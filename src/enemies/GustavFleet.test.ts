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

function makeCtx(hpMult = 1) {
  const shots: { t: number; damage: number }[] = [];
  const crushes: { r: number; amount: number }[] = [];
  const destroyed: { t: Target; exp: number }[] = [];
  const clock = { t: 0 };
  const monster = { position: new THREE.Vector3(1300, 0, 0), alive: true, airborne: false, height: 385 };
  const ctx = {
    monster,
    difficulty: { hpMult, dmgMult: 1 },
    level: 1,
    rng: mulberry32(9),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    damageBuildings: (_p: Vec2, r: number, amount: number) => crushes.push({ r, amount }),
    fireGustavShell: (_from: THREE.Vector3, _to: THREE.Vector3, damage: number) => shots.push({ t: clock.t, damage }),
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, shots, crushes, destroyed, monster, clock };
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

  it('drives at its speed, stops in range and fires on the cooldown rhythm', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    const g = f.targets()[0]!;
    run(f, c, 4);
    expect(g.position.x).toBeCloseTo(G.speed * 4, -1);
    expect(c.shots).toEqual([]);
    run(f, c, 36);
    const stopAt = 1300 - G.range;
    expect(g.position.x).toBeGreaterThan(stopAt - G.speed * DT * 2);
    expect(g.position.x).toBeLessThan(stopAt + G.speed * DT * 2);
    const reach = stopAt / G.speed;
    expect(c.shots.length).toBe(3);
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

  it('flattens buildings within crushRadius as it goes', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 0, c.ctx);
    run(f, c, 1);
    expect(c.crushes.length).toBeGreaterThan(0);
    for (const k of c.crushes) {
      expect(k.r).toBe(G.crushRadius);
      expect(k.amount).toBeCloseTo(G.crushDps * DT, 6);
    }
  });

  it('a dead Gustav never fires, and blasts the buildings around it', () => {
    const f = new GustavFleet(new THREE.Scene());
    const c = makeCtx();
    c.monster.position.set(500, 0, 0);
    f.spawnAt(0, 0, c.ctx);
    f.targets()[0]!.applyDamage(1e9);
    expect(c.crushes.some((k) => k.r === G.deathBlastRadius && k.amount === G.deathBlastDamage)).toBe(true);
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
