import { CONFIG } from '../../config';
import type { CityStyle } from '../types';
import { TOKYO_DISTRICTS } from './districts';
import { districtAt, TMG_SITE } from './layout';
import { SCRAMBLE, SHIBUYA_LOTS } from './shibuya';
import { TMG, tmgGeometry } from './tmg';

export const TOKYO: CityStyle = {
  id: 'tokyo',
  name: 'Tokyo',
  colors: {
    paved: 0xa8a59d,
    pavedSpeck: 0x8f8c85,
    park: 0x7fa65c,
    road: CONFIG.palette.road,
    roadLine: CONFIG.palette.roadLine,
    crosswalk: 0xf2f0ea,
    roof: 0x6b6a70,
    tree: CONFIG.palette.groundDark,
  },
  // Magenta, cyan, warm white, yellow, violet: no reds (they belong to threats).
  signColors: [0xff3fb4, 0x35e8ff, 0xfff4d6, 0xffd23a, 0x7a5cff],
  districtAt,
  districts: TOKYO_DISTRICTS,
  parkTrees: [12, 18],
  landmarks: [{ id: 'tmg', x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h, build: tmgGeometry }],
  specialLots: SHIBUYA_LOTS,
  overlays: [SCRAMBLE],
};
