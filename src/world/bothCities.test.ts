import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { CITIES } from '../cities';
import type { BuildingSpec, CityStyle } from '../cities/types';
import { mulberry32 } from '../util/rng';
import { CHUNK_SIZE, chunksInRadius, generateChunk } from './chunks';
import { AVENUE_WIDTH, PITCH, bridgeAxis, isBay, isIsland, isRiver, isWater, lineWidth, nearestRoadPoint, planRoadPath, segmentAt, type Axis } from './roads';
import { inBay } from './shore';
import { openWater } from '../systems/splash';

const W = CONFIG.world;
const R = 30;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const blockCell = (v: number) => Math.floor(v / PITCH);
const mid = (axis: Axis, i: number, j: number) => (axis === 'x' ? { x: PITCH * i + PITCH / 2, z: PITCH * j } : { x: PITCH * i, z: PITCH * j + PITCH / 2 });
const cellsOf = (axis: Axis, i: number, j: number): [[number, number], [number, number]] => (axis === 'x' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]]);
const isAvenue = (axis: Axis, i: number, j: number) => mod(axis === 'x' ? j : i, 5) === 0;
const riverOnly = (s: CityStyle, i: number, j: number) => isRiver(s, i, j) && !isBay(s, i, j);
const cellRange = (v: number) => {
  const c = Math.floor(v / PITCH);
  return Math.abs(v - PITCH * c) < 1e-6 ? [c - 1, c] : [c];
};
const inWater = (s: CityStyle, p: { x: number; z: number }) => cellRange(p.x).every((i) => cellRange(p.z).every((j) => isWater(s, i, j)));
/** On an avenue line that bridges the river: x = k·1000 across an east–west river, z = k·1000 across a north–south one. */
const onBridgeLine = (s: CityStyle, p: { x: number; z: number }) => {
  const v = bridgeAxis(s) === 'z' ? p.x : p.z;
  return Math.abs(v - Math.round(v / 1000) * 1000) < 1e-6;
};
const onSegment = (s: CityStyle, p: { x: number; z: number }): boolean => {
  const eps = 1e-6;
  const ci = Math.floor(p.x / PITCH), cj = Math.floor(p.z / PITCH);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    if (Math.abs(p.z - PITCH * j) < eps && p.x >= PITCH * i - eps && p.x <= PITCH * (i + 1) + eps && segmentAt(s, 'x', i, j)) return true;
    if (Math.abs(p.x - PITCH * i) < eps && p.z >= PITCH * j - eps && p.z <= PITCH * (j + 1) + eps && segmentAt(s, 'z', i, j)) return true;
  }
  return false;
};
/** A route across the river, off the bridge avenues at both ends (Tokyo's is its existing route test's). */
const across = (s: CityStyle): [{ x: number; z: number }, { x: number; z: number }] => {
  const c0 = s.river!.c0;
  return s.river!.axis === 'z' ? [{ x: c0 - 600, z: 500 }, { x: c0 + 800, z: 500 }] : [{ x: 430, z: c0 - 900 }, { x: 610, z: c0 + 1100 }];
};
/** Full-load centres: the origin, the river, the coast and (Toronto) the lakeshore beside the islands and the Don's mouth. */
const LOAD_POINTS: Record<string, readonly (readonly [number, number])[]> = {
  tokyo: [[0, 0], [0, 1300], [-1100, -900], [-2000, 400]],
  toronto: [[0, 0], [1500, 0], [0, 2100], [-300, 2100], [1500, 2100], [-3000, 2100], [6000, 2100]],
};
// Chunks around the crash, the river and the coast, in every city.
const SAMPLE: [number, number][] = [];
for (let cx = -4; cx <= 4; cx++) for (let cz = -2; cz <= 3; cz++) SAMPLE.push([cx, cz]);

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: road network', (_id, style) => {
  it('is deterministic', () => {
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (const axis of ['x', 'z'] as const) {
      expect(segmentAt(style, axis, i, j)).toEqual(segmentAt(style, axis, i, j));
    }
  });

  it('keeps every avenue unless water is on both sides; where river is on both sides, only the bridge axis bridges it', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const axis of ['x', 'z'] as const) {
      if (!isAvenue(axis, i, j)) continue;
      const [a, b] = cellsOf(axis, i, j);
      if (isIsland(style, a[0], a[1]) || isIsland(style, b[0], b[1])) continue;
      const bothRiver = riverOnly(style, a[0], a[1]) && riverOnly(style, b[0], b[1]);
      const seg = segmentAt(style, axis, i, j);
      if (isWater(style, a[0], a[1]) && isWater(style, b[0], b[1]) && !bothRiver) expect(seg).toBeNull();
      else if (bothRiver && axis !== bridgeAxis(style)) expect(seg).toBeNull();
      else {
        expect(seg, `${axis} ${i},${j}`).not.toBeNull();
        expect(seg!.width).toBe(AVENUE_WIDTH);
        expect(seg!.bridge).toBe(bothRiver);
      }
    }
  });

  it('every land node keeps at least one segment', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const cells = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]];
      if (!cells.some(([a, b]) => !isWater(style, a!, b!)) || cells.some(([a, b]) => isIsland(style, a!, b!))) continue;
      const any = [segmentAt(style, 'x', i, j), segmentAt(style, 'x', i - 1, j), segmentAt(style, 'z', i, j), segmentAt(style, 'z', i, j - 1)].some((s) => s);
      expect(any, `node ${i},${j}`).toBe(true);
    }
  });

  it('keeps every segment near the crash site', () => {
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (const axis of ['x', 'z'] as const) {
      const m = mid(axis, i, j);
      if (Math.hypot(m.x, m.z) <= W.clearRadius + PITCH) expect(segmentAt(style, axis, i, j), `${axis} ${i},${j}`).not.toBeNull();
    }
  });

  it('removes streets at the style\'s fraction per district', () => {
    const tot: Record<string, number> = {};
    const gone: Record<string, number> = {};
    for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) for (const axis of ['x', 'z'] as const) {
      const removable = axis === 'x' ? mod(j, 2) === 1 : mod(i, 2) === 1 && mod(j, 2) === 0;
      const m = mid(axis, i, j);
      const ends = axis === 'x' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
      const kept = style.keepNodes.some((k) => ends.some(([a, b]) => k.x === PITCH * a! && k.z === PITCH * b!));
      if (!removable || isAvenue(axis, i, j) || kept || Math.hypot(m.x, m.z) <= W.clearRadius + PITCH) continue;
      const [a, b] = cellsOf(axis, i, j);
      if (isWater(style, a[0], a[1]) || isWater(style, b[0], b[1]) || isIsland(style, a[0], a[1]) || isIsland(style, b[0], b[1])) continue;
      const d = style.districtAt(m.x, m.z);
      tot[d] = (tot[d] ?? 0) + 1;
      if (!segmentAt(style, axis, i, j)) gone[d] = (gone[d] ?? 0) + 1;
    }
    let checked = 0;
    for (const [d, n] of Object.entries(tot)) {
      if (n < 200) continue;
      checked++;
      expect(Math.abs((gone[d] ?? 0) / n - style.roadRemoval[d as keyof typeof style.roadRemoval]), d).toBeLessThanOrEqual(0.05);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('puts landmarks and special lots on land, inset from the bordering road lines', () => {
    for (const s of [...style.landmarks, ...style.specialLots]) {
      const ci = blockCell(s.x), cj = blockCell(s.z);
      const msg = `${'id' in s ? s.id : 'lot'} ${s.x},${s.z}`;
      expect(isWater(style, ci, cj), msg).toBe(false);
      expect(s.x - s.w / 2, msg).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2);
      expect(s.x + s.w / 2, msg).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2);
      expect(s.z - s.d / 2, msg).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2);
      expect(s.z + s.d / 2, msg).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2);
    }
  });

  it('nearestRoadPoint never returns a water point off a bridge line', () => {
    const rnd = mulberry32(23);
    for (let k = 0; k < 500; k++) {
      const q = nearestRoadPoint(style, { x: (rnd() - 0.5) * 6000, z: (rnd() - 0.5) * 6000 });
      if (inWater(style, q)) expect(onBridgeLine(style, q), `${q.x},${q.z}`).toBe(true);
    }
  });

  it('routes ground units across the river along existing segments, over water only on bridges', () => {
    const [start, goal] = across(style);
    const path = planRoadPath(style, start, goal);
    expect(path.length).toBeGreaterThan(0);
    const pts = [nearestRoadPoint(style, start), ...path];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!, b = pts[k]!;
      expect(a.x === b.x || a.z === b.z, `leg ${k} axis-aligned`).toBe(true);
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
      for (let s = 0; s <= n; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n };
        expect(onSegment(style, q), `leg ${k} sample ${q.x},${q.z}`).toBe(true);
        if (inWater(style, q)) expect(onBridgeLine(style, q), `water ${q.x},${q.z}`).toBe(true);
      }
    }
    expect(path[path.length - 1]).toEqual(nearestRoadPoint(style, goal));
  });
});

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: chunks', (id, style) => {
  it('is deterministic per chunk', () => {
    expect(generateChunk(style, 1337, 1, 2)).toEqual(generateChunk(style, 1337, 1, 2));
  });

  it('keeps every building inside its chunk and block, clear of the bordering line half-widths', () => {
    for (const [cx, cz] of SAMPLE) {
      for (const b of generateChunk(style, 1337, cx, cz).buildings) {
        expect(Math.floor(b.x / CHUNK_SIZE)).toBe(cx);
        expect(Math.floor(b.z / CHUNK_SIZE)).toBe(cz);
        const ci = blockCell(b.x), cj = blockCell(b.z);
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2 - 1e-6);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2 + 1e-6);
        expect(b.z - b.d / 2).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2 - 1e-6);
        expect(b.z + b.d / 2).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2 + 1e-6);
      }
    }
  });

  it('puts no building, tree or park in a water cell, and lists the water cells', () => {
    let water = 0;
    const wet = (x: number, z: number) => isWater(style, blockCell(x), blockCell(z));
    for (const [cx, cz] of SAMPLE) {
      const c = generateChunk(style, 1337, cx, cz);
      for (const b of c.buildings) expect(wet(b.x, b.z)).toBe(false);
      for (const t of c.trees) expect(wet(t.x, t.z)).toBe(false);
      for (const p of c.parks) expect(wet(p.x, p.z)).toBe(false);
      for (const w of c.water) expect(wet(w.x, w.z)).toBe(true);
      water += c.water.length;
    }
    expect(water).toBeGreaterThan(10);
  });

  it('gives each landmark to exactly one chunk and builds nothing else on its block', () => {
    for (const l of style.landmarks.filter((l) => !l.span)) {
      let owners = 0;
      for (const r of chunksInRadius(l.x, l.z, CHUNK_SIZE * 2)) {
        const c = generateChunk(style, 1337, r.cx, r.cz);
        owners += c.landmarks.filter((m) => m.id === l.id).length;
        for (const b of c.buildings) expect(blockCell(b.x) === blockCell(l.x) && blockCell(b.z) === blockCell(l.z), l.id).toBe(false);
      }
      expect(owners, l.id).toBe(1);
    }
  });

  it('places every special lot exactly and lets no random building overlap one', () => {
    const all: BuildingSpec[] = [];
    const seen = new Set<string>();
    for (const s of style.specialLots) {
      for (const r of chunksInRadius(s.x, s.z, 1)) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        all.push(...generateChunk(style, 1337, r.cx, r.cz).buildings);
      }
    }
    const isSpecial = (b: BuildingSpec) => style.specialLots.some((s) => s.x === b.x && s.z === b.z && s.h === b.h);
    expect(all.filter(isSpecial)).toHaveLength(style.specialLots.length);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of all.filter(isSpecial)) {
      expect(s.keep).toBe(true);
      for (const b of all.filter((b) => !isSpecial(b))) expect(overlaps(s, b)).toBe(false);
    }
  });

  it('fits a full load in every pool: roads, intersections and bridges, water, pads, sea wall, cranes, buildings, trees, signs, screens', () => {
    for (const [x, z] of LOAD_POINTS[id]!) {
      let roads = 0, nodes = 0, water = 0, pads = 0, walls = 0, cranes = 0, buildings = 0, trees = 0, signs = 0, screens = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const c = generateChunk(style, 1337, r.cx, r.cz);
        roads += c.roads.length;
        nodes += c.nodes.length + c.roads.filter((s) => s.bridge).length;
        water += c.water.length;
        pads += c.parks.length + c.quays.length;
        walls += c.seaWall.length;
        cranes += c.cranes.length;
        buildings += c.buildings.length;
        trees += c.trees.length;
        for (const b of c.buildings) for (const s of b.signs) if (s.kind === 'screen') screens++; else signs++;
      }
      const at = `${id} at ${x},${z}`;
      expect(roads, at).toBeLessThanOrEqual(W.maxRoads);
      expect(nodes * 1.1, at).toBeLessThanOrEqual(W.maxNodes);
      if (!isBay(style, blockCell(x), blockCell(z))) expect(water, at).toBeLessThanOrEqual(W.maxWater);
      expect(pads, at).toBeLessThanOrEqual(W.maxParks);
      expect(walls, at).toBeLessThanOrEqual(W.maxSeaWall);
      expect(cranes, at).toBeLessThanOrEqual(W.maxCranes);
      expect(buildings, at).toBeLessThanOrEqual(W.maxBuildings);
      expect(trees, at).toBeLessThanOrEqual(W.maxTrees);
      expect(signs, at).toBeLessThanOrEqual(W.maxSigns);
      expect(screens, at).toBeLessThanOrEqual(W.maxScreens);
    }
  });
});

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: water underfoot', (_id, style) => {
  it('never blocks a river cell (the monster wades), and splashes in open river water but not on land', () => {
    let rivers = 0, open = 0;
    for (let ci = -20; ci < 20; ci++) for (let cj = -20; cj < 20; cj++) {
      if (!riverOnly(style, ci, cj)) continue;
      rivers++;
      const x = PITCH * (ci + 0.5), z = PITCH * (cj + 0.5);
      expect(inBay(style, x, z)).toBe(false);
      if (openWater(style, x, z)) open++;
    }
    expect(rivers).toBeGreaterThan(10);
    expect(open).toBeGreaterThan(5);
    expect(openWater(style, 0, 0)).toBe(false);
  });
});
