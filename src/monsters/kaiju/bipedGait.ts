import { phaseLanded } from '../../monster/gait';

/** Two legs half a cycle apart: leg 0 is the left (+X), leg 1 the right. */
function phase(cycle: number, leg: number): number {
  const p = cycle + leg * 0.5;
  return p - Math.floor(p);
}

/**
 * lift: 0..1 foot height factor. stride: -1 (back) .. 1 (front) along the body axis.
 * First half of a leg's phase is swing (lifted, moving forward), second half is stance (planted, pushing back).
 */
export function bipedFoot(cycle: number, leg: number): { lift: number; stride: number } {
  const p = phase(cycle, leg);
  if (p < 0.5) {
    const t = p / 0.5;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - 0.5) / 0.5;
  return { lift: 0, stride: 1 - 2 * t };
}

/** True when the leg's swing ended between prev and cur (the foot touched down), walking either way. */
export function bipedLanded(prev: number, cur: number, leg: number): boolean {
  return phaseLanded(prev, cur, leg * 0.5, 0.5);
}
