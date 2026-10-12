export type Vec2 = { x: number; z: number };

export const MAX_DELTA = 0.05;

/** Frame delta clamped to [0, MAX_DELTA] so hitches and backgrounded tabs never teleport anything. */
export function clampDelta(dt: number): number {
  return Math.min(MAX_DELTA, Math.max(0, dt));
}

/** Frame-rate-independent exponential approach. Larger lambda is snappier. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Horizontal (XZ) distance. */
export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Yaw so that forward = (sin yaw, cos yaw) points from `from` to `to`. */
export function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
