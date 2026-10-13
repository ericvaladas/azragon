import * as THREE from 'three';

/**
 * The Wendigo's spine bending sideways (torso space, +Z forward, +X left): from z0 (by the hips) to z1 (past the
 * shoulders) it curves at constant curvature through a total `a` rad (+ toward +X), keeping its length; everything
 * ahead of z1 is carried on rigidly, turned by `a`; everything behind z0 stays put. The torso's vertex shader runs
 * the same map (GolemBody's SPINE_BEND_GLSL); this is its CPU twin, for the shoulders, head and launch points.
 */
export function bendPoint(p: THREE.Vector3, a: number, z0: number, z1: number, out: THREE.Vector3, sin = Math.sin): THREE.Vector3 {
  const s = p.z - z0;
  if (s <= 0 || a === 0) return out.copy(p);
  const L = z1 - z0;
  const m = Math.min(s, L);
  const th = (a * m) / L;
  // Slice at arc length m, turned by th about the centre of curvature L/a off to the side. Written with sinc rather
  // than dividing by the curvature, so a GPU sin's small absolute error is never blown up by a nearly straight spine.
  const sc = sinc(th / 2, sin);
  let x = p.x * Math.cos(th) + m * (th / 2) * sc * sc;
  let z = z0 + m * sinc(th, sin) - p.x * sin(th);
  if (s > L) {
    x += (s - L) * Math.sin(a);
    z += (s - L) * Math.cos(a);
  }
  return out.set(x, p.y, z);
}

/** sin(x)/x, by its series near 0 (where a GPU sin's absolute error would swamp the quotient). */
function sinc(x: number, sin: (x: number) => number): number {
  return Math.abs(x) < 0.05 ? 1 - (x * x) / 6 + (x * x * x * x) / 120 : sin(x) / x;
}

/** How far (rad) the slice of the spine at z is turned by a bend of `a` (bendPoint). */
export function bendAngleAt(z: number, a: number, z0: number, z1: number): number {
  return a * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
}

/**
 * Horizontal bearing (rad) of a hand target from a shoulder, given its offset outward (`dxOut`, away from the body)
 * and forward (dz): 0 ahead, + outward, − across the chest; behind the shoulder it reads round the outside, past
 * π (never as a far reach across the chest), so a target behind calls for the body to turn toward it.
 */
export function outwardBearing(dxOut: number, dz: number): number {
  const b = Math.atan2(dxOut, dz);
  return b < -Math.PI / 2 ? b + Math.PI * 2 : b;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * A pivot step at progress s (0..1): `blend` how far the hand has moved from its old plant to its new one (eased, so
 * it hardly moves while barely lifted), `lift` how high it is off the ground (0..1).
 */
export function pivotStep(s: number): { blend: number; lift: number } {
  if (s <= 0) return { blend: 0, lift: 0 };
  if (s >= 1) return { blend: 1, lift: 0 };
  return { blend: smooth(s), lift: Math.sin(Math.PI * s) };
}

/** Advance step progress s toward 1 (`out`) or 0 over `time` s. */
export function stepToward(s: number, out: boolean, dt: number, time: number): number {
  return Math.min(1, Math.max(0, s + ((out ? 1 : -1) * dt) / time));
}
