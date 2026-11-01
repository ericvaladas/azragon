import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, painted, toonMat } from '../render/toon';
import { samLauncherGeometry, samLaunchDir, samMuzzle } from './samModel';
import { steerToward } from './steer';
import type { EnemySystem, WorldContext } from './types';

const C = CONFIG.sam;
const MAX = CONFIG.spawns.sam.cap;
const MAX_MISSILES = MAX * C.missiles * 2;
type Phase = 'rising' | 'up';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _d = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 1, 0);
/** How fast a launcher's turntable yaws to keep its rack facing the monster (rad/s). */
const YAW_RATE = 1.2;
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
  /** Turntable heading (0 faces +Z); the rack keeps turning toward the monster. */
  yaw = 0;
  /** Seconds into the 'up' phase when the next volley launches. */
  nextVolley: number = C.fireDelay;

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

/**
 * Silos rise from hatches and stay up, firing a homing volley on the same rhythm a sinking silo used to (up, sink,
 * down and rise again), so the player has the whole time to destroy them. Missiles can be shot down.
 */
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
    // Mobile launcher: turntable, cab, radar and a 2×2 missile pod pitched up 45°, yawed toward the monster.
    this.launcher = new THREE.InstancedMesh(samLauncherGeometry(), toonMat(0xffffff, { vertexColors: true }), MAX);
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
    for (const s of this.silos) s.alive = false;
    for (const m of this.missiles) m.alive = false;
    this.silos = [];
    this.missiles = [];
    this.draw();
  }

  /**
   * A silo rises out of open ground spawnMin..spawnMax m from the monster: a rubble lot (bursting up through the
   * wreckage) or a park or plaza, never one already holding a silo. False when there is no such site.
   */
  spawn(ctx: WorldContext): boolean {
    this.ctx = ctx;
    if (this.silos.length >= MAX) return false;
    const free = ctx.openGround(C.spawnMin, C.spawnMax).filter((p) => !this.silos.some((s) => Math.hypot(s.position.x - p.x, s.position.z - p.z) < C.size * 2));
    if (free.length === 0) return false;
    const m = ctx.monster.position;
    // Prefer sites inside the cone of ctx.spawnDir (ahead of a running monster); any free site otherwise.
    const d = ctx.spawnDir();
    const minDot = Math.cos(CONFIG.runaway.cone);
    const ahead = free.filter((q) => ((q.x - m.x) * d.x + (q.z - m.z) * d.z) / Math.max(1e-6, Math.hypot(q.x - m.x, q.z - m.z)) >= minDot);
    const pool = ahead.length > 0 ? ahead : free;
    const p = pool[Math.floor(ctx.rng() * pool.length)]!;
    const s = new Silo(C.hp * ctx.difficulty.hpMult, this.damageSilo);
    s.position.set(p.x, C.size * 0.4, p.z);
    s.yaw = Math.atan2(m.x - p.x, m.z - p.z);
    const ground = s.position.clone().setY(0);
    ctx.particles.ring('dust', ground, C.size * 1.5, 10);
    if (p.rubble) ctx.particles.emit('debris', ground.setY(20), 14, 1.4);
    this.silos.push(s);
    return true;
  }

  private damageSilo = (s: Silo, amount: number): void => {
    if (!s.isAlive()) return;
    s.hp -= amount;
    if (s.hp > 0) return;
    s.alive = false;
    if (!this.ctx?.quiet) this.ctx?.particles.explosion(s.position, 2);
    this.ctx?.onDestroyed(s, C.exp);
  };

  private damageMissile = (m: Missile): void => {
    if (!m.alive) return;
    m.alive = false;
    if (!this.ctx?.quiet) this.ctx?.particles.explosion(m.position, 0.5);
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
      const turn = Math.atan2(mp.x - s.position.x, mp.z - s.position.z) - s.yaw;
      const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
      s.yaw += Math.sign(wrapped) * Math.min(Math.abs(wrapped), YAW_RATE * dt);
      if (s.phase === 'rising') {
        s.raise = Math.min(1, s.t / C.riseTime);
        if (s.t >= C.riseTime) this.enter(s, 'up');
      } else if (s.t >= s.nextVolley && ctx.retreating !== true) {
        // While retreating a silo launches nothing and its volley stays due.
        if (ctx.monster.alive) for (let k = 0; k < C.missiles; k++) this.launch(s, k, ctx);
        // The gap a sinking silo took: the rest of its up time, sinking, a random spell down, and rising again.
        const down = C.downMin + ctx.rng() * (C.downMax - C.downMin);
        s.nextVolley += C.upTime + C.sinkTime + down + C.riseTime;
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
    // Out of tube k's mouth along the rack's 45° axis, with a little scatter; the missile then homes on the monster.
    samLaunchDir(s.yaw, m.dir);
    samMuzzle(k, s.yaw, C.size, _p);
    m.position.set(s.position.x + _p.x, _p.y, s.position.z + _p.z).addScaledVector(m.dir, C.size * 0.08);
    m.dir.x += (ctx.rng() - 0.5) * 0.3;
    m.dir.z += (ctx.rng() - 0.5) * 0.3;
    m.dir.normalize();
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
        _q.setFromAxisAngle(FWD, s.yaw);
        _m.compose(_p.set(s.position.x, -C.size * 1.5 * (1 - s.raise), s.position.z), _q, _s.setScalar(C.size));
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
