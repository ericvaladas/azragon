import { FACADE, type BuildingSpec } from '../types';

const STONE = [0xb9ae9c, 0xcbbd9e, 0xa99f90, 0xcfc3a6] as const;

/** A kept stone hall: centre (x, z), footprint w × d, height h, a stone tint. */
const hall = (x: number, z: number, w: number, d: number, h: number, k: number): BuildingSpec => ({ x, z, w, d, h, facade: FACADE.office, color: STONE[k % STONE.length]!, signs: [], keep: true });

/**
 * The U of T college halls in warm grey and buff stone, standing on the campus lawns (park blocks, so their trees grow
 * round them): a University College quad (north range, two side ranges, its tower), Hart House and Soldiers' Tower,
 * Knox College and Trinity. The lawns at (−1500, −300) and (−1500, −100) stay open, the front campus.
 */
export const UOFT_HALLS: BuildingSpec[] = [
  // University College, block (−1800..−1600, −400..−200): a U open to the south.
  hall(-1700, -360, 130, 24, 24, 0),
  hall(-1753, -300, 24, 96, 22, 1),
  hall(-1647, -300, 24, 96, 22, 1),
  hall(-1700, -336, 16, 16, 35, 2),
  // Hart House and Soldiers' Tower, block (−1800..−1600, −200..0).
  hall(-1716, -130, 100, 30, 22, 3),
  hall(-1648, -130, 14, 14, 34, 2),
  // Knox College, block (−1800..−1600, −600..−400): a range and a wing.
  hall(-1700, -540, 110, 28, 26, 0),
  hall(-1740, -480, 26, 64, 21, 3),
  // Trinity College, block (−1600..−1400, −600..−400).
  hall(-1500, -545, 120, 26, 24, 1),
];
