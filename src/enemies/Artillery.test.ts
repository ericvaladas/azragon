import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Artillery } from './Artillery';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Vec2 } from '../util/math';

const ctx = (blocked: (x: number, z: number) => boolean): WorldContext =>
  ({
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
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
