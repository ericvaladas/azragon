import type { GroundOverlay } from '../types';
import { LATIN_FONT } from '../../world/latinFont';
import { CITY_HALL_SITE } from './layout';

/** A solid rectangle on a decal, in px: x along world +x, y along world +z (canvas row 0 is the decal's −z edge). */
export type PaintRect = { x: number; y: number; w: number; h: number; color: number };

/** The decal is SQUARE_PX square over `size` m of ground. */
export const SQUARE_PX = 128;
/**
 * The square in front of City Hall (Ruling R2): 140 m, from the block's avenue-side interior edge (z = 1036) south
 * under City Hall, so the visible plaza is its north part, facing the start camera.
 */
export const NATHAN_PHILLIPS: GroundOverlay = { id: 'nathan-phillips', x: CITY_HALL_SITE.x, z: 1106, size: 140 };
/** Pool (with a `rim` px border) and the TORONTO strip, in decal px. */
export const SQUARE_LAYOUT = { pool: { x: 23, y: 9, w: 82, h: 22 }, rim: 2, strip: { x: 40, y: 35, w: 48, h: 11 } } as const;
const WORD = 'TORONTO';
const PAVING = 0xb9b6ae;
const JOINT = 0xa4a199;
const RIM = 0xe6e3dc;
const POOL = 0x3f86b0;
const STRIP = 0x26222e;
const LETTERS = [0xffffff, 0x35e8ff, 0xff3fb4, 0xffc23a] as const;

/**
 * TORONTO in 5 × 7 capitals on the strip, each letter in its own colour, readable from the start camera (it looks
 * +z, so screen right is world −x and screen up is world +z): letters advance toward −x, glyph columns mirror, and a
 * glyph's top row lies at its +z edge.
 */
export function letterRects(): (PaintRect & { letter: number })[] {
  const { strip } = SQUARE_LAYOUT;
  const width = WORD.length * 6 - 1;
  const first = strip.x + Math.floor((strip.w + width) / 2) - 1;
  const top = strip.y + 8;
  const out: (PaintRect & { letter: number })[] = [];
  [...WORD].forEach((ch, k) => {
    LATIN_FONT[ch]!.forEach((row, r) => {
      for (let c = 0; c < 5; c++) {
        if (row[c] === '1') out.push({ x: first - (k * 6 + c), y: top - r, w: 1, h: 1, color: LETTERS[k % LETTERS.length]!, letter: k });
      }
    });
  });
  return out;
}

/** The whole decal: paving with joints, the rimmed reflecting pool, the dark strip and its letters. */
export function squareRects(): PaintRect[] {
  const n = SQUARE_PX;
  const { pool, rim, strip } = SQUARE_LAYOUT;
  const out: PaintRect[] = [{ x: 0, y: 0, w: n, h: n, color: PAVING }];
  for (let k = 16; k < n; k += 16) out.push({ x: k, y: 0, w: 1, h: n, color: JOINT }, { x: 0, y: k, w: n, h: 1, color: JOINT });
  out.push({ x: pool.x - rim, y: pool.y - rim, w: pool.w + 2 * rim, h: pool.h + 2 * rim, color: RIM }, { ...pool, color: POOL });
  out.push({ ...strip, color: STRIP });
  for (const { letter: _letter, ...r } of letterRects()) out.push(r);
  return out;
}
