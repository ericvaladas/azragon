import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import { rotateToward, stepAngle, yawPitch } from './aimMath';
import { beamHits } from './beamMath';
import { BARREL as BARREL_U, LEG_Z, PIVOT_DEPLOYED, cannonGeometry, chassisGeometry, deployPose, legBoxes, legGeometry, TRUNNION, turretGeometry } from './truckModel';
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
const _fwd = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** Height of the deployed cannon's pivot above the truck's ground point, and the pivot-to-emitter length. */
const PIVOT_Y = S * PIVOT_DEPLOYED;
const BARREL = S * BARREL_U;
/** Outrigger instances per truck: 4 outriggers of beam, jack and pad. */
const LEG_PARTS = 12;
/** Seconds the emitter glow takes to fade after firing. */
const GLOW_FADE = 1.5;
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
  /** 0 stowed for driving, 1 deployed (outriggers down, turret raised). */
  deploy = 0;
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
  private chassis: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;
  private cannon: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private sight: THREE.InstancedMesh;
  private beam: THREE.InstancedMesh;
  private core: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const vc = () => toonMat(0xffffff, { vertexColors: true });
    this.chassis = new THREE.InstancedMesh(chassisGeometry(), vc(), MAX);
    this.turret = new THREE.InstancedMesh(turretGeometry(), vc(), MAX);
    this.cannon = new THREE.InstancedMesh(cannonGeometry(), vc(), MAX);
    this.legs = new THREE.InstancedMesh(legGeometry(), toonMat(0xffffff), MAX * LEG_PARTS);
    const line = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0);
    const glow = (color: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sight = new THREE.InstancedMesh(line, glow(0xff2a1a), MAX);
    this.beam = new THREE.InstancedMesh(line, glow(0xff7a1a), MAX);
    this.core = new THREE.InstancedMesh(line, glow(0xfff2c0), MAX);
    this.glow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), glow(0xffffff), MAX);
    // Allocate per-instance colours up front so the materials compile with them.
    for (let i = 0; i < MAX * LEG_PARTS; i++) this.legs.setColorAt(i, _c.setHex(CONFIG.palette.truckDark));
    for (let i = 0; i < MAX; i++) this.glow.setColorAt(i, _c.setHex(0));
    for (const m of [this.chassis, this.turret, this.cannon, this.legs, this.glow, this.sight, this.beam, this.core]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    for (const m of [this.chassis, this.turret, this.cannon, this.legs]) m.castShadow = m.receiveShadow = true;
    this.sight.renderOrder = this.beam.renderOrder = this.core.renderOrder = this.glow.renderOrder = 4;
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
    const p = ctx.roads.nearest({ x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r });
    t.position.set(p.x, S * 0.3, p.z);
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

  /** Swings the turret onto the monster at the turn rate while the truck deploys (the truck itself never turns). */
  private slewAt(t: LaserTruck, monster: THREE.Vector3, dt: number): void {
    this.aimAt(t, monster, dt, T.turnRate);
  }

  /** Swings the cannon back to lie along the truck's heading (stowed), at the body's turn rate. */
  private aimForward(t: LaserTruck, dt: number): void {
    rotateToward(t.aim, _fwd.set(Math.sin(t.heading), 0, Math.cos(t.heading)), T.turnRate * dt, t.aim);
  }

  /**
   * Turns the cannon toward the monster's body by at most `trackRate * dt`, then runs the beam
   * from the emitter out to full length along the cannon's direction.
   */
  private aimAt(t: LaserTruck, monster: THREE.Vector3, dt: number, rate: number = T.trackRate): void {
    _p.set(t.position.x, PIVOT_Y, t.position.z);
    rotateToward(t.aim, _to.subVectors(bodyPoint(monster, _body), _p), rate * dt, t.aim);
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
      // Parked trucks keep their road heading; only the turret turns to the monster.
      if (t.phase === 'driving') this.aimForward(t, dt);
      // Deploying, the turret makes the big swing onto the monster (at the old body turn rate); aiming then tracks slowly.
      else if (t.phase === 'deploying') this.slewAt(t, mp, dt);
      t.deploy = THREE.MathUtils.clamp(t.deploy + (t.phase === 'driving' ? -dt : dt) / T.deployTime, 0, 1);
      switch (t.phase) {
        case 'driving': {
          if (d <= T.range && ctx.monster.alive) {
            this.enter(t, 'deploying');
            ctx.particles.ring('dust', _p.copy(t.position).setY(0), S * 1.5, 10);
            break;
          }
          t.replanT -= dt;
          if (t.path.length === 0 || t.replanT <= 0) {
            t.path = ctx.roads.path(here, goal);
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
    const P = CONFIG.palette;
    let sights = 0;
    let beams = 0;
    let glows = 0;
    this.trucks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _m.compose(_p.set(t.position.x, 0, t.position.z), _q, _s.setScalar(S));
      this.chassis.setMatrixAt(i, _m);
      // Outriggers: beams slide out from under the deck, then jacks drop their pads to the ground.
      const pose = deployPose(t.deploy);
      let k = i * LEG_PARTS;
      for (const z of LEG_Z) {
        for (const sx of [-1, 1]) {
          for (const b of legBoxes(pose, sx, z)) {
            _p.set(b.c[0], b.c[1], b.c[2]).multiplyScalar(S).applyQuaternion(_q).add(_to.set(t.position.x, 0, t.position.z));
            _m.compose(_p, _q, _s.set(b.s[0], b.s[1], b.s[2]).multiplyScalar(S));
            this.legs.setMatrixAt(k, _m);
            this.legs.setColorAt(k++, _c.setHex(b.part === 'pad' ? P.samHazard : b.part === 'jack' ? P.truckHub : P.truckDark));
          }
        }
      }
      // Turret yaws with the aim; the cannon also pitches with it once unfolded.
      const { yaw, pitch } = yawPitch(t.aim);
      const pivotY = S * pose.pivotY;
      _e.set(0, yaw, 0);
      _m.compose(_p.set(t.position.x, pivotY - S * TRUNNION, t.position.z), _q.setFromEuler(_e), _s.setScalar(S));
      this.turret.setMatrixAt(i, _m);
      _e.set(-pitch * pose.pitch, yaw, 0);
      _m.compose(_p.set(t.position.x, pivotY, t.position.z), _q.setFromEuler(_e), _s.setScalar(S));
      this.cannon.setMatrixAt(i, _m);
      const g = this.glowLevel(t);
      if (g > 0) {
        const size = t.phase === 'firing' ? 0.5 : 0.07 + 0.13 * g;
        _m.compose(t.muzzle, _q.identity(), _s.setScalar(S * size));
        this.glow.setMatrixAt(glows, _m);
        // Deep red while charging, hotter orange when locked, white-hot while firing.
        this.glow.setColorAt(glows++, _c.setRGB(1, 0.12 + 0.6 * g * g, 0.05 + 0.6 * g * g * g).multiplyScalar(0.35 + 0.65 * g));
      }
      if (t.phase === 'aiming' || t.phase === 'locked') {
        this.placeLine(this.sight, sights++, t.muzzle, t.beamEnd, t.phase === 'locked' ? 10 : 5);
      } else if (t.phase === 'firing') {
        this.placeLine(this.beam, beams, t.muzzle, t.beamEnd, T.beamWidth);
        this.placeLine(this.core, beams++, t.muzzle, t.beamEnd, T.beamWidth * 0.4);
      }
    });
    this.chassis.count = this.turret.count = this.cannon.count = this.trucks.length;
    this.legs.count = this.trucks.length * LEG_PARTS;
    this.glow.count = glows;
    this.sight.count = sights;
    this.beam.count = this.core.count = beams;
    for (const m of [this.chassis, this.turret, this.cannon, this.legs, this.glow, this.sight, this.beam, this.core]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Emitter charge 0..1: builds while aiming, pulses bright when locked, full while firing, fades after. */
  private glowLevel(t: LaserTruck): number {
    switch (t.phase) {
      case 'aiming':
        return 0.15 + 0.35 * Math.min(1, t.t / T.aimTime) + 0.05 * Math.sin(t.t * 31);
      case 'locked':
        return 0.75 + 0.15 * Math.sin(t.t * 40);
      case 'firing':
        return 1;
      case 'cooldown':
        return Math.max(0, 0.8 * (1 - t.t / GLOW_FADE));
      default:
        return 0;
    }
  }
}
