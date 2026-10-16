import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { GustavFleet } from './GustavFleet';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';
import type { Vec2 } from '../util/math';

const G = CONFIG.gustav;
const DT = 0.05;
/** Where the monster stands in the driving tests: 400 m beyond the Gustav's range from the origin. */
const START = G.range + 400;

function makeCtx(hpMult = 1) {
  const shots: { t: number; damage: number }[] = [];
  const crushes: { r: number; amount: number }[] = [];
  const rings: { kind: string; x: number; z: number; r: number }[] = [];
  const destroyed: { t: Target; exp: number }[] = [];
  const clock = { t: 0 };
  const monster = { position: new THREE.Vector3(START, 0, 0), alive: true, airborne: false, height: 385 };
  const ctx = {
    monster,
    difficulty: { hpMult, dmgMult: 1 },
    level: 1,
    rng: mulberry32(9),
    particles: { ring: (kind: string, at: THREE.Vector3, r: number) => rings.push({ kind, x: at.x, z: at.z, r }), explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    damageBuildings: (_p: Vec2, r: number, amount: number) => crushes.push({ r, amount }),
    fireGustavShell: (_from: THREE.Vector3, _to: THREE.Vector3, damage: number) => shots.push({ t: clock.t, damage }),
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, shots, crushes, rings, destroyed, monster, clock };
}

function run(f: GustavFleet, c: ReturnType<typeof makeCtx>, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    c.clock.t += DT;
    f.update(DT, c.ctx);
  }
}

describe('GustavFleet', () => {
  it('spawns on a road with difficulty-scaled HP, at most two alive', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx(1.5);
    expect(f.spawn(c.ctx)).toBe(true);
    expect(f.spawn(c.ctx)).toBe(true);
    expect(f.spawn(c.ctx)).toBe(false);
    expect(f.count()).toBe(2);
    const g = f.targets()[0]!;
    expect(g.kind).toBe('gustav');
    expect(g.airborne).toBe(false);
    g.applyDamage(G.hp * 1.5 - 1);
    expect(g.isAlive()).toBe(true);
    g.applyDamage(2);
    expect(g.isAlive()).toBe(false);
    expect(c.destroyed).toEqual([{ t: g, exp: G.exp }]);
  });

  it('spawns just outside its firing range, spawnBeyond..spawnBeyond + spawnSpread m past it', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    for (let k = 0; k < 20; k++) {
      f.clear();
      f.spawn(c.ctx);
      const g = f.targets()[0]!;
      const d = Math.hypot(g.position.x - c.monster.position.x, g.position.z - c.monster.position.z);
      expect(d).toBeGreaterThanOrEqual(G.range + G.spawnBeyond);
      expect(d).toBeLessThanOrEqual(G.range + G.spawnBeyond + G.spawnSpread);
    }
    expect(G.range + G.spawnBeyond).toBeGreaterThan(G.range);
  });

  it('drives at its speed, stops in range and fires on the cooldown rhythm', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    const g = f.targets()[0]!;
    run(f, c, 4);
    expect(g.position.x).toBeCloseTo(G.speed * 4, -1);
    expect(c.shots).toEqual([]);
    run(f, c, 36);
    const stopAt = START - G.range;
    expect(g.position.x).toBeGreaterThan(stopAt - G.speed * DT * 2);
    expect(g.position.x).toBeLessThan(stopAt + G.speed * DT * 2);
    const reach = stopAt / G.speed;
    expect(c.shots.length).toBe(Math.floor((40 - c.shots[0]!.t) / G.fireCooldown + 1e-6) + 1);
    expect(c.shots[0]!.t).toBeGreaterThanOrEqual(reach + G.firstShotMin - DT);
    expect(c.shots[0]!.t).toBeLessThanOrEqual(reach + G.firstShotMax + DT * 2);
    for (let i = 1; i < c.shots.length; i++) expect(c.shots[i]!.t - c.shots[i - 1]!.t).toBeCloseTo(G.fireCooldown, 0);
    for (const s of c.shots) expect(s.damage).toBe(G.damage);
  });

  it('drives again when the monster leaves range, and holds fire', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 12);
    c.monster.position.set(4000, 0, 0);
    const shots = c.shots.length;
    const g = f.targets()[0]!;
    const x0 = g.position.x;
    run(f, c, 10);
    expect(g.position.x).toBeGreaterThan(x0 + G.speed * 9);
    expect(c.shots.length).toBe(shots);
  });

  it('holds its ground and keeps firing while the monster lingers just past range', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 20);
    const g = f.targets()[0]!;
    const x0 = g.position.x;
    const fired = c.shots.length;
    c.monster.position.set(x0 + G.range + G.disengageMargin / 2, 0, 0);
    run(f, c, 25);
    expect(g.position.x).toBe(x0);
    expect(c.shots.length).toBeGreaterThanOrEqual(fired + 2);
  });

  it('plans a fresh route to the monster the moment it walks out of range', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    const asked: Vec2[] = [];
    (c.ctx.roads as { path: (a: Vec2, b: Vec2) => Vec2[] }).path = (_a, b) => {
      asked.push({ x: b.x, z: b.z });
      return [{ x: b.x, z: b.z }];
    };
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 10);
    c.monster.position.set(0, 0, -3000);
    asked.length = 0;
    run(f, c, DT);
    expect(asked).toEqual([{ x: 0, z: -3000 }]);
  });

  it('re-plans toward a moving monster', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    c.monster.position.set(0, 0, 3000);
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 2);
    c.monster.position.set(3000, 0, 0);
    run(f, c, G.replanEvery + 4);
    const g = f.targets()[0]!;
    expect(g.position.x).toBeGreaterThan(G.speed * 2);
  });

  it('never damages buildings, driving or dying', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 30);
    f.targets()[0]!.applyDamage(1e9);
    run(f, c, 1);
    expect(c.crushes).toEqual([]);
  });

  it('fires without throwing up a dust cloud around itself', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 25);
    const g = f.targets()[0]!;
    expect(c.shots.length).toBeGreaterThan(0);
    expect(c.rings.filter((r) => Math.hypot(r.x - g.position.x, r.z - g.position.z) < 1)).toEqual([]);
  });

  it('is drawn just wider than a road', () => {
    const scene = new THREE.Scene();
    const f = new GustavFleet(scene);
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    expect(G.width).toBeGreaterThan(CONFIG.world.roadWidth);
    expect(G.width).toBeLessThan(CONFIG.world.roadWidth * 1.3);
    const hull = scene.children[0] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    hull.getMatrixAt(0, m);
    const box = new THREE.Box3().setFromBufferAttribute(hull.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(m);
    // Spawned facing the monster along +x, so the hull's width lies along z.
    expect(box.max.z - box.min.z).toBeCloseTo(G.width, 0);
  });

  it('a dead Gustav never fires', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    c.monster.position.set(500, 0, 0);
    f.spawnAt(0, 0, c.ctx);
    f.targets()[0]!.applyDamage(1e9);
    run(f, c, 20);
    expect(c.shots).toEqual([]);
    expect(f.count()).toBe(0);
  });

  it('clear removes every instance', () => {
    const scene = new THREE.Scene();
    const f = new GustavFleet(scene);
    const c = makeCtx();
    f.spawn(c.ctx);
    f.spawn(c.ctx);
    run(f, c, 1);
    f.clear();
    expect(f.count()).toBe(0);
    expect(f.targets()).toHaveLength(0);
    for (const m of scene.children) expect((m as THREE.InstancedMesh).count).toBe(0);
  });
});
