import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, DestroyedLog, blastTopples, chunkKey, chunksInRadius, generateChunk, planStreaming } from './chunks';
import { CONFIG } from '../config';

const W = CONFIG.world;

describe('generateChunk', () => {
  it('is deterministic per seed and chunk, and differs between chunks', () => {
    expect(generateChunk(1337, 3, -2)).toEqual(generateChunk(1337, 3, -2));
    expect(generateChunk(1337, 3, -2).buildings).not.toEqual(generateChunk(1337, 4, -2).buildings);
    expect(generateChunk(1337, 3, -2).buildings).not.toEqual(generateChunk(99, 3, -2).buildings);
  });

  it('keeps every building inside its own chunk and off every road line', () => {
    const cell = (v: number) => Math.floor(v / W.blockSize);
    for (const [cx, cz] of [[0, 0], [5, -3], [-7, 11], [40, 40]] as const) {
      for (const b of generateChunk(1337, cx, cz).buildings) {
        expect(Math.floor((b.x - b.w / 2) / CHUNK_SIZE)).toBe(cx);
        expect(Math.floor((b.z + b.d / 2) / CHUNK_SIZE)).toBe(cz);
        expect(cell(b.x - b.w / 2)).toBe(cell(b.x + b.w / 2));
        expect(cell(b.z - b.d / 2)).toBe(cell(b.z + b.d / 2));
      }
    }
  });

  it('builds on the crater site (the impact flattens it) but plants no parks there', () => {
    let inside = 0;
    for (const r of chunksInRadius(0, 0, W.clearRadius + CHUNK_SIZE)) {
      const c = generateChunk(1337, r.cx, r.cz);
      inside += c.buildings.filter((b) => Math.hypot(b.x, b.z) < W.clearRadius).length;
      // Park blocks start one half-block outside the crater; trees scatter at most ~0.6 blocks from their block centre.
      for (const t of c.trees) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(W.clearRadius - W.blockSize * 0.25);
    }
    expect(inside).toBeGreaterThan(4);
  });

  it('fills chunks far from the origin densely', () => {
    let total = 0;
    for (let i = 0; i < 10; i++) total += generateChunk(1337, 20 + i, -30).buildings.length;
    expect(total / 10).toBeGreaterThan(25);
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
