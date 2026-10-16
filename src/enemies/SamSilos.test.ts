import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SamSilos } from './SamSilos';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Vec2 } from '../util/math';
import { spawnDirection } from '../systems/runaway';

const LAND = { x: 123, z: 456 };
const RUBBLE = { x: 900, z: -300, rubble: true };
const PARK = { x: -700, z: 800, rubble: false };
const ctx = (sites: { x: number; z: number; rubble: boolean }[] = [RUBBLE]): WorldContext =>
  ({
    openGround: () => sites,
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
    // Spawns pick a direction all round the monster, as when it isn't running away.
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    // `nearest` may land on a bridge deck; `nearestLand` never does.
    roads: { nearest: (p: Vec2) => p, nearestLand: () => LAND, path: (_a: Vec2, b: Vec2) => [b] },
  }) as unknown as WorldContext;

describe('SamSilos spawn', () => {
  it('rises out of an open-ground site (rubble or a park), not a road', () => {
    const s = new SamSilos(new THREE.Scene());
    expect(s.spawn(ctx())).toBe(true);
    const silos = s.targets().filter((t) => t.kind === 'sam');
    expect(silos.length).toBe(1);
    expect(silos[0]!.position.x).toBe(RUBBLE.x);
    expect(silos[0]!.position.z).toBe(RUBBLE.z);
  });

  it('skips the spawn, reporting it, when there is no open ground in range', () => {
    const s = new SamSilos(new THREE.Scene());
    expect(s.spawn(ctx([]))).toBe(false);
    expect(s.count()).toBe(0);
  });

  it('never puts a second silo on a site already holding one', () => {
    const s = new SamSilos(new THREE.Scene());
    const c = ctx([RUBBLE, PARK]);
    s.spawn(c);
    s.spawn(c);
    const xs = s.targets().filter((t) => t.kind === 'sam').map((t) => t.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([PARK.x, RUBBLE.x]);
    expect(s.spawn(c)).toBe(false);
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
