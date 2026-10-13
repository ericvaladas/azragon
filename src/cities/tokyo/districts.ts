import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Tokyo's districts. Heights are first-pass values for playtest tuning. */
export const TOKYO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // Shinjuku towers: one or two per block, glass and steel.
  highrise: {
    lots: 2, fill: 0.4, minPerBlock: 1, height: [150, 260], heightCurve: 1.2, footprint: [0.75, 0.95],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x9fb3c4, 0xb9c6d0, 0x8aa0b4, 0xd2d6d8, 0x7f93a8],
    signs: 0, billboard: 0.1, trees: 0,
  },
  // Shibuya and east Shinjuku: narrow, tall-ish, plastered with signs.
  neon: {
    lots: 3, fill: 0.6, minPerBlock: 3, height: [40, 110], heightCurve: 1.4, footprint: [0.7, 0.9],
    facades: [FACADE.shop, FACADE.office, FACADE.shop], colors: [0xe9e4dc, 0xc8c2b8, 0xd8d0c4, 0xa9a39c, 0xbfc5c9],
    signs: 1.2, billboard: 0.35, trees: 0,
  },
  office: {
    lots: 2, fill: 0.8, minPerBlock: 1, height: [30, 90], heightCurve: 1.6, footprint: [0.6, 0.85],
    facades: [FACADE.office, FACADE.office, FACADE.glass], colors: [0xd9d6cf, 0xc4c9cc, 0xe3ddd2, 0xb7bec4],
    signs: 0.1, billboard: 0.08, trees: 1,
  },
  residential: {
    lots: 3, fill: 0.5, minPerBlock: 2, height: [10, 25], heightCurve: 1.3, footprint: [0.6, 0.85],
    facades: [FACADE.balcony], colors: [0xf0e8da, 0xe6dccb, 0xd9cdb8, 0xeee9e0, 0xcfc6b4],
    signs: 0, billboard: 0, trees: 2,
  },
  park: {
    lots: 0, fill: 0, minPerBlock: 0, height: [0, 0], heightCurve: 1, footprint: [0, 0],
    facades: [FACADE.office], colors: [0xffffff], signs: 0, billboard: 0, trees: 0,
  },
};
