import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { EnemySystem, WorldContext } from './types';
import { toonMat } from '../render/toon';
import { angleDelta, dist2, type Vec2 } from '../util/math';
import { gustavMuzzle, hullGeometry, turretGeometry } from './gustavModel';

const G = CONFIG.gustav;
const MAX = CONFIG.spawns.gustav.cap;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Turns `from` toward `to` by at most `step` rad. */
const turn = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, angleDelta(from, to)));

class Gustav implements Target {
  readonly kind = 'gustav' as const;
  readonly airborne = false;
  readonly radius = G.size * 0.45;
  readonly position = new THREE.Vector3();
  hp: number = G.hp;
  alive = true;
  heading = 0;
  turretYaw = 0;
  path: Vec2[] = [];
  replanT = 0;
  /** Within range of the monster (stopped) since the last time it drove, and the time to its next shot. */
  engaged = false;
  fireCd = 0;
  flashT = 0;

  constructor(private onDamage: (g: Gustav, amount: number) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * Schwerer Gustav land battleships (at most CONFIG.spawns.gustav.cap): each follows the roads toward the monster,
 * flattening the buildings it rolls into, and within range stops, swings its gun round and fires a huge shell
 * straight at the monster on a slow reload. Drawn as two vertex-coloured InstancedMeshes (hull; turret with gun).
 */
export class GustavFleet implements EnemySystem {
  readonly kind = 'gustav' as const;
  private ctx: WorldContext | null = null;
  private units: Gustav[] = [];
  private hull: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const mat = toonMat(0xffffff, { vertexColors: true });
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      for (let i = 0; i < MAX; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
      return m;
    };
    this.hull = mk(hullGeometry());
    this.turret = mk(turretGeometry());
  }

  targets(): readonly Target[] {
    return this.units;
  }

  count(): number {
    return this.units.length;
  }

  clear(): void {
    this.units = [];
    this.draw();
  }

  /** On the road nearest a random point of the spawn ring; false at the cap. */
  spawn(ctx: WorldContext): boolean {
    const a = ctx.rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const m = ctx.monster.position;
    const p = ctx.roads.nearest({ x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r });
    return this.spawnAt(p.x, p.z, ctx);
  }

  /** A Gustav at an exact point (assumed on a road), facing the monster, HP scaled by difficulty; false at the cap. */
  spawnAt(x: number, z: number, ctx: WorldContext): boolean {
    this.ctx = ctx;
    if (this.units.length >= MAX) return false;
    const g = new Gustav(this.damage);
    g.hp = G.hp * ctx.difficulty.hpMult;
    g.position.set(x, G.size * 0.2, z);
    const m = ctx.monster.position;
    g.heading = g.turretYaw = Math.atan2(m.x - x, m.z - z);
    this.units.push(g);
    this.draw();
    return true;
  }

  private damage = (g: Gustav, amount: number): void => {
    if (!g.alive) return;
    g.hp -= amount;
    g.flashT = 0.1;
    if (g.hp > 0) return;
    g.alive = false;
    const ctx = this.ctx;
    if (!ctx) return;
    // A huge blast: several fireballs over the hull, a dust ring, and the buildings around it come down.
    for (const k of [-0.3, 0, 0.3]) {
      _v.set(g.position.x + Math.sin(g.heading) * G.size * k, g.position.y, g.position.z + Math.cos(g.heading) * G.size * k);
      ctx.particles.explosion(_v, 2.2);
    }
    ctx.particles.ring('dust', _v.set(g.position.x, 0, g.position.z), G.deathBlastRadius, 24);
    ctx.damageBuildings({ x: g.position.x, z: g.position.z }, G.deathBlastRadius, G.deathBlastDamage);
    ctx.shake(0.6);
    ctx.onDestroyed(g, G.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    const goal = { x: m.x, z: m.z };
    for (let i = this.units.length - 1; i >= 0; i--) {
      const g = this.units[i]!;
      if (!g.alive) {
        this.units.splice(i, 1);
        continue;
      }
      g.flashT = Math.max(0, g.flashT - dt);
      const here = { x: g.position.x, z: g.position.z };
      ctx.damageBuildings(here, G.crushRadius, G.crushDps * dt);
      const aim = Math.atan2(goal.x - here.x, goal.z - here.z);
      g.turretYaw = turn(g.turretYaw, aim, G.aimRate * dt);
      // Once stopped it holds until the monster is clearly out of range, so a monster at the edge can't stall its fire.
      if (dist2(here, goal) <= G.range + (g.engaged ? G.disengageMargin : 0)) {
        if (!g.engaged) {
          g.engaged = true;
          g.fireCd = G.firstShotMin + ctx.rng() * (G.firstShotMax - G.firstShotMin);
        }
        if (Math.abs(angleDelta(g.turretYaw, aim)) > G.aimTolerance) continue;
        g.fireCd -= dt;
        if (g.fireCd <= 0) {
          g.fireCd = G.fireCooldown;
          this.fire(g, ctx);
        }
        continue;
      }
      if (g.engaged) {
        // Driving again: the old route led to where the monster was, so plan afresh.
        g.engaged = false;
        g.path = [];
      }
      g.replanT -= dt;
      if (g.path.length === 0 || g.replanT <= 0) {
        g.path = ctx.roads.path(here, goal);
        g.replanT = G.replanEvery;
      }
      const wp = g.path[0];
      if (!wp) continue;
      const wd = dist2(here, wp);
      const step = Math.min(wd, G.speed * dt);
      if (wd > 1e-3) {
        g.heading = turn(g.heading, Math.atan2(wp.x - here.x, wp.z - here.z), G.turnRate * dt);
        g.position.x += ((wp.x - here.x) / wd) * step;
        g.position.z += ((wp.z - here.z) / wd) * step;
      }
      if (wd - step < 1) g.path.shift();
    }
    this.draw();
  }

  /** One shell from the muzzle at the monster's chest, with a big muzzle blast and a shake. */
  private fire(g: Gustav, ctx: WorldContext): void {
    const muzzle = gustavMuzzle(g.turretYaw, G.size, new THREE.Vector3()).add(_v.set(g.position.x, 0, g.position.z));
    const target = ctx.monster.position.clone().setY(ctx.monster.position.y + ctx.monster.height * 0.55);
    ctx.fireGustavShell(muzzle, target, G.damage);
    ctx.particles.emit('fire', muzzle, 10, 1.2);
    ctx.particles.emit('smoke', muzzle, 8, 1.5);
    ctx.shake(G.fireShake);
  }

  private draw(): void {
    this.units.forEach((g, i) => {
      _p.set(g.position.x, 0, g.position.z);
      _s.setScalar(G.size);
      _m.compose(_p, _q.setFromAxisAngle(UP, g.heading), _s);
      this.hull.setMatrixAt(i, _m);
      _m.compose(_p, _q.setFromAxisAngle(UP, g.turretYaw), _s);
      this.turret.setMatrixAt(i, _m);
      _c.setHex(g.flashT > 0 ? 0xffd0a0 : 0xffffff);
      this.hull.setColorAt(i, _c);
      this.turret.setColorAt(i, _c);
    });
    for (const m of [this.hull, this.turret]) {
      m.count = this.units.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
