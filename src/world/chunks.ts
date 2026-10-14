import { CONFIG } from '../config';
import { mulberry32, pick, range } from '../util/rng';
import type { BuildingSpec, CityStyle, DistrictRules, LandmarkSpec, SignDef, YardRules } from '../cities/types';
import { hash2 } from '../cities/noise';
import { AVENUE_WIDTH, PITCH, isBay, blockDistrict, isIsland, isWater, lineWidth, segmentAt, type Axis, type Segment } from './roads';

export type { BuildingSpec } from '../cities/types';
export type TreeSpec = { x: number; z: number; s: number };
/** A park block, by its centre: drawn as a green pad under its trees. */
export type ParkSpec = { x: number; z: number };
/** An intersection at (x, z), drawn as a square `size` m across (the widest incident road). */
export type NodeSpec = { x: number; z: number; size: number };
/** A river cell, by its centre. */
export type WaterSpec = { x: number; z: number };
/** A gantry crane: portal centre (x, z) and yaw, its jib pointing along (sin yaw, cos yaw). Scenery only. */
export type CraneSpec = { x: number; z: number; yaw: number };
/**
 * A sea-wall edge: the centre (x, z) of a land cell's edge on a lattice line that borders a bay cell. `axis` is the
 * direction the wall runs along, `side` the direction (+1 or -1 along the other axis) from the land cell to the bay.
 */
export type SeaWallSpec = { x: number; z: number; axis: Axis; side: 1 | -1; ends: [SeaWallEnd, SeaWallEnd] };
/**
 * How a wall meets the next cell along its run, at its low and high end: `convex` (that cell is bay too, so the
 * perpendicular wall turns the corner: extend to its outer face), `concave` (the next land cell is also walled round
 * the corner: stop inside that wall), `straight` (a wall continues, or nothing does: small overlap).
 */
export type SeaWallEnd = 'convex' | 'concave' | 'straight';
/** Sea-wall dimensions (m): height, thickness, foam strip width, overlap at straight ends. */
export const SEA_WALL_SIZE = { height: 14, thick: 8, foam: 12, overlap: 6 } as const;
export type Rect = { x0: number; x1: number; z0: number; z1: number };

/**
 * The footprints of a sea-wall edge's wall and foam strip. The wall's inner face is half the road's width past the
 * edge, on the bay side; each end is extended (convex), retracted (concave) or overlapped (straight) so the walls form
 * a continuous coastline around corners without poking over land.
 */
export function seaWallRects(e: SeaWallSpec): { wall: Rect; foam: Rect } {
  const alongX = e.axis === 'x';
  const { thick, foam, overlap } = SEA_WALL_SIZE;
  const line = Math.round((alongX ? e.z : e.x) / PITCH);
  const inner = lineWidth(line) / 2;
  const cell = alongX ? e.x : e.z;
  const ends = [-1, 1].map((t, k) => {
    const corner = cell + (t * PITCH) / 2;
    const half = lineWidth(Math.round(corner / PITCH)) / 2;
    const kind = e.ends[k]!;
    const wall = kind === 'convex' ? half + thick : kind === 'concave' ? -(half + thick / 2) : overlap;
    const fm = kind === 'convex' ? half + thick + foam : wall;
    return [corner + t * wall, corner + t * fm] as const;
  });
  const across = (a: number, b: number) => (e.side > 0 ? [(alongX ? e.z : e.x) + a, (alongX ? e.z : e.x) + b] : [(alongX ? e.z : e.x) - b, (alongX ? e.z : e.x) - a]) as [number, number];
  const make = (k: 0 | 1, a: number, b: number): Rect => {
    const [lo, hi] = [ends[0]![k], ends[1]![k]];
    const [c0, c1] = across(a, b);
    return alongX ? { x0: lo, x1: hi, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: lo, z1: hi };
  };
  return { wall: make(0, inner, inner + thick), foam: make(1, inner + thick, inner + thick + foam) };
}

/** End kinds of cell (i, j)'s wall on the edge toward (di, dj); the cell is land and (i+di, j+dj) is bay. */
function wallEnds(style: CityStyle, i: number, j: number, di: number, dj: number): [SeaWallEnd, SeaWallEnd] {
  const kind = (t: number): SeaWallEnd => {
    const ni = di !== 0 ? i : i + t, nj = di !== 0 ? j + t : j;
    if (isBay(style, ni, nj)) return 'convex';
    return !isWater(style, ni, nj) && !isWater(style, ni + di, nj + dj) ? 'concave' : 'straight';
  };
  return [kind(-1), kind(1)];
}

/**
 * `roads`: existing segments whose start node lies in the chunk. `nodes`: the chunk's intersections that have at
 * least one incident segment. `water`: the chunk's water cells (river and bay). `quays`: the chunk's port cells, by
 * centre, drawn as paving pads. `lawns`: the chunk's residential cells off the crater, by centre, when the style has a
 * lawn colour (drawn as green pads under the houses). `cranes`: gantry cranes on the chunk's coastal port cells. `seaWall`: one entry per land-cell edge that borders
 * a bay cell, emitted by the chunk owning the land cell.
 */
export type ChunkContent = {
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  parks: ParkSpec[];
  quays: ParkSpec[];
  lawns: ParkSpec[];
  cranes: CraneSpec[];
  landmarks: LandmarkSpec[];
  roads: Segment[];
  nodes: NodeSpec[];
  water: WaterSpec[];
  seaWall: SeaWallSpec[];
};
export type ChunkRef = { cx: number; cz: number; key: string; dist: number };

/** Road lines sit on every multiple of blockSize on both axes; chunks are chunkBlocks × chunkBlocks blocks. */
export const ROAD_ORIGIN = 0;
export const CHUNK_SIZE = CONFIG.world.blockSize * CONFIG.world.chunkBlocks;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function parseKey(key: string): [number, number] {
  const [a, b] = key.split(',');
  return [Number(a), Number(b)];
}

/** Distance from (x, z) to the nearest point of chunk (cx, cz); 0 when inside. */
function distToChunk(x: number, z: number, cx: number, cz: number): number {
  const dx = Math.max(cx * CHUNK_SIZE - x, 0, x - (cx + 1) * CHUNK_SIZE);
  const dz = Math.max(cz * CHUNK_SIZE - z, 0, z - (cz + 1) * CHUNK_SIZE);
  return Math.hypot(dx, dz);
}

/** Seed for one chunk, mixed from the world seed and chunk coordinates. */
function chunkSeed(seed: number, cx: number, cz: number): number {
  let h = (seed ^ Math.imul(cx, 0x9e3779b1) ^ Math.imul(cz, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Chunks whose nearest point lies within r of (x, z), nearest first. */
export function chunksInRadius(x: number, z: number, r: number): ChunkRef[] {
  const out: ChunkRef[] = [];
  const x0 = Math.floor((x - r) / CHUNK_SIZE);
  const x1 = Math.floor((x + r) / CHUNK_SIZE);
  const z0 = Math.floor((z - r) / CHUNK_SIZE);
  const z1 = Math.floor((z + r) / CHUNK_SIZE);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const dist = distToChunk(x, z, cx, cz);
      if (dist <= r) out.push({ cx, cz, key: chunkKey(cx, cz), dist });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/** The most chunks that can be loaded at once (anywhere inside a chunk, out to unloadRadius). */
export function maxLoadedChunks(): number {
  let max = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    max = Math.max(max, chunksInRadius((i / 4) * CHUNK_SIZE, (j / 4) * CHUNK_SIZE, CONFIG.world.unloadRadius).length);
  }
  return max;
}
/** Per-chunk caps, so a full load of the densest districts still fits the pools. */
export const BUILDINGS_PER_CHUNK = Math.floor(CONFIG.world.maxBuildings / maxLoadedChunks());
export const SIGNS_PER_CHUNK = Math.floor(CONFIG.world.maxSigns / maxLoadedChunks());
export const TREES_PER_CHUNK = Math.floor(CONFIG.world.maxTrees / maxLoadedChunks());

/** Pavement (m) between an avenue and the buildings of a block beside it; the avenue's street trees stand in it. */
export const AVENUE_PAVEMENT = 8;
/** Target spacing (m) of the street trees lining an avenue. */
const AVENUE_TREE_GAP = 28;

/** Width of the widest existing segment meeting node (i, j), or 0 when none does. */
export function nodeSize(style: CityStyle, i: number, j: number): number {
  let size = 0;
  for (const s of [segmentAt(style, 'x', i, j), segmentAt(style, 'x', i - 1, j), segmentAt(style, 'z', i, j), segmentAt(style, 'z', i, j - 1)]) {
    if (s) size = Math.max(size, s.width);
  }
  return size;
}

const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, gap = 0) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.z - b.z) * 2 < a.d + b.d + gap;

/** Vertical neon blades on the sides and, when `allowBillboard`, maybe a rooftop billboard, in the building's frame. */
function makeSigns(rules: DistrictRules, style: CityStyle, w: number, d: number, h: number, allowBillboard: boolean, rng: () => number): SignDef[] {
  const signs: SignDef[] = [];
  const n = Math.floor(rules.signs) + (rng() < rules.signs % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const face = Math.floor(rng() * 4);
    const len = 14 + rng() * 8;
    const sh = Math.min(h * 0.8, 50 + rng() * 40);
    const cell = Math.floor(rng() * 3);
    const ly = Math.min(h - sh / 2, Math.max(sh / 2 + 6, h * (0.4 + 0.4 * rng())));
    const color = pick(style.signColors, rng);
    // A blade sticks straight out of the facade.
    if (face < 2) {
      const sx = face === 0 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: sx * (w / 2 + len / 2), ly, lz: (rng() - 0.5) * d * 0.6, w: len, h: sh, d: 2, color, cell });
    } else {
      const sz = face === 2 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: (rng() - 0.5) * w * 0.6, ly, lz: sz * (d / 2 + len / 2), w: 2, h: sh, d: len, color, cell });
    }
  }
  if (allowBillboard && rng() < rules.billboard) {
    const bh = 30 + rng() * 16;
    signs.push({ kind: 'billboard', lx: 0, ly: h + bh / 2 + 2, lz: 0, w: w * 0.9, h: bh, d: 2, color: 0xffffff, cell: 3 + Math.floor(rng() * 3) });
  }
  return signs;
}

/** A crane's portal, in its own frame: legs at ±halfAlong along the sea edge and ±halfAcross along its normal, each leg `leg` m square. */
export const CRANE_PORTAL = { halfAlong: 13, halfAcross: 16, leg: 4 } as const;
/** Metres between a crane's front legs and its quay road's land-side edge, and between its back legs and any building. */
const CRANE_CLEAR = 3;
/** A container block cut back behind a crane's portal keeps at least this depth (m), or is left out. */
const MIN_BLOCK = 20;
/** The four sides of a cell: neighbour offset and the outward normal (x, z) of the shared edge. */
const SIDES = [[-1, 0], [0, -1], [1, 0], [0, 1]] as const;

/**
 * One built port lot: a warehouse covering most of the lot, or one container block (turned 90° on a coin toss) a whole
 * number of containers tall. `seaLot` (the sea side of a crane's cell) is never a warehouse.
 */
function yardLot(rules: DistrictRules, yard: YardRules, x: number, z: number, lotW: number, lotD: number, seaLot: boolean, rng: () => number): BuildingSpec {
  if (rng() < yard.warehouse && !seaLot) {
    const h = range(rng, yard.warehouseHeight[0], yard.warehouseHeight[1]);
    const f = yard.warehouseFootprint;
    return { x, z, w: lotW * f, d: lotD * f, h, facade: yard.warehouseFacade, color: pick(yard.warehouseColors, rng), signs: [] };
  }
  const turned = rng() < 0.5;
  const [fw, fd] = turned ? [yard.block[1], yard.block[0]] : [yard.block[0], yard.block[1]];
  const tiers = yard.tiers[0] + Math.floor(rng() * (yard.tiers[1] - yard.tiers[0] + 1));
  return { x, z, w: lotW * fw, d: lotD * fd, h: yard.tier * tiers, facade: pick(rules.facades, rng), color: pick(rules.colors, rng), signs: [] };
}

/** World footprint of a crane's portal (legs and the span between them). */
function portalFootprint(c: CraneSpec): { x: number; z: number; w: number; d: number } {
  const across = 2 * CRANE_PORTAL.halfAcross + CRANE_PORTAL.leg;
  const along = 2 * CRANE_PORTAL.halfAlong + CRANE_PORTAL.leg;
  const alongX = Math.abs(Math.sin(c.yaw)) > 0.5;
  return { x: c.x, z: c.z, w: alongX ? across : along, d: alongX ? along : across };
}

/**
 * Building `b` kept clear of crane `c`'s portal: one overlapping it has its sea-side face pulled back inland of the
 * back legs (by CRANE_CLEAR); null when less than MIN_BLOCK of it would be left.
 */
function clearOfPortal(b: BuildingSpec, c: CraneSpec): BuildingSpec | null {
  const p = portalFootprint(c);
  if (!overlaps(b, p)) return b;
  const alongX = Math.abs(Math.sin(c.yaw)) > 0.5;
  // Coordinates along the sea normal n (+1 or −1 on its axis); inland is decreasing.
  const n = Math.round(alongX ? Math.sin(c.yaw) : Math.cos(c.yaw));
  const pos = alongX ? b.x : b.z, size = alongX ? b.w : b.d;
  const back = n * (alongX ? c.x : c.z) - (alongX ? p.w : p.d) / 2 - CRANE_CLEAR;
  const inland = n * pos - size / 2;
  const depth = back - inland;
  if (depth < MIN_BLOCK) return null;
  const mid = n * (inland + depth / 2);
  return alongX ? { ...b, x: mid, w: depth } : { ...b, z: mid, d: depth };
}

/** Outward normals of the edges of cell (i, j) that border a bay cell. */
const baySides = (style: CityStyle, i: number, j: number) => SIDES.filter(([di, dj]) => isBay(style, i + di, j + dj));

/** Land, off the island, beside the bay: where cranes may stand. */
const coastal = (style: CityStyle, i: number, j: number): boolean => !isWater(style, i, j) && !isIsland(style, i, j) && baySides(style, i, j).length > 0;

/**
 * The gantry crane of coastal cell (i, j), if it has one: a cell gets a crane when its hash is below every coastal
 * neighbour's (8-neighbourhood), so cranes are never in touching cells and come about every 2–3 cells along the coast.
 * It faces the bay side whose outward normal best matches the bay's dir (a tie, as on a diagonal coast, goes by the
 * cell's hash), and stands at the middle of that edge with its front legs just inland of the quay road, jib out over
 * the water.
 */
function craneAt(style: CityStyle, seed: number, i: number, j: number): CraneSpec | null {
  if (style.cranes === false || !coastal(style, i, j) || !style.bay) return null;
  const h = hash2(i, j, seed + 57);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    if ((di || dj) && coastal(style, i + di, j + dj) && hash2(i + di, j + dj, seed + 57) <= h) return null;
  }
  const dir = style.bay.dir;
  const score = ([nx, nz]: readonly [number, number]) => nx * dir.x + nz * dir.z;
  const sides = baySides(style, i, j);
  const best = Math.max(...sides.map(score));
  const ties = sides.filter((n) => score(n) > best - 1e-9);
  const [nx, nz] = ties[Math.floor(hash2(i, j, seed + 58) * ties.length)]!;
  const pitch = CONFIG.world.blockSize;
  // The sea edge's lattice line, and the portal centre's distance in from it.
  const line = nx < 0 ? i : nx > 0 ? i + 1 : nz < 0 ? j : j + 1;
  const inset = lineWidth(line) / 2 + CRANE_CLEAR + CRANE_PORTAL.halfAcross + CRANE_PORTAL.leg / 2;
  const cx = (i + 0.5) * pitch + ROAD_ORIGIN, cz = (j + 0.5) * pitch + ROAD_ORIGIN;
  return { x: cx + nx * (pitch / 2 - inset), z: cz + nz * (pitch / 2 - inset), yaw: Math.atan2(nx, nz) };
}

/**
 * One chunk of the city in `style`: each block is built from the district at its centre. River cells hold nothing
 * but water. Lots sit inside the block inset by half the width of each bordering lattice line, whether or not its
 * segment exists, so removed-street strips stay unbuilt; in residential and park blocks they become tree-lined
 * lanes. Beside an avenue the inset adds an AVENUE_PAVEMENT band, lined with a row of street trees in every built
 * block off the crash site (not water, landmark or park cells; a tree inside a building's footprint is skipped).
 * Landmarks claim their block (the chunk holding the landmark's centre, or a long landmark's `from` end, owns it); special lots replace the random lots
 * they overlap; the crash site is never a park. Per-chunk caps thin the random buildings (never special lots), then
 * their signs, then the trees (other trees before avenue rows). Port cells are paved quays of container blocks and
 * warehouses with cranes along the water (no warehouse on a crane's sea side, nothing in its portal), and no trees. With a
 * lawn colour, residential cells off the crater (and off the island) also get a lawn pad. Island cells use the style's islandRules (its centre park
 * aside) and get no street, avenue or lane trees. Same inputs, same chunk.
 */
export function generateChunk(style: CityStyle, seed: number, cx: number, cz: number): ChunkContent {
  const w = CONFIG.world;
  const rng = mulberry32(chunkSeed(seed, cx, cz));
  const pitch = w.blockSize;
  const buildings: BuildingSpec[] = [];
  const specials: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];
  const avenueTrees: TreeSpec[] = [];
  const parks: ParkSpec[] = [];
  const quays: ParkSpec[] = [];
  const lawns: ParkSpec[] = [];
  const cranes: CraneSpec[] = [];
  const landmarks: LandmarkSpec[] = [];
  const water: WaterSpec[] = [];
  const seaWall: SeaWallSpec[] = [];
  const blockOf = (v: number) => Math.floor(v / pitch);
  // Billboards: at most one per chunk, only on a building whose centre is in the chunk's central 400 × 400 m.
  const midX = (cx + 0.5) * CHUNK_SIZE + ROAD_ORIGIN;
  const midZ = (cz + 0.5) * CHUNK_SIZE + ROAD_ORIGIN;
  let billboardPlaced = false;

  for (let i = 0; i < w.chunkBlocks; i++) {
    for (let j = 0; j < w.chunkBlocks; j++) {
      const bi = cx * w.chunkBlocks + i;
      const bj = cz * w.chunkBlocks + j;
      const bx = (bi + 0.5) * pitch + ROAD_ORIGIN;
      const bz = (bj + 0.5) * pitch + ROAD_ORIGIN;
      const craterSite = Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5;
      if (isWater(style, bi, bj)) {
        water.push({ x: bx, z: bz });
        continue;
      }
      for (const [di, dj] of baySides(style, bi, bj)) {
        seaWall.push(di !== 0
          ? { x: (di > 0 ? bi + 1 : bi) * pitch + ROAD_ORIGIN, z: bz, axis: 'z', side: di > 0 ? 1 : -1, ends: wallEnds(style, bi, bj, di, dj) }
          : { x: bx, z: (dj > 0 ? bj + 1 : bj) * pitch + ROAD_ORIGIN, axis: 'x', side: dj > 0 ? 1 : -1, ends: wallEnds(style, bi, bj, di, dj) });
      }
      // The buildable block: the cell inset by half of each bordering line's width, plus pavement beside an avenue.
      const inset = (line: number) => lineWidth(line) / 2 + (lineWidth(line) === AVENUE_WIDTH ? AVENUE_PAVEMENT : 0);
      const x0 = bi * pitch + inset(bi) + ROAD_ORIGIN;
      const x1 = (bi + 1) * pitch - inset(bi + 1) + ROAD_ORIGIN;
      const z0 = bj * pitch + inset(bj) + ROAD_ORIGIN;
      const z1 = (bj + 1) * pitch - inset(bj + 1) + ROAD_ORIGIN;
      const ix = (x0 + x1) / 2;
      const iz = (z0 + z1) / 2;
      const iw = x1 - x0;
      const id = z1 - z0;

      // A long landmark belongs to the block of its `from` end (the shore anchorage); its deck may cross other cells.
      const landmark = style.landmarks.find((l) => {
        const at = l.span?.from ?? l;
        return blockOf(at.x) === bi && blockOf(at.z) === bj;
      });
      if (landmark) {
        if (!craterSite) landmarks.push(landmark);
        // A landmark in a park stands on the park's green (Tokyo Tower in Shiba Park); one in the port on the quay.
        const district = blockDistrict(style, bx, bz);
        if (!craterSite && district === 'park') parks.push({ x: bx, z: bz });
        if (!craterSite && district === 'port') quays.push({ x: bx, z: bz });
        continue;
      }
      let district = blockDistrict(style, bx, bz);
      if (craterSite && district === 'park') district = 'office';
      const island = isIsland(style, bi, bj);
      const rules = island && district !== 'park' && style.islandRules ? style.islandRules : style.districts[district];
      const crane = district === 'port' ? craneAt(style, seed, bi, bj) : null;
      if (district === 'port') quays.push({ x: bx, z: bz });
      if (crane) cranes.push(crane);
      if (district === 'residential' && style.colors.lawn !== undefined && !craterSite && !island) lawns.push({ x: bx, z: bz });

      if (district === 'park') {
        parks.push({ x: bx, z: bz });
        const count = Math.round(range(rng, style.parkTrees[0], style.parkTrees[1]));
        for (let t = 0; t < count; t++) {
          trees.push({ x: ix + range(rng, -iw / 2, iw / 2), z: iz + range(rng, -id / 2, id / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      const blockSpecials = style.specialLots.filter((s) => blockOf(s.x) === bi && blockOf(s.z) === bj);
      const firstBuilding = buildings.length;
      for (const s of blockSpecials) specials.push({ ...s, signs: s.signs.map((g) => ({ ...g })) });

      const n = rules.lots;
      const lotW = iw / n;
      const lotD = id / n;
      // Roll every lot first so the dice sequence never depends on what was placed.
      const rolls: { lx: number; lz: number; built: boolean }[] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        rolls.push({ lx: ix + (a - (n - 1) / 2) * lotW, lz: iz + (b - (n - 1) / 2) * lotD, built: rng() < rules.fill });
      }
      const free = rolls.filter((r) => !blockSpecials.some((s) => overlaps(s, { x: r.lx, z: r.lz, w: lotW, d: lotD }, 4)));
      let placed = free.filter((r) => r.built).length;
      for (const r of free) {
        if (!r.built && placed < rules.minPerBlock) {
          r.built = true;
          placed++;
        }
      }
      for (const r of free) {
        if (!r.built) continue;
        if (rules.yard) {
          const seaLot = crane !== null && (r.lx - ix) * Math.sin(crane.yaw) + (r.lz - iz) * Math.cos(crane.yaw) > 0;
          const b = yardLot(rules, rules.yard, r.lx, r.lz, lotW, lotD, seaLot, rng);
          const clear = crane ? clearOfPortal(b, crane) : b;
          if (clear) buildings.push(clear);
          continue;
        }
        const bw = lotW * range(rng, rules.footprint[0], rules.footprint[1]);
        const bd = lotD * range(rng, rules.footprint[0], rules.footprint[1]);
        const h = rules.height[0] + (rules.height[1] - rules.height[0]) * Math.pow(rng(), rules.heightCurve);
        const facade = pick(rules.facades, rng);
        const color = pick(rules.colors, rng);
        const central = Math.abs(r.lx - midX) <= 200 && Math.abs(r.lz - midZ) <= 200;
        const signs = makeSigns(rules, style, bw, bd, h, central && !billboardPlaced, rng);
        if (signs.some((s) => s.kind === 'billboard')) billboardPlaced = true;
        buildings.push({ x: r.lx, z: r.lz, w: bw, d: bd, h, facade, color, signs });
      }
      if (!craterSite && !island && district !== 'port') {
        for (let t = 0; t < rules.trees; t++) {
          // Street trees along the block's edge (the pavement).
          const along = range(rng, -0.5, 0.5);
          const side = rng() < 0.5 ? -1 : 1;
          const xs = rng() < 0.5;
          trees.push(xs
            ? { x: ix + along * iw, z: iz + side * (id / 2 - 3), s: range(rng, 9, 14) }
            : { x: ix + side * (iw / 2 - 3), z: iz + along * id, s: range(rng, 9, 14) });
        }
        // Avenue rows: evenly spaced down the middle of each avenue pavement band, between the cross streets' edges.
        const blockBuildings = [...blockSpecials, ...buildings.slice(firstBuilding)];
        const plant = (x: number, z: number) => {
          if (blockBuildings.some((b) => overlaps(b, { x, z, w: 0, d: 0 }, 6))) return;
          avenueTrees.push({ x, z, s: 10 + 4 * hash2(Math.round(x), Math.round(z), seed + 31) });
        };
        const row = (line: number, side: 1 | -1, alongZ: boolean) => {
          if (lineWidth(line) !== AVENUE_WIDTH) return;
          const at = line * pitch + side * (AVENUE_WIDTH / 2 + AVENUE_PAVEMENT / 2) + ROAD_ORIGIN;
          const c = alongZ ? bj : bi;
          const lo = c * pitch + lineWidth(c) / 2 + ROAD_ORIGIN;
          const hi = (c + 1) * pitch - lineWidth(c + 1) / 2 + ROAD_ORIGIN;
          const n = Math.max(1, Math.round((hi - lo) / AVENUE_TREE_GAP));
          for (let k = 0; k < n; k++) {
            const along = lo + ((k + 0.5) * (hi - lo)) / n;
            if (alongZ) plant(at, along);
            else plant(along, at);
          }
        };
        row(bi, 1, true);
        row(bi + 1, -1, true);
        row(bj, 1, false);
        row(bj + 1, -1, false);
      }
    }
  }

  // The road network: segments starting at this chunk's nodes, the intersections, and lanes on removed strips.
  const roads: Segment[] = [];
  const nodes: NodeSpec[] = [];
  const lane = (d: string) => d === 'residential' || d === 'park';
  for (let i = cx * w.chunkBlocks; i < (cx + 1) * w.chunkBlocks; i++) {
    for (let j = cz * w.chunkBlocks; j < (cz + 1) * w.chunkBlocks; j++) {
      // A mid-river node (four water cells) only carries a bridge, whose deck runs straight through it.
      const midRiver = isWater(style, i - 1, j - 1) && isWater(style, i, j - 1) && isWater(style, i - 1, j) && isWater(style, i, j);
      const size = midRiver ? 0 : nodeSize(style, i, j);
      if (size > 0) nodes.push({ x: i * pitch + ROAD_ORIGIN, z: j * pitch + ROAD_ORIGIN, size });
      for (const axis of ['x', 'z'] as Axis[]) {
        const seg = segmentAt(style, axis, i, j);
        if (seg) {
          roads.push(seg);
          continue;
        }
        // A removed segment between two land cells: three trees down the middle of the strip in leafy districts.
        const [ai, aj] = axis === 'x' ? [i, j - 1] : [i - 1, j];
        // The island has no streets at all, so its lattice lines are no lanes.
        if (isWater(style, ai, aj) || isWater(style, i, j) || isIsland(style, ai, aj) || isIsland(style, i, j)) continue;
        const da = blockDistrict(style, (ai + 0.5) * pitch + ROAD_ORIGIN, (aj + 0.5) * pitch + ROAD_ORIGIN);
        const db = blockDistrict(style, (i + 0.5) * pitch + ROAD_ORIGIN, (j + 0.5) * pitch + ROAD_ORIGIN);
        if ((!lane(da) && !lane(db)) || da === 'port' || db === 'port') continue;
        for (const f of [0.25, 0.5, 0.75]) {
          const x = (axis === 'x' ? i + f : i) * pitch + ROAD_ORIGIN;
          const z = (axis === 'x' ? j : j + f) * pitch + ROAD_ORIGIN;
          trees.push({ x, z, s: range(rng, 10, 15) });
        }
      }
    }
  }

  // Caps: thin random buildings evenly (deterministic), never special lots; then trim signs.
  const room = Math.max(0, BUILDINGS_PER_CHUNK - specials.length);
  let kept = buildings;
  if (buildings.length > room) {
    const order = buildings.map((_, k) => ({ k, r: rng() })).sort((a, b) => a.r - b.r).slice(0, room).map((o) => o.k).sort((a, b) => a - b);
    kept = order.map((k) => buildings[k]!);
  }
  const out = [...specials, ...kept];
  // Special-lot signs always stay; the rest of the budget is spread over random buildings by dropping signs at random.
  const budget = Math.max(0, SIGNS_PER_CHUNK - specials.reduce((n, s) => n + s.signs.length, 0));
  const pairs: { b: BuildingSpec; k: number; r: number }[] = [];
  for (const b of kept) b.signs.forEach((_, k) => pairs.push({ b, k, r: rng() }));
  if (pairs.length > budget) {
    const drop = new Map<BuildingSpec, Set<number>>();
    for (const p of pairs.sort((x, y) => x.r - y.r).slice(budget)) {
      if (!drop.has(p.b)) drop.set(p.b, new Set());
      drop.get(p.b)!.add(p.k);
    }
    for (const [b, ks] of drop) b.signs = b.signs.filter((_, k) => !ks.has(k));
  }
  // Tree cap: an over-full (park-heavy) chunk drops trees at random, so every loaded chunk fits the tree pool. Avenue
  // rows are thinned only once every other tree is gone, so the rows stay regular.
  const thin = (list: TreeSpec[], room: number): TreeSpec[] => {
    if (list.length <= room) return list;
    const order = list.map((_, k) => ({ k, r: rng() })).sort((a, b) => a.r - b.r).slice(0, room).map((o) => o.k).sort((a, b) => a - b);
    return order.map((k) => list[k]!);
  };
  const keptAvenue = thin(avenueTrees, TREES_PER_CHUNK);
  const keptTrees = [...keptAvenue, ...thin(trees, TREES_PER_CHUNK - keptAvenue.length)];
  return { buildings: out, trees: keptTrees, parks, quays, lawns, cranes, landmarks, roads, nodes, water, seaWall };
}

/** Chunks to load (within loadRadius, nearest first) and to unload (beyond unloadRadius). */
export function planStreaming(loaded: ReadonlySet<string>, x: number, z: number): { load: ChunkRef[]; unload: string[] } {
  const load = chunksInRadius(x, z, CONFIG.world.loadRadius).filter((c) => !loaded.has(c.key));
  const unload: string[] = [];
  for (const key of loaded) {
    const [cx, cz] = parseKey(key);
    if (distToChunk(x, z, cx, cz) > CONFIG.world.unloadRadius) unload.push(key);
  }
  return { load, unload };
}

/** Destroyed buildings by chunk and building index, so flattened blocks stay flattened after streaming out and back. */
export class DestroyedLog {
  private byChunk = new Map<string, Set<number>>();
  count = 0;

  /** `counted` false records rubble that doesn't count as a player kill (the crater blast). */
  mark(key: string, index: number, counted = true): void {
    let set = this.byChunk.get(key);
    if (!set) {
      set = new Set();
      this.byChunk.set(key, set);
    }
    if (set.has(index)) return;
    set.add(index);
    if (counted) this.count++;
  }

  has(key: string, index: number): boolean {
    return this.byChunk.get(key)?.has(index) ?? false;
  }

  clear(): void {
    this.byChunk.clear();
    this.count = 0;
  }
}

/**
 * Whether the pod's impact topples the building on lot (x, z), `d` metres from the impact: always inside the
 * crater radius `r`, never past `outer`, and in between with odds falling off linearly (a fixed hash per lot,
 * so a skipped and a played intro agree).
 */
export function blastTopples(x: number, z: number, d: number, r: number, outer: number): boolean {
  if (d <= r) return true;
  if (d >= outer) return false;
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h) < 1 - (d - r) / (outer - r);
}
