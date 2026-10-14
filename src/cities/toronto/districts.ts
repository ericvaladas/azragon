import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Toronto's districts: brick midtown, warm stone offices, dark glass towers, pale condos on the lake. */
export const TORONTO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // The Financial District and the Yonge corridor's nodes: dark blue-black and green-black glass (the Financial
  // District's hand-placed lots add gold and white). Mostly 170–260 m, a few to 300.
  highrise: {
    lots: 2, fill: 0.5, minPerBlock: 1, height: [150, 300], heightCurve: 1.3, footprint: [0.75, 0.92],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x2b3a4a, 0x22302c, 0x313844, 0x1f2a35, 0x3a4a52],
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
    lots: 2, fill: 0.85, minPerBlock: 2, height: [40, 100], heightCurve: 1.3, footprint: [0.7, 0.9],
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
  // The waterfront: pale glass and teal condo towers on quay paving; no yard, so no containers or cranes.
  port: {
    lots: 2, fill: 0.7, minPerBlock: 1, height: [80, 160], heightCurve: 1.2, footprint: [0.6, 0.85],
    facades: [FACADE.glass, FACADE.balcony, FACADE.glass], colors: [0xcfe3e6, 0x9fd0cf, 0x6fb3b0, 0xe2ecec, 0x8cc4c9],
    signs: 0, billboard: 0, trees: 0,
  },
};

/**
 * The tower pockets among midtown's houses: a few condo towers per block, 80–200 m, in pale glass, teal and light
 * stone (never the high-rise district's darker glass), with street trees.
 */
export const POCKET_RULES: DistrictRules = {
  lots: 2, fill: 0.75, minPerBlock: 2, height: [80, 200], heightCurve: 1.2, footprint: [0.55, 0.8],
  facades: [FACADE.glass, FACADE.balcony, FACADE.glass], colors: [0xcfe3e6, 0x9fd0cf, 0x7fb8c4, 0xe2ecec, 0x8cc4c9, 0xd8cdb4, 0xb7d3dc],
  signs: 0, billboard: 0, trees: 4,
};
