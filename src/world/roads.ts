import type { Vec2 } from '../util/math';

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
