import { describe, it, expect } from 'vitest';
import { AVENUE_PAVEMENT, BUILDINGS_PER_CHUNK, CHUNK_SIZE, CRANE_PORTAL, DestroyedLog, SIGNS_PER_CHUNK, TREES_PER_CHUNK, blastTopples, chunkKey, chunksInRadius, generateChunk, maxLoadedChunks, planStreaming, seaWallRects } from './chunks';
import type { BuildingSpec, ChunkContent } from './chunks';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import { SHIBUYA_CROSSING } from '../cities/tokyo/layout';
import { FACADE, type CityStyle } from '../cities/types';
import { CONTAINER_COLORS } from '../cities/tokyo/districts';
import { AVENUE_WIDTH, PITCH, isBay, isIsland, isRiverBank, isWater, lineWidth, segmentAt, type Axis } from './roads';

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
    for (let i = 0; i < 10; i++) total += generateChunk(TOKYO, 1337, 20 + i, 30).buildings.length;
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
    for (const [x, z] of [[0, 0], [0, 1300], [4000, 1300], [-9000, 1500], [20000, 900], [-7100, 1300], [0, -2400], [-100, -2900], [-2613, -1913], [-3100, -1900]] as const) {
      let roads = 0, nodes = 0, water = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
        roads += c.roads.length;
        nodes += c.nodes.length + c.roads.filter((s) => s.bridge).length;
        water += c.water.length;
      }
      expect(roads).toBeLessThanOrEqual(W.maxRoads);
      expect(nodes * 1.1).toBeLessThanOrEqual(W.maxNodes);
      // Bay cells are water quads too; the pool is sized for a load centred on land (the monster never stands in the bay); swept worst case is 1979 at (-3100, -1900).
      if (!isBay(TOKYO, Math.floor(x / PITCH), Math.floor(z / PITCH))) expect(water).toBeLessThanOrEqual(W.maxWater);
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

describe('harbour and island', () => {
  const bayNeighbour = (i: number, j: number) => [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].some(([a, b]) => isBay(TOKYO, a!, b!));
  const coastal = (i: number, j: number) => !isWater(TOKYO, i, j) && !isIsland(TOKYO, i, j) && bayNeighbour(i, j);
  const cellOf = (x: number, z: number): [number, number] => [Math.floor(x / PITCH), Math.floor(z / PITCH)];
  const districtOf = (x: number, z: number) => {
    const [i, j] = cellOf(x, z);
    return TOKYO.districtAt(PITCH * (i + 0.5), PITCH * (j + 0.5));
  };
  const islandAt = (x: number, z: number) => isIsland(TOKYO, ...cellOf(x, z));
  // The coast south-east of the crash and the island, chunk by chunk.
  const REGION: [number, number][] = [];
  for (let cx = -6; cx <= 2; cx++) for (let cz = -6; cz <= 2; cz++) REGION.push([cx, cz]);
  const chunks = REGION.map(([cx, cz]) => ({ cx, cz, c: generateChunk(TOKYO, 1337, cx, cz) }));
  const all = <T>(pick: (c: ChunkContent) => T[]) => chunks.flatMap(({ c }) => pick(c));
  const portBuildings = all((c) => c.buildings).filter((b) => districtOf(b.x, b.z) === 'port');
  const yard = TOKYO.districts.port.yard!;

  it('makes every coastal land cell port and paves every port cell with a full-cell quay pad', () => {
    let coast = 0;
    for (const { cx, cz, c } of chunks) {
      const want: string[] = [];
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        if (coastal(i, j)) {
          coast++;
          expect(TOKYO.districtAt(PITCH * (i + 0.5), PITCH * (j + 0.5)), `cell ${i},${j}`).toBe('port');
        }
        if (!isWater(TOKYO, i, j) && TOKYO.districtAt(PITCH * (i + 0.5), PITCH * (j + 0.5)) === 'port') want.push(`${PITCH * (i + 0.5)},${PITCH * (j + 0.5)}`);
      }
      expect(c.quays.map((q) => `${q.x},${q.z}`).sort()).toEqual(want.sort());
    }
    expect(coast).toBeGreaterThan(20);
  });

  it('fills the port with bold container blocks (container colours, ribbed facade, whole containers tall) and warehouses', () => {
    const stacks = portBuildings.filter((b) => b.facade === FACADE.container);
    const sheds = portBuildings.filter((b) => b.facade !== FACADE.container);
    expect(stacks.length).toBeGreaterThan(50);
    expect(sheds.length).toBeGreaterThan(5);
    for (const b of stacks) {
      expect(CONTAINER_COLORS).toContain(b.color);
      const tiers = b.h / yard.tier;
      expect(Math.abs(tiers - Math.round(tiers))).toBeLessThan(1e-9);
      expect(Math.round(tiers)).toBeGreaterThanOrEqual(2);
      expect(Math.round(tiers)).toBeLessThanOrEqual(4);
      // Most of a lot (≈ 0.85 × 0.7 of 64–82 m); a block cut back behind a crane's portal keeps at least 20 m.
      expect(Math.max(b.w, b.d)).toBeGreaterThan(44);
      expect(Math.min(b.w, b.d)).toBeGreaterThanOrEqual(20);
    }
    for (const b of sheds) {
      expect(b.facade).toBe(yard.warehouseFacade);
      expect(yard.warehouseColors).toContain(b.color);
      expect(b.h).toBeGreaterThanOrEqual(12);
      expect(b.h).toBeLessThanOrEqual(22);
    }
  });

  it('puts no signs, billboards or trees in port cells', () => {
    for (const b of portBuildings) expect(b.signs).toEqual([]);
    for (const t of all((c) => c.trees)) {
      // A tree on a lattice line counts for the cells on both sides of it.
      for (const [x, z] of [[t.x - 0.5, t.z - 0.5], [t.x + 0.5, t.z + 0.5], [t.x - 0.5, t.z + 0.5], [t.x + 0.5, t.z - 0.5]] as const) {
        expect(districtOf(x, z), `tree at ${t.x},${t.z}`).not.toBe('port');
      }
    }
  });

  it('stands gantry cranes only on coastal land cells, two or three cells apart, jibs out over the water', () => {
    const cranes = all((c) => c.cranes);
    let coast = 0;
    for (const [cx, cz] of REGION) for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) if (coastal(i, j)) coast++;
    expect(cranes.length).toBeGreaterThan(5);
    // About one crane every 2–3 coastal cells.
    expect(coast / cranes.length).toBeGreaterThanOrEqual(2);
    expect(coast / cranes.length).toBeLessThanOrEqual(4);
    const cells = cranes.map((k) => cellOf(k.x, k.z));
    // A diagonal coast gets cranes facing both ways, not all along one axis.
    expect(cranes.some((k) => Math.abs(Math.sin(k.yaw)) > 0.5)).toBe(true);
    expect(cranes.some((k) => Math.abs(Math.cos(k.yaw)) > 0.5)).toBe(true);
    for (const [k, [i, j]] of cells.entries()) {
      expect(coastal(i, j), `crane in ${i},${j}`).toBe(true);
      const crane = cranes[k]!;
      // It faces the bay: its sea edge is the bay side whose outward normal best matches the bay's dir.
      const dir = TOKYO.bay!.dir;
      const facing = Math.sin(crane.yaw) * dir.x + Math.cos(crane.yaw) * dir.z;
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (isBay(TOKYO, i + di, j + dj)) expect(facing).toBeGreaterThanOrEqual(di * dir.x + dj * dir.z - 1e-9);
      }
      // The jib's tip is over a bay cell.
      const tip = cellOf(crane.x + 80 * Math.sin(crane.yaw), crane.z + 80 * Math.cos(crane.yaw));
      expect(isBay(TOKYO, ...tip), `crane in ${i},${j}`).toBe(true);
      for (const [i2, j2] of cells.slice(k + 1)) expect(Math.max(Math.abs(i2 - i), Math.abs(j2 - j))).toBeGreaterThanOrEqual(2);
    }
  });

  it('stands no crane anywhere when the style sets cranes: false (and the same coast with Tokyo has some)', () => {
    const NO_CRANES: CityStyle = { ...TOKYO, cranes: false };
    let tokyo = 0;
    for (const [cx, cz] of REGION) {
      expect(generateChunk(NO_CRANES, 1337, cx, cz).cranes).toEqual([]);
      tokyo += generateChunk(TOKYO, 1337, cx, cz).cranes.length;
    }
    expect(tokyo).toBeGreaterThan(0);
  });

  it('never stands a crane leg in a building, and never puts a warehouse on the sea side of a crane cell', () => {
    let cranes = 0;
    for (let cx = -8; cx <= 4; cx++) for (let cz = -8; cz <= 4; cz++) {
      const c = generateChunk(TOKYO, 1337, cx, cz);
      for (const k of c.cranes) {
        cranes++;
        // The portal's footprint (legs and the span between them), axis-aligned: the jib points along x or z.
        const alongX = Math.abs(Math.sin(k.yaw)) > 0.5;
        const across = CRANE_PORTAL.halfAcross + CRANE_PORTAL.leg / 2, along = CRANE_PORTAL.halfAlong + CRANE_PORTAL.leg / 2;
        const portal = { x: k.x, z: k.z, w: 2 * (alongX ? across : along), d: 2 * (alongX ? along : across) };
        const [ci, cj] = cellOf(k.x, k.z);
        for (const b of c.buildings) {
          const hit = Math.abs(b.x - portal.x) * 2 < b.w + portal.w && Math.abs(b.z - portal.z) * 2 < b.d + portal.d;
          expect(hit, `crane at ${k.x},${k.z} through building at ${b.x},${b.z}`).toBe(false);
          // Sea side: the building's centre lies toward the jib from the cell centre.
          const [bi, bj] = cellOf(b.x, b.z);
          if (bi !== ci || bj !== cj) continue;
          const seaward = (b.x - PITCH * (ci + 0.5)) * Math.sin(k.yaw) + (b.z - PITCH * (cj + 0.5)) * Math.cos(k.yaw) > 0;
          if (seaward) expect(b.facade, `warehouse on the sea side of crane cell ${ci},${cj}`).toBe(FACADE.container);
        }
      }
    }
    expect(cranes).toBeGreaterThan(15);
  });

  it('fits a full load of cranes, quay and park pads, and buildings in the pools at three coast positions', () => {
    for (const [x, z] of [[-1100, -900], [-2000, 400], [600, -2600]] as const) {
      let cranes = 0, pads = 0, buildings = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
        cranes += c.cranes.length;
        pads += c.parks.length + c.quays.length;
        buildings += c.buildings.length;
      }
      expect(cranes).toBeGreaterThan(0);
      expect(cranes).toBeLessThanOrEqual(W.maxCranes);
      expect(pads).toBeLessThanOrEqual(W.maxParks);
      expect(buildings).toBeLessThanOrEqual(W.maxBuildings);
    }
  });

  it('builds the island: office towers 40–110 m with no roads, signs or trees, and one park block', () => {
    const island = all((c) => c.buildings).filter((b) => islandAt(b.x, b.z));
    expect(island.length).toBeGreaterThan(5);
    for (const b of island) {
      expect(b.signs).toEqual([]);
      expect(b.h).toBeGreaterThanOrEqual(40);
      expect(b.h).toBeLessThanOrEqual(110);
    }
    const centre = cellOf(TOKYO.island!.center.x, TOKYO.island!.center.z);
    const parks = all((c) => c.parks).filter((p) => islandAt(p.x, p.z));
    expect(parks.map((p) => cellOf(p.x, p.z))).toEqual([centre]);
    for (const s of all((c) => c.roads)) {
      const [ai, aj] = s.axis === 'x' ? [s.i, s.j - 1] : [s.i - 1, s.j];
      expect(isIsland(TOKYO, ai, aj) || isIsland(TOKYO, s.i, s.j)).toBe(false);
    }
    // No lane trees down the island's road-less lattice lines and no avenue rows: trees only in its park block.
    for (const t of all((c) => c.trees)) {
      for (const [x, z] of [[t.x - 0.5, t.z - 0.5], [t.x + 0.5, t.z + 0.5], [t.x - 0.5, t.z + 0.5], [t.x + 0.5, t.z - 0.5]] as const) {
        if (!islandAt(x, z)) continue;
        expect(cellOf(t.x, t.z), `tree at ${t.x},${t.z}`).toEqual(centre);
      }
    }
  });
});


describe('sea wall', () => {
  const chunks: ChunkContent[] = [];
  // A 6 km stretch of coast.
  for (let cx = -6; cx <= 2; cx++) for (let cz = -6; cz <= 2; cz++) chunks.push(generateChunk(TOKYO, 1337, cx, cz));
  const walls = chunks.flatMap((c) => c.seaWall);

  it('has exactly one wall per land/bay cell edge, none where both sides are land, none on river edges', () => {
    const want = new Set<string>();
    for (let i = -24; i < 12; i++) for (let j = -24; j < 12; j++) {
      if (isWater(TOKYO, i, j)) continue;
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (isBay(TOKYO, i + di, j + dj)) want.add(di !== 0 ? `z,${(di > 0 ? i + 1 : i) * PITCH},${j * PITCH + PITCH / 2}` : `x,${i * PITCH + PITCH / 2},${(dj > 0 ? j + 1 : j) * PITCH}`);
      }
    }
    expect(want.size).toBeGreaterThan(20);
    const got = walls.map((w) => `${w.axis},${w.x},${w.z}`);
    expect(got.length).toBe(new Set(got).size);
    expect(new Set(got)).toEqual(want);
  });

  it('puts every wall on a land/bay edge with side pointing from the land cell to the bay', () => {
    for (const w of walls) {
      const px = w.axis === 'z' ? w.side : 0, pz = w.axis === 'x' ? w.side : 0;
      const bay = [Math.floor((w.x + px * PITCH / 2) / PITCH), Math.floor((w.z + pz * PITCH / 2) / PITCH)] as const;
      const land = [Math.floor((w.x - px * PITCH / 2) / PITCH), Math.floor((w.z - pz * PITCH / 2) / PITCH)] as const;
      expect(isBay(TOKYO, bay[0], bay[1])).toBe(true);
      expect(isWater(TOKYO, land[0], land[1])).toBe(false);
    }
  });

  const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, b: typeof a) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

  it('is continuous around convex corners: the two walls (and their foam) of a corner cell overlap', () => {
    let corners = 0;
    const byCell = new Map<string, typeof walls>();
    for (const w of walls) {
      const i = Math.floor((w.axis === 'z' ? w.x - w.side * PITCH / 2 : w.x) / PITCH);
      const j = Math.floor((w.axis === 'x' ? w.z - w.side * PITCH / 2 : w.z) / PITCH);
      byCell.set(`${i},${j}`, [...(byCell.get(`${i},${j}`) ?? []), w]);
    }
    for (const list of byCell.values()) {
      const a = list.find((w) => w.axis === 'x'), b = list.find((w) => w.axis === 'z');
      if (!a || !b) continue;
      corners++;
      expect(overlap(seaWallRects(a).wall, seaWallRects(b).wall)).toBe(true);
      expect(overlap(seaWallRects(a).foam, seaWallRects(b).foam)).toBe(true);
    }
    expect(corners).toBeGreaterThan(3);
  });

  it('never covers the interior of a land cell beyond its bordering roads (no poke at concave corners)', () => {
    for (const w of walls) {
      const { wall, foam } = seaWallRects(w);
      for (const r of [wall, foam]) {
        for (let i = Math.floor(r.x0 / PITCH); i <= Math.floor(r.x1 / PITCH); i++) for (let j = Math.floor(r.z0 / PITCH); j <= Math.floor(r.z1 / PITCH); j++) {
          if (isWater(TOKYO, i, j)) continue;
          const cell = { x0: i * PITCH + lineWidth(i) / 2, x1: (i + 1) * PITCH - lineWidth(i + 1) / 2, z0: j * PITCH + lineWidth(j) / 2, z1: (j + 1) * PITCH - lineWidth(j + 1) / 2 };
          expect(r.x0 < cell.x1 && cell.x0 < r.x1 && r.z0 < cell.z1 && cell.z0 < r.z1, `wall at ${w.x},${w.z} over land cell ${i},${j}`).toBe(false);
        }
      }
    }
  });

  it('fits a full load along the coast in the wall and foam pools', () => {
    for (const [x, z] of [[-1100, -900], [-2000, 400], [600, -2600], [-2600, -1900]] as const) {
      let n = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) n += generateChunk(TOKYO, 1337, r.cx, r.cz).seaWall.length;
      expect(n).toBeLessThanOrEqual(W.maxSeaWall);
      expect(n).toBeLessThanOrEqual(W.maxFoam);
    }
  });
});

describe('Rainbow Bridge (a span landmark)', () => {
  const bridge = TOKYO.landmarks.find((l) => l.id === 'rainbow-bridge')!;
  const span = bridge.span!;
  const mid = { x: (span.from.x + span.to.x) / 2, z: (span.from.z + span.to.z) / 2 };
  const near = chunksInRadius(mid.x, mid.z, 900);
  const contents = near.map((r) => ({ r, c: generateChunk(TOKYO, 1337, r.cx, r.cz) }));

  it('is owned by exactly one chunk, the one holding its shore anchorage', () => {
    const owners = contents.filter(({ c }) => c.landmarks.some((l) => l.id === bridge.id));
    expect(owners).toHaveLength(1);
    const { r } = owners[0]!;
    expect(Math.floor(span.from.x / CHUNK_SIZE)).toBe(r.cx);
    expect(Math.floor(span.from.z / CHUNK_SIZE)).toBe(r.cz);
  });

  it('claims the anchorage block: no buildings or cranes on it, a quay pad under it (it is in the port)', () => {
    const [bi, bj] = [blockCell(span.from.x), blockCell(span.from.z)];
    expect(TOKYO.districtAt((bi + 0.5) * PITCH, (bj + 0.5) * PITCH)).toBe('port');
    let pads = 0;
    for (const { c } of contents) {
      for (const b of c.buildings) expect(blockCell(b.x) === bi && blockCell(b.z) === bj).toBe(false);
      for (const k of c.cranes) expect(blockCell(k.x) === bi && blockCell(k.z) === bj).toBe(false);
      pads += c.quays.filter((q) => blockCell(q.x) === bi && blockCell(q.z) === bj).length;
    }
    expect(pads).toBe(1);
  });

  it('keeps every crane (portal and jib) clear of the deck', () => {
    const len = Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z);
    const ux = (span.to.x - span.from.x) / len, uz = (span.to.z - span.from.z) / len;
    // A crane's reach from its centre: the jib tip, 80 m past the front legs.
    const reach = CRANE_PORTAL.halfAcross + 80;
    for (const { c } of contents) for (const k of c.cranes) {
      const t = Math.max(0, Math.min(len, (k.x - span.from.x) * ux + (k.z - span.from.z) * uz));
      const d = Math.hypot(k.x - (span.from.x + ux * t), k.z - (span.from.z + uz * t));
      expect(d).toBeGreaterThan(reach + span.halfWidth);
    }
  });
});

describe('river bank parks', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 }, bay: undefined, island: undefined, landmarks: [], specialLots: [] };
  it('lays every bank block as a park: a pad, and no building on it', () => {
    let banks = 0;
    for (let cx = 0; cx <= 3; cx++) for (let cz = -3; cz <= 2; cz++) {
      const c = generateChunk(NS, 1337, cx, cz);
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        if (!isRiverBank(NS, i, j)) continue;
        banks++;
        expect(c.parks).toContainEqual({ x: PITCH * (i + 0.5), z: PITCH * (j + 0.5) });
        expect(c.buildings.some((b) => Math.floor(b.x / PITCH) === i && Math.floor(b.z / PITCH) === j), `${i},${j}`).toBe(false);
      }
    }
    expect(banks).toBeGreaterThan(20);
  });
});
