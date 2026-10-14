/** Four limbs in planting order: left fist, right foot, right fist, left foot (side 0 = left/+X). */
export const LIMBS: readonly { kind: 'fist' | 'foot'; side: 0 | 1 }[] = [
  { kind: 'fist', side: 0 },
  { kind: 'foot', side: 1 },
  { kind: 'fist', side: 1 },
  { kind: 'foot', side: 0 },
];

/** Fraction of a cycle each limb spends lifted, swinging forward; the rest of the cycle it is planted. */
export const SWING = 0.4;

/** Phase offsets: each limb plants a quarter cycle after the one before it in LIMBS. */
const OFFSET: readonly number[] = [0, 0.75, 0.5, 0.25];

export function limbPhase(cycle: number, i: number): number {
  const p = cycle + OFFSET[i]!;
  return p - Math.floor(p);
}

/**
 * lift: 0..1 height factor. stride: −1 (back) .. 1 (front) along the body axis. A limb swings forward while
 * lifted, plants at the front, then slides back as the body passes over it.
 */
export function limbSwing(cycle: number, i: number): { lift: number; stride: number } {
  const p = limbPhase(cycle, i);
  if (p < SWING) {
    const t = p / SWING;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - SWING) / (1 - SWING);
  return { lift: 0, stride: 1 - 2 * t };
}

/** True when limb i's swing ended between prev and cur (it touched down). */
export function limbPlanted(prev: number, cur: number, i: number): boolean {
  if (cur <= prev) return false;
  const off = OFFSET[i]!;
  return Math.floor(prev + off - SWING) !== Math.floor(cur + off - SWING);
}
