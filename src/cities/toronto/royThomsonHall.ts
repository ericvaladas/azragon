import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** Roy Thomson Hall: a round glass dome 90 m across, 30 m tall. */
export const ROY_THOMSON_HALL = { w: 90, d: 90, h: 30 } as const;
const PLINTH = 0xd8d2c4;
const GLASS = 0x6f8ea6;
const GLASS_DARK = 0x3c5468;

/**
 * Roy Thomson Hall: a pale round plinth under a low, many-sided glass dome stepping in to its crown, its middle band
 * darker (the lattice). Base centre at the origin, +Y up, vertex-coloured.
 */
export function royThomsonHallGeometry(): THREE.BufferGeometry {
  return merge([
    ring(45, 44, 0, 6, PLINTH, 24),
    ring(42, 36, 6, 16, GLASS, 24),
    ring(36, 26, 16, 24, GLASS_DARK, 24),
    ring(26, 10, 24, 30, GLASS, 24),
  ]);
}
