import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** The Princes' Gates: a stone arch 60 m wide, 25 m to the statue's head. */
export const PRINCES_GATES = { w: 60, d: 14, h: 25 } as const;
const STONE = 0xe6dfcf;
const STONE_DARK = 0xc9c0ad;
const STATUE = 0xb8b0a0;

/**
 * The Princes' Gates: a central triumphal arch (two piers, an entablature, a statue on top) between two low
 * colonnade wings. Base centre at the origin, +Y up, vertex-coloured.
 */
export function princesGatesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-9, 0, -6, -4, 16, 6, STONE),
    box(4, 0, -6, 9, 16, 6, STONE),
    box(-10, 16, -7, 10, 20, 7, STONE_DARK),
    box(-2, 20, -2, 2, 25, 2, STATUE),
  ];
  // Colonnade wings: columns under a beam, either side.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const x = sx * (13 + k * 3.2);
      parts.push(box(x - 0.6, 0, -1, x + 0.6, 9, 1, STONE));
    }
    parts.push(box(sx > 0 ? 11 : -30, 9, -1.5, sx > 0 ? 30 : -11, 11, 1.5, STONE_DARK));
  }
  return merge(parts);
}
