import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { DISTRICTS, type DistrictId } from '../types';
import { CORE_RADIUS, PORT_DEPTH, SHIBUYA_CROSSING, SHINJUKU, TMG_SITE, TOKYO_BAY, TOKYO_ISLAND, coastDistance, districtAt } from './layout';
import { isBay, isIsland } from '../../world/roads';

describe('Tokyo layout', () => {
  it('puts the Shinjuku high-rise to the north and the Metropolitan Government Building inside it', () => {
    expect(SHINJUKU).toEqual({ x: 1100, z: 2900 });
    expect(TMG_SITE).toEqual({ x: 1300, z: 2900 });
    expect(districtAt(SHINJUKU.x, SHINJUKU.z)).toBe('highrise');
    expect(districtAt(TMG_SITE.x, TMG_SITE.z)).toBe('highrise');
  });
  it('puts the Shibuya Crossing north-west of the crash (+X is west), on a road intersection, in neon', () => {
    expect(SHIBUYA_CROSSING).toEqual({ x: 200, z: 1000 });
    expect(SHIBUYA_CROSSING.x).toBeGreaterThan(0);
    expect(SHIBUYA_CROSSING.z).toBeGreaterThan(0);
    expect(SHIBUYA_CROSSING.x % CONFIG.world.blockSize).toBe(0);
    expect(SHIBUYA_CROSSING.z % CONFIG.world.blockSize).toBe(0);
    expect(districtAt(SHIBUYA_CROSSING.x + 100, SHIBUYA_CROSSING.z + 100)).toBe('neon');
  });
  it('lines the east (−X) edge of Shinjuku with neon streets', () => {
    expect(districtAt(300, 3000)).toBe('neon');
  });
  it('sets Tokyo Tower in Shiba Park', () => {
    expect(districtAt(-500, 1500)).toBe('park');
  });
  it('keeps the intro dive line (due south of the crash, under the falling pod) dense: no low-rise housing', () => {
    // Its south-east corner reaches the waterfront, which is port.
    for (let x = -1400; x <= 1400; x += 200) for (let z = -3400; z <= -200; z += 200) {
      const coast = coastDistance(TOKYO_BAY, x, z);
      expect(coast >= 0 && coast <= PORT_DEPTH ? ['port'] : ['office', 'neon']).toContain(districtAt(x, z));
    }
    expect(districtAt(0, -2000)).toBe('neon');
  });
  it('never makes the crash site a park', () => {
    const W = CONFIG.world;
    for (let x = -1000; x <= 1000; x += 100) for (let z = -1000; z <= 1000; z += 100) {
      if (Math.hypot(x, z) < W.clearRadius + W.blockSize) expect(districtAt(x, z)).not.toBe('park');
    }
  });
  it('is deterministic', () => {
    for (const [x, z] of [[123, 456], [-9000, 12000], [40000, -3000]] as const) expect(districtAt(x, z)).toBe(districtAt(x, z));
  });
  it('beyond the core: every district appears, mostly residential or office, neon a minority', () => {
    const n: Record<DistrictId, number> = { highrise: 0, neon: 0, office: 0, residential: 0, park: 0, port: 0, industrial: 0 };
    let total = 0;
    for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
      const x = CORE_RADIUS + 1000 + i * 400;
      const z = -24000 + j * 400;
      n[districtAt(x, z)]++;
      total++;
    }
    for (const d of DISTRICTS) expect(n[d]).toBeGreaterThan(0);
    expect((n.residential + n.office) / total).toBeGreaterThan(0.6);
    expect(n.neon / total).toBeLessThan(0.2);
  });

  it('makes the land within 600 m of the coast port, off the island and the crash site', () => {
    const shore = { bay: TOKYO_BAY, island: TOKYO_ISLAND };
    let port = 0;
    for (let i = -40; i <= 20; i++) for (let j = -40; j <= 20; j++) {
      const x = 200 * (i + 0.5), z = 200 * (j + 0.5);
      const d = districtAt(x, z);
      if (isIsland(shore, i, j) || isBay(shore, i, j)) {
        expect(d).not.toBe('port');
        continue;
      }
      const coast = coastDistance(TOKYO_BAY, x, z);
      expect(d === 'port', `cell ${i},${j}`).toBe(coast <= PORT_DEPTH && Math.hypot(x, z) > CONFIG.world.clearRadius + 200);
      if (d === 'port') port++;
    }
    expect(port).toBeGreaterThan(50);
  });

  it('builds the island as office with one park block, at its centre cell', () => {
    const shore = { bay: TOKYO_BAY, island: TOKYO_ISLAND };
    const parks: [number, number][] = [];
    let island = 0;
    for (let i = -40; i <= 0; i++) for (let j = -40; j <= 0; j++) {
      if (!isIsland(shore, i, j)) continue;
      island++;
      const d = districtAt(200 * (i + 0.5), 200 * (j + 0.5));
      expect(['office', 'park']).toContain(d);
      if (d === 'park') parks.push([i, j]);
    }
    expect(island).toBeGreaterThan(6);
    expect(parks).toEqual([[Math.floor(TOKYO_ISLAND.center.x / 200), Math.floor(TOKYO_ISLAND.center.z / 200)]]);
  });

  it('leaves Shibuya, the landmarks and the crash site out of the port', () => {
    for (const [x, z] of [[200, 1000], [1300, 2900], [-300, 1500], [-1900, 3100], [0, 0], [-500, -500]] as const) {
      expect(districtAt(x, z)).not.toBe('port');
    }
  });
});
