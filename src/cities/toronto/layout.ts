import { CONFIG } from '../../config';
import { hash2, valueNoise } from '../noise';
import { coastDistance } from '../coast';
import type { BaySpec, DistrictId, RiverSpec } from '../types';
import { AVENUE_WIDTH, PITCH, isRiverBank, isWater, lineWidth } from '../../world/roads';
import { AVENUE_PAVEMENT } from '../../world/chunks';

/**
 * World metres from the crash. Toronto's +Z is south (toward the lake), so +X is east (the player's left at play
 * start) and −X west (their right). The start camera looks down Yonge Street (x = 0) toward the lake.
 */
export const YONGE_DUNDAS = { x: -100, z: 900 } as const;
export const FINANCIAL = { x: -300, z: 1500 } as const;
/** City Hall stands in the south of its block; Nathan Phillips Square is the paved strip north of it (the camera side). */
export const CITY_HALL_SITE = { x: -500, z: 1135 } as const;
export const CN_TOWER_SITE = { x: -500, z: 1900 } as const;
/** Centred on the interior of block (−800..−600, 1800..2000), the block just west of the tower's, so the dome sits at its west foot. */
export const ROGERS_CENTRE_SITE = { x: -700, z: 1891 } as const;
/** The Ontario Legislature: the interior centre of block (−1200..−1000, −200..0), at the head of University Avenue. */
export const QUEENS_PARK_SITE = { x: -1109, z: -109 } as const;
/** Casa Loma: the centre of block (−1800..−1600, −2400..−2200). */
export const CASA_LOMA_SITE = { x: -1700, z: -2300 } as const;
/** Scotiabank Arena: the interior centre of block (0..200, 1800..2000), at the foot of Yonge by the waterfront. */
export const SCOTIABANK_ARENA_SITE = { x: 109, z: 1891 } as const;
/** Lake Ontario: everything south of a gently wavering line near z = 2250 (land ends at z = 2200 almost everywhere). */
export const TORONTO_LAKE: BaySpec = { dir: { x: 0, z: 1 }, offset: 2250, amp: 60, wavelength: 1500 };
/** The Don: north–south, east of downtown, its banks a green ravine. */
export const DON: RiverSpec = { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 };
/** The lakeshore band: land within this many metres of the coastline. */
export const PORT_DEPTH = 400;
/** Inside the core, the lakeshore band is port (quays and condos) only between these x. */
export const WATERFRONT = { x0: 0, x1: 1400 } as const;
/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

/**
 * The Yonge tower corridor: blocks whose centre lies within halfWidth of Yonge (x = 0), from z0 (north, past the
 * crash) to z1 (the downtown edge), are office, inside and beyond the core, except the crater and the hand-laid
 * Yonge-Dundas and Financial District regions.
 */
export const YONGE_CORRIDOR = { halfWidth: 300, z0: -6000, z1: 1000 } as const;
/** The corridor's high-rise nodes: the blocks whose centre lies in each rectangle. Yonge-Eglinton spans the band's full width. */
export const YONGE_NODES = [
  { name: 'Bloor-Yonge', z: -1200, x0: -200, x1: 200, z0: -1400, z1: -1000 },
  { name: 'St. Clair', z: -2600, x0: -200, x1: 200, z0: -2800, z1: -2400 },
  { name: 'Yonge-Eglinton', z: -4200, x0: -300, x1: 300, z0: -4400, z1: -4000 },
] as const;
/** Chance a residential block is a parkette (a park block), by a hash of its cell. */
export const PARKETTE_CHANCE = 1 / 8;

/** Pale condo glass: CityPlace and King West. */
export const CONDO_COLORS = [0xcfe3e6, 0x9fd0cf, 0x7fb8c4, 0xe2ecec, 0x8cc4c9, 0xb7d3dc] as const;
/** University Avenue: blue-grey glass and pale limestone. */
export const UNIVERSITY_COLORS = [0x7c94ac, 0x7d8e9c, 0xb8ada0, 0x7088a0, 0xa8b4bc] as const;
/** Kensington Market's painted houses: pink, teal, yellow, purple, orange, sky blue. */
export const KENSINGTON_COLORS = [0xe86aa0, 0x3fb8a8, 0xf2c94c, 0x9a4fd0, 0xf08a5d, 0x6cc4e8] as const;

/**
 * A named area: the blocks ci0..ci1 × cj0..cj1 (inclusive), or the blocks whose centre lies in the ellipse of radii
 * rx × rz about (x, z). `colors`, when set, replaces the district's facade tints on the area's random buildings.
 */
export type Area = { name: string; district: DistrictId; colors?: readonly number[] } & (
  | { ci0: number; ci1: number; cj0: number; cj1: number }
  | { x: number; z: number; rx: number; rz: number }
);

/**
 * Toronto's named areas west of Yonge, and the Distillery District east of it, checked inside and beyond the core
 * ahead of everything but the islands (High Park reaches down over the lakeshore band to the water).
 */
export const AREAS: readonly Area[] = [
  // Yorkville: towers just west of the Bloor-Yonge node.
  { name: 'Yorkville', district: 'highrise', ci0: -4, ci1: -3, cj0: -7, cj1: -6 },
  // University Avenue: the blocks either side of the x = −1000 avenue, from Queen's Park south to the Financial row.
  { name: 'University Avenue', district: 'highrise', colors: UNIVERSITY_COLORS, ci0: -6, ci1: -5, cj0: 0, cj1: 6 },
  // CityPlace: condo towers west of the Rogers Centre.
  { name: 'CityPlace', district: 'highrise', colors: CONDO_COLORS, ci0: -7, ci1: -6, cj0: 8, cj1: 9 },
  // King West / Liberty Village: condo towers, a block clear of the lakeshore band.
  { name: 'King West', district: 'highrise', colors: CONDO_COLORS, ci0: -13, ci1: -12, cj0: 7, cj1: 8 },
  // Chinatown: both sides of Spadina (x = −1800), from z 200 to 1200.
  { name: 'Chinatown', district: 'neon', ci0: -10, ci1: -9, cj0: 1, cj1: 5 },
  // Kensington Market: painted houses just west of Chinatown.
  { name: 'Kensington Market', district: 'residential', colors: KENSINGTON_COLORS, ci0: -12, ci1: -11, cj0: 1, cj1: 3 },
  // Queen's Park: the green round the Legislature, at the head of University Avenue.
  { name: "Queen's Park", district: 'park', ci0: -7, ci1: -5, cj0: -2, cj1: -1 },
  // U of T: campus lawns west of Queen's Park (its stone halls are hand-placed lots).
  { name: 'U of T', district: 'park', ci0: -9, ci1: -8, cj0: -3, cj1: -1 },
  // High Park: about 1.8 km across, far west, down to the lake.
  { name: 'High Park', district: 'park', x: -4900, z: 1100, rx: 850, rz: 1100 },
  // Casa Loma's gardens: the castle's block.
  { name: 'Casa Loma', district: 'park', ci0: -9, ci1: -9, cj0: -12, cj1: -12 },
  // The Distillery District: brick warehouses (hand-placed lots) on paved lanes.
  { name: 'Distillery District', district: 'office', ci0: 4, ci1: 5, cj0: 8, cj1: 8 },
];

/** The area holding the block that contains (x, z), if any. */
export function areaAt(x: number, z: number): Area | undefined {
  const cell = CONFIG.world.blockSize;
  const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
  const cx = (ci + 0.5) * cell, cz = (cj + 0.5) * cell;
  return AREAS.find((a) => ('ci0' in a ? ci >= a.ci0 && ci <= a.ci1 && cj >= a.cj0 && cj <= a.cj1 : ((cx - a.x) / a.rx) ** 2 + ((cz - a.z) / a.rz) ** 2 <= 1));
}

/** The facade tints for the random buildings of the block at (x, z): its area's, if the area sets them. */
export function blockColors(x: number, z: number): readonly number[] | undefined {
  return areaAt(x, z)?.colors;
}

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core, ahead of the corridor. First match wins. */
const CORE_LANDMARK_REGIONS: readonly Region[] = [
  // Yonge-Dundas: the one neon block, just west of Yonge.
  { district: 'neon', x0: -200, z0: 800, x1: 0, z1: 1000 },
  // The Financial District: the block at its centre and its four neighbours.
  { district: 'highrise', x: FINANCIAL.x, z: FINANCIAL.z, r: 250 },
];
/** The rest of the hand-laid core, behind the corridor. Unmatched core points are midtown. */
const CORE_REGIONS: readonly Region[] = [
  // Downtown: from the City Hall row to the lake, west of the Don's banks.
  { district: 'office', x0: -1800, z0: 1000, x1: 1200, z1: 2400 },
];

const inRegion = (r: Region, x: number, z: number): boolean =>
  'r' in r ? Math.hypot(x - r.x, z - r.z) <= r.r : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const SEED = CONFIG.world.seed + 601;

/** The corridor's district at (x, z): high-rise in a node, office elsewhere on the band, null off it or in the crater. */
function corridorAt(x: number, z: number): DistrictId | null {
  const C = YONGE_CORRIDOR;
  if (Math.abs(x) > C.halfWidth || z < C.z0 || z > C.z1) return null;
  if (Math.hypot(x, z) < CONFIG.world.clearRadius + CONFIG.world.blockSize / 2) return null;
  return YONGE_NODES.some((n) => x >= n.x0 && x <= n.x1 && z >= n.z0 && z <= n.z1) ? 'highrise' : 'office';
}

/** Houses, or a parkette on a PARKETTE_CHANCE share of blocks (by a hash of the block, never in the crater). */
function midtown(x: number, z: number): DistrictId {
  const cell = CONFIG.world.blockSize;
  const crater = Math.hypot(x, z) < CONFIG.world.clearRadius + cell;
  return !crater && hash2(Math.floor(x / cell), Math.floor(z / cell), SEED + 7) < PARKETTE_CHANCE ? 'park' : 'residential';
}

/**
 * Toronto's district at world point (x, z), before the tower pockets. The islands are park, then the named AREAS hold their blocks. The lakeshore band (PORT_DEPTH of the coast, off
 * the crash site) is port: in the core only on the waterfront, beyond it all along. Then Yonge-Dundas and the Financial
 * District, the Yonge corridor (inside and beyond the core), the rest of the hand-laid core, midtown where unmatched,
 * and seeded noise beyond. Midtown residential blocks, in the core and beyond, are parkettes on a seeded hash. The
 * Don's bank parks are applied on top by blockDistrict.
 */
function baseDistrictAt(x: number, z: number): DistrictId {
  const cell = CONFIG.world.blockSize;
  const area = areaAt(x, z);
  if (area) return area.district;
  const r = Math.hypot(x, z);
  const coast = coastDistance(TORONTO_LAKE, x, z);
  const lakeshore = coast >= 0 && coast <= PORT_DEPTH && r > CONFIG.world.clearRadius + cell;
  if (lakeshore && (r > CORE_RADIUS || (x >= WATERFRONT.x0 && x <= WATERFRONT.x1))) return 'port';
  if (r <= CORE_RADIUS) for (const reg of CORE_LANDMARK_REGIONS) if (inRegion(reg, x, z)) return reg.district;
  const corridor = corridorAt(x, z);
  if (corridor) return corridor;
  if (r <= CORE_RADIUS) {
    for (const reg of CORE_REGIONS) if (inRegion(reg, x, z)) return reg.district;
    return midtown(x, z);
  }
  if (valueNoise(x, z, 2600, SEED + 3) > 0.8) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.62 ? midtown(x, z) : 'office';
}

/** Tower pockets: at most one per POCKET_GRID × POCKET_GRID blocks (1.2 km square, about 1.44 km²). */
export const POCKET_GRID = 6;
/** A pocket's blocks as offsets from its anchor: one block, two side by side, or three in an L, all within 2 × 2. */
const POCKET_SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1]],
];
/** Anchors tried per grid cell before it is left without a pocket. */
const POCKET_TRIES = 3;
/** The water, for the Don bank test. */
const WATERS = { river: DON, bay: TORONTO_LAKE } as const;
/** The blocks the landmarks stand on. */
const LANDMARK_BLOCKS = [CN_TOWER_SITE, ROGERS_CENTRE_SITE, CITY_HALL_SITE, QUEENS_PARK_SITE, CASA_LOMA_SITE, SCOTIABANK_ARENA_SITE].map((s) => ({
  ci: Math.floor(s.x / CONFIG.world.blockSize),
  cj: Math.floor(s.z / CONFIG.world.blockSize),
}));

/**
 * True when block (ci, cj) may hold a pocket: midtown houses (not a parkette or water), a block clear of every named
 * area and landmark block, no part of it within clearRadius + half a block of the crash, and off the Don's bank parks.
 */
function pocketEligible(ci: number, cj: number): boolean {
  const cell = CONFIG.world.blockSize;
  const x = (ci + 0.5) * cell, z = (cj + 0.5) * cell;
  const nx = Math.max(Math.abs(x) - cell / 2, 0), nz = Math.max(Math.abs(z) - cell / 2, 0);
  if (Math.hypot(nx, nz) < CONFIG.world.clearRadius + cell / 2) return false;
  if (isWater(WATERS, ci, cj) || isRiverBank(WATERS, ci, cj)) return false;
  // A block's gap to every named area and landmark block, so the campus, the market and the castle keep their setting.
  if (LANDMARK_BLOCKS.some((b) => Math.abs(b.ci - ci) <= 1 && Math.abs(b.cj - cj) <= 1)) return false;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (areaAt(x + di * cell, z + dj * cell)) return false;
  return baseDistrictAt(x, z) === 'residential';
}

/** The pocket hash's seed. */
const POCKET_SEED = SEED + 41;

const pocketCache = new Map<string, readonly (readonly [number, number])[]>();
/**
 * The pocket blocks of grid cell (gi, gj). A seeded hash picks an anchor block 1..POCKET_GRID − 2 blocks into the
 * cell and a shape; the shape's eligible blocks are the pocket. When none is eligible another anchor is tried, up to
 * POCKET_TRIES. Anchors keep a block's margin to the cell's edge, so pockets in neighbouring cells never touch.
 */
function pocketBlocks(gi: number, gj: number): readonly (readonly [number, number])[] {
  const key = `${gi},${gj}`;
  const hit = pocketCache.get(key);
  if (hit) return hit;
  let blocks: (readonly [number, number])[] = [];
  for (let t = 0; t < POCKET_TRIES && blocks.length === 0; t++) {
    const ai = gi * POCKET_GRID + 1 + Math.floor(hash2(gi, gj, POCKET_SEED + 3 * t) * (POCKET_GRID - 2));
    const aj = gj * POCKET_GRID + 1 + Math.floor(hash2(gi, gj, POCKET_SEED + 1 + 3 * t) * (POCKET_GRID - 2));
    const shape = POCKET_SHAPES[Math.floor(hash2(gi, gj, POCKET_SEED + 2 + 3 * t) * POCKET_SHAPES.length)]!;
    blocks = shape.map(([di, dj]) => [ai + di, aj + dj] as const).filter(([i, j]) => pocketEligible(i, j));
  }
  if (pocketCache.size > 4096) pocketCache.clear();
  pocketCache.set(key, blocks);
  return blocks;
}

/** True when the block holding (x, z) is in a tower pocket: a cluster of 1–3 blocks of condo towers among the houses. */
export function pocketAt(x: number, z: number): boolean {
  const cell = CONFIG.world.blockSize;
  const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
  return pocketBlocks(Math.floor(ci / POCKET_GRID), Math.floor(cj / POCKET_GRID)).some(([i, j]) => i === ci && j === cj);
}

/**
 * Toronto's district at world point (x, z): the hand-laid and seeded districts, with the tower pockets raised as
 * high-rise among midtown's houses, inside and beyond the core. The Don's bank parks are applied on top by
 * blockDistrict (pockets avoid them).
 */
export function districtAt(x: number, z: number): DistrictId {
  const base = baseDistrictAt(x, z);
  return base === 'residential' && pocketAt(x, z) ? 'highrise' : base;
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
