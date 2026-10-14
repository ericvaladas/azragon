import { CONFIG } from '../config';
import { mulberry32, pick, range } from '../util/rng';
import type { BuildingSpec, CityStyle, DistrictRules, LandmarkSpec, SignDef } from '../cities/types';
import { isWater, lineWidth, segmentAt, type Axis, type Segment } from './roads';

export type { BuildingSpec } from '../cities/types';
export type TreeSpec = { x: number; z: number; s: number };
/** A park block, by its centre: drawn as a green pad under its trees. */
export type ParkSpec = { x: number; z: number };
/** An intersection at (x, z), drawn as a square `size` m across (the widest incident road). */
export type NodeSpec = { x: number; z: number; size: number };
/** A river cell, by its centre. */
export type WaterSpec = { x: number; z: number };
/**
 * `roads`: existing segments whose start node lies in the chunk. `nodes`: the chunk's intersections that have at
 * least one incident segment. `water`: the chunk's river cells.
 */
export type ChunkContent = {
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  parks: ParkSpec[];
  landmarks: LandmarkSpec[];
  roads: Segment[];
  nodes: NodeSpec[];
  water: WaterSpec[];
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

/**
 * One chunk of the city in `style`: each block is built from the district at its centre. River cells hold nothing
 * but water. Lots sit inside the block inset by half the width of each bordering lattice line, whether or not its
 * segment exists, so removed-street strips stay unbuilt; in residential and park blocks they become tree-lined
 * lanes. Landmarks claim their block (the chunk holding the landmark's centre owns it); special lots replace the
 * random lots they overlap; the crash site is never a park. Per-chunk caps thin the random buildings (never special
 * lots), then their signs, then the trees. Same inputs, same chunk.
 */
export function generateChunk(style: CityStyle, seed: number, cx: number, cz: number): ChunkContent {
  const w = CONFIG.world;
  const rng = mulberry32(chunkSeed(seed, cx, cz));
  const pitch = w.blockSize;
  const buildings: BuildingSpec[] = [];
  const specials: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];
  const parks: ParkSpec[] = [];
  const landmarks: LandmarkSpec[] = [];
  const water: WaterSpec[] = [];
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
      // The buildable block: the cell inset by half of each bordering line's width.
      const x0 = bi * pitch + lineWidth(bi) / 2 + ROAD_ORIGIN;
      const x1 = (bi + 1) * pitch - lineWidth(bi + 1) / 2 + ROAD_ORIGIN;
      const z0 = bj * pitch + lineWidth(bj) / 2 + ROAD_ORIGIN;
      const z1 = (bj + 1) * pitch - lineWidth(bj + 1) / 2 + ROAD_ORIGIN;
      const ix = (x0 + x1) / 2;
      const iz = (z0 + z1) / 2;
      const iw = x1 - x0;
      const id = z1 - z0;

      const landmark = style.landmarks.find((l) => blockOf(l.x) === bi && blockOf(l.z) === bj);
      if (landmark) {
        if (!craterSite) landmarks.push(landmark);
        // A landmark in a park stands on the park's green (Tokyo Tower in Shiba Park).
        if (!craterSite && style.districtAt(bx, bz) === 'park') parks.push({ x: bx, z: bz });
        continue;
      }
      let district = style.districtAt(bx, bz);
      if (craterSite && district === 'park') district = 'office';
      const rules = style.districts[district];

      if (district === 'park') {
        parks.push({ x: bx, z: bz });
        const count = Math.round(range(rng, style.parkTrees[0], style.parkTrees[1]));
        for (let t = 0; t < count; t++) {
          trees.push({ x: ix + range(rng, -iw / 2, iw / 2), z: iz + range(rng, -id / 2, id / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      const blockSpecials = style.specialLots.filter((s) => blockOf(s.x) === bi && blockOf(s.z) === bj);
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
      if (!craterSite) {
        for (let t = 0; t < rules.trees; t++) {
          // Street trees along the block's edge (the pavement).
          const along = range(rng, -0.5, 0.5);
          const side = rng() < 0.5 ? -1 : 1;
          const xs = rng() < 0.5;
          trees.push(xs
            ? { x: ix + along * iw, z: iz + side * (id / 2 - 3), s: range(rng, 9, 14) }
            : { x: ix + side * (iw / 2 - 3), z: iz + along * id, s: range(rng, 9, 14) });
        }
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
        if (isWater(style, ai, aj) || isWater(style, i, j)) continue;
        const da = style.districtAt((ai + 0.5) * pitch + ROAD_ORIGIN, (aj + 0.5) * pitch + ROAD_ORIGIN);
        const db = style.districtAt((i + 0.5) * pitch + ROAD_ORIGIN, (j + 0.5) * pitch + ROAD_ORIGIN);
        if (!lane(da) && !lane(db)) continue;
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
  // Tree cap: an over-full (park-heavy) chunk drops trees at random, so every loaded chunk fits the tree pool.
  let keptTrees = trees;
  if (trees.length > TREES_PER_CHUNK) {
    const order = trees.map((_, k) => ({ k, r: rng() })).sort((a, b) => a.r - b.r).slice(0, TREES_PER_CHUNK).map((o) => o.k).sort((a, b) => a - b);
    keptTrees = order.map((k) => trees[k]!);
  }
  return { buildings: out, trees: keptTrees, parks, landmarks, roads, nodes, water };
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
