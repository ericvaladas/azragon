import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';

/** [x, y, z] triple. */
export type V3 = readonly [number, number, number];
/** A glyph stroke on a plate face, in model units from the face's centre: x0, y0, x1, y1. */
export type Seg = readonly [number, number, number, number];

const _m = new THREE.Matrix4();
const _l = new THREE.Matrix4();
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

/** Glyph stroke widths (model units): across the face and out of it. */
const GLYPH_W = 13;
const GLYPH_D = 9;

/**
 * Glyph strokes on a plate's +Z face, as unit-box matrices. `plate` is the plate's matrix without scale; `depth`
 * its thickness. `w` overrides the stroke width.
 */
export function glyphMatrices(plate: THREE.Matrix4, depth: number, segs: readonly Seg[], out: THREE.Matrix4[], w = GLYPH_W): void {
  for (const [x0, y0, x1, y1] of segs) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    _l.compose(
      _p.set((x0 + x1) / 2, (y0 + y1) / 2, depth / 2 + GLYPH_D / 2 - 3),
      _q.setFromEuler(_e.set(0, 0, Math.atan2(y1 - y0, x1 - x0), 'XYZ')),
      _s.set(len + w, w, GLYPH_D),
    );
    out.push(_l.clone().premultiply(plate));
  }
}

/** Glyph patterns (model units, centred on the face). */
export const glyph = {
  rect(cx: number, cy: number, w: number, h: number): Seg[] {
    const a = cx - w / 2, b = cx + w / 2, c = cy - h / 2, d = cy + h / 2;
    return [[a, c, b, c], [b, c, b, d], [b, d, a, d], [a, d, a, c]];
  },
  diamond(cx: number, cy: number, r: number): Seg[] {
    return [[cx, cy - r, cx + r, cy], [cx + r, cy, cx, cy + r], [cx, cy + r, cx - r, cy], [cx - r, cy, cx, cy - r]];
  },
  /** A staircase of n steps from (x, y), each dx across and dy up. */
  steps(x: number, y: number, n: number, dx: number, dy: number): Seg[] {
    const s: Seg[] = [];
    for (let k = 0; k < n; k++) {
      s.push([x, y, x + dx, y], [x + dx, y, x + dx, y + dy]);
      x += dx;
      y += dy;
    }
    return s;
  },
  /** A square spiral inward from the outer corner (cx ± r, cy ± r). */
  spiral(cx: number, cy: number, r: number, turns: number, gap: number): Seg[] {
    const s: Seg[] = [];
    let x = cx - r, y = cy - r, len = 2 * r;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
    for (let k = 0; k < turns * 4 && len > gap; k++) {
      const [dx, dy] = dirs[k % 4]!;
      s.push([x, y, x + dx * len, y + dy * len]);
      x += dx * len;
      y += dy * len;
      if (k % 2 === 1 || k === 0) len -= gap;
    }
    return s;
  },
  mirrorX(segs: readonly Seg[]): Seg[] {
    return segs.map(([a, b, c, d]) => [-a, b, -c, d] as Seg);
  },
};

/** One fur tuft: a clump of three spikes hanging from the origin along −Y, length 1. Painted white (instance colours tint it). */
export function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  piece(parts, SHAPES.spike, 0xffffff, [0, -0.5, 0], [0.55, 1, 0.55], [Math.PI, 0, 0]);
  piece(parts, SHAPES.spike, 0xffffff, [0.28, -0.38, 0.1], [0.4, 0.8, 0.4], [Math.PI, 0.6, 0.3]);
  piece(parts, SHAPES.spike, 0xffffff, [-0.24, -0.34, -0.12], [0.4, 0.72, 0.4], [Math.PI, -0.4, -0.3]);
  return merge(parts);
}

/** Deterministic random in [0, 1) (mulberry32), so the fur is the same every run. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A ring of `n` fur spikes around a limb axis (limb space, model units: Y runs along the limb toward its far end),
 * at height y and radius r, hanging toward +Y and flaring out by `flare` rad.
 */
export function furRing(out: THREE.BufferGeometry[], colors: readonly number[], n: number, y: number, r: number, len: number, wide: number, flare: number, phase: number): void {
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    const l = len * (0.8 + 0.4 * (((k * 7) % 5) / 4));
    // Tilt +Y outward by `flare`, then turn to angle a; the spike's centre sits half a length past its root.
    _e.set(flare, a, 0, 'ZYX');
    _p.set(0, 1, 0).applyEuler(_e).multiplyScalar(l / 2);
    piece(out, SHAPES.spike, colors[k % colors.length]!, [Math.sin(a) * r + _p.x, y + _p.y, Math.cos(a) * r + _p.z], [wide, l, wide], [flare, a, 0]);
  }
}
