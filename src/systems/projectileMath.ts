import type * as THREE from 'three';

/** Straight-line lerp plus a parabolic lift of `arc` at t = 0.5. */
export function ballistic(from: THREE.Vector3, to: THREE.Vector3, arc: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += arc * 4 * t * (1 - t);
  return out;
}

/**
 * A launch curve from a tube mouth `from` to `to`, `t` (0..1) along it, written into `out`: a cubic Bézier that leaves
 * level along the unit ground direction (fx, fz) and sweeps round to the target in one turn. The first control point is
 * up to `run` ahead at `from`'s height, shortened the further the target lies off that direction (none directly behind)
 * and to a third of the range at most. On the ground the second control point sits on the line from the first to the
 * target, `back` (0..1) of the way back from the target, so the curve's last two legs run straight and its heading
 * turns one way only; it is `rise` above `from`, and the path peaks a fraction of that above the tube.
 */
export function launchArc(from: THREE.Vector3, fx: number, fz: number, to: THREE.Vector3, run: number, rise: number, back: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const rx = to.x - from.x;
  const rz = to.z - from.z;
  const range = Math.hypot(rx, rz);
  const facing = range > 1e-6 ? (fx * rx + fz * rz) / range : 1;
  const lead = Math.min((run * (1 + facing)) / 2, range / 3);
  const x1 = from.x + fx * lead;
  const z1 = from.z + fz * lead;
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return out.set(
    b0 * from.x + b1 * x1 + b2 * (to.x + (x1 - to.x) * back) + b3 * to.x,
    (b0 + b1) * from.y + b2 * (from.y + rise) + b3 * to.y,
    b0 * from.z + b1 * z1 + b2 * (to.z + (z1 - to.z) * back) + b3 * to.z,
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
