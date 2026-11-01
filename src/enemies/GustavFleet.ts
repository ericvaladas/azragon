import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { EnemySystem, WorldContext } from './types';
import { toonMat } from '../render/toon';
import { angleDelta, dist2, type Vec2 } from '../util/math';
import { escaped, fleePoint } from './retreat';
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

/** Recoil travel (0..1) `t` s after a shot: a snap back over the first 0.08 s, then a smooth return by recoilTime. */
function recoilKick(t: number): number {
  const snap = 0.08;
  if (t < 0 || t >= G.recoilTime) return 0;
  if (t < snap) return t / snap;
  const u = (t - snap) / (G.recoilTime - snap);
  return 1 - u * u * (3 - 2 * u);
}

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
  /** Heading out of the map; the route to the monster was dropped when the retreat began. */
  fleeing = false;
  flashT = 0;
  /** Seconds since the last shot (drives the turret's recoil). */
  recoilT: number = G.recoilTime;

  constructor(private onDamage: (g: Gustav, amount: number) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * Schwerer Gustav land battleships (at most CONFIG.spawns.gustav.cap): each follows the roads toward the monster and,
 * within range, stops, swings its gun round and fires a huge shell straight at the monster on a slow reload, each shot
 * kicking the turret back. Drawn as two vertex-coloured InstancedMeshes (hull, narrowed to
 * CONFIG.gustav.width; turret with gun).
 */
export class GustavFleet implements EnemySystem {
  readonly kind = 'gustav' as const;
  private ctx: WorldContext | null = null;
  private units: Gustav[] = [];
  private hull: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;
  /** Hull x scale (per size unit) that draws it CONFIG.gustav.width across. */
  private hullXScale: number;

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
    const hullGeo = hullGeometry();
    hullGeo.computeBoundingBox();
    const box = hullGeo.boundingBox!;
    this.hullXScale = G.width / (G.size * (box.max.x - box.min.x));
    this.hull = mk(hullGeo);
    this.turret = mk(turretGeometry());
  }

  targets(): readonly Target[] {
    return this.units;
  }

  count(): number {
    return this.units.length;
  }

  clear(): void {
    for (const g of this.units) g.alive = false;
    this.units = [];
    this.draw();
  }

  /** On the road nearest a point in ctx.spawnDir just beyond its firing range (spawnBeyond..+spawnSpread m); false at the cap. */
  spawn(ctx: WorldContext): boolean {
    const d = ctx.spawnDir();
    const r = G.range + G.spawnBeyond + ctx.rng() * G.spawnSpread;
    const m = ctx.monster.position;
    const p = ctx.roads.nearest({ x: m.x + d.x * r, z: m.z + d.z * r });
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
    if (ctx.quiet) {
      ctx.onDestroyed(g, G.exp);
      return;
    }
    // A huge blast: several fireballs along the hull and a dust ring (buildings are left standing).
    for (const k of [-0.3, 0, 0.3]) {
      _v.set(g.position.x + Math.sin(g.heading) * G.size * k, g.position.y, g.position.z + Math.cos(g.heading) * G.size * k);
      ctx.particles.explosion(_v, 2.2);
    }
    ctx.particles.ring('dust', _v.set(g.position.x, 0, g.position.z), G.size * 1.4, 24);
    ctx.shake(0.6);
    ctx.onDestroyed(g, G.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    const retreating = ctx.retreating === true;
    const goal = { x: m.x, z: m.z };
    for (let i = this.units.length - 1; i >= 0; i--) {
      const g = this.units[i]!;
      if (!g.alive) {
        this.units.splice(i, 1);
        continue;
      }
      g.flashT = Math.max(0, g.flashT - dt);
      g.recoilT += dt;
      const here = { x: g.position.x, z: g.position.z };
      if (retreating && escaped(here, goal)) {
        g.alive = false;
        this.units.splice(i, 1);
        continue;
      }
      if (retreating && !g.fleeing) {
        g.fleeing = true;
        g.engaged = false;
        g.path = [];
      }
      const aim = Math.atan2(goal.x - here.x, goal.z - here.z);
      if (!retreating) g.turretYaw = turn(g.turretYaw, aim, G.aimRate * dt);
      // Once stopped it holds until the monster is clearly out of range, so a monster at the edge can't stall its fire.
      if (!retreating && dist2(here, goal) <= G.range + (g.engaged ? G.disengageMargin : 0)) {
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
        g.path = ctx.roads.path(here, retreating ? fleePoint(here, goal, CONFIG.cycle.exitDistance + 200) : goal);
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

  /** One shell from the muzzle at the monster's chest: a big muzzle blast, a recoil kick and a shake. */
  private fire(g: Gustav, ctx: WorldContext): void {
    const muzzle = gustavMuzzle(g.turretYaw, G.size, new THREE.Vector3()).add(_v.set(g.position.x, 0, g.position.z));
    const target = ctx.monster.position.clone().setY(ctx.monster.position.y + ctx.monster.height * 0.55);
    ctx.fireGustavShell(muzzle, target, G.damage);
    ctx.particles.emit('fire', muzzle, 14, 1.4);
    ctx.particles.emit('smoke', muzzle, 10, 1.8);
    g.recoilT = 0;
    ctx.shake(G.fireShake);
  }

  private draw(): void {
    this.units.forEach((g, i) => {
      _p.set(g.position.x, 0, g.position.z);
      _s.set(G.size * this.hullXScale, G.size, G.size);
      _m.compose(_p, _q.setFromAxisAngle(UP, g.heading), _s);
      this.hull.setMatrixAt(i, _m);
      // Recoil: the turret snaps back along its aim, then eases forward again.
      const kick = recoilKick(g.recoilT) * G.recoil * G.size;
      _p.set(g.position.x - Math.sin(g.turretYaw) * kick, 0, g.position.z - Math.cos(g.turretYaw) * kick);
      _s.setScalar(G.size);
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
