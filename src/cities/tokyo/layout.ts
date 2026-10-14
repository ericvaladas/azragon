import { CONFIG } from '../../config';
import { hash2, valueNoise } from '../noise';
import type { BaySpec, DistrictId, IslandSpec } from '../types';
import { isIsland } from '../../world/roads';
import { coastDistance } from '../coast';

export { coastDistance } from '../coast';

/** World metres; north is +Z, west is +X, east is −X. The crash is at the origin. */
export const SHIBUYA_CROSSING = { x: 200, z: 1000 } as const;
export const SHINJUKU = { x: 1100, z: 2900 } as const;
export const TMG_SITE = { x: 1300, z: 2900 } as const;
export const TOKYO_TOWER_SITE = { x: -300, z: 1500 } as const;
export const SKYTREE_SITE = { x: -1900, z: 3100 } as const;
/** Tokyo Bay: the south-east coast. */
export const TOKYO_BAY: BaySpec = { dir: { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }, offset: 2000, amp: 150, wavelength: 1400 };
/** The Odaiba-style island out in the bay. */
export const TOKYO_ISLAND: IslandSpec = { center: { x: -2613, z: -1913 }, halfAlong: 350, halfAcross: 450 };
/** The port: land within this many metres of the coastline (along the bay's dir). */
export const PORT_DEPTH = 600;

/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core. First match wins; unmatched core points are office / mixed. */
const CORE_REGIONS: readonly Region[] = [
  { district: 'neon', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z, r: 420 },
  // The Imperial Palace gardens (east of the crash) and Shiba Park around Tokyo Tower.
  { district: 'park', x0: -1600, z0: 200, x1: -1000, z1: 1000 },
  { district: 'park', x0: -800, z0: 1400, x1: -200, z1: 1600 },
  // Neon streets along Shinjuku's east edge, then the towers.
  { district: 'neon', x0: 200, z0: 2000, x1: 600, z1: 3400 },
  { district: 'highrise', x0: 400, z0: 2000, x1: 2000, z1: 3400 },
  { district: 'highrise', x0: -1400, z0: 1600, x1: -800, z1: 2400 },
  // The intro dive's line (due south of the crash): a station with neon streets amid office blocks, so the fall
  // passes over a dense, lit city rather than low-rise housing.
  { district: 'neon', x: 0, z: -2000, r: 340 },
  { district: 'office', x0: -2400, z0: -3600, x1: 2400, z1: -900 },
  { district: 'residential', x0: 1600, z0: -4000, x1: 4000, z1: 1150 },
  { district: 'residential', x0: -4000, z0: -4000, x1: 4000, z1: -900 },
];

const inRegion = (r: Region, x: number, z: number): boolean =>
  'r' in r ? Math.hypot(x - r.x, z - r.z) <= r.r : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const SEED = CONFIG.world.seed + 501;
/** Beyond the core: a "station" may sit in each STATION_CELL square; neon within STATION_R of it. */
const STATION_CELL = 1600;
const STATION_R = 260;

function nearStation(x: number, z: number): boolean {
  const cx = Math.floor(x / STATION_CELL);
  const cz = Math.floor(z / STATION_CELL);
  for (let i = cx - 1; i <= cx + 1; i++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      if (hash2(i, j, SEED) > 0.7) continue;
      const sx = (i + 0.2 + 0.6 * hash2(i, j, SEED + 1)) * STATION_CELL;
      const sz = (j + 0.2 + 0.6 * hash2(i, j, SEED + 2)) * STATION_CELL;
      if (Math.hypot(x - sx, z - sz) < STATION_R) return true;
    }
  }
  return false;
}

/**
 * Tokyo's district at world point (x, z). The island is office with one park block at its centre cell; the port is
 * the land within PORT_DEPTH of the coast (off the crash site); then the hand-laid core near the crash, seeded noise
 * beyond.
 */
export function districtAt(x: number, z: number): DistrictId {
  const cell = CONFIG.world.blockSize;
  const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
  if (isIsland({ bay: TOKYO_BAY, island: TOKYO_ISLAND }, ci, cj)) {
    const centre = ci === Math.floor(TOKYO_ISLAND.center.x / cell) && cj === Math.floor(TOKYO_ISLAND.center.z / cell);
    return centre ? 'park' : 'office';
  }
  const coast = coastDistance(TOKYO_BAY, x, z);
  if (coast >= 0 && coast <= PORT_DEPTH && Math.hypot(x, z) > CONFIG.world.clearRadius + cell) return 'port';
  if (Math.hypot(x, z) <= CORE_RADIUS) {
    for (const r of CORE_REGIONS) if (inRegion(r, x, z)) return r.district;
    return 'office';
  }
  if (nearStation(x, z)) return 'neon';
  if (valueNoise(x, z, 2200, SEED + 3) > 0.78) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.55 ? 'residential' : 'office';
}
