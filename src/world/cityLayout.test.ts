import { describe, it, expect } from 'vitest';
import { generateCityLayout } from './cityLayout';
import { CONFIG } from '../config';

describe('generateCityLayout', () => {
  const a = generateCityLayout(1337);

  it('is deterministic per seed', () => {
    expect(generateCityLayout(1337)).toEqual(a);
    expect(generateCityLayout(7).buildings).not.toEqual(a.buildings);
  });

  it('produces a dense city', () => {
    expect(a.buildings.length).toBeGreaterThan(500);
    expect(a.trees.length).toBeGreaterThan(20);
  });

  it('keeps the crater clearing empty', () => {
    for (const b of a.buildings) {
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(CONFIG.world.clearRadius);
    }
  });

  it('never places a building across a road line', () => {
    const cell = (v: number) => Math.floor((v - a.roadOrigin) / a.pitch);
    for (const b of a.buildings) {
      expect(cell(b.x - b.w / 2)).toBe(cell(b.x + b.w / 2));
      expect(cell(b.z - b.d / 2)).toBe(cell(b.z + b.d / 2));
    }
  });

  it('heights stay within config bounds', () => {
    for (const b of a.buildings) {
      expect(b.h).toBeGreaterThanOrEqual(CONFIG.world.minBuildingH);
      expect(b.h).toBeLessThanOrEqual(CONFIG.world.maxBuildingH);
    }
  });
});
