import { FACADE, type BuildingSpec } from '../types';
import { lotCentre } from './layout';

/** Deep slate, teal and blue-grey glass: the darkest towers downtown, still glass rather than black silhouettes. */
const DARK = [0x7890a6, 0x6e9894, 0x7c8ca2] as const;
export const GOLD = 0xd4a442;
const WHITE = 0xf0eee8;
const DARK_SIZE = 56;
/**
 * Dark glass towers: block (ci, cj), lot (a, b) of its 2 × 2 grid, height. One in the centre block (−2, 7), two
 * on opposite corners of each of its four neighbours (Ruling R4).
 */
const DARK_TOWERS: readonly (readonly [number, number, number, number, number])[] = [
  [-2, 7, 0, 1, 270],
  [-3, 7, 0, 0, 240], [-3, 7, 1, 1, 210],
  [-1, 7, 0, 0, 255], [-1, 7, 1, 1, 225],
  [-2, 6, 0, 0, 205], [-2, 6, 1, 1, 245],
  [-2, 8, 0, 0, 285], [-2, 8, 1, 1, 215],
];

/** First Canadian Place: the tallest, a white slab. */
export const FIRST_CANADIAN_PLACE: BuildingSpec = { ...lotCentre(-2, 7, 2, 0, 0), w: 66, d: 44, h: 300, facade: FACADE.office, color: WHITE, signs: [], keep: true };

/** One Royal Bank Plaza tower on lot (a, b) of the centre block: three gold boxes staggered 8 m on each axis and 12 m lower each, so its edges step. */
function royalBankTower(a: number, b: number, h: number): BuildingSpec[] {
  const c = lotCentre(-2, 7, 2, a, b);
  return [0, 1, 2].map((k) => ({ x: c.x + (k - 1) * 8, z: c.z + (k - 1) * 8, w: 34, d: 34, h: h - 12 * k, facade: FACADE.glass, color: GOLD, signs: [], keep: true }));
}

/** The Royal Bank Plaza: two gold towers. */
export const ROYAL_BANK_PLAZA: BuildingSpec[] = [...royalBankTower(1, 0, 230), ...royalBankTower(1, 1, 150)];

/** The Financial District's hand-placed lots: ordinary buildings that ride out the crash blast (keep) and topple like any other. */
export const FINANCIAL_LOTS: BuildingSpec[] = [
  FIRST_CANADIAN_PLACE,
  ...ROYAL_BANK_PLAZA,
  ...DARK_TOWERS.map(([ci, cj, a, b, h], k): BuildingSpec => ({
    ...lotCentre(ci, cj, 2, a, b),
    w: DARK_SIZE,
    d: DARK_SIZE,
    h,
    facade: k % 3 === 2 ? FACADE.office : FACADE.glass,
    color: DARK[k % DARK.length]!,
    signs: [],
    keep: true,
  })),
];
