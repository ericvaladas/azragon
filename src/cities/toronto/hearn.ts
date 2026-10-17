import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** The Hearn: a brick hall 150 × 80 × 50 m, its chimney 215 m tall at the east end. */
export const HEARN = { w: 150, d: 80, h: 215 } as const;
const BRICK = 0x8a4a36;
const BRICK_DARK = 0x6a3828;
const WINDOW = 0x2e3a44;
const CONCRETE = 0xb3ada3;
const BAND = 0x3a3634;

/**
 * The Hearn generating station: a long brick hall with tall vertical window bands and a stepped roof, and its
 * chimney (a slightly tapering concrete cylinder with a dark band near the top) at the hall's east (+x) end. Base
 * centre at the origin, +Y up, vertex-coloured.
 */
export function hearnGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-75, 0, -40, 45, 50, 40, BRICK),
    box(-70, 50, -32, 40, 58, 32, BRICK_DARK),
  ];
  // Tall window bands down both long faces.
  for (let x = -65; x <= 35; x += 20) {
    parts.push(box(x, 8, -40.4, x + 8, 44, -40, WINDOW));
    parts.push(box(x, 8, 40, x + 8, 44, 40.4, WINDOW));
  }
  // The chimney on a low plinth at the east end.
  parts.push(box(45, 0, -20, 75, 12, 20, BRICK_DARK));
  parts.push(ring(6.5, 5.5, 12, 195, CONCRETE, 16).translate(60, 0, 0));
  parts.push(ring(5.5, 5.5, 195, 205, BAND, 16).translate(60, 0, 0));
  parts.push(ring(5.5, 5.4, 205, 215, CONCRETE, 16).translate(60, 0, 0));
  return merge(parts);
}
