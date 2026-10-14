import { describe, it, expect } from 'vitest';
import { AVENUE_PAVEMENT, BUILDINGS_PER_CHUNK, CHUNK_SIZE, DestroyedLog, SIGNS_PER_CHUNK, TREES_PER_CHUNK, blastTopples, chunkKey, chunksInRadius, generateChunk, maxLoadedChunks, planStreaming } from './chunks';
import type { BuildingSpec } from './chunks';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import { SHIBUYA_CROSSING } from '../cities/tokyo/layout';
import type { CityStyle } from '../cities/types';
import { AVENUE_WIDTH, PITCH, isWater, lineWidth, segmentAt, type Axis } from './roads';

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

  it('lays a park pad under a landmark standing in a park (Tokyo Tower in Shiba Park), but no trees on its block', () => {
    const tower = TOKYO.landmarks.find((l) => l.id === 'tokyo-tower')!;
    let pads = 0;
    for (const r of chunksInRadius(tower.x, tower.z, CHUNK_SIZE)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      pads += c.parks.filter((p) => blockCell(p.x) === blockCell(tower.x) && blockCell(p.z) === blockCell(tower.z)).length;
      for (const t of c.trees) expect(Math.abs(t.x - tower.x) < tower.w / 2 && Math.abs(t.z - tower.z) < tower.d / 2).toBe(false);
    }
    expect(pads).toBe(1);
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

describe('road network in chunks', () => {
  // Chunks straddling the river (z ≈ 1120–1480), the crater, Shibuya and a residential stretch.
  const SAMPLE: [number, number][] = [];
  for (let cx = -6; cx <= 6; cx++) for (let cz = 0; cz <= 2; cz++) SAMPLE.push([cx, cz]);
  SAMPLE.push([3, -3], [4, -4], [2, -2], [-3, -3]);

  it("lists exactly the existing segments whose start node lies in the chunk", () => {
    for (const [cx, cz] of SAMPLE) {
      const want: string[] = [];
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        for (const axis of ['x', 'z'] as Axis[]) {
          const s = segmentAt(TOKYO, axis, i, j);
          if (s) want.push(JSON.stringify(s));
        }
      }
      const got = generateChunk(TOKYO, 1337, cx, cz).roads.map((s) => JSON.stringify(s));
      expect(got.sort()).toEqual(want.sort());
    }
  });

  it('puts no building, tree or park in a water cell, and lists the water cells', () => {
    let water = 0;
    for (const [cx, cz] of SAMPLE) {
      const c = generateChunk(TOKYO, 1337, cx, cz);
      const wet = (x: number, z: number) => isWater(TOKYO, Math.floor(x / PITCH), Math.floor(z / PITCH));
      for (const b of c.buildings) expect(wet(b.x, b.z)).toBe(false);
      for (const t of c.trees) expect(wet(t.x, t.z)).toBe(false);
      for (const p of c.parks) expect(wet(p.x, p.z)).toBe(false);
      for (const wc of c.water) expect(wet(wc.x, wc.z)).toBe(true);
      water += c.water.length;
    }
    expect(water).toBeGreaterThan(10);
  });

  it("keeps every building footprint clear of its cell's bordering line half-widths", () => {
    for (const [cx, cz] of SAMPLE) {
      for (const b of generateChunk(TOKYO, 1337, cx, cz).buildings) {
        const ci = Math.floor(b.x / PITCH);
        const cj = Math.floor(b.z / PITCH);
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2 - 1e-6);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2 + 1e-6);
        expect(b.z - b.d / 2).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2 - 1e-6);
        expect(b.z + b.d / 2).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2 + 1e-6);
      }
    }
  });

  it('plants trees along removed street strips between residential cells', () => {
    let strips = 0;
    for (let cx = 2; cx <= 4; cx++) for (let cz = -4; cz <= -2; cz++) {
      const c = generateChunk(TOKYO, 1337, cx, cz);
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        for (const axis of ['x', 'z'] as Axis[]) {
          if (segmentAt(TOKYO, axis, i, j)) continue;
          const [a, b] = axis === 'x' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
          const res = [a!, b!].every(([ci, cj]) => TOKYO.districtAt(PITCH * (ci! + 0.5), PITCH * (cj! + 0.5)) === 'residential');
          if (!res) continue;
          strips++;
          const on = c.trees.filter((t) => axis === 'x'
            ? Math.abs(t.z - PITCH * j) < 1 && t.x > PITCH * i && t.x < PITCH * (i + 1)
            : Math.abs(t.x - PITCH * i) < 1 && t.z > PITCH * j && t.z < PITCH * (j + 1));
          expect(on.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
    expect(strips).toBeGreaterThan(0);
  });

  describe('avenue street trees', () => {
    const CHUNKS = [[5, -3], [-7, 11], [40, 40], [3, 7], [-4, -6], [8, 2]] as const;
    const avenue = (line: number) => lineWidth(line) === AVENUE_WIDTH;
    const mod = (n: number, m: number) => ((n % m) + m) % m;

    it('line both sides of every avenue bordering a built block, in the pavement band beside the road', () => {
      let edges = 0;
      for (const [cx, cz] of CHUNKS) {
        const c = generateChunk(TOKYO, 1337, cx, cz);
        for (let bi = 4 * cx; bi < 4 * cx + 4; bi++) for (let bj = 4 * cz; bj < 4 * cz + 4; bj++) {
          const bx = PITCH * (bi + 0.5), bz = PITCH * (bj + 0.5);
          if (isWater(TOKYO, bi, bj) || TOKYO.districtAt(bx, bz) === 'park' || Math.hypot(bx, bz) < W.clearRadius + PITCH * 0.5) continue;
          if (TOKYO.landmarks.some((l) => blockCell(l.x) === bi && blockCell(l.z) === bj)) continue;
          // [line index, line coordinate, side the block lies on, along-axis is z]
          const sides: [number, number, 1 | -1, boolean][] = [[bi, PITCH * bi, 1, true], [bi + 1, PITCH * (bi + 1), -1, true], [bj, PITCH * bj, 1, false], [bj + 1, PITCH * (bj + 1), -1, false]];
          for (const [line, at, side, alongZ] of sides) {
            if (!avenue(line)) continue;
            edges++;
            const lo = PITCH * (alongZ ? bj : bi), hi = lo + PITCH;
            const row = c.trees.filter((t) => {
              const off = ((alongZ ? t.x : t.z) - at) * side;
              const along = alongZ ? t.z : t.x;
              return off > AVENUE_WIDTH / 2 && off < AVENUE_WIDTH / 2 + AVENUE_PAVEMENT && along > lo && along < hi;
            });
            expect(row.length, `block ${bi},${bj} line ${line}`).toBeGreaterThanOrEqual(4);
          }
        }
      }
      expect(edges).toBeGreaterThan(10);
    });

    it('never stands on an avenue, and no building stands in an avenue pavement band', () => {
      for (const [cx, cz] of CHUNKS) {
        const c = generateChunk(TOKYO, 1337, cx, cz);
        for (const t of c.trees) for (const v of [t.x, t.z]) {
          const line = Math.round(v / PITCH);
          if (mod(line, 5) === 0) expect(Math.abs(v - PITCH * line)).toBeGreaterThan(AVENUE_WIDTH / 2);
        }
        for (const b of c.buildings) {
          if (b.keep) continue;
          for (const [v, half] of [[b.x, b.w / 2], [b.z, b.d / 2]] as const) {
            const line = Math.round(v / PITCH);
            if (mod(line, 5) === 0) expect(Math.abs(v - PITCH * line) - half).toBeGreaterThanOrEqual(AVENUE_WIDTH / 2 + AVENUE_PAVEMENT - 1e-6);
          }
        }
      }
    });
  });

  it('lists intersections with at least one incident segment, sized to the widest', () => {
    const c = generateChunk(TOKYO, 1337, 0, 1);
    const shibuya = c.nodes.find((n) => n.x === SHIBUYA_CROSSING.x && n.z === SHIBUYA_CROSSING.z);
    expect(shibuya?.size).toBe(56);
    for (const n of c.nodes) expect([36, 56]).toContain(n.size);
  });

  it('fits a full load of roads, intersections (with bridge slabs) and water in the pools', () => {
    expect(32 * maxLoadedChunks()).toBeLessThanOrEqual(W.maxRoads);
    // (−7100, 1300) is the swept peak for intersections plus bridge slabs; keep 10% headroom over it.
    for (const [x, z] of [[0, 0], [0, 1300], [4000, 1300], [-9000, 1500], [20000, 900], [-7100, 1300]] as const) {
      let roads = 0, nodes = 0, water = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
        roads += c.roads.length;
        nodes += c.nodes.length + c.roads.filter((s) => s.bridge).length;
        water += c.water.length;
      }
      expect(roads).toBeLessThanOrEqual(W.maxRoads);
      expect(nodes * 1.1).toBeLessThanOrEqual(W.maxNodes);
      expect(water).toBeLessThanOrEqual(W.maxWater);
    }
  });

  it('draws no intersection square at a mid-river node (all four cells water; the bridge deck runs through)', () => {
    let midRiver = 0;
    for (let cx = -20; cx <= 20; cx++) for (const cz of [1, 2, 3]) {
      for (const n of generateChunk(TOKYO, 1337, cx, cz).nodes) {
        const i = n.x / PITCH, j = n.z / PITCH;
        expect(isWater(TOKYO, i - 1, j - 1) && isWater(TOKYO, i, j - 1) && isWater(TOKYO, i - 1, j) && isWater(TOKYO, i, j)).toBe(false);
      }
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        if (isWater(TOKYO, i - 1, j - 1) && isWater(TOKYO, i, j - 1) && isWater(TOKYO, i - 1, j) && isWater(TOKYO, i, j)) midRiver++;
      }
    }
    expect(midRiver).toBeGreaterThan(0);
  });

  it('caps trees per chunk, so a full load never runs the tree pool dry (near chunks keep their trees)', () => {
    expect(TREES_PER_CHUNK * maxLoadedChunks()).toBeLessThanOrEqual(W.maxTrees);
    // The origin, the swept tree peak (a park-heavy load) and the node peak by the river.
    for (const [x, z] of [[0, 0], [7000, -2000], [-7100, 1300], [2500, -2500]] as const) {
      let trees = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const n = generateChunk(TOKYO, 1337, r.cx, r.cz).trees.length;
        expect(n).toBeLessThanOrEqual(TREES_PER_CHUNK);
        trees += n;
      }
      expect(trees).toBeLessThanOrEqual(W.maxTrees);
    }
  });

  it('thins only over-full chunks, deterministically, and keeps most of a park chunk\'s trees', () => {
    const ALL_PARK: CityStyle = { ...TOKYO, districtAt: () => 'park', landmarks: [], specialLots: [], river: undefined };
    const c = generateChunk(ALL_PARK, 1337, 30, 30);
    expect(c.trees.length).toBe(TREES_PER_CHUNK);
    expect(c.trees).toEqual(generateChunk(ALL_PARK, 1337, 30, 30).trees);
    expect(TREES_PER_CHUNK).toBeGreaterThanOrEqual(16 * TOKYO.parkTrees[0] * 0.5);
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
