import { FACADE, type BuildingSpec, type GroundOverlay, type SignDef } from '../types';
import { SHIBUYA_CROSSING } from './layout';

const C = SHIBUYA_CROSSING;
const SIZE = 70;
/**
 * From the crossing's centre to each corner building's centre: half the road, a gap, half the building. The crossing
 * node sits on a 36 m street along x = 200 and a 56 m avenue along z = 1000 (widths match the road network's lineWidth).
 */
const OFF_X = 36 / 2 + 6 + SIZE / 2;
const OFF_Z = 56 / 2 + 6 + SIZE / 2;
const HEIGHTS = [110, 130, 90, 140] as const;
const SCREEN_COLORS = [0xffffff, 0xffffff, 0xffffff, 0xffffff] as const;
const BLADE_COLORS = [0xff3fb4, 0x35e8ff, 0xffd23a, 0x7a5cff] as const;

/**
 * The four corner buildings of the scramble crossing. Each faces the crossing with a big video screen (all but the
 * lowest) and a vertical blade sign. Signs are in the building's frame: base centre, +Y up.
 */
export const SHIBUYA_LOTS: BuildingSpec[] = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz], i) => {
  const h = HEIGHTS[i]!;
  const signs: SignDef[] = [];
  if (h >= 70) {
    // On the face toward the crossing in z (the building sits at +sz × OFF_Z, so that face is at −sz × SIZE/2).
    signs.push({ kind: 'screen', lx: 0, ly: h * 0.62, lz: -sz! * (SIZE / 2 + 0.8), w: 58, h: 36, d: 1.2, color: SCREEN_COLORS[i]! });
  }
  signs.push({ kind: 'vertical', lx: -sx! * (SIZE / 2 + 7), ly: h * 0.45, lz: 0, w: 14, h: Math.min(70, h * 0.6), d: 2, color: BLADE_COLORS[i]!, cell: i % 3 });
  return { x: C.x + sx! * OFF_X, z: C.z + sz! * OFF_Z, w: SIZE, d: SIZE, h, facade: FACADE.shop, color: 0xf2ece4, signs, keep: true };
});

export const SCRAMBLE: GroundOverlay = { id: 'scramble', x: C.x, z: C.z, size: 120 };
