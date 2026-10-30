import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { chunkTargets, inkPhase, inkVictims } from './inkStorm';

const U = CONFIG.kraken.ultimate;
const T = U.t;
const target = (x: number, y = 0, extra: Partial<Target> = {}): Target => ({
  kind: y > 0 ? 'heli' : 'tank',
  position: new THREE.Vector3(x, y, 0),
  radius: 30,
  airborne: y > 0,
  isAlive: () => true,
  applyDamage: () => {},
  ...extra,
});
const c = { x: 0, z: 0 };

describe('inkPhase', () => {
  it('phases', () => {
    expect(inkPhase(0).time).toBe(1);
    expect(inkPhase(1).time).toBeCloseTo(U.timeScale);
    expect(inkPhase(T.end).time).toBe(1);
    expect(inkPhase(T.leapFrom - 0.01).height).toBe(0);
    expect(inkPhase(T.peakAt).height).toBeCloseTo(U.peak);
    expect(inkPhase((T.peakAt + T.inkTo) / 2).height).toBeCloseTo(U.peak);
    expect(inkPhase(T.inkTo).height).toBeCloseTo(U.peak);
    expect(inkPhase(T.fallTo).height).toBe(0);
    expect(inkPhase(T.inkFrom - 0.01).ink).toBe(0);
    expect(inkPhase(T.inkTo).ink).toBe(1);
    expect(inkPhase(T.end).ink).toBe(0);
    expect(inkPhase(T.sky).sky).toBe(1);
    expect(inkPhase(T.rainFrom).rain).toBe(0);
    expect(inkPhase(2).rain).toBe(1);
    expect(inkPhase(T.end).sky).toBe(0);
    expect(inkPhase(T.end).rain).toBe(0);
    expect(inkPhase(2).camera).toBe(1);
    expect(inkPhase(T.end - 0.01).done).toBe(false);
    expect(inkPhase(T.end).done).toBe(true);
  });
});

describe('inkVictims', () => {
  it('ink takes the ground inside, nearest first, never aircraft', () => {
    const far = target(800);
    const near = target(100);
    const edge = target(U.radius + 20);
    const out = target(U.radius + 40);
    const heli = target(50, 300);
    const dead = target(10, 0, { isAlive: () => false });
    const boss = target(200, 0, { boss: true });
    const v = inkVictims(c, U.radius, [far, heli, near, out, edge, dead, boss]);
    expect(v.ground).toEqual([near, far, edge]);
    expect(v.bosses).toEqual([boss]);
  });
});

describe('chunkTargets', () => {
  it('nearest eight aircraft, one chunk each', () => {
    const air = Array.from({ length: 12 }, (_, i) => target(60 * (12 - i), 400 + i * 50));
    const ground = [target(5), target(10)];
    const outside = target(U.radius + 100, 300);
    const got = chunkTargets(c, U.radius, [...ground, ...air, outside], U.chunks);
    expect(got).toHaveLength(8);
    expect(new Set(got).size).toBe(8);
    expect(got).toEqual([...air].reverse().slice(0, 8));
    expect(got.every((t) => t.airborne)).toBe(true);
  });
  it('an airborne boss gets a chunk too (it is hurt, not killed, when it lands)', () => {
    const boss = target(1, 300, { boss: true });
    expect(chunkTargets(c, U.radius, [target(50, 300), boss], U.chunks)[0]).toBe(boss);
  });
});
