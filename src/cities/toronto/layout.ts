import { CONFIG } from '../../config';
import { valueNoise } from '../noise';
import { coastDistance } from '../coast';
import type { BaySpec, DistrictId, IslandSpec, RiverSpec } from '../types';
import { AVENUE_WIDTH, PITCH, isIsland, lineWidth } from '../../world/roads';
import { AVENUE_PAVEMENT } from '../../world/chunks';

/**
 * World metres from the crash. Toronto's +Z is south (toward the lake), so +X is east (the player's left at play
 * start) and −X west (their right). The start camera looks down Yonge Street (x = 0) toward the lake.
 */
export const YONGE_DUNDAS = { x: -100, z: 900 } as const;
export const FINANCIAL = { x: -300, z: 1500 } as const;
/** City Hall stands in the south of its block; Nathan Phillips Square is the paved strip north of it (the camera side). */
export const CITY_HALL_SITE = { x: -500, z: 1135 } as const;
export const CN_TOWER_SITE = { x: -700, z: 1900 } as const;
/** Centred on the interior of block (−1200..−1000, 1800..2000), whose east and south sides are avenues. */
export const ROGERS_CENTRE_SITE = { x: -1110, z: 1890 } as const;
/** Lake Ontario: everything south of a gently wavering line near z = 2250 (land ends at z = 2200 almost everywhere). */
export const TORONTO_LAKE: BaySpec = { dir: { x: 0, z: 1 }, offset: 2250, amp: 60, wavelength: 1500 };
/** The Toronto Islands: long and low, east–west, one lake row offshore. */
export const TORONTO_ISLANDS: IslandSpec = { center: { x: -300, z: 2900 }, halfAlong: 250, halfAcross: 900 };
/** The Don: north–south, east of downtown, its banks a green ravine. */
export const DON: RiverSpec = { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 };
/** The lakeshore band: land within this many metres of the coastline. */
export const PORT_DEPTH = 400;
/** Inside the core, the lakeshore band is port (quays and condos) only between these x. */
export const WATERFRONT = { x0: 0, x1: 1400 } as const;
/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core. First match wins; unmatched core points are residential midtown. */
const CORE_REGIONS: readonly Region[] = [
  // Yonge-Dundas: the one neon block, just west of Yonge.
  { district: 'neon', x0: -200, z0: 800, x1: 0, z1: 1000 },
  // The Financial District: the block at its centre and its four neighbours.
  { district: 'highrise', x: FINANCIAL.x, z: FINANCIAL.z, r: 250 },
  // Downtown: from the City Hall row to the lake, west of the Don's banks.
  { district: 'office', x0: -1800, z0: 1000, x1: 1200, z1: 2400 },
];

const inRegion = (r: Region, x: number, z: number): boolean =>
  'r' in r ? Math.hypot(x - r.x, z - r.z) <= r.r : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const SEED = CONFIG.world.seed + 601;

/**
 * Toronto's district at world point (x, z). The islands are park. The lakeshore band (PORT_DEPTH of the coast, off
 * the crash site) is port: in the core only on the waterfront, beyond it all along. Then the hand-laid core, residential
 * where unmatched, and seeded noise beyond. The Don's bank parks are applied on top by blockDistrict.
 */
export function districtAt(x: number, z: number): DistrictId {
  const cell = CONFIG.world.blockSize;
  if (isIsland({ bay: TORONTO_LAKE, island: TORONTO_ISLANDS }, Math.floor(x / cell), Math.floor(z / cell))) return 'park';
  const r = Math.hypot(x, z);
  const coast = coastDistance(TORONTO_LAKE, x, z);
  const lakeshore = coast >= 0 && coast <= PORT_DEPTH && r > CONFIG.world.clearRadius + cell;
  if (lakeshore && (r > CORE_RADIUS || (x >= WATERFRONT.x0 && x <= WATERFRONT.x1))) return 'port';
  if (r <= CORE_RADIUS) {
    for (const reg of CORE_REGIONS) if (inRegion(reg, x, z)) return reg.district;
    return 'residential';
  }
  if (valueNoise(x, z, 2600, SEED + 3) > 0.8) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.62 ? 'residential' : 'office';
}

/** The buildable interior of block (ci, cj), as generateChunk lays lots: inset by half of each bordering line, plus pavement beside an avenue. */
export function blockInterior(ci: number, cj: number): { x0: number; x1: number; z0: number; z1: number } {
  const inset = (line: number) => lineWidth(line) / 2 + (lineWidth(line) === AVENUE_WIDTH ? AVENUE_PAVEMENT : 0);
  return { x0: PITCH * ci + inset(ci), x1: PITCH * (ci + 1) - inset(ci + 1), z0: PITCH * cj + inset(cj), z1: PITCH * (cj + 1) - inset(cj + 1) };
}

/** Centre of lot (a, b) of an n × n grid over block (ci, cj)'s interior. */
export function lotCentre(ci: number, cj: number, n: number, a: number, b: number): { x: number; z: number } {
  const r = blockInterior(ci, cj);
  return { x: r.x0 + ((a + 0.5) * (r.x1 - r.x0)) / n, z: r.z0 + ((b + 0.5) * (r.z1 - r.z0)) / n };
}
