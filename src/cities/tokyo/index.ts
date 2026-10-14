import type { CityStyle } from '../types';
import { TOKYO_DISTRICTS, TOKYO_ISLAND_RULES } from './districts';
import { districtAt, SHIBUYA_CROSSING, TOKYO_BAY, TOKYO_ISLAND, SKYTREE_SITE, TMG_SITE, TOKYO_TOWER_SITE } from './layout';
import { SKYTREE, skytreeGeometry, TOKYO_TOWER, tokyoTowerGeometry } from './towers';
import { SCRAMBLE, SHIBUYA_LOTS } from './shibuya';
import { TMG, tmgGeometry } from './tmg';
import { RAINBOW_BRIDGE_LANDMARK } from './rainbowBridge';

export const TOKYO: CityStyle = {
  id: 'tokyo',
  name: 'Tokyo',
  colors: {
    paved: 0x939899,
    pavedSpeck: 0x83888c,
    park: 0x6fae4f,
    road: 0x4b4f56,
    roadLine: 0xeeeeea,
    crosswalk: 0xf2f0ea,
    roof: 0xd4d6d8,
    tree: 0x4c8f39,
    quay: 0xb9b2a4,
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
    RAINBOW_BRIDGE_LANDMARK,
  ],
  specialLots: SHIBUYA_LOTS,
  overlays: [SCRAMBLE],
  river: { z0: 1300, amp: 180, wavelength: 900, halfWidth: 130 },
  bay: TOKYO_BAY,
  island: TOKYO_ISLAND,
  islandRules: TOKYO_ISLAND_RULES,
  // The port matches office and residential (what the coast was before it), so the network there keeps its streets.
  roadRemoval: { highrise: 0.15, neon: 0.15, office: 0.3, residential: 0.3, park: 0.5, port: 0.3 },
  keepNodes: [SHIBUYA_CROSSING],
};
