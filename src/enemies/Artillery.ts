import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import type { Vec2 } from '../util/math';
import { salvoSize, strikeFill, strikeHits, strikePoints } from './artilleryMath';
import type { EnemySystem, WorldContext } from './types';

const A = CONFIG.artillery;
const MAX_BATTERIES = CONFIG.spawns.artillery.cap;
const MAX_GUNS = MAX_BATTERIES * A.guns;
const MAX_STRIKES = 32;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Barrel elevation, applied after the gun's yaw. */
const _pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6);

class Gun implements Target {
  readonly kind = 'artillery' as const;
  readonly airborne = false;
  readonly radius = A.size * 0.7;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  yaw = 0;

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
type Strike = { at: Vec2; t: number };

/** Far-off gun batteries; each salvo paints red circles that fill, then shells land. */
export class Artillery implements EnemySystem {
  readonly kind = 'artillery' as const;
  private batteries: Battery[] = [];
  private strikes: Strike[] = [];
  private gunMesh: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private fillMesh: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const gunGeo = faceted(new THREE.BoxGeometry(1, 0.5, 1.2)).translate(0, 0.25, 0);
    // Body and barrel are two instances of the same box per gun.
    this.gunMesh = new THREE.InstancedMesh(gunGeo, toonMat(P.artillery), MAX_GUNS * 2);
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }), MAX_STRIKES);
    this.fillMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.35, depthWrite: false }), MAX_STRIKES);
    this.gunMesh.castShadow = true;
    for (const m of [this.gunMesh, this.ringMesh, this.fillMesh]) {
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
  strikeNear(p: Vec2): boolean {
    return this.strikes.some((s) => s.t >= A.fillTime * 0.5 && strikeHits(p, s.at, A.radius));
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.batteries.length >= MAX_BATTERIES) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = A.distMin + ctx.rng() * (A.distMax - A.distMin);
    const m = ctx.monster.position;
    const cx = m.x + Math.cos(a) * r;
    const cz = m.z + Math.sin(a) * r;
    const guns: Gun[] = [];
    for (let i = 0; i < A.guns; i++) {
      const g = new Gun(A.hp * ctx.difficulty.hpMult, this.damage);
      const off = (i - (A.guns - 1) / 2) * A.gunSpacing;
      g.position.set(cx - Math.sin(a) * off, A.size * 0.3, cz + Math.cos(a) * off);
      g.yaw = Math.atan2(m.x - cx, m.z - cz);
      guns.push(g);
    }
    this.batteries.push({ guns, salvoT: A.salvoEvery * 0.5 });
  }

  private damage = (g: Gun, amount: number): void => {
    if (!g.alive) return;
    g.hp -= amount;
    if (g.hp > 0) return;
    g.alive = false;
    this.ctx?.particles.explosion(g.position, 1.2);
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
      for (const g of b.guns) g.yaw = Math.atan2(m.x - g.position.x, m.z - g.position.z);
      b.salvoT -= dt;
      if (b.salvoT <= 0 && ctx.monster.alive) {
        b.salvoT = A.salvoEvery;
        for (const g of b.guns) ctx.particles.emit('fire', _p.copy(g.position).setY(A.size), 3, 0.3);
        for (const at of strikePoints({ x: m.x, z: m.z }, salvoSize(ctx.minutes), A.spread, ctx.rng)) {
          if (this.strikes.length < MAX_STRIKES) this.strikes.push({ at, t: 0 });
        }
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]!;
      s.t += dt;
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

  private draw(): void {
    let n = 0;
    for (const b of this.batteries) {
      for (const g of b.guns) {
        _q.setFromAxisAngle(UP, g.yaw);
        _m.compose(g.position, _q, _s.setScalar(A.size));
        this.gunMesh.setMatrixAt(n++, _m);
        // Barrel: a long thin instance pitched up toward the target.
        _p.set(Math.sin(g.yaw), 0, Math.cos(g.yaw)).multiplyScalar(A.size * 0.6).add(g.position).setY(A.size * 0.55);
        _q.setFromAxisAngle(UP, g.yaw).multiply(_pitch);
        _m.compose(_p, _q, _s.set(A.size * 0.15, A.size * 0.3, A.size * 1.3));
        this.gunMesh.setMatrixAt(n++, _m);
      }
    }
    this.gunMesh.count = n;
    this.strikes.forEach((s, i) => {
      _m.compose(_p.set(s.at.x, 3, s.at.z), _q.identity(), _s.setScalar(A.radius));
      this.ringMesh.setMatrixAt(i, _m);
      const f = Math.max(0.02, strikeFill(s.t, A.fillTime));
      _m.compose(_p.set(s.at.x, 2.5, s.at.z), _q.identity(), _s.set(A.radius * f, 1, A.radius * f));
      this.fillMesh.setMatrixAt(i, _m);
    });
    this.ringMesh.count = this.fillMesh.count = this.strikes.length;
    for (const m of [this.gunMesh, this.ringMesh, this.fillMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
