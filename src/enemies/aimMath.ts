import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const EPS = 1e-12;

/**
 * Turns the direction `dir` toward the direction `target` by at most `maxAngle` radians and writes
 * the unit result to `out` (which may be `dir`). A zero `target` keeps `dir`; a zero `dir` takes
 * `target`; both zero gives +Z. A target exactly behind turns about world up (a yaw turn), or
 * about +X when `dir` is vertical.
 */
export function rotateToward(dir: THREE.Vector3, target: THREE.Vector3, maxAngle: number, out: THREE.Vector3): THREE.Vector3 {
  const la = dir.length();
  const lb = target.length();
  if (lb < EPS) return la < EPS ? out.set(0, 0, 1) : out.copy(dir).divideScalar(la);
  if (la < EPS) return out.copy(target).divideScalar(lb);
  _a.copy(dir).divideScalar(la);
  _b.copy(target).divideScalar(lb);
  const angle = Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1));
  if (angle <= maxAngle) return out.copy(_b);
  _axis.crossVectors(_a, _b);
  if (_axis.lengthSq() < 1e-16) {
    // Exactly behind: any perpendicular axis works; prefer a horizontal (yaw) turn.
    if (Math.abs(_a.y) < 0.999) _axis.copy(UP);
    else _axis.crossVectors(_a, RIGHT);
  }
  _axis.normalize();
  return out.copy(_a).applyAxisAngle(_axis, maxAngle).normalize();
}

/** `a` wrapped into [-π, π). */
export function wrapAngle(a: number): number {
  const tau = Math.PI * 2;
  return a - tau * Math.floor((a + Math.PI) / tau);
}

/** Steps the angle `from` toward `to` the short way round by at most `maxStep`; the result is wrapped into [-π, π). */
export function stepAngle(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  return wrapAngle(from + THREE.MathUtils.clamp(d, -maxStep, maxStep));
}

/** Yaw about +Y measured from +Z, and pitch up from the horizontal, of the direction `d`. */
export function yawPitch(d: THREE.Vector3): { yaw: number; pitch: number } {
  const len = d.length();
  if (len < EPS) return { yaw: 0, pitch: 0 };
  return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y / len, -1, 1)) };
}
