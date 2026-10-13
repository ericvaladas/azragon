import type { Vec2 } from '../util/math';

type Cand = { position: { x: number; z: number }; radius: number; isAlive(): boolean };
type XYZ = { x: number; y: number; z: number };

/**
 * Live ground targets a forward swipe reaches: within `range` (plus their radius) and within `halfAngle`
 * of the facing `yaw` (forward = (sin yaw, cos yaw)), widened by each target's angular size.
 */
export function arcTargets<T extends Cand & { airborne: boolean }>(from: Vec2, yaw: number, range: number, halfAngle: number, cands: readonly T[]): T[] {
  return cands.filter((c) => c.isAlive() && !c.airborne && inArc(from, yaw, range, halfAngle, c.position, c.radius));
}

/** Whether point p (a disc of `radius`) lies in the forward arc from `from` facing `yaw`, within `range`. */
export function inArc(from: Vec2, yaw: number, range: number, halfAngle: number, p: Vec2, radius = 0): boolean {
  const dx = p.x - from.x;
  const dz = p.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range + radius) return false;
  if (d <= radius) return true;
  const ang = Math.acos(Math.min(1, Math.max(-1, (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d)));
  return ang <= halfAngle + Math.asin(Math.min(1, radius / d));
}

/**
 * Ground end of a beam leaving `from` along unit direction (dx, dz): the point on that ray exactly `range`
 * from `origin` (the monster), so the lane length does not depend on how far ahead the jaws are.
 */
export function groundBeamEnd(from: Vec2, dir: Vec2, origin: Vec2, range: number): Vec2 {
  const ox = from.x - origin.x;
  const oz = from.z - origin.z;
  const b = ox * dir.x + oz * dir.z;
  const c = ox * ox + oz * oz - range * range;
  const t = Math.max(0, -b + Math.sqrt(Math.max(0, b * b - c)));
  return { x: from.x + dir.x * t, z: from.z + dir.z * t };
}

/** Distance from p to segment a→b in the XZ plane. */
export function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const u = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * u), p.z - (a.z + abz * u));
}

/** Live targets (ground or air) whose footprint touches segment a→b widened by halfWidth. */
export function lineTargets<T extends Cand>(a: Vec2, b: Vec2, halfWidth: number, cands: readonly T[]): T[] {
  return cands.filter((c) => c.isAlive() && segDist(c.position, a, b) <= halfWidth + c.radius);
}

/** Evenly spaced points from a to b inclusive, no more than `step` apart (for sampling buildings). */
export function linePoints(a: Vec2, b: Vec2, step: number): Vec2[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  return out;
}

/**
 * Where a beam from `from` toward `aim` ends: extended to `range` horizontally, or where it meets the
 * ground first. Aimed straight down, it ends on the ground below.
 */
export function beamEnd(from: XYZ, aim: XYZ, range: number): XYZ {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const dz = aim.z - from.z;
  const h = Math.hypot(dx, dz);
  if (h < 1e-6) return { x: from.x, y: 0, z: from.z };
  let s = range / h;
  if (dy < 0) s = Math.min(s, from.y / -dy);
  return { x: from.x + dx * s, y: Math.max(0, from.y + dy * s), z: from.z + dz * s };
}
