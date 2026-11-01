import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { EnemySystem, WorldContext } from './types';
import { toonMat } from '../render/toon';
import { TURRET, hullGeometry, turretGeometry } from './tankModel';
import { dist2, type Vec2 } from '../util/math';
import { escaped, fleePoint } from './retreat';

const REPLAN_EVERY = 4;
const MAX_TANKS = CONFIG.spawns.tank.cap;
const S = CONFIG.tank.size;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Tank implements Target {
  readonly kind = 'tank' as const;
  readonly airborne = false;
  readonly radius = S * 0.6;
  readonly position = new THREE.Vector3();
  hp: number = CONFIG.tank.hp;
  alive = true;
  heading = 0;
  turretYaw = 0;
  path: Vec2[] = [];
  replanT = 0;
  /** Heading out of the map; the route to the monster was dropped when the retreat began. */
  fleeing = false;
  fireCd = 0;
  flashT = 0;

  constructor(private onDamage: (t: Tank, amount: number) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Up to maxTanks tanks drawn as two vertex-coloured InstancedMeshes (hull, and turret with its gun). */
export class TankFleet implements EnemySystem {
  readonly kind = 'tank' as const;
  private ctx: WorldContext | null = null;
  private tanks: Tank[] = [];
  private hull: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const mat = toonMat(0xffffff, { vertexColors: true });
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_TANKS);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      for (let i = 0; i < MAX_TANKS; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
      return m;
    };
    this.hull = mk(hullGeometry());
    this.turret = mk(turretGeometry());
  }

  targets(): readonly Target[] {
    return this.tanks;
  }

  count(): number {
    return this.tanks.length;
  }

  clear(): void {
    for (const t of this.tanks) t.alive = false;
    this.tanks = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    const d = ctx.spawnDir();
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const around = ctx.monster.position;
    const p = ctx.roads.nearest({ x: around.x + d.x * r, z: around.z + d.z * r });
    this.spawnAt(p.x, p.z, ctx);
  }

  /** Spawn a tank at an exact point (assumed on a road), HP scaled by difficulty. */
  spawnAt(x: number, z: number, ctx: WorldContext): void {
    if (this.tanks.length >= MAX_TANKS) return;
    const t = new Tank(this.damage);
    t.hp = CONFIG.tank.hp * ctx.difficulty.hpMult;
    t.position.set(x, S * 0.3, z);
    t.fireCd = 1 + ctx.rng() * CONFIG.tank.fireCooldown;
    this.tanks.push(t);
  }

  private damage = (t: Tank, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    t.flashT = 0.1;
    if (t.hp <= 0) {
      t.alive = false;
      this.ctx?.onDestroyed(t, CONFIG.tank.exp);
    }
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const monster = ctx.monster.position;
    const T = CONFIG.tank;
    const retreating = ctx.retreating === true;
    const goal = { x: monster.x, z: monster.z };
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (!t.alive) {
        this.tanks.splice(i, 1);
        continue;
      }
      t.flashT = Math.max(0, t.flashT - dt);
      const here = { x: t.position.x, z: t.position.z };
      if (retreating && escaped(here, goal)) {
        t.alive = false;
        this.tanks.splice(i, 1);
        continue;
      }
      if (retreating && !t.fleeing) {
        t.fleeing = true;
        t.path = [];
      }
      const d = dist2(here, goal);
      t.turretYaw = Math.atan2(goal.x - here.x, goal.z - here.z);

      if (!retreating && d <= T.range) {
        t.fireCd -= dt;
        if (t.fireCd <= 0) {
          t.fireCd = T.fireCooldown;
          const muzzle = new THREE.Vector3(Math.sin(t.turretYaw), 0, Math.cos(t.turretYaw)).multiplyScalar(S * TURRET.muzzle).add(t.position).setY(S * TURRET.gunY);
          const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, (220 + Math.random() * 200) * CONFIG.monster.scale, (Math.random() - 0.5) * 160));
          ctx.fireShell(muzzle, aim, T.damage);
        }
        continue;
      }

      t.replanT -= dt;
      if (t.path.length === 0 || t.replanT <= 0) {
        t.path = ctx.roads.path(here, retreating ? fleePoint(here, goal, CONFIG.cycle.exitDistance + 200) : goal);
        t.replanT = REPLAN_EVERY;
      }
      const wp = t.path[0];
      if (!wp) continue;
      const wd = dist2(here, wp);
      const step = Math.min(wd, T.speed * dt);
      if (wd > 1e-3) {
        t.heading = Math.atan2(wp.x - here.x, wp.z - here.z);
        t.position.x += ((wp.x - here.x) / wd) * step;
        t.position.z += ((wp.z - here.z) / wd) * step;
      }
      if (wd - step < 1) t.path.shift();
    }
    this.draw();
  }

  private draw(): void {
    this.tanks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _p.set(t.position.x, 0, t.position.z);
      _s.setScalar(S);
      _m.compose(_p, _q, _s);
      this.hull.setMatrixAt(i, _m);
      _q.setFromAxisAngle(UP, t.turretYaw);
      _m.compose(_p, _q, _s);
      this.turret.setMatrixAt(i, _m);
      _c.setHex(t.flashT > 0 ? 0xffd0a0 : 0xffffff);
      this.hull.setColorAt(i, _c);
      this.turret.setColorAt(i, _c);
    });
    for (const m of [this.hull, this.turret]) {
      m.count = this.tanks.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
