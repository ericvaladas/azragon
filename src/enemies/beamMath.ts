import * as THREE from 'three';

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();

/** Shortest distance from point p to segment ab. */
export function pointSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const t = len2 > 0 ? Math.min(1, Math.max(0, _ap.dot(_ab) / len2)) : 0;
  return _ap.sub(_ab.multiplyScalar(t)).length();
}

/** True when p lies within `radius` of the beam segment ab. */
export function beamHits(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, radius: number): boolean {
  return pointSegmentDistance(p, a, b) <= radius;
}
