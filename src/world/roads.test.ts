import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import { mulberry32 } from '../util/rng';
import { nearestRoadPoint, planRoadPath, ringOnRoads, segmentAt, isWater, lineWidth, PITCH, AVENUE_WIDTH, type Axis } from './roads';

const R = 30;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const mid = (axis: Axis, i: number, j: number) => (axis === 'x' ? { x: PITCH * i + PITCH / 2, z: PITCH * j } : { x: PITCH * i, z: PITCH * j + PITCH / 2 });
const cellsOf = (axis: Axis, i: number, j: number): [[number, number], [number, number]] =>
  axis === 'x' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
const isAvenue = (axis: Axis, i: number, j: number) => mod(axis === 'x' ? j : i, 5) === 0;
const forced = (axis: Axis, i: number, j: number) => {
  const m = mid(axis, i, j);
  if (isAvenue(axis, i, j)) return true;
  if (Math.hypot(m.x, m.z) <= CONFIG.world.clearRadius + PITCH) return true;
  const ends = axis === 'x' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
  return TOKYO.keepNodes.some((k) => ends.some(([a, b]) => k.x === PITCH * a! && k.z === PITCH * b!));
};

describe('road network', () => {
  it('is deterministic', () => {
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
      expect(segmentAt(TOKYO, 'x', i, j)).toEqual(segmentAt(TOKYO, 'x', i, j));
      expect(segmentAt(TOKYO, 'z', i, j)).toEqual(segmentAt(TOKYO, 'z', i, j));
    }
  });

  it('lineWidth: avenues 56, streets roadWidth', () => {
    expect(lineWidth(0)).toBe(AVENUE_WIDTH);
    expect(lineWidth(-5)).toBe(AVENUE_WIDTH);
    expect(lineWidth(3)).toBe(CONFIG.world.roadWidth);
  });

  it('avenues always exist unless both sides are water (and then only z-avenues bridge)', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const axis of ['x', 'z'] as const) {
      if (!isAvenue(axis, i, j)) continue;
      const [a, b] = cellsOf(axis, i, j);
      const bothWater = isWater(TOKYO, a[0], a[1]) && isWater(TOKYO, b[0], b[1]);
      const seg = segmentAt(TOKYO, axis, i, j);
      if (bothWater && axis === 'x') expect(seg).toBeNull();
      else {
        expect(seg).not.toBeNull();
        expect(seg!.avenue).toBe(true);
        expect(seg!.width).toBe(AVENUE_WIDTH);
        expect(seg!.bridge).toBe(bothWater);
      }
    }
  });

  it('every land node keeps at least one segment', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const land = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => !isWater(TOKYO, a!, b!));
      if (!land) continue;
      const any = [segmentAt(TOKYO, 'x', i, j), segmentAt(TOKYO, 'x', i - 1, j), segmentAt(TOKYO, 'z', i, j), segmentAt(TOKYO, 'z', i, j - 1)].some((s) => s);
      expect(any, `node ${i},${j}`).toBe(true);
    }
  });

  it('keeps every segment near the crash site', () => {
    const lim = CONFIG.world.clearRadius + PITCH;
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (const axis of ['x', 'z'] as const) {
      const m = mid(axis, i, j);
      if (Math.hypot(m.x, m.z) <= lim) expect(segmentAt(TOKYO, axis, i, j), `${axis} ${i},${j}`).not.toBeNull();
    }
  });

  it('keeps the four segments at the Shibuya node', () => {
    expect(segmentAt(TOKYO, 'x', 1, 5)).not.toBeNull();
    expect(segmentAt(TOKYO, 'x', 0, 5)).not.toBeNull();
    expect(segmentAt(TOKYO, 'z', 1, 5)).not.toBeNull();
    expect(segmentAt(TOKYO, 'z', 1, 4)).not.toBeNull();
  });

  it('removal fractions match roadRemoval per district', () => {
    const tot: Record<string, number> = {};
    const gone: Record<string, number> = {};
    for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) for (const axis of ['x', 'z'] as const) {
      const removable = axis === 'x' ? mod(j, 2) === 1 : mod(i, 2) === 1 && mod(j, 2) === 0;
      if (!removable || forced(axis, i, j)) continue;
      const [a, b] = cellsOf(axis, i, j);
      if (isWater(TOKYO, a[0], a[1]) || isWater(TOKYO, b[0], b[1])) continue;
      const m = mid(axis, i, j);
      const d = TOKYO.districtAt(m.x, m.z);
      tot[d] = (tot[d] ?? 0) + 1;
      if (!segmentAt(TOKYO, axis, i, j)) gone[d] = (gone[d] ?? 0) + 1;
    }
    for (const [d, n] of Object.entries(tot)) {
      if (n < 200) continue;
      const f = (gone[d] ?? 0) / n;
      expect(Math.abs(f - TOKYO.roadRemoval[d as keyof typeof TOKYO.roadRemoval]), d).toBeLessThanOrEqual(0.05);
    }
    expect(Object.keys(tot).length).toBeGreaterThan(0);
  });

  it('the river crosses every column, only z-avenues bridge it, and bridges form a contiguous run', () => {
    for (let ci = -20; ci <= 20; ci++) {
      let any = false;
      for (let cj = -30; cj <= 30; cj++) if (isWater(TOKYO, ci, cj)) any = true;
      expect(any, `column ${ci}`).toBe(true);
    }
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const axis of ['x', 'z'] as const) {
      const [a, b] = cellsOf(axis, i, j);
      if (!(isWater(TOKYO, a[0], a[1]) && isWater(TOKYO, b[0], b[1]))) continue;
      const seg = segmentAt(TOKYO, axis, i, j);
      if (axis === 'z' && isAvenue(axis, i, j)) expect(seg?.bridge).toBe(true);
      else expect(seg).toBeNull();
    }
    for (let i = -20; i <= 20; i += 5) {
      // Water cells beside this z-avenue (cells i-1 and i): the run of bridge segments must span each stretch of water.
      for (let j = -30; j <= 30; j++) {
        if (!(isWater(TOKYO, i - 1, j) && isWater(TOKYO, i, j))) continue;
        expect(segmentAt(TOKYO, 'z', i, j)?.bridge, `avenue ${i} row ${j}`).toBe(true);
      }
      // The avenue is continuous across the river: every z segment from -30 to 30 exists.
      for (let j = -30; j < 30; j++) expect(segmentAt(TOKYO, 'z', i, j), `avenue ${i} seg ${j}`).not.toBeNull();
    }
  });

  it('landmarks and special lots are on land, inset from the bordering road lines', () => {
    for (const s of [...TOKYO.landmarks, ...TOKYO.specialLots]) {
      const ci = Math.floor(s.x / PITCH);
      const cj = Math.floor(s.z / PITCH);
      expect(isWater(TOKYO, ci, cj), `${'id' in s ? s.id : 'lot'} water`).toBe(false);
      const x0 = PITCH * ci + lineWidth(ci) / 2, x1 = PITCH * (ci + 1) - lineWidth(ci + 1) / 2;
      const z0 = PITCH * cj + lineWidth(cj) / 2, z1 = PITCH * (cj + 1) - lineWidth(cj + 1) / 2;
      const msg = `${'id' in s ? s.id : 'lot'} ${s.x},${s.z} ${s.w}x${s.d} in x[${x0},${x1}] z[${z0},${z1}]`;
      expect(s.x - s.w / 2, msg).toBeGreaterThanOrEqual(x0);
      expect(s.x + s.w / 2, msg).toBeLessThanOrEqual(x1);
      expect(s.z - s.d / 2, msg).toBeGreaterThanOrEqual(z0);
      expect(s.z + s.d / 2, msg).toBeLessThanOrEqual(z1);
    }
  });
});

const onSegment = (p: { x: number; z: number }): boolean => {
  // True when p lies on the centreline of an existing segment (within 1e-6 of the line and between its ends).
  const eps = 1e-6;
  const ci = Math.floor(p.x / PITCH), cj = Math.floor(p.z / PITCH);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    if (Math.abs(p.z - PITCH * j) < eps && p.x >= PITCH * i - eps && p.x <= PITCH * (i + 1) + eps && segmentAt(TOKYO, 'x', i, j)) return true;
    if (Math.abs(p.x - PITCH * i) < eps && p.z >= PITCH * j - eps && p.z <= PITCH * (j + 1) + eps && segmentAt(TOKYO, 'z', i, j)) return true;
  }
  return false;
};
// In water: every cell whose closed square contains p is water (a road on a cell edge with land on one side is a bank road).
const cellRange = (v: number) => {
  const c = Math.floor(v / PITCH);
  return Math.abs(v - PITCH * c) < 1e-6 ? [c - 1, c] : [c];
};
const inWater = (p: { x: number; z: number }) => cellRange(p.x).every((i) => cellRange(p.z).every((j) => isWater(TOKYO, i, j)));
const onBridgeLine = (p: { x: number; z: number }) => Math.abs(p.x - Math.round(p.x / 1000) * 1000) < 1e-6;

describe('nearestRoadPoint', () => {
  it('returns a point on an existing segment centreline', () => {
    const rnd = mulberry32(11);
    for (let k = 0; k < 300; k++) {
      const p = { x: (rnd() - 0.5) * 6000, z: (rnd() - 0.5) * 6000 };
      const q = nearestRoadPoint(TOKYO, p);
      expect(onSegment(q), `${p.x},${p.z} -> ${q.x},${q.z}`).toBe(true);
    }
  });

  it('never returns a water point unless it is on a bridge', () => {
    const rnd = mulberry32(23);
    for (let k = 0; k < 500; k++) {
      const p = { x: (rnd() - 0.5) * 6000, z: (rnd() - 0.5) * 6000 };
      const q = nearestRoadPoint(TOKYO, p);
      if (inWater(q)) expect(onBridgeLine(q), `${q.x},${q.z}`).toBe(true);
    }
  });

  it('avoidBridges: from the river beside a bridge, returns a bank road point, never a bridge deck', () => {
    // A point on a bridge deck: strictly inside a bridge segment's span.
    const onBridge = (q: { x: number; z: number }) => {
      const i = Math.round(q.x / PITCH), j = Math.floor(q.z / PITCH);
      return Math.abs(q.x - PITCH * i) < 1e-6 && q.z > PITCH * j + 1e-6 && segmentAt(TOKYO, 'z', i, j)?.bridge === true;
    };
    let cases = 0;
    for (let i = -20; i <= 20; i += 5) for (let j = 0; j <= 12; j++) {
      if (!segmentAt(TOKYO, 'z', i, j)?.bridge) continue;
      for (const dx of [-15, 15]) {
        const p = { x: PITCH * i + dx, z: PITCH * (j + 0.5) };
        expect(onBridge(nearestRoadPoint(TOKYO, p)), 'the plain nearest point is the bridge').toBe(true);
        const q = nearestRoadPoint(TOKYO, p, 3000, { avoidBridges: true });
        expect(onBridge(q), `${p.x},${p.z} -> ${q.x},${q.z}`).toBe(false);
        expect(onSegment(q)).toBe(true);
        expect(inWater(q) && !onBridgeLine(q)).toBe(false);
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(4);
  });

  it('is the closest road point (a point already on a road maps to itself)', () => {
    expect(nearestRoadPoint(TOKYO, { x: 0, z: 37 })).toEqual({ x: 0, z: 37 });
    const q = nearestRoadPoint(TOKYO, { x: 15, z: 80 });
    expect(q).toEqual({ x: 0, z: 80 });
  });
});

describe('planRoadPath', () => {
  const start = { x: 0, z: 400 }, goal = { x: 0, z: 2400 };

  it.each([
    ['on a bridge avenue', start, goal],
    ['off the bridge avenues (detours to one)', { x: 430, z: 400 }, { x: 610, z: 2400 }],
  ])('crosses the river from south to north along existing segments, only on bridges: %s', (_name, start, goal) => {
    const path = planRoadPath(TOKYO, start, goal);
    expect(path.length).toBeGreaterThan(0);
    const pts = [nearestRoadPoint(TOKYO, start), ...path];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!, b = pts[k]!;
      expect(a.x === b.x || a.z === b.z, `leg ${k} axis-aligned`).toBe(true);
      // Sample the leg densely: every sample is on an existing segment.
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
      for (let s = 0; s <= n; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n };
        expect(onSegment(q), `leg ${k} sample ${q.x},${q.z}`).toBe(true);
        if (inWater(q)) expect(onBridgeLine(q), `water ${q.x},${q.z}`).toBe(true);
      }
    }
    for (const w of path) if (inWater(w)) expect(onBridgeLine(w)).toBe(true);
    expect(path[path.length - 1]).toEqual(nearestRoadPoint(TOKYO, goal));
  });

  it('start equal to goal gives []', () => {
    expect(planRoadPath(TOKYO, { x: 130, z: 410 }, { x: 130, z: 410 })).toEqual([]);
  });

  it('falls back to the goal road point when the node budget runs out', () => {
    const far = { x: 9000, z: -7000 };
    expect(planRoadPath(TOKYO, start, far, 5)).toEqual([nearestRoadPoint(TOKYO, far)]);
  });
});

describe('ringOnRoads', () => {
  it('returns n points, each on an existing segment', () => {
    const pts = ringOnRoads(TOKYO, { x: 130, z: -70 }, 8, 1200);
    expect(pts).toHaveLength(8);
    for (const p of pts) expect(onSegment(p), `${p.x},${p.z}`).toBe(true);
  });
});
