import { describe, it, expect } from 'vitest';
import { TORONTO } from './index';
import { TORONTO_DISTRICTS, POCKET_RULES } from './districts';
import { AREAS } from './layout';
import { generateChunk } from '../../world/chunks';

/** Chunks in the owner's four pocket boxes (A–D, see pockets.test.ts). */
const POCKET_BOXES = [
  { x0: 2300, x1: 3800, z0: 800, z1: 1800 },
  { x0: 2300, x1: 3800, z0: -2200, z1: 0 },
  { x0: -4200, x1: -3000, z0: 900, z1: 1800 },
  { x0: -3600, x1: -2000, z0: -2000, z1: -200 },
] as const;

/** WCAG relative luminance of an sRGB hex colour. */
function luminance(c: number): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255);
}
/** HSL saturation of an sRGB hex colour. */
function saturation(c: number): number {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

describe('Toronto has no black-looking buildings', () => {
  /**
   * Under the sunset light the facade texture's window grid and the cool ambient darken a tint a good deal. A grey or
   * blue tint below relative luminance 0.10 reads as a black silhouette (the old high-rise glass, 0.02–0.06, did);
   * University Avenue's blue-grey at 0.13 reads as glass. A strongly saturated tint (HSL s ≥ 0.4: brick, paint) keeps
   * its hue when darkened, so dark red brick needs only 0.06.
   */
  const MIN_GREY = 0.1;
  const MIN_SATURATED = 0.06;
  const ok = (c: number) => luminance(c) >= (saturation(c) >= 0.4 ? MIN_SATURATED : MIN_GREY);

  it('keeps every district, area, pocket and hand-placed lot colour out of the near-black', () => {
    const colours: [string, number][] = [];
    for (const [d, r] of Object.entries(TORONTO_DISTRICTS)) for (const c of r.colors) colours.push([d, c]);
    for (const a of AREAS) for (const c of a.colors ?? []) colours.push([a.name, c]);
    for (const c of POCKET_RULES.colors) colours.push(['pocket', c]);
    for (const s of TORONTO.specialLots) colours.push([`lot ${s.x},${s.z}`, s.color]);
    for (const [name, c] of colours) expect(ok(c), `${name} #${c.toString(16)} L ${luminance(c).toFixed(3)}`).toBe(true);
  });

  it('keeps the high-rise glass darker than the stone offices on average, so it still reads as glass, not stone', () => {
    const mean = (cs: readonly number[]) => cs.reduce((a, c) => a + luminance(c), 0) / cs.length;
    expect(mean(TORONTO_DISTRICTS.highrise.colors)).toBeLessThan(mean(TORONTO_DISTRICTS.office.colors));
  });

  it('builds no near-black random building in the start area and the four pocket boxes', () => {
    const chunks: [number, number][] = [];
    for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 2; cz++) chunks.push([cx, cz]);
    for (const b of POCKET_BOXES) chunks.push([Math.floor((b.x0 + b.x1) / 2 / 800), Math.floor((b.z0 + b.z1) / 2 / 800)]);
    for (const [cx, cz] of chunks) for (const b of generateChunk(TORONTO, 1337, cx, cz).buildings) expect(ok(b.color), `${b.x},${b.z} #${b.color.toString(16)}`).toBe(true);
  });
});
