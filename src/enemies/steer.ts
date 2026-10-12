import * as THREE from 'three';

const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Rotate unit `dir` toward unit `desired` by at most maxAngle. Returns signed yaw turn (+ = toward +X / left). */
export function steerToward(dir: THREE.Vector3, desired: THREE.Vector3, maxAngle: number): number {
  const angle = dir.angleTo(desired);
  if (angle < 1e-6) return 0;
  _axis.crossVectors(dir, desired);
  if (_axis.lengthSq() < 1e-10) _axis.copy(UP);
  _axis.normalize();
  const step = Math.min(angle, maxAngle);
  dir.applyAxisAngle(_axis, step).normalize();
  return step * Math.sign(_axis.y || 1);
}
