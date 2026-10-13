/**
 * Dread Gaze / Evil Eye timeline (s from the moment the Wendigo looks). The target catches black fire at IGNITE;
 * the flames build while it burns, and the damage lands when they flare up at `dur` (the old lob's flight time, so
 * damage timing is unchanged). The skull keeps staring until LOOK_AFTER past the flare.
 */
export const GAZE = { ignite: 0.35, lookAfter: 0.3 } as const;

/** 0..1 strength of the black flames on the target at `t` of a `dur`-second gaze (0 before ignition and after the flare). */
export function burnIntensity(t: number, dur: number): number {
  if (t < GAZE.ignite || t >= dur) return 0;
  const u = (t - GAZE.ignite) / Math.max(1e-6, dur - GAZE.ignite);
  // Catches fast, then roars higher toward the flare.
  return Math.min(1, 0.45 + 0.55 * u + (u < 0.1 ? 0.3 * (1 - u / 0.1) : 0));
}

/** Whether the skull is still staring at the target at `t`. */
export function gazing(t: number, dur: number): boolean {
  return t >= 0 && t < dur + GAZE.lookAfter;
}
