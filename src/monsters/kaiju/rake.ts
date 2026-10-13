/**
 * Arm swing (rad about the shoulder, + = back) for the Claw Rake at t seconds into the strike:
 * raised back through the windup, slashing forward-down by the impact, then returning to rest.
 */
export function rakeSwing(t: number, T: { windup: number; impact: number; end: number }): number {
  if (t <= 0 || t >= T.end) return 0;
  if (t < T.windup) return t / T.windup;
  if (t < T.impact) return 1 - 1.9 * ((t - T.windup) / (T.impact - T.windup));
  return -0.9 * (1 - (t - T.impact) / (T.end - T.impact));
}
