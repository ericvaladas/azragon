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

/** True when the centre of cell (ci, cj) lies within the river's half width (vertical distance) of its centreline. */
export function isWater(style: CityStyle, ci: number, cj: number): boolean {
  const r = style.river;
  if (!r) return false;
  const xc = PITCH * ci + PITCH / 2;
  const zc = PITCH * cj + PITCH / 2;
  return Math.abs(zc - (r.z0 + r.amp * Math.sin(xc / r.wavelength))) < r.halfWidth;
}

/** The road segment on the lattice, or null where none exists (removed street, or river water). */
export function segmentAt(style: CityStyle, axis: Axis, i: number, j: number): Segment | null {
  const avenue = mod(axis === 'x' ? j : i, AVENUE_EVERY) === 0;
  const a = axis === 'x' ? isWater(style, i, j - 1) : isWater(style, i - 1, j);
  const b = isWater(style, i, j);
  const seg = (bridge: boolean): Segment => ({ axis, i, j, avenue, width: lineWidth(axis === 'x' ? j : i), bridge });
  if (a && b) return avenue && axis === 'z' ? seg(true) : null;
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

export function snapToRoad(v: number, origin: number, pitch: number): number {
  return origin + Math.round((v - origin) / pitch) * pitch;
}

function onLine(v: number, origin: number, pitch: number): boolean {
  return Math.abs(v - snapToRoad(v, origin, pitch)) < 1e-6;
}

/**
 * L-shaped path along the road grid from `start` (which sits on a road line) to the
 * intersection nearest `goal`. Zero-length legs are dropped.
 */
export function planRoadPath(start: Vec2, goal: Vec2, origin: number, pitch: number): Vec2[] {
  const end = { x: snapToRoad(goal.x, origin, pitch), z: snapToRoad(goal.z, origin, pitch) };
  const corner = onLine(start.x, origin, pitch) ? { x: start.x, z: end.z } : { x: end.x, z: start.z };
  const path: Vec2[] = [];
  if (corner.x !== start.x || corner.z !== start.z) path.push(corner);
  if (end.x !== corner.x || end.z !== corner.z) path.push(end);
  return path;
}
/** n points around `center` at radius r, alternately snapped to the nearest north-south or east-west road line. */
export function ringOnRoads(center: Vec2, n: number, r: number, origin: number, pitch: number): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    out.push(k % 2 === 0 ? { x: snapToRoad(x, origin, pitch), z } : { x, z: snapToRoad(z, origin, pitch) });
  }
  return out;
}
