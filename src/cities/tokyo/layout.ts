import { CONFIG } from '../../config';
import { hash2, valueNoise } from '../noise';
import type { DistrictId } from '../types';

/** World metres; north is +Z, west is +X, east is −X. The crash is at the origin. */
export const SHIBUYA_CROSSING = { x: 600, z: 1600 } as const;
export const SHINJUKU = { x: 300, z: 3100 } as const;
export const TMG_SITE = { x: 500, z: 3100 } as const;
/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core. First match wins; unmatched core points are office / mixed. */
const CORE_REGIONS: readonly Region[] = [
  { district: 'neon', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z, r: 450 },
  // Yoyogi Park and the Meiji Shrine woods.
  { district: 'park', x0: 900, z0: 2150, x1: 1700, z1: 2450 },
  // Neon streets along Shinjuku's east edge.
  { district: 'neon', x0: -1100, z0: 2500, x1: -500, z1: 3700 },
  { district: 'highrise', x0: -800, z0: 2500, x1: 1400, z1: 3700 },
  { district: 'residential', x0: 200, z0: -4000, x1: 4000, z1: 1150 },
  { district: 'residential', x0: -4000, z0: -4000, x1: 4000, z1: -700 },
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

/** Tokyo's district at world point (x, z): the hand-laid core near the crash, seeded noise beyond. */
export function districtAt(x: number, z: number): DistrictId {
  if (Math.hypot(x, z) <= CORE_RADIUS) {
    for (const r of CORE_REGIONS) if (inRegion(r, x, z)) return r.district;
    return 'office';
  }
  if (nearStation(x, z)) return 'neon';
  if (valueNoise(x, z, 2200, SEED + 3) > 0.78) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.55 ? 'residential' : 'office';
}
