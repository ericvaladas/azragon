import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { cutsceneK, fallPosition, fallbackSite, pickLandSite } from './meteorMath';

const M = CONFIG.meteor;
const total = M.lookUp + M.fallTime + M.hold + M.lookBack;
const sites = [
  { x: 1, z: 1, rubble: false },
  { x: 2, z: 2, rubble: true },
];

describe('pickLandSite', () => {
  it('skips blocked sites', () => {
    for (const r of [0, 0.3, 0.99]) expect(pickLandSite(sites, (x) => x === 1, () => r)).toEqual({ x: 2, z: 2 });
  });
  it('returns null when all are blocked', () => {
    expect(pickLandSite(sites, () => true, Math.random)).toBeNull();
  });
});

describe('fallbackSite', () => {
  it('sits in the land band', () => {
    for (let i = 0; i < 20; i++) {
      const p = fallbackSite({ x: 10, z: -20 }, Math.random, (v) => v);
      const d = Math.hypot(p.x - 10, p.z + 20);
      expect(d).toBeGreaterThanOrEqual(M.landMin - 1e-6);
      expect(d).toBeLessThanOrEqual(M.landMax + 1e-6);
    }
  });
});

describe('cutsceneK', () => {
  it('eases 0→1→0 over the total', () => {
    expect(cutsceneK(0)).toBe(0);
    expect(cutsceneK(M.lookUp / 2)).toBeGreaterThan(0);
    expect(cutsceneK(M.lookUp / 2)).toBeLessThan(1);
    expect(cutsceneK(M.lookUp)).toBe(1);
    expect(cutsceneK(M.lookUp + M.fallTime + M.hold)).toBe(1);
    expect(cutsceneK(total)).toBe(0);
    expect(cutsceneK(total + 5)).toBe(0);
    expect(cutsceneK(-1)).toBe(0);
  });
});

describe('fallPosition', () => {
  it('starts high and ends on the ground at the target', () => {
    const a = fallPosition({ x: 100, z: 200 }, 0);
    expect(a.y).toBe(M.startHeight);
    expect(Math.hypot(a.x - 100, a.z - 200)).toBeCloseTo(M.slant);
    const b = fallPosition({ x: 100, z: 200 }, M.fallTime + 5);
    expect([b.x, b.y, b.z]).toEqual([100, 0, 200]);
  });
});
