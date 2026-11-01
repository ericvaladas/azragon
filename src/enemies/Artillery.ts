import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import { artyBarrelDir, artyMuzzle, barrelGeometry, carriageGeometry, GUN, recoilOffset } from './artyModel';
import type { Vec2 } from '../util/math';
import { salvoSize, shellProgress, strikeFill, strikeHits, strikePoints } from './artilleryMath';
import { ballistic } from '../systems/projectileMath';
import type { EnemySystem, WorldContext } from './types';

const A = CONFIG.artillery;
const MAX_BATTERIES = CONFIG.spawns.artillery.cap;
const MAX_GUNS = MAX_BATTERIES * A.guns;
const MAX_STRIKES = 32;
/** Seconds between smoke puffs along a shell's arc, and the glowing shell's size (m). */
const TRAIL_EVERY = 0.025;
const SHELL_SIZE = 26;
const _land = new THREE.Vector3();
const _shell = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Seconds the barrel takes to snap back and run out again after a shot. */
const RECOIL_TIME = 0.7;

class Gun implements Target {
  readonly kind = 'artillery' as const;
  readonly airborne = false;
  readonly radius = A.size * 0.7;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  yaw = 0;
  /** Seconds since this gun last fired (drives the barrel recoil). */
  sinceShot = Infinity;

  constructor(
    hp: number,
    private onDamage: (g: Gun, amount: number) => void,
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

type Battery = { guns: Gun[]; salvoT: number };
/** A telegraphed strike: the circle at `at`, and its shell fired by `gun` from that gun's muzzle `from` (set at launch). */
type Strike = { at: Vec2; t: number; gun: Gun; from: THREE.Vector3; launched: boolean; trailT: number };

/** Far-off gun batteries; each salvo paints red circles that fill, then shells land. */
export class Artillery implements EnemySystem {
  readonly kind = 'artillery' as const;
  private batteries: Battery[] = [];
  private strikes: Strike[] = [];
  private carriageMesh: THREE.InstancedMesh;
  private barrelMesh: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private fillMesh: THREE.InstancedMesh;
  private shellMesh: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    // Towed howitzer: the carriage (wheels, trails, shield, cradle) and the barrel that recoils along its axis.
    const mat = toonMat(0xffffff, { vertexColors: true });
    this.carriageMesh = new THREE.InstancedMesh(carriageGeometry(), mat, MAX_GUNS);
    this.barrelMesh = new THREE.InstancedMesh(barrelGeometry(), mat, MAX_GUNS);
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }), MAX_STRIKES);
    this.fillMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.35, depthWrite: false }), MAX_STRIKES);
    this.shellMesh = new THREE.InstancedMesh(faceted(new THREE.IcosahedronGeometry(0.5, 0)), new THREE.MeshBasicMaterial({ color: P.eye, fog: false }), MAX_STRIKES);
    this.shellMesh.count = 0;
    this.shellMesh.frustumCulled = false;
    scene.add(this.shellMesh);
    for (const m of [this.carriageMesh, this.barrelMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    for (const m of [this.carriageMesh, this.barrelMesh, this.ringMesh, this.fillMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.fillMesh.renderOrder = 2;
    // Outlines draw over everything: the first circle is centred under the monster's own body.
    this.ringMesh.renderOrder = 10;
  }

  targets(): readonly Target[] {
    return this.batteries.flatMap((b) => b.guns);
  }

  count(): number {
    return this.batteries.length;
  }

  clear(): void {
    this.batteries = [];
    this.strikes = [];
    this.draw();
  }

  /** A strike circle that has filled past half is on top of `p` (an imminent hit). */
  /** Strikes painted and not yet landed. */
  paintedCount(): number {
    return this.strikes.length;
  }

  strikeNear(p: Vec2): boolean {
    return this.strikes.some((s) => s.t >= A.fillTime * 0.5 && strikeHits(p, s.at, A.radius));
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.batteries.length >= MAX_BATTERIES) return;
    const m = ctx.monster.position;
    for (let attempt = 0; attempt < 8; attempt++) {
      const d = ctx.spawnDir();
      const r = A.distMin + ctx.rng() * (A.distMax - A.distMin);
      const cx = m.x + d.x * r;
      const cz = m.z + d.z * r;
      const spots: { x: number; z: number }[] = [];
      for (let i = 0; i < A.guns; i++) {
        // Guns stand in a line across the direction to the monster.
        const off = (i - (A.guns - 1) / 2) * A.gunSpacing;
        spots.push({ x: cx - d.z * off, z: cz + d.x * off });
      }
      if (ctx.blocked && spots.some((s) => ctx.blocked!(s.x, s.z))) continue;
      const guns = spots.map((s) => {
        const g = new Gun(A.hp * ctx.difficulty.hpMult, this.damage);
        g.position.set(s.x, A.size * 0.3, s.z);
        g.yaw = Math.atan2(m.x - cx, m.z - cz);
        return g;
      });
      this.batteries.push({ guns, salvoT: A.salvoEvery * 0.5 });
      return;
    }
  }

  private damage = (g: Gun, amount: number): void => {
    if (!g.alive) return;
    g.hp -= amount;
    if (g.hp > 0) return;
    g.alive = false;
    if (!this.ctx?.quiet) this.ctx?.particles.explosion(g.position, 1.2);
    this.ctx?.onDestroyed(g, A.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    for (let i = this.batteries.length - 1; i >= 0; i--) {
      const b = this.batteries[i]!;
      b.guns = b.guns.filter((g) => g.alive);
      if (b.guns.length === 0) {
        this.batteries.splice(i, 1);
        continue;
      }
      for (const g of b.guns) {
        g.yaw = Math.atan2(m.x - g.position.x, m.z - g.position.z);
        g.sinceShot += dt;
      }
      b.salvoT -= dt;
      // A battery fires only while the monster is within range of it and the army is not retreating; beyond that it holds its next salvo ready.
      const cx = b.guns.reduce((n, g) => n + g.position.x, 0) / b.guns.length;
      const cz = b.guns.reduce((n, g) => n + g.position.z, 0) / b.guns.length;
      const inRange = Math.hypot(m.x - cx, m.z - cz) <= A.range;
      if (b.salvoT <= 0 && ctx.monster.alive && inRange && ctx.retreating !== true) {
        b.salvoT = A.salvoEvery;
        strikePoints({ x: m.x, z: m.z }, salvoSize(ctx.level), A.spread, ctx.rng).forEach((at, k) => {
          if (this.strikes.length >= MAX_STRIKES) return;
          const g = b.guns[k % b.guns.length]!;
          this.strikes.push({ at, t: 0, gun: g, from: new THREE.Vector3(), launched: false, trailT: 0 });
        });
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]!;
      s.t += dt;
      const k = shellProgress(s.t, A.fillTime, A.shellFlight);
      if (k !== null) {
        if (!s.launched) {
          s.launched = true;
          this.fire(s, ctx);
        }
        // Smoke trail along the arc, leading back to the gun.
        s.trailT += dt;
        if (s.trailT >= TRAIL_EVERY && k < 1) {
          s.trailT = 0;
          ctx.particles.emit('trail', this.shellPos(s, k), 1, 0.05);
        }
      }
      if (s.t < A.fillTime) continue;
      _p.set(s.at.x, 10, s.at.z);
      ctx.particles.explosion(_p, 1.4);
      ctx.particles.ring('dust', _p.setY(0), A.radius, 10);
      ctx.shake(0.2);
      ctx.damageBuildings(s.at, A.radius, A.buildingDamage);
      if (strikeHits({ x: m.x, z: m.z }, s.at, A.radius)) ctx.damageMonster(A.damage, 'artillery');
      this.strikes.splice(i, 1);
    }
    this.draw();
  }

  /** The shell leaves the firing gun's muzzle: flash and smoke there and a side blast from the brake. */
  private fire(s: Strike, ctx: WorldContext): void {
    const g = s.gun;
    g.sinceShot = 0;
    artyMuzzle(g.yaw, A.size, s.from);
    s.from.x += g.position.x;
    s.from.z += g.position.z;
    ctx.particles.emit('fire', s.from, 4, 0.4);
    ctx.particles.emit('smoke', s.from, 3, 0.4);
    // Muzzle-brake side blast: smoke puffs either side of the muzzle, across the barrel.
    _dir.set(Math.cos(g.yaw), 0, -Math.sin(g.yaw)).multiplyScalar(A.size * 0.35);
    ctx.particles.emit('smoke', _p.copy(s.from).add(_dir), 1, 0.2);
    ctx.particles.emit('smoke', _p.copy(s.from).sub(_dir), 1, 0.2);
  }

  private shellPos(s: Strike, k: number): THREE.Vector3 {
    _land.set(s.at.x, 0, s.at.z);
    return ballistic(s.from, _land, A.shellArc, k, _shell);
  }

  private draw(): void {
    let shells = 0;
    for (const s of this.strikes) {
      const k = shellProgress(s.t, A.fillTime, A.shellFlight);
      if (k === null) continue;
      _m.compose(this.shellPos(s, k), _q.identity(), _s.setScalar(SHELL_SIZE));
      this.shellMesh.setMatrixAt(shells++, _m);
    }
    this.shellMesh.count = shells;
    this.shellMesh.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (const b of this.batteries) {
      for (const g of b.guns) {
        // Model origin is on the ground under the axle.
        _q.setFromAxisAngle(UP, g.yaw);
        _m.compose(_p.set(g.position.x, 0, g.position.z), _q, _s.setScalar(A.size));
        this.carriageMesh.setMatrixAt(n, _m);
        // The barrel slides back along its own axis while recoiling.
        const back = -GUN.kick * A.size * recoilOffset(g.sinceShot, RECOIL_TIME);
        _p.addScaledVector(artyBarrelDir(g.yaw, _dir), back);
        _m.compose(_p, _q, _s);
        this.barrelMesh.setMatrixAt(n++, _m);
      }
    }
    this.carriageMesh.count = this.barrelMesh.count = n;
    this.strikes.forEach((s, i) => {
      _m.compose(_p.set(s.at.x, 3, s.at.z), _q.identity(), _s.setScalar(A.radius));
      this.ringMesh.setMatrixAt(i, _m);
      const f = Math.max(0.02, strikeFill(s.t, A.fillTime));
      _m.compose(_p.set(s.at.x, 2.5, s.at.z), _q.identity(), _s.set(A.radius * f, 1, A.radius * f));
      this.fillMesh.setMatrixAt(i, _m);
    });
    this.ringMesh.count = this.fillMesh.count = this.strikes.length;
    for (const m of [this.carriageMesh, this.barrelMesh, this.ringMesh, this.fillMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
