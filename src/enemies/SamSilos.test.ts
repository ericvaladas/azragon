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

describe('SamSilos stay surfaced', () => {
  const run = () => {
    const c = { ...ctx(), damageMonster: () => {}, splash: () => {} } as unknown as WorldContext;
    const s = new SamSilos(new THREE.Scene());
    s.spawn(c);
    const silo = s.targets().find((t) => t.kind === 'sam')!;
    const volleys: number[] = [];
    let alwaysUp = true;
    let prev = 0;
    const dt = 0.05;
    for (let i = 1; i <= 1200; i++) {
      s.update(dt, c);
      const t = i * dt;
      const missiles = s.targets().filter((x) => x.kind !== 'sam').length;
      if (missiles > prev) volleys.push(t);
      prev = missiles;
      if (t > 1.2 && !silo.isAlive()) alwaysUp = false;
    }
    return { volleys, alwaysUp };
  };

  it('rises once and stays targetable from then on', () => {
    expect(run().alwaysUp).toBe(true);
  });

  it('keeps the old volley rhythm: first volley after rising + fire delay, then every rise + up + sink + down time', () => {
    const { volleys } = run();
    expect(volleys.length).toBeGreaterThanOrEqual(4);
    expect(volleys[0]!).toBeCloseTo(2.2, 1);
    for (let k = 1; k < volleys.length; k++) {
      const gap = volleys[k]! - volleys[k - 1]!;
      expect(gap).toBeGreaterThanOrEqual(12 - 0.06);
      expect(gap).toBeLessThanOrEqual(14 + 0.06);
    }
  });
});
