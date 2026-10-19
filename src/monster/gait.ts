/** Leg indices: 0 L-front, 1 R-front, 2 L-mid, 3 R-mid, 4 L-back, 5 R-back. Tripod A swings together. */
export const TRIPOD_A: readonly number[] = [0, 3, 4];

function phase(cycle: number, leg: number): number {
  const p = cycle + (TRIPOD_A.includes(leg) ? 0 : 0.5);
  return p - Math.floor(p);
}

/**
 * lift: 0..1 foot height factor. stride: -1 (back) .. 1 (front) along the body axis.
 * First half of a leg's phase is swing (lifted, moving forward), second half is stance (planted, moving back).
 */
export function footState(cycle: number, leg: number): { lift: number; stride: number } {
  const p = phase(cycle, leg);
  if (p < 0.5) {
    const t = p / 0.5;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - 0.5) / 0.5;
  return { lift: 0, stride: 1 - 2 * t };
}

/**
 * True when a limb at phase offset `off`, lifted for the first `swing` of each cycle, touched down between cycle
 * positions prev and cur. Walking forward (cur > prev) it lands at the end of its swing (phase `swing`); walking
 * backward the gait plays in reverse, so it lands at the start of its swing (phase 0).
 */
export function phaseLanded(prev: number, cur: number, off: number, swing: number): boolean {
  if (cur === prev) return false;
  const at = cur > prev ? swing : 0;
  return Math.floor(prev + off - at) !== Math.floor(cur + off - at);
}

/** True when a leg's swing ended between prev and cur (the foot touched down), walking either way. */
export function didLand(prev: number, cur: number, leg: number): boolean {
  return phaseLanded(prev, cur, TRIPOD_A.includes(leg) ? 0 : 0.5, 0.5);
}
