const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * Arm swing (rad about the shoulder, + = back) for the Claw Rake at t seconds into the strike: eased back through
 * the windup, slashing forward-down (accelerating) by the impact, then easing back to rest. Continuous throughout.
 */
export function rakeSwing(t: number, T: { windup: number; impact: number; end: number }): number {
  if (t <= 0 || t >= T.end) return 0;
  if (t < T.windup) return smooth(t / T.windup);
  if (t < T.impact) {
    const u = (t - T.windup) / (T.impact - T.windup);
    return 1 - 1.9 * u * (1 + u) / 2;
  }
  return -0.9 * (1 - smooth((t - T.impact) / (T.end - T.impact)));
}
