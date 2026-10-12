import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { Tether } from '../monster/tether';
import { faceted, toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import { ROAD_ORIGIN } from '../world/chunks';
import { planRoadPath, snapToRoad } from '../world/roads';
import type { EnemySystem, WorldContext } from './types';

const T = CONFIG.truck;
const MAX = CONFIG.spawns.truck.cap;
const S = T.size;
type Phase = 'driving' | 'anchoring' | 'firing' | 'tethered' | 'cooldown';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
/** Cable thickness in metres; thinner reads as sub-pixel in the low-res render at combat distances. */
const CABLE_WIDTH = 18;
const _tilt = new THREE.Quaternion();

class Truck implements Target {
  readonly kind = 'truck' as const;
  readonly airborne = false;
  readonly radius = S * 0.6;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  phase: Phase = 'driving';
  t = 0;
  heading = 0;
  path: Vec2[] = [];
  replanT = 0;
  tether: Tether | null = null;
  tetherTtl = 0;

  constructor(
    hp: number,
    private onDamage: (t: Truck, amount: number) => void,
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

/** Trucks drive in on roads, anchor, and harpoon the monster; the cable limits how far it can walk. */
export class GrappleTrucks implements EnemySystem {
  readonly kind = 'truck' as const;
  private trucks: Truck[] = [];
  private cab: THREE.InstancedMesh;
  private bed: THREE.InstancedMesh;
  private cable: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const box = faceted(new THREE.BoxGeometry(1, 1, 1));
    this.cab = new THREE.InstancedMesh(box, toonMat(P.truck), MAX * 2);
    this.bed = new THREE.InstancedMesh(box, toonMat(P.truckDark), MAX * 2);
    this.cable = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 4), new THREE.MeshBasicMaterial({ color: P.cable }), MAX);
    for (const m of [this.cab, this.bed, this.cable]) {
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = true;
      scene.add(m);
    }
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

  activeTethers(): Tether[] {
    const out: Tether[] = [];
    for (const t of this.trucks) if (t.phase === 'tethered' && t.tether) out.push(t.tether);
    return out;
  }

  tethered(): boolean {
    return this.trucks.some((t) => t.phase === 'tethered');
  }

  /** Leap/Roar: break every cable; Thrash damages the truck on each snap. */
  snapAll(): void {
    for (const t of this.trucks) {
      if (t.phase !== 'tethered' && t.phase !== 'firing') continue;
      this.release(t);
      const dmg = this.ctx?.thrashDamage ?? 0;
      if (dmg > 0) t.applyDamage(dmg);
    }
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.trucks.length >= MAX) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const m = ctx.monster.position;
    const t = new Truck(T.hp * ctx.difficulty.hpMult, this.damage);
    t.position.set(snapToRoad(m.x + Math.cos(a) * r, ROAD_ORIGIN, CONFIG.world.blockSize), S * 0.3, m.z + Math.sin(a) * r);
    this.trucks.push(t);
  }

  private damage = (t: Truck, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp > 0) return;
    t.alive = false;
    t.tether = null;
    this.ctx?.particles.explosion(t.position, 1.3);
    this.ctx?.onDestroyed(t, T.exp);
  };

  private release(t: Truck): void {
    t.tether = null;
    t.phase = 'cooldown';
    t.t = 0;
    this.ctx?.particles.emit('spark', _p.copy(t.position).setY(S), 8);
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
      if (t.phase !== 'driving') t.heading = Math.atan2(goal.x - here.x, goal.z - here.z);
      switch (t.phase) {
        case 'driving': {
          if (d <= T.range && ctx.monster.alive) {
            t.phase = 'anchoring';
            t.t = 0;
            ctx.particles.ring('dust', _p.copy(t.position).setY(0), S * 1.5, 10);
            ctx.shake(0.05);
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
            t.heading = Math.atan2(wp.x - here.x, wp.z - here.z);
            t.position.x += ((wp.x - here.x) / wd) * step;
            t.position.z += ((wp.z - here.z) / wd) * step;
          }
          if (wd - step < 1) t.path.shift();
          break;
        }
        case 'anchoring':
          if (t.t >= T.anchorTime) {
            t.phase = 'firing';
            t.t = 0;
            ctx.particles.emit('fire', _p.copy(t.position).setY(S), 4, 0.4);
          }
          break;
        case 'firing':
          if (t.t >= T.harpoonTime) {
            t.phase = 'tethered';
            t.t = 0;
            t.tether = { x: t.position.x, z: t.position.z, length: d + T.slack };
            t.tetherTtl = T.tetherTime * ctx.tetherDurationMult;
            ctx.shake(0.15);
          }
          break;
        case 'tethered':
          if (t.t >= t.tetherTtl || !ctx.monster.alive) this.release(t);
          break;
        case 'cooldown':
          if (t.t >= T.cooldown) {
            t.phase = d <= T.range ? 'firing' : 'driving';
            t.t = 0;
          }
          break;
      }
    }
    this.draw();
  }

  private draw(): void {
    const mp = this.ctx?.monster.position;
    let n = 0;
    this.trucks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _m.compose(_p.set(t.position.x, S * 0.25, t.position.z), _q, _s.set(S * 0.5, S * 0.45, S * 1.4));
      this.bed.setMatrixAt(i * 2, _m);
      _p.set(Math.sin(t.heading), 0, Math.cos(t.heading)).multiplyScalar(S * 0.75).add(t.position).setY(S * 0.4);
      _m.compose(_p, _q, _s.set(S * 0.5, S * 0.6, S * 0.4));
      this.cab.setMatrixAt(i * 2, _m);
      // Harpoon cannon on the bed, tilted toward the monster when deployed.
      const tilt = t.phase === 'driving' ? 0 : -0.5;
      _q.setFromAxisAngle(UP, t.heading).multiply(_tilt.setFromAxisAngle(X_AXIS, tilt));
      _m.compose(_p.copy(t.position).setY(S * 0.65), _q, _s.set(S * 0.18, S * 0.18, S * 0.9));
      this.cab.setMatrixAt(i * 2 + 1, _m);
      this.bed.setMatrixAt(i * 2 + 1, HIDDEN);
      if (mp && (t.phase === 'firing' || t.phase === 'tethered')) {
        const k = t.phase === 'firing' ? Math.min(1, t.t / T.harpoonTime) : 1;
        _a.copy(t.position).setY(S * 0.7);
        _b.set(mp.x, 250 * CONFIG.monster.scale, mp.z);
        _b.lerpVectors(_a, _b, k);
        const len = _a.distanceTo(_b);
        _p.addVectors(_a, _b).multiplyScalar(0.5);
        _q.setFromUnitVectors(UP, _s.subVectors(_b, _a).normalize());
        _m.compose(_p, _q, _s.set(CABLE_WIDTH, len, CABLE_WIDTH));
        this.cable.setMatrixAt(n++, _m);
      }
    });
    this.cab.count = this.bed.count = this.trucks.length * 2;
    this.cable.count = n;
    for (const m of [this.cab, this.bed, this.cable]) m.instanceMatrix.needsUpdate = true;
  }
}
