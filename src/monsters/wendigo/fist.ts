import { angleDelta, yawTo, type Vec2 } from '../../util/math';

export type FistKind = 'slam' | 'backhand';

/** Bearing of p from a body at `from` facing `yaw`: 0 dead ahead, + toward the body's left (+X), ±π behind. */
export function bearingTo(from: Vec2, yaw: number, p: Vec2): number {
  return angleDelta(yaw, yawTo(from, p));
}

/** Rending Claws: a target within `frontHalf` of dead ahead takes a slam; anything beside or behind, a backhand. */
export function fistKind(bearing: number, frontHalf: number): FistKind {
  return Math.abs(bearing) <= frontHalf ? 'slam' : 'backhand';
}

/** World yaw the backhand's hit arc is centred on: `centre` rad off the nose, on the target's side. */
export function backhandYaw(yaw: number, bearing: number, centre: number): number {
  return yaw + (bearing >= 0 ? centre : -centre);
}

/** A strike starts this frame when none ran last frame (`prevT` < 0) or its clock went back (a new strike). */
export function strikeStarted(prevT: number, t: number): boolean {
  return prevT < 0 || t < prevT;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** Lunge weight over the strike: 0 through the windup, eases to 1 at impact, holds `hold` s, eases back to 0 by the end. */
export function lungeWeight(t: number, T: { windup: number; impact: number; end: number }, hold: number): number {
  if (t <= T.windup || t >= T.end) return 0;
  if (t < T.impact) return smooth((t - T.windup) / (T.impact - T.windup));
  return 1 - strikeReturn(t, T, hold);
}

/** How far the fist has eased home after impact: 0 while it holds on the target for `hold` s, 1 by the end. */
export function strikeReturn(t: number, T: { impact: number; end: number }, hold: number): number {
  const u = (t - T.impact - hold) / (T.end - T.impact - hold);
  return u <= 0 ? 0 : u >= 1 ? 1 : smooth(u);
}

/** How far past the contact point (fraction of the sweep) the backhand carries through before it stops. */
const CARRY = 0.14;

/**
 * Backhand sweep progress at `t` on timeline T: 0 at the cock (end of the windup), easing out of it, 1 at contact at
 * the impact (still moving fast), then carrying on to 1 + CARRY, decelerating to a stop over `hold` s; it rests there
 * while the hand eases home.
 */
export function backhandSweep(t: number, T: { windup: number; impact: number }, hold: number): number {
  if (t <= T.windup) return 0;
  if (t < T.impact) return Math.pow((t - T.windup) / (T.impact - T.windup), 1.6);
  const s = Math.min(1, (t - T.impact) / hold);
  return 1 + CARRY * (1 - (1 - s) * (1 - s));
}

/** How far the body lunges toward a target `dist` away: nothing within `from`, then the shortfall, capped at `max`. */
export function lungeAmount(dist: number, from: number, max: number): number {
  return Math.min(max, Math.max(0, dist - from));
}
