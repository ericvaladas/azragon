import type * as THREE from 'three';

/** Ink Cloud jet: the blob's speed (m/s) and flight-time clamp (s), and its lob height as a fraction of the distance. */
export const JET = { speed: 3200, minTime: 0.1, maxTime: 0.24, arc: 0.12 } as const;

/**
 * Ink Cloud burst: each puff's life (s), how long it takes to billow out to full size, when it starts thinning,
 * and how much it keeps swelling (fraction of full size) over the rest of its life.
 */
export const CLOUD = { life: 1.9, growTime: 0.28, fadeStart: 0.85, swell: 0.35 } as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Seconds an ink blob takes to fly `dist` metres. */
export function blobFlightTime(dist: number): number {
  return Math.min(JET.maxTime, Math.max(JET.minTime, dist / JET.speed));
}

/** Point along a blob's lobbed path from `from` to `to` at flight fraction `k` (clamped to 0..1). */
export function blobPoint(from: THREE.Vector3, to: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const t = clamp01(k);
  out.lerpVectors(from, to, t);
  out.y += Math.sin(Math.PI * t) * from.distanceTo(to) * JET.arc;
  return out;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * One cloud puff's size (fraction of its full size) and opacity (0..1) at `age` seconds after the burst, for a
 * puff that starts `delay` seconds late: it billows out fast, swells slowly, holds dense until `fadeStart`,
 * then thins to nothing by `life`.
 */
export function cloudPuff(age: number, delay: number, out: { scale: number; alpha: number }): { scale: number; alpha: number } {
  const a = age - delay;
  if (a < 0 || a >= CLOUD.life) {
    out.scale = 0;
    out.alpha = 0;
    return out;
  }
  out.scale = 0.3 + 0.7 * easeOutCubic(Math.min(1, a / CLOUD.growTime)) + CLOUD.swell * (a / CLOUD.life);
  out.alpha = a <= CLOUD.fadeStart ? 1 : (1 - (a - CLOUD.fadeStart) / (CLOUD.life - CLOUD.fadeStart)) ** 2;
  return out;
}
