import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';

/** [x, y, z] triple. */
export type V3 = readonly [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Shared unit shapes, faceted for the toon look. */
export const SHAPES = {
  box: faceted(new THREE.BoxGeometry(1, 1, 1)),
  blob: faceted(new THREE.IcosahedronGeometry(1, 1)),
  boulder: faceted(new THREE.IcosahedronGeometry(1, 0)),
  /** Six-sided sleeve (radius 0.5). */
  hex: faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  /** Tapered six-sided limb core (radius 0.5 at the top, 0.6 at the bottom). */
  limb: faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)),
  /** Seven-sided chimney collar (radius 1 at the top, 1.2 at the bottom). */
  collar: faceted(new THREE.CylinderGeometry(1, 1.2, 1, 7)),
  /** Four-sided spike, tip at +Y (centred). */
  spike: faceted(new THREE.ConeGeometry(0.5, 1, 4)),
};

/**
 * Matrix for a part: position, rotation (radians; applied X first, then Y, then Z, so X tilts a slab, Y turns it
 * and Z rolls it), size, under an optional parent matrix.
 */
export function partMatrix(pos: V3, rot: V3, size: V3, parent?: THREE.Matrix4, out = new THREE.Matrix4()): THREE.Matrix4 {
  out.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'ZYX')), _s.set(size[0], size[1], size[2]));
  if (parent) out.premultiply(parent);
  return out;
}

/** Appends a painted, transformed copy of `geo` to `out` (for one merged, vertex-coloured mesh). */
export function piece(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: number, pos: V3, size: V3, rot: V3 = [0, 0, 0], parent?: THREE.Matrix4): void {
  const g = geo.clone();
  g.applyMatrix4(partMatrix(pos, rot, size, parent, _m));
  out.push(painted(g, color));
}

/** Merges painted parts into one geometry (and frees the parts). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('golemParts: merge failed');
  return g;
}

/** Deterministic random in [0, 1) (mulberry32), so the scatter is the same every run. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
