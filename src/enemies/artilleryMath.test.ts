import { describe, it, expect } from 'vitest';
import { salvoSize, strikeFill, strikeHits, strikePoints } from './artilleryMath';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const A = CONFIG.artillery;

describe('strikeFill', () => {
  it('fills linearly from 0 to 1 over fillTime and clamps', () => {
    expect(strikeFill(0, 2)).toBe(0);
    expect(strikeFill(1, 2)).toBeCloseTo(0.5);
    expect(strikeFill(5, 2)).toBe(1);
    expect(strikeFill(-1, 2)).toBe(0);
  });
});

describe('strikeHits', () => {
  it('hits inside or on the radius, misses outside', () => {
    expect(strikeHits({ x: 0, z: 0 }, { x: 60, z: 0 }, 90)).toBe(true);
    expect(strikeHits({ x: 0, z: 0 }, { x: 90, z: 0 }, 90)).toBe(true);
    expect(strikeHits({ x: 0, z: 0 }, { x: 91, z: 0 }, 90)).toBe(false);
  });
});

describe('salvoSize', () => {
  const L = CONFIG.spawns.artillery.unlockLevel;
  it('starts at baseSalvo at the artillery unlock level, +1 every levelsPerExtra, capped', () => {
    expect(salvoSize(L)).toBe(A.baseSalvo);
    expect(salvoSize(L + A.levelsPerExtra)).toBe(A.baseSalvo + 1);
    expect(salvoSize(1)).toBe(A.baseSalvo);
    expect(salvoSize(999)).toBe(A.maxSalvo);
  });
});

describe('strikePoints', () => {
  it('returns n points within spread, the first exactly on the centre', () => {
    const c = { x: 500, z: -200 };
    const pts = strikePoints(c, 5, 260, mulberry32(1));
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(c);
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThanOrEqual(260);
  });
});
