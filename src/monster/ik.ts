import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/**
 * Knee for a hip→knee→foot chain with bone lengths l1, l2. The knee bends toward `pole`.
 * Unreachable feet clamp to a straight (or fully folded) chain.
 */
export function solveTwoBone(
  hip: THREE.Vector3,
  foot: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  _dir.subVectors(foot, hip);
  const raw = _dir.length();
  if (raw < 1e-6) return out.copy(hip).addScaledVector(_up, l1);
  _dir.divideScalar(raw);
  const d = Math.min(Math.max(raw, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _bend.subVectors(pole, hip);
  _bend.addScaledVector(_dir, -_bend.dot(_dir));
  if (_bend.lengthSq() < 1e-8) _bend.copy(_up).addScaledVector(_dir, -_up.dot(_dir));
  _bend.normalize();
  return out.copy(hip).addScaledVector(_dir, a).addScaledVector(_bend, h);
}

/** Stretch a height-1, centred mesh between a and b. */
export function placeSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _dir.subVectors(b, a);
  const len = _dir.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) obj.quaternion.copy(_q.setFromUnitVectors(_up, _dir.divideScalar(len)));
  obj.scale.y = len;
}
