import { describe, it, expect } from 'vitest';
import { BUILDINGS_PER_CHUNK, CHUNK_SIZE, DestroyedLog, SIGNS_PER_CHUNK, blastTopples, chunkKey, chunksInRadius, generateChunk, maxLoadedChunks, planStreaming } from './chunks';
import type { BuildingSpec } from './chunks';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import { SHIBUYA_CROSSING } from '../cities/tokyo/layout';
import type { CityStyle } from '../cities/types';

const W = CONFIG.world;

const ALL_NEON: CityStyle = { ...TOKYO, districtAt: () => 'neon', landmarks: [], specialLots: [] };
const blockCell = (v: number) => Math.floor(v / W.blockSize);

describe('generateChunk', () => {
  it('is deterministic per style, seed and chunk, and differs between chunks and seeds', () => {
    expect(generateChunk(TOKYO, 1337, 3, -2)).toEqual(generateChunk(TOKYO, 1337, 3, -2));
    expect(generateChunk(TOKYO, 1337, 3, -2).buildings).not.toEqual(generateChunk(TOKYO, 1337, 4, -2).buildings);
    expect(generateChunk(TOKYO, 1337, 30, -2).buildings).not.toEqual(generateChunk(TOKYO, 99, 30, -2).buildings);
  });

  it('keeps every building inside its own chunk and its own block (off every road line)', () => {
    for (const [cx, cz] of [[0, 0], [0, 2], [0, 4], [5, -3], [-7, 11], [40, 40]] as const) {
      for (const b of generateChunk(TOKYO, 1337, cx, cz).buildings) {
        expect(Math.floor(b.x / CHUNK_SIZE)).toBe(cx);
        expect(Math.floor(b.z / CHUNK_SIZE)).toBe(cz);
        expect(blockCell(b.x - b.w / 2)).toBe(blockCell(b.x + b.w / 2));
        expect(blockCell(b.z - b.d / 2)).toBe(blockCell(b.z + b.d / 2));
      }
    }
  });

  it('builds on the crater site but plants no parks or trees there', () => {
    let inside = 0;
    for (const r of chunksInRadius(0, 0, W.clearRadius + CHUNK_SIZE)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      inside += c.buildings.filter((b) => Math.hypot(b.x, b.z) < W.clearRadius).length;
      for (const p of c.parks) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(W.clearRadius + W.blockSize * 0.5);
      for (const t of c.trees) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(W.clearRadius - W.blockSize * 0.25);
    }
    expect(inside).toBeGreaterThan(4);
  });

  it('fills chunks far from the origin densely', () => {
    let total = 0;
    for (let i = 0; i < 10; i++) total += generateChunk(TOKYO, 1337, 20 + i, -30).buildings.length;
    expect(total / 10).toBeGreaterThan(25);
  });

  it('stays within the per-chunk caps even when every block is neon, and the caps fit the pools', () => {
    expect(BUILDINGS_PER_CHUNK * maxLoadedChunks()).toBeLessThanOrEqual(W.maxBuildings);
    expect(SIGNS_PER_CHUNK * maxLoadedChunks()).toBeLessThanOrEqual(W.maxSigns);
    for (let i = 0; i < 6; i++) {
      const c = generateChunk(ALL_NEON, 1337, 10 + i, 7);
      expect(c.buildings.length).toBeLessThanOrEqual(BUILDINGS_PER_CHUNK);
      expect(c.buildings.reduce((n, b) => n + b.signs.length, 0)).toBeLessThanOrEqual(SIGNS_PER_CHUNK);
      expect(c.buildings.length).toBeGreaterThan(BUILDINGS_PER_CHUNK * 0.8);
    }
  });

  it('gives a landmark to exactly one chunk, and builds nothing else on its block', () => {
    const tmg = TOKYO.landmarks[0]!;
    let owners = 0;
    for (const r of chunksInRadius(tmg.x, tmg.z, CHUNK_SIZE * 2)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      owners += c.landmarks.filter((l) => l.id === tmg.id).length;
      for (const b of c.buildings) {
        const same = blockCell(b.x) === blockCell(tmg.x) && blockCell(b.z) === blockCell(tmg.z);
        expect(same).toBe(false);
      }
      for (const p of c.parks) expect(blockCell(p.x) === blockCell(tmg.x) && blockCell(p.z) === blockCell(tmg.z)).toBe(false);
    }
    expect(owners).toBe(1);
  });

  it('places the Shibuya corner buildings exactly, and no random building overlaps them', () => {
    const found: BuildingSpec[] = [];
    const all: BuildingSpec[] = [];
    for (const r of chunksInRadius(SHIBUYA_CROSSING.x, SHIBUYA_CROSSING.z, CHUNK_SIZE)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      all.push(...c.buildings);
      for (const s of TOKYO.specialLots) found.push(...c.buildings.filter((b) => b.x === s.x && b.z === s.z && b.h === s.h));
    }
    expect(found).toHaveLength(4);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of found) for (const b of all) if (b !== s) expect(overlaps(s, b)).toBe(false);
    for (const s of found) expect(s.keep).toBe(true);
  });

  it('spreads signs evenly: every block column and row with buildings has a signed one', () => {
    const chunks = [generateChunk(TOKYO, 1337, 0, 1), generateChunk(ALL_NEON, 1337, 10, 7), generateChunk(ALL_NEON, 1337, 12, 7)];
    for (const c of chunks) {
      const signed = c.buildings.filter((b) => b.signs.length > 0).length;
      expect(signed / c.buildings.length).toBeGreaterThanOrEqual(0.5);
      if (c === chunks[0]) continue; // The Shibuya chunk mixes in sparsely signed office blocks; evenness is pinned on the all-neon chunks
      for (const axis of ['x', 'z'] as const) {
        const groups = new Map<number, number>();
        for (const b of c.buildings) groups.set(blockCell(b[axis]), (groups.get(blockCell(b[axis])) ?? 0) + (b.signs.length > 0 ? 1 : 0));
        for (const n of groups.values()) expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every sign on its building: beside a face or on the roof, within its height', () => {
    for (const [cx, cz] of [[0, 2], [-2, 3], [-1, 4]] as const) {
      for (const b of generateChunk(TOKYO, 1337, cx, cz).buildings) {
        for (const s of b.signs) {
          expect(Math.abs(s.lx)).toBeLessThanOrEqual(b.w / 2 + s.w + 4);
          expect(Math.abs(s.lz)).toBeLessThanOrEqual(b.d / 2 + s.d + 4);
          expect(s.ly - s.h / 2).toBeGreaterThanOrEqual(0);
          expect(s.ly + s.h / 2).toBeLessThanOrEqual(b.h + 50);
        }
      }
    }
  });

  it('places at most one billboard per chunk, on a building in the chunk\'s central 400 × 400 m', () => {
    let total = 0;
    for (const r of chunksInRadius(0, 0, 4000)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      const ccx = (r.cx + 0.5) * CHUNK_SIZE;
      const ccz = (r.cz + 0.5) * CHUNK_SIZE;
      const boards = c.buildings.filter((b) => b.signs.some((s) => s.kind === 'billboard'));
      expect(boards.flatMap((b) => b.signs.filter((s) => s.kind === 'billboard')).length).toBeLessThanOrEqual(1);
      for (const b of boards) {
        expect(Math.abs(b.x - ccx)).toBeLessThanOrEqual(200);
        expect(Math.abs(b.z - ccz)).toBeLessThanOrEqual(200);
      }
      total += boards.length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('draws vertical signs from glyph cells 0–2 and billboards from picture cells 3–5', () => {
    for (const r of chunksInRadius(0, 0, 4000)) {
      for (const b of generateChunk(TOKYO, 1337, r.cx, r.cz).buildings) {
        for (const s of b.signs) {
          if (s.kind === 'vertical') expect([0, 1, 2]).toContain(s.cell);
          if (s.kind === 'billboard') expect([3, 4, 5]).toContain(s.cell);
        }
      }
    }
  });

  it('builds neon blocks with signs and Shinjuku with tall towers', () => {
    const near = (x: number, z: number) => generateChunk(TOKYO, 1337, Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)).buildings;
    expect(near(600, 1600).some((b) => b.signs.length > 0)).toBe(true);
    expect(Math.max(...near(300, 3100).map((b) => b.h))).toBeGreaterThanOrEqual(150);
  });
});

describe('chunksInRadius', () => {
  it('returns chunks touching the circle, nearest first, including the one underfoot', () => {
    const list = chunksInRadius(1234, -567, 2000);
    expect(list[0]!.key).toBe(chunkKey(Math.floor(1234 / CHUNK_SIZE), Math.floor(-567 / CHUNK_SIZE)));
    for (let i = 1; i < list.length; i++) expect(list[i]!.dist).toBeGreaterThanOrEqual(list[i - 1]!.dist);
    for (const c of list) expect(c.dist).toBeLessThanOrEqual(2000);
    const area = Math.PI * 2000 * 2000;
    expect(list.length).toBeGreaterThan(area / (CHUNK_SIZE * CHUNK_SIZE));
  });
});

describe('planStreaming', () => {
  it('loads everything in range from an empty world, nearest first', () => {
    const plan = planStreaming(new Set(), 0, 0);
    expect(plan.unload).toEqual([]);
    expect(plan.load.length).toBe(chunksInRadius(0, 0, W.loadRadius).length);
  });

  it('unloads only chunks past unloadRadius (hysteresis keeps the band in between)', () => {
    const loaded = new Set(chunksInRadius(0, 0, W.loadRadius).map((c) => c.key));
    const step = (W.unloadRadius - W.loadRadius) / 2;
    expect(planStreaming(loaded, step, 0).unload).toEqual([]);
    const far = planStreaming(loaded, 20000, 0);
    expect(far.unload.length).toBe(loaded.size);
    expect(far.load.length).toBeGreaterThan(0);
  });

  it('does not reload chunks that are already loaded', () => {
    const loaded = new Set(chunksInRadius(0, 0, W.loadRadius).map((c) => c.key));
    expect(planStreaming(loaded, 0, 0).load).toEqual([]);
  });
});

describe('DestroyedLog', () => {
  it('remembers uncounted marks (the crater blast) without adding to the count', () => {
    const log = new DestroyedLog();
    log.mark('0,0', 3, false);
    expect(log.has('0,0', 3)).toBe(true);
    expect(log.count).toBe(0);
    log.mark('0,0', 3);
    expect(log.count).toBe(0);
    log.mark('0,0', 4);
    expect(log.count).toBe(1);
  });

  it('remembers destroyed buildings per chunk across unload/reload, and clears on reset', () => {
    const log = new DestroyedLog();
    log.mark('3,4', 7);
    expect(log.has('3,4', 7)).toBe(true);
    expect(log.has('3,4', 8)).toBe(false);
    expect(log.has('4,4', 7)).toBe(false);
    expect(log.count).toBe(1);
    log.mark('3,4', 7);
    expect(log.count).toBe(1);
    log.clear();
    expect(log.has('3,4', 7)).toBe(false);
    expect(log.count).toBe(0);
  });
});

describe('blastTopples', () => {
  const lots = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 37.3 - 300, z: Math.floor(i / 20) * 41.7 - 400 }));
  const share = (d: number) => lots.filter((l) => blastTopples(l.x, l.z, d, 500, 1000)).length / lots.length;
  it('flattens everything inside the crater and nothing past the outer blast radius', () => {
    expect(share(400)).toBe(1);
    expect(share(1001)).toBe(0);
  });
  it('topples fewer buildings the farther they are from the crater, deterministically per lot', () => {
    expect(share(600)).toBeGreaterThan(share(900));
    expect(share(750)).toBeGreaterThan(0.3);
    expect(share(750)).toBeLessThan(0.7);
    for (const l of lots) expect(blastTopples(l.x, l.z, 750, 500, 1000)).toBe(blastTopples(l.x, l.z, 750, 500, 1000));
  });
});
