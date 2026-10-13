import type * as THREE from 'three';

export type DistrictId = 'highrise' | 'neon' | 'office' | 'residential' | 'park';
export const DISTRICTS: readonly DistrictId[] = ['highrise', 'neon', 'office', 'residential', 'park'];

/** Facade atlas cells (see pixelTextures.facadeAtlas): left to right. */
export const FACADE = { glass: 0, office: 1, balcony: 2, shop: 3 } as const;
export const FACADE_COUNT = 4;

/** How one district fills a block (164 m inside the roads). */
export type DistrictRules = {
  /** Lots per block side: lots × lots lots per block (0 for parks). */
  lots: number;
  /** Chance each lot is built on. */
  fill: number;
  /** At least this many buildings per block (the first unbuilt lots fill in, in lot order). */
  minPerBlock: number;
  /** Height range (m): min + (max − min) × rng^heightCurve, so a curve above 1 favours low buildings. */
  height: readonly [number, number];
  heightCurve: number;
  /** Footprint side as a fraction of the lot side. */
  footprint: readonly [number, number];
  /** Facade atlas cells (FACADE values) to pick from. */
  facades: readonly number[];
  /** Facade tint colours to pick from. */
  colors: readonly number[];
  /** Expected vertical neon signs per building (the fraction is a chance of one more). */
  signs: number;
  /** Chance of a rooftop billboard per building. */
  billboard: number;
  /** Street trees per block. */
  trees: number;
};

export type SignKind = 'vertical' | 'billboard' | 'screen';
/** A sign in its building's frame: centre offset from the building's base centre (m), box size (m), colour. */
export type SignDef = { kind: SignKind; lx: number; ly: number; lz: number; w: number; h: number; d: number; color: number };

/** One building: base centre (x, z), footprint w (x) × d (z), height h, facade atlas cell, tint, signs. */
export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; facade: number; color: number; signs: SignDef[] };

/** A destructible structure with its own mesh. `build` returns vertex-coloured geometry with its base centre at the origin, +Y up. */
export type LandmarkSpec = { id: string; x: number; z: number; w: number; d: number; h: number; build(): THREE.BufferGeometry };

/** A ground decal drawn over the road texture, `size` m square, centred on (x, z). */
export type GroundOverlay = { id: string; x: number; z: number; size: number };

export type CityStyle = {
  id: string;
  name: string;
  colors: {
    paved: number;
    pavedSpeck: number;
    park: number;
    road: number;
    roadLine: number;
    crosswalk: number;
    roof: number;
    tree: number;
  };
  /** Neon sign colours (never near the threat reds). */
  signColors: readonly number[];
  districtAt(x: number, z: number): DistrictId;
  districts: Readonly<Record<DistrictId, DistrictRules>>;
  /** Trees per park block (min, max). */
  parkTrees: readonly [number, number];
  landmarks: readonly LandmarkSpec[];
  /** Hand-placed buildings; they replace the random lots they overlap. */
  specialLots: readonly BuildingSpec[];
  overlays: readonly GroundOverlay[];
};
