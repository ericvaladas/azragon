import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import { toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import type { CityLayout } from '../world/cityLayout';
import { planRoadPath, snapToRoad } from '../world/roads';

const REPLAN_EVERY = 4;
const MAX_TANKS = CONFIG.director.maxTanks;
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

/** Up to maxTanks tanks drawn as three InstancedMeshes (hull, turret, barrel). */
export class TankFleet {
  private tanks: Tank[] = [];
  private hull: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;
  private barrel: THREE.InstancedMesh;

  constructor(
    scene: THREE.Scene,
    private layout: CityLayout,
    private onDestroyed: OnDestroyed,
    private fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void,
  ) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mk = (color: number) => {
      const m = new THREE.InstancedMesh(box, toonMat(color), MAX_TANKS);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      for (let i = 0; i < MAX_TANKS; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
      return m;
    };
    this.hull = mk(CONFIG.palette.tank);
    this.turret = mk(CONFIG.palette.tankDark);
    this.barrel = mk(CONFIG.palette.tankDark);
  }

  targets(): readonly Target[] {
    return this.tanks;
  }

  count(): number {
    return this.tanks.length;
  }

  clear(): void {
    this.tanks = [];
    this.draw();
  }

  /** Spawn on a north-south road at roughly spawnRing distance from `around`, inside the city. */
  spawn(around: THREE.Vector3, rng: () => number): void {
    if (this.tanks.length >= MAX_TANKS) return;
    const a = rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + rng() * 0.3);
    const lim = this.layout.half;
    const x = snapToRoad(Math.max(-lim, Math.min(lim, around.x + Math.cos(a) * r)), this.layout.roadOrigin, this.layout.pitch);
    const z = Math.max(-lim, Math.min(lim, around.z + Math.sin(a) * r));
    const t = new Tank(this.damage);
    t.position.set(x, S * 0.3, z);
    t.fireCd = 1 + rng() * CONFIG.tank.fireCooldown;
    this.tanks.push(t);
  }

  private damage = (t: Tank, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    t.flashT = 0.1;
    if (t.hp <= 0) {
      t.alive = false;
      this.onDestroyed(t, CONFIG.tank.exp);
    }
  };

  update(dt: number, monster: THREE.Vector3): void {
    const T = CONFIG.tank;
    const goal = { x: monster.x, z: monster.z };
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (!t.alive) {
        this.tanks.splice(i, 1);
        continue;
      }
      t.flashT = Math.max(0, t.flashT - dt);
      const here = { x: t.position.x, z: t.position.z };
      const d = dist2(here, goal);
      t.turretYaw = Math.atan2(goal.x - here.x, goal.z - here.z);

      if (d <= T.range) {
        t.fireCd -= dt;
        if (t.fireCd <= 0) {
          t.fireCd = T.fireCooldown;
          const muzzle = new THREE.Vector3(Math.sin(t.turretYaw), 0, Math.cos(t.turretYaw)).multiplyScalar(S * 0.8).add(t.position).setY(S * 0.5);
          const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, (220 + Math.random() * 200) * CONFIG.monster.scale, (Math.random() - 0.5) * 160));
          this.fire(muzzle, aim, T.damage);
        }
        continue;
      }

      t.replanT -= dt;
      if (t.path.length === 0 || t.replanT <= 0) {
        t.path = planRoadPath(here, goal, this.layout.roadOrigin, this.layout.pitch);
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
      _m.compose(_p.set(t.position.x, S * 0.18, t.position.z), _q, _s.set(S * 0.6, S * 0.35, S));
      this.hull.setMatrixAt(i, _m);
      _q.setFromAxisAngle(UP, t.turretYaw);
      _m.compose(_p.set(t.position.x, S * 0.45, t.position.z), _q, _s.set(S * 0.42, S * 0.22, S * 0.46));
      this.turret.setMatrixAt(i, _m);
      _p.set(Math.sin(t.turretYaw), 0, Math.cos(t.turretYaw)).multiplyScalar(S * 0.5).add(t.position).setY(S * 0.47);
      _m.compose(_p, _q, _s.set(S * 0.08, S * 0.08, S * 0.6));
      this.barrel.setMatrixAt(i, _m);
      _c.setHex(t.flashT > 0 ? 0xffd0a0 : 0xffffff);
      this.hull.setColorAt(i, _c);
      this.turret.setColorAt(i, _c);
    });
    for (const m of [this.hull, this.turret, this.barrel]) {
      m.count = this.tanks.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
