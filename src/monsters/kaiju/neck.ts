import { angleDelta, yawTo, type Vec2 } from '../../util/math';

/**
 * Neck yaw (relative to the body) that faces a point at (dx, dz) in the body's frame, clamped to the
 * neck's reach `limit`; `error` is how far the clamped yaw still falls short of the point.
 */
export function neckAim(dx: number, dz: number, limit: number): { yaw: number; error: number } {
  const want = Math.atan2(dx, dz);
  const yaw = Math.max(-limit, Math.min(limit, want));
  return { yaw, error: Math.abs(want - yaw) };
}

/** Turn the neck from `current` toward `target` at no more than `rate` rad/s. */
export function stepNeck(current: number, target: number, rate: number, dt: number): number {
  const d = target - current;
  const max = rate * dt;
  return Math.abs(d) <= max ? target : current + Math.sign(d) * max;
}

/** True when the neck alone can face `target` from a body at `from` facing `yaw`. */
export function canAim(from: Vec2, yaw: number, target: Vec2, limit: number): boolean {
  return Math.abs(angleDelta(yaw, yawTo(from, target))) <= limit;
}
