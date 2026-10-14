import { CONFIG } from '../config';
import { hash2 } from '../cities/noise';
import type { CityStyle } from '../cities/types';
import type { Vec2 } from '../util/math';

export const PITCH = CONFIG.world.blockSize;
export const AVENUE_EVERY = 5;
export const AVENUE_WIDTH = 56;
export type Axis = 'x' | 'z';
/** 'x': from node (i, j) to (i+1, j) along z = 200j. 'z': from node (i, j) to (i, j+1) along x = 200i. */
export type Segment = { axis: Axis; i: number; j: number; avenue: boolean; width: number; bridge: boolean };

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Width of the lattice line with this index: an avenue every AVENUE_EVERY lines, a street otherwise. */
export function lineWidth(index: number): number {
  return mod(index, AVENUE_EVERY) === 0 ? AVENUE_WIDTH : CONFIG.world.roadWidth;
}

const cellCentre = (ci: number, cj: number): Vec2 => ({ x: PITCH * ci + PITCH / 2, z: PITCH * cj + PITCH / 2 });

/** Radius of the island's rounded corners. */
const ISLAND_CORNER = 150;

/** True when the centre of cell (ci, cj) lies within the river's half width (vertical distance) of its centreline. */
export function isRiver(style: CityStyle, ci: number, cj: number): boolean {
  const r = style.river;
  if (!r) return false;
  const { x: xc, z: zc } = cellCentre(ci, cj);
  return Math.abs(zc - (r.z0 + r.amp * Math.sin(xc / r.wavelength))) < r.halfWidth;
}

/** True when cell (ci, cj) lies on the island: a rounded rectangle aligned to the bay axes. */
export function isIsland(style: CityStyle, ci: number, cj: number): boolean {
  const is = style.island;
  const bay = style.bay;
  if (!is || !bay) return false;
  const c = cellCentre(ci, cj);
  const dx = c.x - is.center.x, dz = c.z - is.center.z;
  const u = dx * bay.dir.x + dz * bay.dir.z;
  const v = -dx * bay.dir.z + dz * bay.dir.x;
  const qu = Math.max(Math.abs(u) - (is.halfAlong - ISLAND_CORNER), 0);
  const qv = Math.max(Math.abs(v) - (is.halfAcross - ISLAND_CORNER), 0);
  return Math.hypot(qu, qv) <= ISLAND_CORNER;
}

/** True when the centre of cell (ci, cj) lies seaward of the coastline; island cells are never bay. */
export function isBay(style: CityStyle, ci: number, cj: number): boolean {
  const bay = style.bay;
  if (!bay) return false;
  const { x, z } = cellCentre(ci, cj);
  const along = x * bay.dir.x + z * bay.dir.z;
  const across = -x * bay.dir.z + z * bay.dir.x;
  return along > bay.offset + bay.amp * Math.sin(across / bay.wavelength) && !isIsland(style, ci, cj);
}

/** River water outside the bay: only these cells carry bridges. */
const isRiverOnly = (style: CityStyle, ci: number, cj: number): boolean => isRiver(style, ci, cj) && !isBay(style, ci, cj);

/** True for any water cell: river or bay. */
export function isWater(style: CityStyle, ci: number, cj: number): boolean {
  return isRiver(style, ci, cj) || isBay(style, ci, cj);
}

/** The road segment on the lattice, or null where none exists (removed street, water, or island). */
export function segmentAt(style: CityStyle, axis: Axis, i: number, j: number): Segment | null {
  const avenue = mod(axis === 'x' ? j : i, AVENUE_EVERY) === 0;
  const ai = axis === 'x' ? i : i - 1, aj = axis === 'x' ? j - 1 : j;
  if (isIsland(style, ai, aj) || isIsland(style, i, j)) return null;
  const a = isWater(style, ai, aj);
  const b = isWater(style, i, j);
  const seg = (bridge: boolean): Segment => ({ axis, i, j, avenue, width: lineWidth(axis === 'x' ? j : i), bridge });
  // Only river-on-both-sides bridges; bay water, or river meeting bay, has no segment.
  if (a && b) return avenue && axis === 'z' && isRiverOnly(style, ai, aj) && isRiverOnly(style, i, j) ? seg(true) : null;
  if (a || b || avenue) return seg(false);
  const mx = axis === 'x' ? PITCH * i + PITCH / 2 : PITCH * i;
  const mz = axis === 'x' ? PITCH * j : PITCH * j + PITCH / 2;
  if (Math.hypot(mx, mz) <= CONFIG.world.clearRadius + PITCH) return seg(false);
  const ends = axis === 'x' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
  if (style.keepNodes.some((k) => ends.some(([ei, ej]) => k.x === PITCH * ei! && k.z === PITCH * ej!))) return seg(false);
  const removable = axis === 'x' ? mod(j, 2) === 1 : mod(i, 2) === 1 && mod(j, 2) === 0;
  if (!removable) return seg(false);
  const h = hash2(i * 2 + (axis === 'x' ? 0 : 1), j, CONFIG.world.seed + 907);
  return h < style.roadRemoval[style.districtAt(mx, mz)] ? null : seg(false);
}

type RoadHit = { p: Vec2; seg: Segment };

/** Closest point on segment `seg`'s centreline to p. */
function project(seg: Segment, p: Vec2): Vec2 {
  if (seg.axis === 'x') return { x: Math.min(Math.max(p.x, PITCH * seg.i), PITCH * (seg.i + 1)), z: PITCH * seg.j };
  return { x: PITCH * seg.i, z: Math.min(Math.max(p.z, PITCH * seg.j), PITCH * (seg.j + 1)) };
}

/**
 * Nearest road point and its segment (bridge segments skipped when `avoidBridges`): cells scanned in growing square
 * rings, stopping once a ring cannot beat the best.
 */
function nearestHit(style: CityStyle, p: Vec2, maxR: number, avoidBridges = false): RoadHit | null {
  const ci = Math.floor(p.x / PITCH);
  const cj = Math.floor(p.z / PITCH);
  let best: RoadHit | null = null;
  let bestD = Infinity;
  const consider = (axis: Axis, i: number, j: number): void => {
    const seg = segmentAt(style, axis, i, j);
    if (!seg || (avoidBridges && seg.bridge)) return;
    const q = project(seg, p);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) { bestD = d; best = { p: q, seg }; }
  };
  const rings = Math.ceil(maxR / PITCH) + 1;
  for (let k = 0; k <= rings; k++) {
    // Every segment bordering a ring-k cell is at least (k - 1) pitches from any point of the centre cell.
    if ((k - 1) * PITCH > Math.min(bestD, maxR)) break;
    for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== k) continue;
      consider('x', i, j);
      consider('x', i, j + 1);
      consider('z', i, j);
      consider('z', i + 1, j);
    }
  }
  return bestD <= maxR ? best : null;
}

/**
 * Closest point on any existing segment's centreline to p, searching outward up to maxR (default 3000). With
 * `avoidBridges`, bridge segments are skipped, so the point is on land (a bridgehead node at most).
 */
export function nearestRoadPoint(style: CityStyle, p: Vec2, maxR = 3000, opts: { avoidBridges?: boolean } = {}): Vec2 {
  return nearestHit(style, p, maxR, opts.avoidBridges ?? false)?.p ?? { x: p.x, z: p.z };
}

const KEY_OFF = 32768;
const nodeKey = (i: number, j: number): number => (i + KEY_OFF) * 65536 + (j + KEY_OFF);
const keyI = (k: number): number => Math.floor(k / 65536) - KEY_OFF;
const keyJ = (k: number): number => (k % 65536) - KEY_OFF;
/** Virtual goal node; never collides with a lattice key (those are non-negative). */
const GOAL = -1;

/** The two end nodes of a segment. */
function ends(seg: Segment): [[number, number], [number, number]] {
  return seg.axis === 'x' ? [[seg.i, seg.j], [seg.i + 1, seg.j]] : [[seg.i, seg.j], [seg.i, seg.j + 1]];
}

/**
 * Waypoints from `start` to the road point nearest `goal`, over existing segments (A*, Manhattan heuristic,
 * at most maxNodes expansions, default 4000). Excludes the start; ends at the goal's road point. Empty if
 * start and goal snap to the same point. If no route is found within budget: [nearestRoadPoint(goal)].
 * A start off the road gets its own road point as the first waypoint.
 */
export function planRoadPath(style: CityStyle, start: Vec2, goal: Vec2, maxNodes = 4000): Vec2[] {
  const sh = nearestHit(style, start, 3000);
  const gh = nearestHit(style, goal, 3000);
  const g = gh ? gh.p : { x: goal.x, z: goal.z };
  if (!sh || !gh) return [g];
  const s = sh.p;
  if (Math.abs(s.x - g.x) < 1e-6 && Math.abs(s.z - g.z) < 1e-6) return [];
  const offRoad = Math.hypot(start.x - s.x, start.z - s.z) > 1e-6;
  const finish = (pts: Vec2[]): Vec2[] => {
    const out: Vec2[] = [s];
    for (const q of pts) {
      const a = out[out.length - 1]!;
      if (Math.abs(q.x - a.x) < 1e-6 && Math.abs(q.z - a.z) < 1e-6) continue;
      const b = out.length >= 2 ? out[out.length - 2]! : null;
      // Drop the middle point of a straight run in one direction.
      if (b && ((b.x === a.x && a.x === q.x && (a.z - b.z) * (q.z - a.z) > 0) || (b.z === a.z && a.z === q.z && (a.x - b.x) * (q.x - a.x) > 0))) out.pop();
      out.push(q);
    }
    return offRoad ? out : out.slice(1);
  };
  const sameSeg = sh.seg.axis === gh.seg.axis && sh.seg.i === gh.seg.i && sh.seg.j === gh.seg.j;
  if (sameSeg) return finish([g]);

  const gx = g.x, gz = g.z;
  const h = (i: number, j: number): number => Math.abs(PITCH * i - gx) + Math.abs(PITCH * j - gz);
  const exitCost = new Map<number, number>();
  for (const [i, j] of ends(gh.seg)) exitCost.set(nodeKey(i, j), Math.abs(PITCH * i - gx) + Math.abs(PITCH * j - gz));

  const gScore = new Map<number, number>();
  const parent = new Map<number, number>();
  // Binary min-heap on f, as parallel arrays of f and node key.
  const hf: number[] = [];
  const hk: number[] = [];
  const push = (f: number, k: number): void => {
    let n = hf.length;
    hf.push(f); hk.push(k);
    while (n > 0) {
      const up = (n - 1) >> 1;
      if (hf[up]! <= f) break;
      hf[n] = hf[up]!; hk[n] = hk[up]!;
      n = up;
    }
    hf[n] = f; hk[n] = k;
  };
  const pop = (): number => {
    const top = hk[0]!;
    const lf = hf.pop()!, lk = hk.pop()!;
    const len = hf.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        if (l >= len) break;
        const r = l + 1;
        const c = r < len && hf[r]! < hf[l]! ? r : l;
        if (hf[c]! >= lf) break;
        hf[n] = hf[c]!; hk[n] = hk[c]!;
        n = c;
      }
      hf[n] = lf; hk[n] = lk;
    }
    return top;
  };
  const relax = (k: number, cost: number, from: number, hv: number): void => {
    if (cost >= (gScore.get(k) ?? Infinity)) return;
    gScore.set(k, cost);
    parent.set(k, from);
    push(cost + hv, k);
  };

  for (const [i, j] of ends(sh.seg)) relax(nodeKey(i, j), Math.abs(PITCH * i - s.x) + Math.abs(PITCH * j - s.z), GOAL, h(i, j));
  const closed = new Set<number>();
  let expansions = 0;
  let found = false;
  while (hf.length > 0) {
    const k = pop();
    if (k === GOAL) { found = true; break; }
    if (closed.has(k)) continue;
    closed.add(k);
    if (++expansions > maxNodes) break;
    const cost = gScore.get(k)!;
    const exit = exitCost.get(k);
    if (exit !== undefined) relax(GOAL, cost + exit, k, 0);
    const i = keyI(k), j = keyJ(k);
    if (segmentAt(style, 'x', i, j)) relax(nodeKey(i + 1, j), cost + PITCH, k, h(i + 1, j));
    if (segmentAt(style, 'x', i - 1, j)) relax(nodeKey(i - 1, j), cost + PITCH, k, h(i - 1, j));
    if (segmentAt(style, 'z', i, j)) relax(nodeKey(i, j + 1), cost + PITCH, k, h(i, j + 1));
    if (segmentAt(style, 'z', i, j - 1)) relax(nodeKey(i, j - 1), cost + PITCH, k, h(i, j - 1));
  }
  if (!found) return [g];

  const nodes: Vec2[] = [];
  for (let k = parent.get(GOAL)!; k !== GOAL; k = parent.get(k)!) nodes.push({ x: PITCH * keyI(k), z: PITCH * keyJ(k) });
  nodes.reverse();
  nodes.push(g);
  return finish(nodes);
}

/** n points about r from center, each moved to its nearest road point. */
export function ringOnRoads(style: CityStyle, center: Vec2, n: number, r: number): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push(nearestRoadPoint(style, { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }));
  }
  return out;
}
