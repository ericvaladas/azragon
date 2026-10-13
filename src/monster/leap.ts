import type { Vec2 } from '../util/math';

/** Clamp a leap destination to maxRange along the same direction. */
export function leapTarget(from: Vec2, to: Vec2, maxRange: number): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxRange) return { x: to.x, z: to.z };
  return { x: from.x + (dx / d) * maxRange, z: from.z + (dz / d) * maxRange };
}

/**
 * Parabolic arc: ground at both ends, `peak` at the midpoint; t is clamped to [0, duration]. With a `crouch` (a
 * fraction of the duration) it waits on the ground at `from` that long first, then flies the arc in the time left,
 * landing at the same moment.
 */
export function leapPosition(from: Vec2, to: Vec2, t: number, duration: number, peak: number, crouch = 0): { x: number; y: number; z: number } {
  const L0 = crouch * duration;
  const k = Math.min(1, Math.max(0, (t - L0) / (duration - L0)));
  return { x: from.x + (to.x - from.x) * k, y: peak * 4 * k * (1 - k), z: from.z + (to.z - from.z) * k };
}

/** Leap height for a jump this far: `peak` at full `range`, lower in proportion for shorter leaps, never under `minFrac` of it. */
export function leapPeak(distance: number, range: number, peak: number, minFrac: number): number {
  return peak * Math.min(1, Math.max(minFrac, distance / range));
}

/** Dash destination: `range` straight ahead along the monster's facing (forward = (sin yaw, cos yaw)). */
export function dashTarget(from: Vec2, yaw: number, range: number): Vec2 {
  return { x: from.x + Math.sin(yaw) * range, z: from.z + Math.cos(yaw) * range };
}
