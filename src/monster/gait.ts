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

/** True when a leg's swing ended between prev and cur (the foot touched down). */
export function didLand(prev: number, cur: number, leg: number): boolean {
  if (cur <= prev) return false;
  const off = TRIPOD_A.includes(leg) ? 0 : 0.5;
  return Math.floor(prev + off - 0.5) !== Math.floor(cur + off - 0.5);
}
