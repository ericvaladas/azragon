import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** St. Lawrence Market: a brick hall 140 × 60 m, 22 m to its ridge. */
export const ST_LAWRENCE_MARKET = { w: 140, d: 60, h: 22 } as const;
const BRICK = 0x9c4430;
const ROOF = 0x5a3a30;
const STONE = 0xd9cfbc;
const WINDOW = 0x2e3a44;

/**
 * St. Lawrence Market: a long red-brick hall with arched window bands down both long sides, a pale stone end facade
 * (east, +x) rising to the ridge in front of the roof's end, and a long pitched roof built as three stepped ridges. Base centre at the origin, +Y up, vertex-coloured.
 */
export function stLawrenceMarketGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-70, 0, -30, 64, 14, 30, BRICK),
    box(64, 0, -30, 70, 22, 30, STONE),
    box(-70, 14, -26, 64, 18, 26, ROOF),
    box(-70, 18, -16, 64, 20, 16, ROOF),
    box(-70, 20, -6, 64, 22, 6, ROOF),
  ];
  for (let x = -62; x <= 54; x += 14) {
    parts.push(box(x, 4, -30.3, x + 6, 11, -30, WINDOW));
    parts.push(box(x, 4, 30, x + 6, 11, 30.3, WINDOW));
  }
  return merge(parts);
}
