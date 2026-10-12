import * as THREE from 'three';

/** Point on a spherical shield (centre, radius) on the line from the centre toward `hit`; the top if `hit` is the centre. */
export function shieldHitPoint(center: THREE.Vector3, radius: number, hit: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.subVectors(hit, center);
  if (out.lengthSq() < 1e-9) out.set(0, 1, 0);
  return out.normalize().multiplyScalar(radius).add(center);
}
