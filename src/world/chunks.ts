import { CONFIG } from '../config';
import { mulberry32, range } from '../util/rng';

export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; style: number };
export type TreeSpec = { x: number; z: number; s: number };
export type ChunkContent = { buildings: BuildingSpec[]; trees: TreeSpec[] };
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

/**
 * Buildings and park trees for one chunk: 2x2 lots per block, some blocks are parks,
 * and blocks near the origin stay empty for the crash crater. Same inputs, same chunk.
 */
export function generateChunk(seed: number, cx: number, cz: number): ChunkContent {
  const w = CONFIG.world;
  const rng = mulberry32(chunkSeed(seed, cx, cz));
  const pitch = w.blockSize;
  const inner = pitch - w.roadWidth;
  const lot = inner / 2;
  const buildings: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];

  for (let i = 0; i < w.chunkBlocks; i++) {
    for (let j = 0; j < w.chunkBlocks; j++) {
      const bx = (cx * w.chunkBlocks + i + 0.5) * pitch + ROAD_ORIGIN;
      const bz = (cz * w.chunkBlocks + j + 0.5) * pitch + ROAD_ORIGIN;
      if (Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5) continue;

      if (rng() < w.parkChance) {
        const count = 6 + Math.floor(rng() * 5);
        for (let t = 0; t < count; t++) {
          trees.push({ x: bx + range(rng, -inner / 2, inner / 2), z: bz + range(rng, -inner / 2, inner / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          if (rng() > 0.78) continue;
          const t = rng();
          buildings.push({
            x: bx + (a - 0.5) * lot,
            z: bz + (b - 0.5) * lot,
            w: lot * range(rng, 0.55, 0.85),
            d: lot * range(rng, 0.55, 0.85),
            h: w.minBuildingH + (w.maxBuildingH - w.minBuildingH) * t * t,
            style: Math.floor(rng() * CONFIG.palette.buildingFacades.length),
          });
        }
      }
    }
  }
  return { buildings, trees };
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

  mark(key: string, index: number): void {
    let set = this.byChunk.get(key);
    if (!set) {
      set = new Set();
      this.byChunk.set(key, set);
    }
    if (set.has(index)) return;
    set.add(index);
    this.count++;
  }

  has(key: string, index: number): boolean {
    return this.byChunk.get(key)?.has(index) ?? false;
  }

  clear(): void {
    this.byChunk.clear();
    this.count = 0;
  }
}
