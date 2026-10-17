import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Shipping-container colours. */
export const CONTAINER_COLORS = [0xc9402a, 0x2d6fb5, 0xe88a2a, 0x3f9a4f, 0x2aa3a3] as const;

/** Tokyo's districts (look-spike palette: brighter, more varied, greener). */
export const TOKYO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // Shinjuku towers: blue-green glass and white steel.
  highrise: {
    lots: 2, fill: 0.45, minPerBlock: 1, height: [170, 300], heightCurve: 1.1, footprint: [0.8, 0.95],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x7fb8d9, 0x9fd3e0, 0x6aa5c8, 0xe8eef2, 0x8fc7c0],
    signs: 0, billboard: 0.1, trees: 2,
  },
  // Shibuya and east Shinjuku: tall, narrow, plastered with big signs.
  neon: {
    lots: 3, fill: 0.7, minPerBlock: 4, height: [55, 140], heightCurve: 1.2, footprint: [0.75, 0.92],
    facades: [FACADE.shop, FACADE.office, FACADE.shop], colors: [0xf4efe6, 0xffe2c8, 0xd9ecf6, 0xffd9e0, 0xd8f0d0, 0xfff2b8],
    signs: 1.8, billboard: 0.15, trees: 0,
  },
  office: {
    lots: 2, fill: 0.85, minPerBlock: 2, height: [45, 120], heightCurve: 1.3, footprint: [0.7, 0.9],
    facades: [FACADE.office, FACADE.glass, FACADE.office], colors: [0xf2f0ea, 0xcfe0ea, 0xe8ddd0, 0xa9c4d6, 0xdfe8e0],
    signs: 0.3, billboard: 0.05, trees: 4,
  },
  residential: {
    lots: 3, fill: 0.55, minPerBlock: 2, height: [14, 34], heightCurve: 1.2, footprint: [0.8, 0.95],
    facades: [FACADE.balcony], colors: [0xf7f1e6, 0xf0dccb, 0xdde9e2, 0xf2e6ee, 0xe4e0d4],
    signs: 0, billboard: 0, trees: 6,
  },
  park: {
    lots: 0, fill: 0, minPerBlock: 0, height: [0, 0], heightCurve: 1, footprint: [0, 0],
    facades: [FACADE.office], colors: [0xffffff], signs: 0, billboard: 0, trees: 0,
  },
  // The harbour: container blocks (red, blue, orange, green, teal) and pale warehouses; no signs, no trees.
  // Unused in Tokyo (every city defines every district).
  industrial: {
    lots: 2, fill: 0.9, minPerBlock: 2, height: [10, 30], heightCurve: 1.6, footprint: [0.7, 0.95],
    facades: [FACADE.office, FACADE.office, FACADE.shop], colors: [0xa8553e, 0x8a5a44, 0x9a9690, 0xb5b0a6, 0x8fae98],
    signs: 0, billboard: 0, trees: 1,
  },
  port: {
    lots: 2, fill: 0.85, minPerBlock: 1, height: [5.2, 10.4], heightCurve: 1, footprint: [1, 1],
    facades: [FACADE.container], colors: CONTAINER_COLORS, signs: 0, billboard: 0, trees: 0,
    yard: {
      block: [0.85, 0.7], tier: 2.6, tiers: [2, 4], warehouse: 0.3, warehouseFootprint: 0.9, warehouseHeight: [12, 22],
      warehouseFacade: FACADE.office, warehouseColors: [0xe4e6e8, 0xd5d9dc, 0xefe6d2, 0xe8dcc0],
    },
  },
};

/** The island: office blocks 40–110 m with no streets, so no signs and no street trees. */
export const TOKYO_ISLAND_RULES: DistrictRules = { ...TOKYO_DISTRICTS.office, height: [40, 110], signs: 0, billboard: 0, trees: 0 };
