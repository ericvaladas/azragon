import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * A jagged bolt from `from` to `to` in `segments` steps into `out` (reusing its vectors): the ends exact, each inner
 * point pushed off the straight line by up to `jitter`, in a random direction across it.
 */
export function boltPath(from: THREE.Vector3, to: THREE.Vector3, segments: number, jitter: number, rand: () => number, out: THREE.Vector3[]): THREE.Vector3[] {
  _dir.subVectors(to, from).normalize();
  // Two axes across the bolt.
  _a.set(Math.abs(_dir.y) < 0.9 ? 0 : 1, Math.abs(_dir.y) < 0.9 ? 1 : 0, 0).cross(_dir).normalize();
  _b.crossVectors(_dir, _a);
  out.length = Math.min(out.length, segments + 1);
  for (let i = 0; i <= segments; i++) {
    const p = (out[i] ??= new THREE.Vector3()).lerpVectors(from, to, i / segments);
    if (i === 0 || i === segments) continue;
    const ang = rand() * Math.PI * 2;
    const r = rand() * jitter;
    p.addScaledVector(_a, Math.cos(ang) * r).addScaledVector(_b, Math.sin(ang) * r);
  }
  return out;
}
