import * as THREE from 'three';

/** How far (rad) the whole tail may swing round toward a target to either side. */
const MAX_YAW = 1.0;

const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _rest = new THREE.Vector3();
const _want = new THREE.Vector3();

/**
 * Tail chain (model space, root first) aimed at `target` with weight `w` (0 = rest, 1 = on target): the whole
 * tail swings round toward the target's bearing (up to MAX_YAW), then its last segment turns to point straight
 * at the target, so the stinger on its end does. The root never moves and every segment keeps its length.
 */
export function tailAimPoints(base: readonly THREE.Vector3[], target: THREE.Vector3, w: number): THREE.Vector3[] {
  const root = base[0]!;
  const n = base.length;
  const bearing = Math.atan2(target.x - root.x, target.z - root.z);
  const yaw = THREE.MathUtils.clamp(bearing, -MAX_YAW, MAX_YAW) * w;
  _q.setFromAxisAngle(_up, yaw);
  const out = base.map((b) => b.clone().sub(root).applyQuaternion(_q).add(root));

  const pivot = out[n - 2]!;
  const tip = out[n - 1]!;
  const len = tip.distanceTo(pivot);
  _rest.subVectors(tip, pivot).normalize();
  _want.subVectors(target, pivot).normalize();
  _qw.identity().slerp(_q.setFromUnitVectors(_rest, _want), w);
  tip.copy(pivot).addScaledVector(_rest.applyQuaternion(_qw), len);
  return out;
}
