import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Toronto's districts: brick midtown, warm stone offices, blue-grey glass towers, pale condos on the lake. */
export const TORONTO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // The Financial District, the Yonge corridor's nodes and Yorkville: deep blue-grey, slate and teal glass, darker
  // than the stone offices but never black under the sunset (the Financial District's hand-placed lots add gold and
  // white). Generic towers, so kept below the real ones (First Canadian Place, Royal Bank Plaza): 110–220 m.
  highrise: {
    lots: 2, fill: 0.5, minPerBlock: 1, height: [110, 220], heightCurve: 1.3, footprint: [0.75, 0.92],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x88a2ba, 0x78a4a0, 0x90a2b2, 0x7e96ae, 0x8aa8b8],
    signs: 0, billboard: 0.02, trees: 2,
  },
  // Chinatown: low, dense shop houses in jade, gold, vermilion brick, teal, pink and cream, hung with blade signs.
  // (Yonge-Dundas is neon too, but its block is filled by its hand-placed lots, so these rules never build there.)
  neon: {
    lots: 4, fill: 0.85, minPerBlock: 10, height: [15, 30], heightCurve: 1, footprint: [0.78, 0.92],
    facades: [FACADE.shop, FACADE.shop, FACADE.office], colors: [0x3f9a7a, 0xe0b040, 0xc0583e, 0x4aa3b0, 0xd9708f, 0xe8dcc0],
    signs: 2.5, billboard: 0.02, trees: 0,
  },
  // Warm grey stone and buff brick.
  office: {
    lots: 2, fill: 0.85, minPerBlock: 2, height: [35, 80], heightCurve: 1.3, footprint: [0.7, 0.9],
    facades: [FACADE.office, FACADE.office, FACADE.glass], colors: [0xb8ada0, 0xc9b48a, 0xa89f94, 0xd2c09a, 0x9c9389],
    signs: 0.1, billboard: 0.01, trees: 4,
  },
  // Midtown: small red, brown and dark-red brick houses, some cream stone, on leafy streets.
  residential: {
    lots: 4, fill: 0.55, minPerBlock: 4, height: [10, 22], heightCurve: 1.4, footprint: [0.55, 0.75],
    facades: [FACADE.balcony], colors: [0xb84d35, 0xa04632, 0x8e3a2c, 0xc6654a, 0x7f342a, 0xe2d3b2],
    signs: 0, billboard: 0, trees: 6,
  },
  park: {
    lots: 0, fill: 0, minPerBlock: 0, height: [0, 0], heightCurve: 1, footprint: [0, 0],
    facades: [FACADE.office], colors: [0xffffff], signs: 0, billboard: 0, trees: 0,
  },
  // The Port Lands: low brick sheds and wide warehouses in brick, rust, concrete and pale corrugated green.
  industrial: {
    lots: 2, fill: 0.9, minPerBlock: 2, height: [10, 30], heightCurve: 1.6, footprint: [0.7, 0.95],
    facades: [FACADE.office, FACADE.office, FACADE.shop], colors: [0xa8553e, 0x8a5a44, 0x9a9690, 0xb5b0a6, 0x8fae98],
    signs: 0, billboard: 0, trees: 1,
  },
  // The waterfront: pale glass and teal condo towers on quay paving; no yard, so no containers or cranes.
  port: {
    lots: 2, fill: 0.7, minPerBlock: 1, height: [60, 120], heightCurve: 1.2, footprint: [0.6, 0.85],
    facades: [FACADE.glass, FACADE.balcony, FACADE.glass], colors: [0xcfe3e6, 0x9fd0cf, 0x6fb3b0, 0xe2ecec, 0x8cc4c9],
    signs: 0, billboard: 0, trees: 0,
  },
};

/**
 * The tower pockets among midtown's houses: a few condo towers per block, 45–110 m (mostly toward the low end), in pale glass, teal and light
 * stone (never the high-rise district's darker glass), with street trees.
 */
export const POCKET_RULES: DistrictRules = {
  lots: 2, fill: 0.75, minPerBlock: 2, height: [45, 110], heightCurve: 1.4, footprint: [0.55, 0.8],
  facades: [FACADE.glass, FACADE.balcony, FACADE.glass], colors: [0xcfe3e6, 0x9fd0cf, 0x7fb8c4, 0xe2ecec, 0x8cc4c9, 0xd8cdb4, 0xb7d3dc],
  signs: 0, billboard: 0, trees: 4,
};
