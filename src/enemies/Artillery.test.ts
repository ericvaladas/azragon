import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Artillery } from './Artillery';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Vec2 } from '../util/math';
import { spawnDirection } from '../systems/runaway';

const ctx = (blocked: (x: number, z: number) => boolean): WorldContext =>
  ({
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
    // Spawns pick a direction all round the monster, as when it isn't running away.
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    blocked,
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
  }) as unknown as WorldContext;

describe('Artillery spawn', () => {
  it('never places a gun inside a blocked spot (a landmark footprint)', () => {
    const a = new Artillery(new THREE.Scene());
    // Block everything west of the monster (x > 0): with seed 7 the unmodified spawn lands west, so this forces a retry.
    const c = ctx((x) => x > 0);
    for (let i = 0; i < 20; i++) a.spawn(c);
    const guns = a.targets();
    expect(guns.length).toBeGreaterThan(0);
    for (const g of guns) expect(g.position.x).toBeLessThanOrEqual(0);
  });
});

describe('Artillery range', () => {
  const A = CONFIG.artillery;
  /** A context whose monster stands where `monster` says, with the stubs a salvo needs. */
  const live = (monster: THREE.Vector3): WorldContext =>
    ({ ...ctx(() => false), monster: { position: monster, alive: true, airborne: false }, particles: { ring: () => {}, explosion: () => {}, emit: () => {} }, splash: () => {}, shake: () => {}, damageMonster: () => {}, damageBuildings: () => {} }) as unknown as WorldContext;
  const centre = (a: Artillery) => {
    const g = a.targets();
    return { x: g.reduce((n, t) => n + t.position.x, 0) / g.length, z: g.reduce((n, t) => n + t.position.z, 0) / g.length };
  };

  it('places a battery distMin..distMax from the monster, inside its firing range', () => {
    expect(A.distMax).toBeLessThan(A.range);
    for (let k = 0; k < 10; k++) {
      const a = new Artillery(new THREE.Scene());
      a.spawn(live(new THREE.Vector3()));
      const c = centre(a);
      const d = Math.hypot(c.x, c.z);
      expect(d).toBeGreaterThanOrEqual(A.distMin - 1);
      expect(d).toBeLessThanOrEqual(A.distMax + 1);
    }
  });

  it('holds fire while the monster is beyond range, and fires once it comes back', () => {
    const a = new Artillery(new THREE.Scene());
    const monster = new THREE.Vector3();
    const c = live(monster);
    a.spawn(c);
    const g = centre(a);
    // Away from the battery, past its range.
    const len = Math.hypot(g.x, g.z);
    monster.set((-g.x / len) * (A.range + 500 - len), 0, (-g.z / len) * (A.range + 500 - len));
    for (let t = 0; t < A.salvoEvery * 2 + A.fillTime; t += 0.05) a.update(0.05, c);
    expect(a.strikeNear({ x: monster.x, z: monster.z })).toBe(false);
    monster.set(0, 0, 0);
    for (let t = 0; t < A.fillTime * 0.6; t += 0.05) a.update(0.05, c);
    expect(a.strikeNear({ x: 0, z: 0 })).toBe(true);
  });
});
