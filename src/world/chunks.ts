import { CONFIG } from '../config';
import { mulberry32, pick, range } from '../util/rng';
import type { BuildingSpec, CityStyle, DistrictRules, LandmarkSpec, SignDef } from '../cities/types';

export type { BuildingSpec } from '../cities/types';
export type TreeSpec = { x: number; z: number; s: number };
/** A park block, by its centre: drawn as a green pad under its trees. */
export type ParkSpec = { x: number; z: number };
export type ChunkContent = { buildings: BuildingSpec[]; trees: TreeSpec[]; parks: ParkSpec[]; landmarks: LandmarkSpec[] };
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

const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, gap = 0) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.z - b.z) * 2 < a.d + b.d + gap;

/** Vertical neon blades on the sides and maybe a rooftop billboard, in the building's frame. */
function makeSigns(rules: DistrictRules, style: CityStyle, w: number, d: number, h: number, rng: () => number): SignDef[] {
  const signs: SignDef[] = [];
  const n = Math.floor(rules.signs) + (rng() < rules.signs % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const face = Math.floor(rng() * 4);
    const len = 4 + rng() * 3;
    const sh = Math.min(h * 0.6, 18 + rng() * 22);
    const ly = Math.min(h - sh / 2, Math.max(sh / 2 + 6, h * (0.4 + 0.4 * rng())));
    const color = pick(style.signColors, rng);
    // A blade sticks straight out of the facade.
    if (face < 2) {
      const sx = face === 0 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: sx * (w / 2 + len / 2), ly, lz: (rng() - 0.5) * d * 0.6, w: len, h: sh, d: 1.5, color });
    } else {
      const sz = face === 2 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: (rng() - 0.5) * w * 0.6, ly, lz: sz * (d / 2 + len / 2), w: 1.5, h: sh, d: len, color });
    }
  }
  if (rng() < rules.billboard) {
    const bh = 10 + rng() * 8;
    signs.push({ kind: 'billboard', lx: 0, ly: h + bh / 2 + 2, lz: 0, w: w * 0.8, h: bh, d: 1.5, color: pick(style.signColors, rng) });
  }
  return signs;
}

/**
 * One chunk of the city in `style`: each block is built from the district at its centre. Landmarks claim their
 * block (the chunk holding the landmark's centre owns it); special lots replace the random lots they overlap; the
 * crash site is never a park. Per-chunk caps thin the random buildings (never special lots) and then their signs.
 * Same inputs, same chunk.
 */
export function generateChunk(style: CityStyle, seed: number, cx: number, cz: number): ChunkContent {
  const w = CONFIG.world;
  const rng = mulberry32(chunkSeed(seed, cx, cz));
  const pitch = w.blockSize;
  const inner = pitch - w.roadWidth;
  const buildings: BuildingSpec[] = [];
  const specials: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];
  const parks: ParkSpec[] = [];
  const landmarks: LandmarkSpec[] = [];
  const blockOf = (v: number) => Math.floor(v / pitch);

  for (let i = 0; i < w.chunkBlocks; i++) {
    for (let j = 0; j < w.chunkBlocks; j++) {
      const bi = cx * w.chunkBlocks + i;
      const bj = cz * w.chunkBlocks + j;
      const bx = (bi + 0.5) * pitch + ROAD_ORIGIN;
      const bz = (bj + 0.5) * pitch + ROAD_ORIGIN;
      const craterSite = Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5;

      const landmark = style.landmarks.find((l) => blockOf(l.x) === bi && blockOf(l.z) === bj);
      if (landmark) {
        if (!craterSite) landmarks.push(landmark);
        continue;
      }
      let district = style.districtAt(bx, bz);
      if (craterSite && district === 'park') district = 'office';
      const rules = style.districts[district];

      if (district === 'park') {
        parks.push({ x: bx, z: bz });
        const count = Math.round(range(rng, style.parkTrees[0], style.parkTrees[1]));
        for (let t = 0; t < count; t++) {
          trees.push({ x: bx + range(rng, -inner / 2, inner / 2), z: bz + range(rng, -inner / 2, inner / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      const blockSpecials = style.specialLots.filter((s) => blockOf(s.x) === bi && blockOf(s.z) === bj);
      for (const s of blockSpecials) specials.push({ ...s, signs: s.signs.map((g) => ({ ...g })) });

      const n = rules.lots;
      const lot = inner / n;
      // Roll every lot first so the dice sequence never depends on what was placed.
      const rolls: { lx: number; lz: number; built: boolean }[] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        rolls.push({ lx: bx + (a - (n - 1) / 2) * lot, lz: bz + (b - (n - 1) / 2) * lot, built: rng() < rules.fill });
      }
      const free = rolls.filter((r) => !blockSpecials.some((s) => overlaps(s, { x: r.lx, z: r.lz, w: lot, d: lot }, 4)));
      let placed = free.filter((r) => r.built).length;
      for (const r of free) {
        if (!r.built && placed < rules.minPerBlock) {
          r.built = true;
          placed++;
        }
      }
      for (const r of free) {
        if (!r.built) continue;
        const bw = lot * range(rng, rules.footprint[0], rules.footprint[1]);
        const bd = lot * range(rng, rules.footprint[0], rules.footprint[1]);
        const h = rules.height[0] + (rules.height[1] - rules.height[0]) * Math.pow(rng(), rules.heightCurve);
        buildings.push({ x: r.lx, z: r.lz, w: bw, d: bd, h, facade: pick(rules.facades, rng), color: pick(rules.colors, rng), signs: makeSigns(rules, style, bw, bd, h, rng) });
      }
      if (!craterSite) {
        for (let t = 0; t < rules.trees; t++) {
          // Street trees along the block's edge (the pavement).
          const along = range(rng, -inner / 2, inner / 2);
          const edge = (rng() < 0.5 ? -1 : 1) * (inner / 2 - 3);
          const xs = rng() < 0.5;
          trees.push({ x: bx + (xs ? along : edge), z: bz + (xs ? edge : along), s: range(rng, 9, 14) });
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
  return { buildings: out, trees, parks, landmarks };
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
