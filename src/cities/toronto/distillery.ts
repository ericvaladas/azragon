import { FACADE, type BuildingSpec } from '../types';
import { lotCentre } from './layout';

const BRICK = [0x9c4430, 0x8a3b2b, 0xa8553a, 0x7d3426] as const;

/** A kept brick warehouse over lot row b of block (ci, cj)'s 2 × 2 grid: the whole row (`a` null) or lot a alone. */
function shed(ci: number, cj: number, a: 0 | 1 | null, b: 0 | 1, h: number, k: number): BuildingSpec {
  const c = a === null ? { x: (lotCentre(ci, cj, 2, 0, b).x + lotCentre(ci, cj, 2, 1, b).x) / 2, z: lotCentre(ci, cj, 2, 0, b).z } : lotCentre(ci, cj, 2, a, b);
  return { ...c, w: a === null ? 130 : 62, d: 56, h, facade: FACADE.shop, color: BRICK[k % BRICK.length]!, signs: [], keep: true };
}

/** The chimney: slender dark brick, in the lane between the east block's two rows of warehouses. */
export const DISTILLERY_CHIMNEY: BuildingSpec = { x: 1100, z: 1700, w: 8, d: 8, h: 50, facade: FACADE.glass, color: 0x7a3020, signs: [], keep: true };

/**
 * The Distillery District, blocks (800..1000, 1600..1800) and (1000..1200, 1600..1800): low Victorian red-brick
 * warehouses filling each block's two lot rows, a 24 m lane between the rows, and one tall chimney.
 */
export const DISTILLERY_LOTS: BuildingSpec[] = [
  shed(4, 8, 0, 0, 15, 0),
  shed(4, 8, 1, 0, 11, 1),
  shed(4, 8, null, 1, 17, 2),
  shed(5, 8, null, 0, 12, 3),
  shed(5, 8, 0, 1, 16, 1),
  shed(5, 8, 1, 1, 19, 0),
  DISTILLERY_CHIMNEY,
];
