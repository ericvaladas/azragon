import type { Vec2 } from '../util/math';

type GroundCandidate = { position: { x: number; z: number }; radius: number; airborne: boolean; isAlive(): boolean };

/** Live ground targets whose footprint overlaps a circle of radius r around a landed foot. */
export function footTargets<T extends GroundCandidate>(foot: Vec2, r: number, candidates: readonly T[]): T[] {
  return candidates.filter(
    (c) => !c.airborne && c.isAlive() && Math.hypot(c.position.x - foot.x, c.position.z - foot.z) <= r + c.radius,
  );
}

/** Front-left leg index (on the monster's +X side at yaw 0) and front-right leg index. */
export const FRONT_LEFT = 0;
export const FRONT_RIGHT = 1;

/**
 * Which front leg strikes and where: the leg on the target's side, aimed at the target,
 * with the strike point clamped to `reach` from the monster's root.
 */
export function strikePlan(from: Vec2, yaw: number, target: Vec2, reach: number): { leg: number; point: Vec2 } {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  // The monster's left is (cos yaw, -sin yaw) when forward is (sin yaw, cos yaw).
  const leftness = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const leg = leftness >= 0 ? FRONT_LEFT : FRONT_RIGHT;
  const d = Math.hypot(dx, dz);
  const point = d <= reach ? { x: target.x, z: target.z } : { x: from.x + (dx / d) * reach, z: from.z + (dz / d) * reach };
  return { leg, point };
}
