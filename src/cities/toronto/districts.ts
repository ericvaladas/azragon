import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Toronto's districts: brick midtown, warm stone offices, dark glass towers, pale condos on the lake. */
export const TORONTO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // The Financial District: dark blue-black and green-black glass (the hand-placed lots add gold and white).
  highrise: {
    lots: 2, fill: 0.5, minPerBlock: 1, height: [200, 300], heightCurve: 1.2, footprint: [0.75, 0.92],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x2b3a4a, 0x22302c, 0x313844, 0x1f2a35, 0x3a4a52],
    signs: 0, billboard: 0.02, trees: 2,
  },
  // Yonge-Dundas: low brick and cream shop blocks with blades (its screens and billboards are hand-placed).
  neon: {
    lots: 3, fill: 0.7, minPerBlock: 4, height: [40, 90], heightCurve: 1.1, footprint: [0.75, 0.92],
    facades: [FACADE.shop, FACADE.office, FACADE.shop], colors: [0xb5543c, 0x8a4a3a, 0xd9c8a8, 0x6e3b32, 0xe0d6c2],
    signs: 1.5, billboard: 0.02, trees: 0,
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
    facades: [FACADE.balcony], colors: [0xa4442f, 0x8c3b2a, 0x7a2f24, 0xb5583c, 0x6b2a22, 0xd8c7a3],
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
