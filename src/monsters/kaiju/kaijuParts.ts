import * as THREE from 'three';
import { faceted, painted } from '../../render/toon';
import { SHAPES, merge, type V3 } from '../golem/golemParts';

export { merge };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
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

/** Appends `geo` painted `color`, placed by `m`. */
export function placed(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4): void {
  const g = geo.clone();
  g.applyMatrix4(m);
  out.push(painted(g, color));
}

/** Appends `geo` at `pos`, turned by `rot` (rad, X then Y then Z), sized `size`. */
export function at(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, pos: V3, size: V3, rot: V3 = [0, 0, 0]): void {
  _q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX'));
  placed(out, geo, color, _m.compose(_p.set(...pos), _q, _s.set(...size)));
}

/** Appends `geo` stretched from `a` to `b` (its Y along a→b), `w` wide and `d` deep. */
export function between(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, a: V3, b: V3, w: number, d: number): void {
  _a.set(...a);
  _b.set(...b);
  const len = _a.distanceTo(_b);
  _q.setFromUnitVectors(UP, _n.subVectors(_b, _a).normalize());
  placed(out, geo, color, _m.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(w, len, d)));
}

/**
 * Dragon scales over an ellipsoid (centre `c`, radii `r`, tilted `tiltX` about X): staggered rows of raised,
 * faceted plates from polar angle `th0` to `th1` (0 = top) and azimuth `ph0` to `ph1` (0 = +Z, the front),
 * each `size` across, lying on the surface. Several colours alternate in a checker of scales.
 */
export function scaleRows(
  out: THREE.BufferGeometry[],
  color: number | readonly number[],
  c: V3,
  r: V3,
  tiltX: number,
  rows: number,
  cols: number,
  th: readonly [number, number],
  ph: readonly [number, number],
  size: number,
): void {
  const tilt = new THREE.Quaternion().setFromAxisAngle(X_AXIS, tiltX);
  for (let i = 0; i < rows; i++) {
    const theta = th[0] + ((th[1] - th[0]) * (i + 0.5)) / rows;
    for (let j = 0; j < cols; j++) {
      const phi = ph[0] + ((ph[1] - ph[0]) * (j + (i % 2 ? 1 : 0.5))) / cols;
      if (phi > ph[1]) continue;
      const dx = Math.sin(theta) * Math.sin(phi);
      const dy = Math.cos(theta);
      const dz = Math.sin(theta) * Math.cos(phi);
      _p.set(dx * r[0], dy * r[1], dz * r[2]).applyQuaternion(tilt).add(_a.set(...c));
      _n.set(dx / r[0], dy / r[1], dz / r[2]).normalize().applyQuaternion(tilt);
      _q.setFromUnitVectors(UP, _n);
      // Each scale overlaps the one below it: flattened, a little longer down the body than across.
      const tone = typeof color === 'number' ? color : color[(i + j) % color.length]!;
      placed(out, SHAPES.boulder, tone, _m.compose(_p, _q, _s.set(size, size * 0.45, size * 1.15)));
    }
  }
}

export { SHAPES };
