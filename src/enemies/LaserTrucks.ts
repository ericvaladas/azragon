import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import { ROAD_ORIGIN } from '../world/chunks';
import { planRoadPath, snapToRoad } from '../world/roads';
import { rotateToward, stepAngle } from './aimMath';
import { beamHits } from './beamMath';
import type { EnemySystem, WorldContext } from './types';

const T = CONFIG.truck;
const MAX = CONFIG.spawns.truck.cap;
const S = T.size;
type Phase = 'driving' | 'deploying' | 'aiming' | 'locked' | 'firing' | 'cooldown';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _body = new THREE.Vector3();
const _to = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
/** Height of the deployed cannon's pivot above the truck's ground point, and the pivot-to-emitter length. */
const PIVOT_Y = S * 0.9;
const BARREL = S * 0.45;
/** Points sampled along a firing beam for building damage. */
const BEAM_SAMPLES = 12;

class LaserTruck implements Target {
  readonly kind = 'truck' as const;
  readonly airborne = false;
  readonly radius = S * 0.6;
  readonly position = new THREE.Vector3();
  /** Cannon muzzle and the beam's far end (beam runs muzzle → end). */
  readonly muzzle = new THREE.Vector3();
  readonly beamEnd = new THREE.Vector3();
  hp: number;
  alive = true;
  phase: Phase = 'driving';
  t = 0;
  heading = 0;
  /** Unit direction the cannon points (world space); turns toward the monster at `trackRate` while aiming. */
  readonly aim = new THREE.Vector3(0, 0, 1);
  path: Vec2[] = [];
  replanT = 0;

  constructor(
    hp: number,
    private onDamage: (t: LaserTruck, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Monster body point the trucks aim at and test beam hits against. */
function bodyPoint(monster: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(monster.x, monster.y + T.aimHeight * CONFIG.monster.scale, monster.z);
}

/**
 * Laser Cannon Trucks: drive in on roads, deploy, track the monster with a sight line,
 * lock the line, then fire a beam along it. Stepping out of the locked line dodges it.
 */
export class LaserTrucks implements EnemySystem {
  readonly kind = 'truck' as const;
  private trucks: LaserTruck[] = [];
  private body: THREE.InstancedMesh;
  private dish: THREE.InstancedMesh;
  private sight: THREE.InstancedMesh;
  private beam: THREE.InstancedMesh;
  private core: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    this.body = new THREE.InstancedMesh(faceted(new THREE.BoxGeometry(1, 1, 1)), toonMat(P.truck), MAX * 2);
    this.dish = new THREE.InstancedMesh(faceted(new THREE.CylinderGeometry(0.5, 0.15, 0.35, 8)).rotateX(Math.PI / 2), toonMat(P.truckDark), MAX);
    const line = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0);
    const glow = (color: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sight = new THREE.InstancedMesh(line, glow(0xff2a1a), MAX);
    this.beam = new THREE.InstancedMesh(line, glow(0xff7a1a), MAX);
    this.core = new THREE.InstancedMesh(line, glow(0xfff2c0), MAX);
    for (const m of [this.body, this.dish, this.sight, this.beam, this.core]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.body.castShadow = this.dish.castShadow = true;
    this.sight.renderOrder = this.beam.renderOrder = this.core.renderOrder = 4;
  }

  targets(): readonly Target[] {
    return this.trucks;
  }

  count(): number {
    return this.trucks.length;
  }

  clear(): void {
    this.trucks = [];
    this.draw();
  }

  /** A locked or firing beam lies on the monster (used to trigger Shield Bubble). */
  threatening(monster: THREE.Vector3): boolean {
    bodyPoint(monster, _body);
    return this.trucks.some((t) => (t.phase === 'locked' || t.phase === 'firing') && beamHits(_body, t.muzzle, t.beamEnd, T.hitRadius * 1.3));
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.trucks.length >= MAX) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const m = ctx.monster.position;
    const t = new LaserTruck(T.hp * ctx.difficulty.hpMult, this.damage);
    t.position.set(snapToRoad(m.x + Math.cos(a) * r, ROAD_ORIGIN, CONFIG.world.blockSize), S * 0.3, m.z + Math.sin(a) * r);
    this.trucks.push(t);
  }

  private damage = (t: LaserTruck, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp > 0) return;
    t.alive = false;
    this.ctx?.particles.explosion(t.position, 1.4);
    this.ctx?.onDestroyed(t, T.exp);
  };

  private enter(t: LaserTruck, phase: Phase): void {
    t.phase = phase;
    t.t = 0;
  }

  /** Points the cannon along the truck's heading (stowed, or turned with the body before deploying). */
  private aimForward(t: LaserTruck): void {
    t.aim.set(Math.sin(t.heading), 0, Math.cos(t.heading));
  }

  /**
   * Turns the cannon toward the monster's body by at most `trackRate * dt`, then runs the beam
   * from the emitter out to full length along the cannon's direction.
   */
  private aimAt(t: LaserTruck, monster: THREE.Vector3, dt: number): void {
    _p.set(t.position.x, PIVOT_Y, t.position.z);
    rotateToward(t.aim, _to.subVectors(bodyPoint(monster, _body), _p), T.trackRate * dt, t.aim);
    t.muzzle.copy(t.aim).multiplyScalar(BARREL).add(_p);
    t.beamEnd.copy(t.aim).multiplyScalar(T.beamLength).add(t.muzzle);
  }

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const mp = ctx.monster.position;
    const goal = { x: mp.x, z: mp.z };
    for (let i = this.trucks.length - 1; i >= 0; i--) {
      const t = this.trucks[i]!;
      if (!t.alive) {
        this.trucks.splice(i, 1);
        continue;
      }
      t.t += dt;
      const here = { x: t.position.x, z: t.position.z };
      const d = dist2(here, goal);
      if (t.phase !== 'driving' && d > 1e-3) t.heading = stepAngle(t.heading, Math.atan2(goal.x - here.x, goal.z - here.z), T.turnRate * dt);
      if (t.phase === 'driving' || t.phase === 'deploying') this.aimForward(t);
      switch (t.phase) {
        case 'driving': {
          if (d <= T.range && ctx.monster.alive) {
            this.enter(t, 'deploying');
            ctx.particles.ring('dust', _p.copy(t.position).setY(0), S * 1.5, 10);
            break;
          }
          t.replanT -= dt;
          if (t.path.length === 0 || t.replanT <= 0) {
            t.path = planRoadPath(here, goal, ROAD_ORIGIN, CONFIG.world.blockSize);
            t.replanT = 4;
          }
          const wp = t.path[0];
          if (!wp) break;
          const wd = dist2(here, wp);
          const step = Math.min(wd, T.speed * dt);
          if (wd > 1e-3) {
            t.heading = stepAngle(t.heading, Math.atan2(wp.x - here.x, wp.z - here.z), T.turnRate * dt);
            t.position.x += ((wp.x - here.x) / wd) * step;
            t.position.z += ((wp.z - here.z) / wd) * step;
          }
          if (wd - step < 1) t.path.shift();
          break;
        }
        case 'deploying':
          if (t.t >= T.deployTime) this.enter(t, 'aiming');
          break;
        case 'aiming':
          this.aimAt(t, mp, dt);
          if (!ctx.monster.alive) this.enter(t, 'cooldown');
          else if (t.t >= T.aimTime) this.enter(t, 'locked');
          break;
        case 'locked':
          if (t.t >= T.lockTime) {
            this.enter(t, 'firing');
            ctx.particles.emit('fire', t.muzzle, 6, 0.5);
            ctx.shake(0.1);
          }
          break;
        case 'firing': {
          if (ctx.monster.alive && beamHits(bodyPoint(mp, _body), t.muzzle, t.beamEnd, T.hitRadius)) {
            ctx.damageMonster(T.dps * dt, 'beam', t);
          }
          for (let k = 1; k <= BEAM_SAMPLES; k++) {
            _p.lerpVectors(t.muzzle, t.beamEnd, k / BEAM_SAMPLES);
            if (_p.y < 140) ctx.damageBuildings({ x: _p.x, z: _p.z }, T.beamWidth, T.buildingDps * dt);
          }
          if (t.t >= T.fireTime) this.enter(t, 'cooldown');
          break;
        }
        case 'cooldown':
          if (t.t >= T.cooldown) this.enter(t, d <= T.range ? 'aiming' : 'driving');
          break;
      }
    }
    this.draw();
  }

  private placeLine(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
    _s.subVectors(b, a);
    const len = _s.length();
    _q.setFromUnitVectors(UP, _s.normalize());
    _m.compose(a, _q, _s.set(width, len, width));
    mesh.setMatrixAt(i, _m);
  }

  private draw(): void {
    let sights = 0;
    let beams = 0;
    this.trucks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _m.compose(_p.set(t.position.x, S * 0.25, t.position.z), _q, _s.set(S * 0.55, S * 0.45, S * 1.4));
      this.body.setMatrixAt(i * 2, _m);
      _p.set(Math.sin(t.heading), 0, Math.cos(t.heading)).multiplyScalar(S * 0.75).add(t.position).setY(S * 0.4);
      _m.compose(_p, _q, _s.set(S * 0.5, S * 0.6, S * 0.4));
      this.body.setMatrixAt(i * 2 + 1, _m);
      const raised = t.phase === 'driving' ? 0.55 : 0.9;
      _q.setFromUnitVectors(FWD, t.aim);
      _m.compose(_p.set(t.position.x, S * raised, t.position.z), _q, _s.setScalar(S * 0.9));
      this.dish.setMatrixAt(i, _m);
      if (t.phase === 'aiming' || t.phase === 'locked') {
        this.placeLine(this.sight, sights++, t.muzzle, t.beamEnd, t.phase === 'locked' ? 10 : 5);
      } else if (t.phase === 'firing') {
        this.placeLine(this.beam, beams, t.muzzle, t.beamEnd, T.beamWidth);
        this.placeLine(this.core, beams++, t.muzzle, t.beamEnd, T.beamWidth * 0.4);
      }
    });
    this.body.count = this.trucks.length * 2;
    this.dish.count = this.trucks.length;
    this.sight.count = sights;
    this.beam.count = this.core.count = beams;
    for (const m of [this.body, this.dish, this.sight, this.beam, this.core]) m.instanceMatrix.needsUpdate = true;
  }
}
