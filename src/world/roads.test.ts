import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import { snapToRoad, planRoadPath, ringOnRoads, segmentAt, isWater, lineWidth, PITCH, AVENUE_WIDTH, type Axis } from './roads';

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

describe('legacy grid helpers (removed in Task 3)', () => {


const O = -2000;
const P = 200;

describe('snapToRoad', () => {
  it('snaps to the nearest road line', () => {
    expect(snapToRoad(90, O, P)).toBe(0);
    expect(snapToRoad(110, O, P)).toBe(200);
    expect(snapToRoad(-2000, O, P)).toBe(-2000);
  });
});

describe('planRoadPath', () => {
  it('from a north-south road: drive along z, then along x', () => {
    const path = planRoadPath({ x: -2000, z: 600 }, { x: 330, z: -170 }, O, P);
    expect(path).toEqual([{ x: -2000, z: -200 }, { x: 400, z: -200 }]);
  });
  it('from an east-west road: drive along x, then along z', () => {
    const path = planRoadPath({ x: 777, z: 2000 }, { x: -30, z: 10 }, O, P);
    expect(path).toEqual([{ x: 0, z: 2000 }, { x: 0, z: 0 }]);
  });
  it('drops zero-length legs', () => {
    expect(planRoadPath({ x: 0, z: 1000 }, { x: 10, z: 0 }, O, P)).toEqual([{ x: 0, z: 0 }]);
  });
});

describe('ringOnRoads', () => {
  it('places n points about r away, each on a road line', () => {
    const pts = ringOnRoads({ x: 130, z: -70 }, 8, 1200, 0, 200);
    expect(pts).toHaveLength(8);
    for (const p of pts) {
      const onX = Math.abs(p.x - Math.round(p.x / 200) * 200) < 1e-6;
      const onZ = Math.abs(p.z - Math.round(p.z / 200) * 200) < 1e-6;
      expect(onX || onZ).toBe(true);
      expect(Math.abs(Math.hypot(p.x - 130, p.z + 70) - 1200)).toBeLessThanOrEqual(150);
    }
  });
});

});
