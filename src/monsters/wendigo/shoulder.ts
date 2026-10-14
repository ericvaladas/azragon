import * as THREE from 'three';

/**
 * The shoulder's range, for the left arm in torso space (+X out to the side, +Y up, +Z forward; mirror x for the
 * right arm), all in rad:
 * - `back`: how far a level arm may swing behind the coronal plane (the vertical plane through both shoulders);
 * - `tilt`: how much further back the limit leans as the arm hangs lower (a hanging arm extends further than a
 *   level one): a unit direction d must keep d.z ≥ tilt·d.y − sin(back);
 * - `medial`: how far the arm may cross the midline in front of the chest (d.x ≥ −sin(medial));
 * - `raise`: how far above level the arm may lift (d.y ≤ sin(raise)).
 */
export type ShoulderLimits = { back: number; tilt: number; medial: number; raise: number };

/** Whether unit direction d lies within the shoulder's range (to within eps). */
export function inShoulder(d: THREE.Vector3, lim: ShoulderLimits, eps = 1e-9): boolean {
  return d.y <= Math.sin(lim.raise) + eps && d.z >= lim.tilt * d.y - Math.sin(lim.back) - eps && d.x >= -Math.sin(lim.medial) - eps;
}

const _d0 = new THREE.Vector3();

/**
 * Writes to `out` the unit direction nearest d (any length) within the shoulder's range: a raise is capped keeping
 * the arm's heading; a swing past the back or across the chest stops at that limit keeping the arm's height. Returns
 * the angle (rad) it moved; 0 when d was already inside.
 */
export function clampShoulder(d: THREE.Vector3, lim: ShoulderLimits, out: THREE.Vector3): number {
  _d0.copy(d).normalize();
  out.copy(_d0);
  if (inShoulder(out, lim)) return 0;
  const top = Math.sin(lim.raise);
  if (out.y > top) {
    const h = Math.hypot(out.x, out.z);
    const r = Math.cos(lim.raise);
    if (h < 1e-9) out.set(0, top, r);
    else out.set((out.x / h) * r, top, (out.z / h) * r);
  }
  const y = out.y;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const zMin = lim.tilt * y - Math.sin(lim.back);
  const xMin = -Math.sin(lim.medial);
  // Across the chest: the medial limit at this height, in front (the back half there is behind the back).
  const front = Math.sqrt(Math.max(0, r * r - xMin * xMin));
  if (out.z < zMin) {
    // Behind the shoulders' plane: out round the side to the back limit, never across behind the back; a reach
    // far across behind the back is nearer the medial limit in front.
    const xo = Math.sqrt(Math.max(0, r * r - zMin * zMin));
    const side = xo * _d0.x + zMin * _d0.z;
    const across = xMin * _d0.x + front * _d0.z;
    if (out.x < xMin && across > side) out.set(xMin, y, front);
    else out.set(xo, y, zMin);
  } else if (out.x < xMin) out.set(xMin, y, front);
  out.normalize();
  return Math.acos(Math.min(1, Math.max(-1, out.dot(_d0))));
}

/** A deficit `x` eased into ±max: about x while small, never past max. */
export function softCap(x: number, max: number): number {
  return max * Math.tanh(x / max);
}

/**
 * How far (rad) the torso turns toward the arm's side so a hand target at horizontal `bearing` from the shoulder
 * (0 ahead, + outward, − across the chest) comes within the shoulder's own sweep, `lo`..`hi`; soft-capped at `max`.
 * Negative for a target across the chest (the torso coils away).
 */
export function reachTwist(bearing: number, lo: number, hi: number, max: number): number {
  const deficit = bearing > hi ? bearing - hi : bearing < lo ? bearing - lo : 0;
  return deficit === 0 ? 0 : softCap(deficit, max);
}

/**
 * Advance a damped spring (`s.x` toward `target`, natural frequency `omega` rad/s, damping ratio `zeta`) by dt s;
 * substepped so a long frame stays stable. Below zeta 1 it overshoots and settles: follow-through.
 */
export function springStep(s: { x: number; v: number }, target: number, omega: number, zeta: number, dt: number): void {
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (omega * omega * (target - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
}
