import type * as THREE from 'three';

export type DistrictId = 'highrise' | 'neon' | 'office' | 'residential' | 'park' | 'port';
export const DISTRICTS: readonly DistrictId[] = ['highrise', 'neon', 'office', 'residential', 'park', 'port'];

/** Facade atlas cells (see pixelTextures.facadeAtlas): left to right. */
export const FACADE = { glass: 0, office: 1, balcony: 2, shop: 3, container: 4 } as const;
export const FACADE_COUNT = 5;

/**
 * A container yard (the port): each built lot holds either one container block or one warehouse. A block covers
 * `block` of its lot (fractions w × d, turned 90° on a coin toss per lot), `tier` m × tiers[0]..tiers[1] tall, in the
 * district's facades and colours, so the repeating facade reads as rows of containers; a warehouse covers
 * `warehouseFootprint` of its lot.
 */
export type YardRules = {
  block: readonly [number, number];
  tier: number;
  tiers: readonly [number, number];
  /** Chance a built lot is a warehouse instead of a container block. */
  warehouse: number;
  warehouseFootprint: number;
  warehouseHeight: readonly [number, number];
  warehouseFacade: number;
  warehouseColors: readonly number[];
};

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
  /** Present for a container yard: lots hold container blocks and warehouses instead of `footprint` buildings. */
  yard?: YardRules;
};

export type SignKind = 'vertical' | 'billboard' | 'screen';
/** A sign in its building's frame: centre offset from the building's base centre (m), box size (m), colour. */
export type SignDef = { kind: SignKind; lx: number; ly: number; lz: number; w: number; h: number; d: number; color: number; cell?: number };

/** One building: base centre (x, z), footprint w (x) × d (z), height h, facade atlas cell, tint, signs. */
export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; facade: number; color: number; signs: SignDef[]; keep?: boolean };

/**
 * A long landmark's line: from its shore end `from` to its far end `to`, `halfWidth` m to each side, its deck's top
 * `deckY` m up (rays pick it up to 10 m above that), and towers `towers` m along it (rays pick each up to the
 * landmark's full height, within TOWER_PICK_HALF m along). Its geometry is built in its own frame, running along
 * local +Z from `from` (local z = 0) to `to` (local z = the span's length).
 */
export type LandmarkSpan = {
  from: { x: number; z: number };
  to: { x: number; z: number };
  halfWidth: number;
  deckY: number;
  towers?: readonly number[];
};

/**
 * A destructible structure with its own mesh. `build` returns vertex-coloured geometry with its base centre at the
 * origin, +Y up. A long landmark (`span` set) is owned by the block holding `from`; its (x, z) and w × d are its
 * footprint on the ground at that end (inside that block), and its mesh is placed at `from`, turned to the span's
 * bearing.
 */
export type LandmarkSpec = { id: string; x: number; z: number; w: number; d: number; h: number; span?: LandmarkSpan; build(): THREE.BufferGeometry };

/** A ground decal drawn over the road texture, `size` m square, centred on (x, z). */
export type GroundOverlay = { id: string; x: number; z: number; size: number };

/**
 * A winding river. Along axis 'x' (the default: it runs east–west) the centreline is z = c0 + amp · sin(x / wavelength);
 * along 'z' (north–south) it is x = c0 + amp · sin(z / wavelength). Cells whose centre lies within halfWidth of the
 * centreline, measured across the axis, are water. With `bankPark`, land blocks within that many blocks of river
 * water (Chebyshev distance) are park.
 */
export type RiverSpec = { axis?: 'x' | 'z'; c0: number; amp: number; wavelength: number; halfWidth: number; bankPark?: number };

/**
 * A coastline: cells whose centre c has dot(c, dir) > offset + amp · sin(dot(c, perp) / wavelength) are sea, with
 * perp = (−dir.z, dir.x).
 */
export type BaySpec = { dir: { x: number; z: number }; offset: number; amp: number; wavelength: number };

/** A rounded-rectangle island: half extents along the bay's dir and perp axes from center. Never reached by road. */
export type IslandSpec = { center: { x: number; z: number }; halfAlong: number; halfAcross: number };
/** Shape of the coast and island only (what the water tests read). */
export type Shoreline = { bay?: BaySpec; island?: IslandSpec };

/**
 * A city's time of day. Colours are hex (sRGB). `sunDir` points from the ground toward the sun (normalised when
 * applied); fog distances default to CONFIG.fog's. Window glow is added to the facade's window texels as emissive
 * colour × strength (0 = none).
 */
export type Atmosphere = {
  skyZenith: number;
  skyHorizon: number;
  fog: number;
  fogNear?: number;
  fogFar?: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  sunDir: { x: number; y: number; z: number };
  windowGlow: { color: number; strength: number };
};

/** Lettering on vertical signs: Tokyo's blocky kanji-like strokes, or Latin capitals. */
export type GlyphSet = 'kanji' | 'latin';
/** Gantry crane paint: the bold bands (main and band alternate) and the grey machinery. */
export type CraneColors = { main: number; band: number; machinery: number };

/** A ground point (game metres, +x east, +z south). */
export type Pt = { x: number; z: number };
/** An outline corner; `beach` overrides the landform's beach width (m) there. */
export type OutlinePt = Pt & { beach?: number };
/**
 * A hand-placed solid on a landform. A box is `w` wide, `d` deep along its yaw (rad about +Y), `h` tall, standing
 * `y` m above the land. A tower is a tapering cylinder of base radius `r`, with a `cap` coloured lantern on top.
 * `water`: built out over the water (a pier or a dock), so it may leave the land.
 */
export type LandformDetail =
  | { kind: 'box'; x: number; z: number; w: number; d: number; h: number; yaw: number; color: number; y?: number; water?: boolean }
  | { kind: 'tower'; x: number; z: number; r: number; h: number; color: number; cap: number };
/**
 * Scenery land drawn over the water: a sand outline (smoothed into curves unless `sharp`) with a grass interior
 * `beach` m in from the edge, `holes` (lagoons) cut through both, trees on the grass (one per `treeEvery` m², none at
 * 0) except inside `clearings` (open ground such as an airport), and hand-placed `details`. It plays no part in gameplay.
 */
export type LandformSpec = {
  name: string;
  outline: readonly OutlinePt[];
  sharp?: boolean;
  holes: readonly (readonly Pt[])[];
  beach: number;
  treeEvery: number;
  clearings?: readonly (readonly Pt[])[];
  details: readonly LandformDetail[];
};
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
    /** Port quay paving, drawn as a pad over each port cell. */
    quay: number;
    /** River and bay water. */
    water: number;
    /** Lawn under every residential block (a full-block pad), when set; unset means no lawns. */
    lawn?: number;
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
  river?: RiverSpec;
  bay?: BaySpec;
  island?: IslandSpec;
  /** Scenery landforms drawn over the water (islands, spits); absent means none. */
  landforms?: readonly LandformSpec[];
  /**
   * Rules for the island's built cells (districtAt reports them as office, its centre cell as park): no streets, so
   * no signs and no street trees.
   */
  islandRules?: DistrictRules;
  /** Fraction of removable street segments removed, by the district at the segment's midpoint. */
  roadRemoval: Readonly<Record<DistrictId, number>>;
  /** Lattice nodes (world x, z) whose four segments always exist (e.g. the Shibuya Crossing). */
  keepNodes: readonly { x: number; z: number }[];
  /** Sky, fog, lights and window glow; City.reset applies it. */
  atmosphere: Atmosphere;
  /** The sign atlas's lettering. */
  glyphs: GlyphSet;
  /** Where the city is on the intro's globe (degrees; north and east positive): the point the pod dives into. */
  globe: { lat: number; lon: number };
  /** Facade tints for the random buildings of the block at (x, z), replacing its district's; unset or undefined keeps the district's. */
  blockColors?(x: number, z: number): readonly number[] | undefined;
  /** Rules for the random buildings of the block at (x, z), replacing its district's; unset or undefined keeps the district's. */
  blockRules?(x: number, z: number): DistrictRules | undefined;
  /** Multiplier on CONFIG.world.buildingsPerChunk for this city's per-chunk building cap; unset is 1. */
  buildingCapScale?: number;
  /** Port cranes: their paint, or false for none; unset is today's red and white. */
  cranes?: { colors: CraneColors } | false;
};
