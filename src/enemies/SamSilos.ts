import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, painted, toonMat } from '../render/toon';
import { steerToward } from './steer';
import type { EnemySystem, WorldContext } from './types';

const C = CONFIG.sam;
const MAX = CONFIG.spawns.sam.cap;
const MAX_MISSILES = MAX * C.missiles * 2;
type Phase = 'rising' | 'up' | 'sinking' | 'down';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _d = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

class Silo implements Target {
  readonly kind = 'sam' as const;
  readonly airborne = false;
  readonly radius = C.size * 0.6;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  phase: Phase = 'rising';
  t = 0;
  raise = 0;
  fired = false;
  downFor: number = C.downMin;

  constructor(
    hp: number,
    private onDamage: (s: Silo, amount: number) => void,
  ) {
    this.hp = hp;
  }

  /** Targetable only while mostly raised. */
  isAlive(): boolean {
    return this.alive && this.raise > 0.5;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

class Missile implements Target {
  readonly kind = 'missile' as const;
  readonly airborne = true;
  readonly radius = 25;
  readonly position = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 1, 0);
  alive = true;
  age = 0;
  trailT = 0;

  constructor(private onDamage: (m: Missile) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(): void {
    this.onDamage(this);
  }
}

/** Silos rise from hatches, fire a homing volley, and sink back. Missiles can be shot down. */
export class SamSilos implements EnemySystem {
  readonly kind = 'sam' as const;
  private silos: Silo[] = [];
  private missiles: Missile[] = [];
  private hatch: THREE.InstancedMesh;
  private launcher: THREE.InstancedMesh;
  private missileMesh: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    // Dark hatch inside a yellow hazard ring.
    const hatchGeo = mergeGeometries([
      painted(faceted(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 8)), P.samHatch),
      painted(faceted(new THREE.CylinderGeometry(0.72, 0.72, 0.03, 8)), P.samHazard),
    ])!;
    this.hatch = new THREE.InstancedMesh(hatchGeo, toonMat(0xffffff, { vertexColors: true }), MAX);
    // White launcher body with a hazard-striped band, red missile tubes with white caps.
    const stripes = [0, 1, 2, 3].map((k) =>
      painted(faceted(new THREE.BoxGeometry(0.21, 0.1, 0.84)).translate(-0.3 + k * 0.2, 0.42, 0), k % 2 ? P.samHazardDark : P.samHazard),
    );
    const tubes = [-0.18, 0.18].flatMap((x) =>
      [-0.18, 0.18].flatMap((z) => [
        painted(faceted(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 6)).translate(x, 0.7, z), P.samTube),
        painted(faceted(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6)).translate(x, 1.04, z), P.samLauncher),
      ]),
    );
    const launcherGeo = mergeGeometries([painted(faceted(new THREE.BoxGeometry(0.8, 0.5, 0.8)).translate(0, 0.25, 0), P.samLauncher), ...stripes, ...tubes])!;
    this.launcher = new THREE.InstancedMesh(launcherGeo, toonMat(0xffffff, { vertexColors: true }), MAX);
    // White missile body with a red nose (the cone's tip is +Y, the flight direction).
    const missileGeo = mergeGeometries([
      painted(faceted(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 5)).translate(0, -0.15, 0), P.missile),
      painted(faceted(new THREE.ConeGeometry(0.3, 0.3, 5)).translate(0, 0.35, 0), P.samTube),
    ])!;
    this.missileMesh = new THREE.InstancedMesh(missileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), MAX_MISSILES);
    for (const m of [this.hatch, this.launcher, this.missileMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = m !== this.missileMesh;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  targets(): readonly Target[] {
    return [...this.silos, ...this.missiles];
  }

  count(): number {
    return this.silos.length;
  }

  clear(): void {
    this.silos = [];
    this.missiles = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.silos.length >= MAX) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = C.spawnMin + ctx.rng() * (C.spawnMax - C.spawnMin);
    const m = ctx.monster.position;
    const s = new Silo(C.hp * ctx.difficulty.hpMult, this.damageSilo);
    // A silo rises out of the ground, so never onto a bridge deck.
    const p = ctx.roads.nearestLand({ x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r });
    s.position.set(p.x, C.size * 0.4, p.z);
    ctx.particles.ring('dust', s.position.clone().setY(0), C.size * 1.5, 10);
    this.silos.push(s);
  }

  private damageSilo = (s: Silo, amount: number): void => {
    if (!s.isAlive()) return;
    s.hp -= amount;
    if (s.hp > 0) return;
    s.alive = false;
    this.ctx?.particles.explosion(s.position, 2);
    this.ctx?.onDestroyed(s, C.exp);
  };

  private damageMissile = (m: Missile): void => {
    if (!m.alive) return;
    m.alive = false;
    this.ctx?.particles.explosion(m.position, 0.5);
    this.ctx?.onDestroyed(m, C.missileExp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const mp = ctx.monster.position;
    _aim.set(mp.x, 280 * CONFIG.monster.scale, mp.z);

    for (let i = this.silos.length - 1; i >= 0; i--) {
      const s = this.silos[i]!;
      if (!s.alive) {
        this.silos.splice(i, 1);
        continue;
      }
      s.t += dt;
      if (s.phase === 'rising') {
        s.raise = Math.min(1, s.t / C.riseTime);
        if (s.t >= C.riseTime) this.enter(s, 'up');
      } else if (s.phase === 'up') {
        if (!s.fired && s.t >= C.fireDelay && ctx.monster.alive) {
          s.fired = true;
          for (let k = 0; k < C.missiles; k++) this.launch(s, k, ctx);
        }
        if (s.t >= C.upTime) this.enter(s, 'sinking');
      } else if (s.phase === 'sinking') {
        s.raise = Math.max(0, 1 - s.t / C.sinkTime);
        if (s.t >= C.sinkTime) {
          s.downFor = C.downMin + ctx.rng() * (C.downMax - C.downMin);
          this.enter(s, 'down');
        }
      } else if (s.t >= s.downFor) {
        s.fired = false;
        ctx.particles.ring('dust', s.position.clone().setY(0), C.size * 1.2, 8);
        this.enter(s, 'rising');
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      if (!m.alive) {
        this.missiles.splice(i, 1);
        continue;
      }
      m.age += dt;
      steerToward(m.dir, _d.subVectors(_aim, m.position).normalize(), C.missileTurn * dt);
      m.position.addScaledVector(m.dir, C.missileSpeed * dt);
      m.trailT += dt;
      if (m.trailT > 0.06) {
        m.trailT = 0;
        ctx.particles.emit('smoke', m.position, 1, 0.15);
      }
      if (m.position.distanceTo(_aim) < C.missileHitDist) {
        m.alive = false;
        ctx.particles.explosion(m.position, 0.8);
        ctx.damageMonster(C.missileDamage, 'missile');
      } else if (m.age > C.missileTtl || m.position.y < 0) {
        m.alive = false;
        ctx.particles.explosion(m.position, 0.5);
        if (m.position.y < 0) ctx.splash(m.position);
      }
    }
    this.draw();
  }

  private enter(s: Silo, p: Phase): void {
    s.phase = p;
    s.t = 0;
  }

  private launch(s: Silo, k: number, ctx: WorldContext): void {
    if (this.missiles.length >= MAX_MISSILES) return;
    const m = new Missile(this.damageMissile);
    m.position.set(s.position.x + (k % 2 ? 1 : -1) * C.size * 0.18, C.size * 1.3, s.position.z + (k < 2 ? 1 : -1) * C.size * 0.18);
    m.dir.set((ctx.rng() - 0.5) * 0.3, 1, (ctx.rng() - 0.5) * 0.3).normalize();
    ctx.particles.emit('fire', m.position, 3, 0.4);
    this.missiles.push(m);
  }

  private draw(): void {
    this.silos.forEach((s, i) => {
      _m.compose(_p.set(s.position.x, 1, s.position.z), _q.identity(), _s.setScalar(C.size));
      this.hatch.setMatrixAt(i, _m);
      if (s.raise <= 0.01) {
        this.launcher.setMatrixAt(i, HIDDEN);
      } else {
        _m.compose(_p.set(s.position.x, -C.size * 1.5 * (1 - s.raise), s.position.z), _q.identity(), _s.setScalar(C.size));
        this.launcher.setMatrixAt(i, _m);
      }
    });
    this.missiles.forEach((m, i) => {
      _q.setFromUnitVectors(FWD, m.dir);
      _m.compose(m.position, _q, _s.set(10, 34, 10));
      this.missileMesh.setMatrixAt(i, _m);
    });
    this.hatch.count = this.launcher.count = this.silos.length;
    this.missileMesh.count = this.missiles.length;
    for (const m of [this.hatch, this.launcher, this.missileMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
