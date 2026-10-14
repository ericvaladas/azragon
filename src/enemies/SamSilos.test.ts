import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SamSilos } from './SamSilos';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Vec2 } from '../util/math';

const LAND = { x: 123, z: 456 };
const ctx = (): WorldContext =>
  ({
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    // `nearest` may land on a bridge deck; `nearestLand` never does.
    roads: { nearest: (p: Vec2) => p, nearestLand: () => LAND, path: (_a: Vec2, b: Vec2) => [b] },
  }) as unknown as WorldContext;

describe('SamSilos spawn', () => {
  it('puts each silo on a land road point (never a bridge deck)', () => {
    const s = new SamSilos(new THREE.Scene());
    s.spawn(ctx());
    const silos = s.targets().filter((t) => t.kind === 'sam');
    expect(silos.length).toBe(1);
    expect(silos[0]!.position.x).toBe(LAND.x);
    expect(silos[0]!.position.z).toBe(LAND.z);
  });
});
