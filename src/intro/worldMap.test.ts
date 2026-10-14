import { describe, it, expect } from 'vitest';
import { landAt } from './worldMap';

// Spot checks given as [name, lat, lon]; landAt takes (lon, lat).
const LAND: [string, number, number][] = [
  ['Toronto', 43.7, -79.4],
  ['Tokyo', 35.7, 139.7],
  ['Sahara', 23, 13],
  ['Brazil', -10, -55],
  ['Australia', -25, 134],
  ['Moscow', 55.8, 37.6],
  ['London', 51.5, -0.1],
];
const OCEAN: [string, number, number][] = [
  ['mid-Atlantic', 30, -40],
  ['mid-Pacific', 0, -150],
  ['Indian Ocean', -20, 80],
  ['Sea of Japan', 40, 135],
  ['Lake Superior', 47.7, -87.5],
  ['Hudson Bay', 59, -86],
  ['Mediterranean', 35, 18],
];

describe('landAt', () => {
  for (const [name, lat, lon] of LAND) it(`${name} is land`, () => expect(landAt(lon, lat)).toBe(true));
  for (const [name, lat, lon] of OCEAN) it(`${name} is water`, () => expect(landAt(lon, lat)).toBe(false));
  it('covers a plausible share of the globe (about 30% land by area, ignoring the ice caps)', () => {
    let land = 0;
    let total = 0;
    for (let lat = -60; lat <= 70; lat += 2) {
      const w = Math.cos((lat * Math.PI) / 180);
      for (let lon = -180; lon < 180; lon += 2) {
        total += w;
        if (landAt(lon, lat)) land += w;
      }
    }
    expect(land / total).toBeGreaterThan(0.22);
    expect(land / total).toBeLessThan(0.38);
  });
});
