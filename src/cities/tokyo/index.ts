import type { CityStyle } from '../types';
import { TOKYO_DISTRICTS } from './districts';
import { districtAt, SHIBUYA_CROSSING, SKYTREE_SITE, TMG_SITE, TOKYO_TOWER_SITE } from './layout';
import { SKYTREE, skytreeGeometry, TOKYO_TOWER, tokyoTowerGeometry } from './towers';
import { SCRAMBLE, SHIBUYA_LOTS } from './shibuya';
import { TMG, tmgGeometry } from './tmg';

export const TOKYO: CityStyle = {
  id: 'tokyo',
  name: 'Tokyo',
  colors: {
    paved: 0xc2c6c9,
    pavedSpeck: 0xaeb3b8,
    park: 0x6fae4f,
    road: 0x5d6168,
    roadLine: 0xeeeeea,
    crosswalk: 0xf2f0ea,
    roof: 0xd4d6d8,
    tree: 0x4c8f39,
  },
  // Magenta, cyan, warm white, yellow, violet: no reds (they belong to threats).
  signColors: [0xff3fb4, 0x35e8ff, 0xfff4d6, 0xffd23a, 0x7a5cff],
  districtAt,
  districts: TOKYO_DISTRICTS,
  parkTrees: [18, 26],
  landmarks: [
    { id: 'tmg', x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h, build: tmgGeometry },
    { id: 'tokyo-tower', x: TOKYO_TOWER_SITE.x, z: TOKYO_TOWER_SITE.z, w: TOKYO_TOWER.w, d: TOKYO_TOWER.d, h: TOKYO_TOWER.h, build: tokyoTowerGeometry },
    { id: 'skytree', x: SKYTREE_SITE.x, z: SKYTREE_SITE.z, w: SKYTREE.w, d: SKYTREE.d, h: SKYTREE.h, build: skytreeGeometry },
  ],
  specialLots: SHIBUYA_LOTS,
  overlays: [SCRAMBLE],
  river: { z0: 1300, amp: 180, wavelength: 900, halfWidth: 130 },
  roadRemoval: { highrise: 0.15, neon: 0.15, office: 0.3, residential: 0.3, park: 0.5 },
  keepNodes: [SHIBUYA_CROSSING],
};
