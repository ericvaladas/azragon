import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** BMO Field: an open bowl 140 × 130 m (its block's interior is about 148 m across), 30 m to the canopy tops. */
export const BMO_FIELD = { w: 140, d: 130, h: 30 } as const;
const PITCH_GREEN = 0x4f9a46;
const STAND = 0x8f9499;
const STAND_DARK = 0x6c7176;
const CANOPY = 0xf0f0ec;

/**
 * BMO Field: a green pitch in a ring of grey stands rising outward, with white canopy roofs over the east and west
 * stands. Base centre at the origin, +Y up, vertex-coloured.
 */
export function bmoFieldGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(-46, 0, -34, 46, 1, 34, PITCH_GREEN)];
  // Stands: three tiers on each side, stepping up and out.
  for (let k = 0; k < 3; k++) {
    const o = 46 + k * 6;
    const p = 34 + k * 6;
    const y = 4 + k * 6;
    parts.push(box(-o - 6, 0, -p - 6, o + 6, y, -p, k % 2 ? STAND_DARK : STAND));
    parts.push(box(-o - 6, 0, p, o + 6, y, p + 6, k % 2 ? STAND_DARK : STAND));
    parts.push(box(-o - 6, 0, -p, -o, y, p, k % 2 ? STAND_DARK : STAND));
    parts.push(box(o, 0, -p, o + 6, y, p, k % 2 ? STAND_DARK : STAND));
  }
  // Canopies over the east and west stands, on posts.
  for (const sx of [-1, 1]) {
    parts.push(box(sx > 0 ? 54 : -70, 26, -52, sx > 0 ? 70 : -54, 30, 52, CANOPY));
    for (const z of [-48, 0, 48]) parts.push(box(sx * 69 - 1, 16, z - 1, sx * 69 + 1, 26, z + 1, STAND_DARK));
  }
  return merge(parts);
}
