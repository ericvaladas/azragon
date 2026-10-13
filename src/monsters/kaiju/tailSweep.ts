import { angleDelta, yawTo, type Vec2 } from '../../util/math';

type Cand = { position: Vec2; radius: number; airborne: boolean; isAlive(): boolean };

/**
 * Tail Sweep swing, t seconds in: cocked away from the target (-0.3) through the windup, whipped across to
 * full reach (1) at impact, then easing back to rest (0) by the end.
 */
export function tailSwing(t: number, T: { windup: number; impact: number; end: number }): number {
  if (t <= 0 || t >= T.end) return 0;
  if (t < T.windup) return -0.3 * (t / T.windup);
  if (t < T.impact) return -0.3 + 1.3 * ((t - T.windup) / (T.impact - T.windup));
  const u = (t - T.impact) / (T.end - T.impact);
  return 1 - u * u * (3 - 2 * u);
}

/**
 * Nearest live ground target the tail can reach: within `reach` (plus its radius) and within `rearHalf`
 * of straight behind the monster (facing `yaw`, forward = (sin yaw, cos yaw)). Null when there is none.
 */
export function tailSweepTarget<T extends Cand>(from: Vec2, yaw: number, cands: readonly T[], reach: number, rearHalf: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (c.airborne || !c.isAlive()) continue;
    const d = Math.hypot(c.position.x - from.x, c.position.z - from.z);
    if (d > reach + c.radius || d >= bestD) continue;
    if (Math.abs(angleDelta(yaw + Math.PI, yawTo(from, c.position))) > rearHalf) continue;
    best = c;
    bestD = d;
  }
  return best;
}

/** Which way the tail swings to reach `target`: +1 toward the monster's left (+X at yaw 0), -1 its right. */
export function tailSide(from: Vec2, yaw: number, target: Vec2): 1 | -1 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  return dx * Math.cos(yaw) - dz * Math.sin(yaw) >= 0 ? 1 : -1;
}
