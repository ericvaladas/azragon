import { CONFIG } from '../../config';
import { hash2, valueNoise } from '../noise';
import type { DistrictId } from '../types';

/** World metres; north is +Z, west is +X, east is −X. The crash is at the origin. */
export const SHIBUYA_CROSSING = { x: 200, z: 1000 } as const;
export const SHINJUKU = { x: 1100, z: 2900 } as const;
export const TMG_SITE = { x: 1300, z: 2900 } as const;
export const TOKYO_TOWER_SITE = { x: -300, z: 1500 } as const;
export const SKYTREE_SITE = { x: -1900, z: 3100 } as const;
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
