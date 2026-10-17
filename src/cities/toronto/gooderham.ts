import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** The Gooderham (Flatiron) Building: a 22 m brick wedge about 40 m across. */
export const GOODERHAM = { w: 40, d: 40, h: 22 } as const;
const BRICK = 0xa8553a;
const COPPER = 0x5f9a83;
const WINDOW = 0x2e3a44;

/**
 * The Gooderham Building: a triangular five-storey brick prism with its point toward the west (−x), a band of
 * windows round each storey, and a green copper roof band. Base centre at the origin, +Y up, vertex-coloured.
 */
export function gooderhamGeometry(): THREE.BufferGeometry {
  // A 3-sided ring is a triangular prism with a corner at +z; turning it −90° about Y puts that corner at −x.
  const tri = (r: number, y0: number, y1: number, color: number) => ring(r, r, y0, y1, color, 3).rotateY(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    parts.push(tri(20, k * 4, k * 4 + 2.6, BRICK));
    parts.push(tri(19.6, k * 4 + 2.6, k * 4 + 4, WINDOW));
  }
  parts.push(tri(20, 20, 22, COPPER));
  return merge(parts);
}
