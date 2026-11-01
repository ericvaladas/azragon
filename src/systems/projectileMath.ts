import type * as THREE from 'three';

/** Straight-line lerp plus a parabolic lift of `arc` at t = 0.5. */
export function ballistic(from: THREE.Vector3, to: THREE.Vector3, arc: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += arc * 4 * t * (1 - t);
  return out;
}

/**
 * A launch curve from a tube mouth `from` to `to`, `t` (0..1) along it, written into `out`: a cubic Bézier that leaves
 * level along the unit ground direction (fx, fz), first control point `run` ahead at `from`'s height, and drops
 * straight down onto `to` from its second control point `apex` above it. `apex` is the control height; the path peaks
 * at about 4/9 of it.
 */
export function launchArc(from: THREE.Vector3, fx: number, fz: number, to: THREE.Vector3, run: number, apex: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return out.set(
    b0 * from.x + b1 * (from.x + fx * run) + (b2 + b3) * to.x,
    (b0 + b1) * from.y + b2 * (to.y + apex) + b3 * to.y,
    b0 * from.z + b1 * (from.z + fz * run) + (b2 + b3) * to.z,
  );
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
