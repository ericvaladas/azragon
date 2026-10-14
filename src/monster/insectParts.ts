import * as THREE from 'three';
import { faceted, painted } from '../render/toon';
import { SHAPES, merge, type V3 } from '../monsters/wendigo/wendigoParts';

export { SHAPES, merge };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** A box that tapers along Z: `back` (w, h) at z = −len/2 to `front` (w, h) at z = +len/2. Faceted. */
export function taper(back: readonly [number, number], front: readonly [number, number], len: number): THREE.BufferGeometry {
  const g = faceted(new THREE.BoxGeometry(1, 1, 1));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) + 0.5;
    pos.setXYZ(i, pos.getX(i) * (back[0] + (front[0] - back[0]) * t), pos.getY(i) * (back[1] + (front[1] - back[1]) * t), pos.getZ(i) * len);
  }
  g.computeVertexNormals();
  return g;
}

function push(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4): void {
  const g = geo.clone();
  g.applyMatrix4(m);
  out.push(painted(g, color));
}

/** Appends `geo` at `pos`, turned by `rot` (rad, X then Y then Z), sized `size`. */
export function at(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, pos: V3, size: V3, rot: V3 = [0, 0, 0]): void {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'ZYX'));
  push(out, geo, color, _m.compose(_p.set(...pos), _q, _s.set(...size)));
}

/** Appends `geo` stretched from `a` to `b` (its Y along a→b), `w` wide and `d` deep. */
export function between(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, a: V3, b: V3, w: number, d: number): void {
  _a.set(...a);
  _b.set(...b);
  _q.setFromUnitVectors(UP, _n.subVectors(_b, _a).normalize());
  push(out, geo, color, _m.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(w, _a.distanceTo(_b), d)));
}

/**
 * An armour plate lying on an ellipsoid (centre `c`, radii `r`, tilted `tiltX` about X): `u` runs along the body
 * (0 = top, + toward +Z), `v` across it (+ toward +X). The plate is `size` (across, thick, along), sunk `sink`
 * into the surface and tipped `shingle` rad so its rear edge stands proud over the next plate.
 */
export function plateOn(out: THREE.BufferGeometry[], color: number, c: V3, r: V3, tiltX: number, u: number, v: number, size: V3, sink: number, shingle: number): void {
  const tilt = new THREE.Quaternion().setFromAxisAngle(X_AXIS, tiltX);
  const dx = Math.sin(v);
  const dy = Math.cos(v) * Math.cos(u);
  const dz = Math.cos(v) * Math.sin(u);
  _p.set(dx * r[0], dy * r[1], dz * r[2]).applyQuaternion(tilt).add(_a.set(...c));
  _n.set(dx / r[0], dy / r[1], dz / r[2]).normalize().applyQuaternion(tilt);
  _p.addScaledVector(_n, -sink);
  _q.setFromUnitVectors(UP, _n).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, -shingle));
  push(out, SHAPES.box, color, _m.compose(_p, _q, _s.set(...size)));
}
