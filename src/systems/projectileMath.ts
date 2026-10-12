import type * as THREE from 'three';

/** Straight-line lerp plus a parabolic lift of `arc` at t = 0.5. */
export function ballistic(from: THREE.Vector3, to: THREE.Vector3, arc: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += arc * 4 * t * (1 - t);
  return out;
}

/** Multi-shot target list: the primary, then distinct others (pre-sorted nearest first), then the primary again. */
export function spikeTargets<T>(primary: T, others: readonly T[], count: number): T[] {
  const out: T[] = [primary];
  for (const o of others) {
    if (out.length >= count) break;
    if (o !== primary && !out.includes(o)) out.push(o);
  }
  while (out.length < count) out.push(primary);
  return out;
}
