import { FACADE, type BuildingSpec, type SignDef } from '../types';
import { lotCentre } from './layout';

/** Yonge-Dundas Square's block: (−200..0, 800..1000), just west of Yonge. */
export const YD_BLOCK = { ci: -1, cj: 4 } as const;
const SIZE = 60;
/** Lots (0,0), (1,0) face the crash (−z) and stay lower, so the back row's screens show over them. */
const HEIGHTS = [55, 60, 85, 90] as const;
const COLORS = [0xd9c8a8, 0xb5543c, 0xe0d6c2, 0x8a4a3a] as const;
const BLADES = [0xff3fb4, 0x35e8ff, 0xffc23a, 0x5cf2a0] as const;

/**
 * The one bright billboard block (Ruling R3): four kept shop buildings filling the block's 2 × 2 lots, each with a
 * video screen on its face toward the crash, a rooftop billboard and a blade sign on its outer side.
 */
export const YONGE_DUNDAS_LOTS: BuildingSpec[] = ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([a, b], i): BuildingSpec => {
  const h = HEIGHTS[i]!;
  const signs: SignDef[] = [
    { kind: 'screen', lx: 0, ly: h * (b === 1 ? 0.72 : 0.6), lz: -(SIZE / 2 + 0.8), w: 48, h: 28, d: 1.2, color: 0xffffff },
    { kind: 'billboard', lx: 0, ly: h + 20, lz: 0, w: SIZE * 0.9, h: 36, d: 2, color: 0xffffff, cell: 3 + (i % 3) },
    { kind: 'vertical', lx: (a === 0 ? -1 : 1) * (SIZE / 2 + 7), ly: h * 0.45, lz: 0, w: 14, h: Math.min(50, h * 0.6), d: 2, color: BLADES[i]!, cell: i % 3 },
  ];
  return { ...lotCentre(YD_BLOCK.ci, YD_BLOCK.cj, 2, a, b), w: SIZE, d: SIZE, h, facade: FACADE.shop, color: COLORS[i]!, signs, keep: true };
});
