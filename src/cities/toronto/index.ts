import type { CityStyle } from '../types';
import { POCKET_RULES, TORONTO_DISTRICTS } from './districts';
import { BMO_FIELD_SITE, CHERRY_BEACH, GOODERHAM_SITE, ROM_SITE, VARSITY_STADIUM_SITE, ROY_THOMSON_HALL_SITE, ST_LAWRENCE_MARKET_SITE, HEARN_SITE, PORT_LANDS, PRINCES_GATES_SITE, SHIP_CHANNEL, CASA_LOMA_SITE, CITY_HALL_SITE, CN_TOWER_SITE, QUEENS_PARK_SITE, SCOTIABANK_ARENA_SITE, DON, ROGERS_CENTRE_SITE, TORONTO_LAKE, areaAt, blockColors, districtAt, pocketAt } from './layout';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
import { QUEENS_PARK, queensParkGeometry } from './queensPark';
import { CASA_LOMA, casaLomaGeometry } from './casaLoma';
import { SCOTIABANK_ARENA, scotiabankArenaGeometry } from './scotiabankArena';
import { FINANCIAL_LOTS } from './financial';
import { YONGE_DUNDAS_LOTS } from './yongeDundas';
import { UOFT_HALLS } from './uoft';
import { DISTILLERY_LOTS } from './distillery';
import { NATHAN_PHILLIPS } from './square';
import { TORONTO_LANDFORMS } from './waterfront';
import { HEARN, hearnGeometry } from './hearn';
import { BMO_FIELD, bmoFieldGeometry } from './bmoField';
import { PRINCES_GATES, princesGatesGeometry } from './princesGates';
import { ST_LAWRENCE_MARKET, stLawrenceMarketGeometry } from './stLawrenceMarket';
import { GOODERHAM, gooderhamGeometry } from './gooderham';
import { ROY_THOMSON_HALL, royThomsonHallGeometry } from './royThomsonHall';
import { ROM, romGeometry } from './rom';
import { VARSITY_STADIUM, varsityStadiumGeometry } from './varsityStadium';

export const TORONTO: CityStyle = {
  id: 'toronto',
  name: 'Toronto',
  colors: {
    paved: 0x9a948c,
    pavedSpeck: 0x8a847c,
    park: 0x5f9a43,
    // Residential lawns: a touch lighter than the parks, so parkettes and ravines still read as parks.
    lawn: 0x6aa64c,
    road: 0x4f4b48,
    roadLine: 0xeeeae0,
    crosswalk: 0xf0ece2,
    roof: 0xa89c94,
    tree: 0x3f7a2f,
    quay: 0xb3aa9a,
    beach: 0xe3d3a1,
    water: 0x3d8fa8,
  },
  // Warm white, amber, cyan, magenta, mint: no reds (they belong to threats).
  signColors: [0xfff4d6, 0xffc23a, 0x35e8ff, 0xff3fb4, 0x5cf2a0],
  districtAt,
  blockColors,
  // The tower pockets build condo towers by their own rules.
  // A named area's own rules, else a tower pocket's (areas never hold pockets).
  blockRules: (x, z) => areaAt(x, z)?.rules ?? (pocketAt(x, z) ? POCKET_RULES : undefined),
  districts: TORONTO_DISTRICTS,
  parkTrees: [20, 28],
  landmarks: [
    { id: 'cn-tower', x: CN_TOWER_SITE.x, z: CN_TOWER_SITE.z, w: CN_TOWER.w, d: CN_TOWER.d, h: CN_TOWER.h, build: cnTowerGeometry },
    { id: 'rogers-centre', x: ROGERS_CENTRE_SITE.x, z: ROGERS_CENTRE_SITE.z, w: ROGERS_CENTRE.w, d: ROGERS_CENTRE.d, h: ROGERS_CENTRE.h, build: rogersCentreGeometry },
    { id: 'city-hall', x: CITY_HALL_SITE.x, z: CITY_HALL_SITE.z, w: CITY_HALL.w, d: CITY_HALL.d, h: CITY_HALL.h, build: cityHallGeometry },
    { id: 'queens-park', x: QUEENS_PARK_SITE.x, z: QUEENS_PARK_SITE.z, w: QUEENS_PARK.w, d: QUEENS_PARK.d, h: QUEENS_PARK.h, build: queensParkGeometry },
    { id: 'casa-loma', x: CASA_LOMA_SITE.x, z: CASA_LOMA_SITE.z, w: CASA_LOMA.w, d: CASA_LOMA.d, h: CASA_LOMA.h, build: casaLomaGeometry },
    { id: 'scotiabank-arena', x: SCOTIABANK_ARENA_SITE.x, z: SCOTIABANK_ARENA_SITE.z, w: SCOTIABANK_ARENA.w, d: SCOTIABANK_ARENA.d, h: SCOTIABANK_ARENA.h, build: scotiabankArenaGeometry },
    { id: 'hearn', x: HEARN_SITE.x, z: HEARN_SITE.z, w: HEARN.w, d: HEARN.d, h: HEARN.h, build: hearnGeometry },
    { id: 'bmo-field', x: BMO_FIELD_SITE.x, z: BMO_FIELD_SITE.z, w: BMO_FIELD.w, d: BMO_FIELD.d, h: BMO_FIELD.h, build: bmoFieldGeometry },
    { id: 'princes-gates', x: PRINCES_GATES_SITE.x, z: PRINCES_GATES_SITE.z, w: PRINCES_GATES.w, d: PRINCES_GATES.d, h: PRINCES_GATES.h, build: princesGatesGeometry },
    { id: 'st-lawrence-market', x: ST_LAWRENCE_MARKET_SITE.x, z: ST_LAWRENCE_MARKET_SITE.z, w: ST_LAWRENCE_MARKET.w, d: ST_LAWRENCE_MARKET.d, h: ST_LAWRENCE_MARKET.h, build: stLawrenceMarketGeometry },
    { id: 'gooderham', x: GOODERHAM_SITE.x, z: GOODERHAM_SITE.z, w: GOODERHAM.w, d: GOODERHAM.d, h: GOODERHAM.h, build: gooderhamGeometry },
    { id: 'roy-thomson-hall', x: ROY_THOMSON_HALL_SITE.x, z: ROY_THOMSON_HALL_SITE.z, w: ROY_THOMSON_HALL.w, d: ROY_THOMSON_HALL.d, h: ROY_THOMSON_HALL.h, build: royThomsonHallGeometry },
    { id: 'rom', x: ROM_SITE.x, z: ROM_SITE.z, w: ROM.w, d: ROM.d, h: ROM.h, build: romGeometry },
    { id: 'varsity-stadium', x: VARSITY_STADIUM_SITE.x, z: VARSITY_STADIUM_SITE.z, w: VARSITY_STADIUM.w, d: VARSITY_STADIUM.d, h: VARSITY_STADIUM.h, build: varsityStadiumGeometry },
  ],
  specialLots: [...YONGE_DUNDAS_LOTS, ...FINANCIAL_LOTS, ...UOFT_HALLS, ...DISTILLERY_LOTS],
  overlays: [NATHAN_PHILLIPS],
  river: DON,
  bay: TORONTO_LAKE,
  landAreas: PORT_LANDS,
  waterAreas: [SHIP_CHANNEL],
  beaches: [CHERRY_BEACH],
  landforms: TORONTO_LANDFORMS,
  // A very regular grid: fewer removed streets than Tokyo (neon and port per Ruling R8).
  roadRemoval: { highrise: 0.1, neon: 0.1, office: 0.15, residential: 0.15, park: 0.4, port: 0.15, industrial: 0.15 },
  keepNodes: [],
  // A warm evening: the sun low in the west-north-west (−X, a little −Z, where Toronto's summer sun sets), so
  // shadows fall long to the east and the faces turned toward the start camera catch its light. The fog is the
  // horizon's gold, so the far edge melts into the sky; it starts beyond Tokyo's near so the lake and the islands
  // read behind the skyline. The ambient is a cool violet so shaded faces stay cool against the warm sunlit ones.
  atmosphere: {
    skyZenith: 0x4b4a8c,
    skyHorizon: 0xf2c08c,
    fog: 0xf2c08c,
    fogNear: 3000,
    hemiSky: 0x9c9ad6,
    hemiGround: 0x4e4466,
    hemiIntensity: 1.1,
    sun: 0xffb468,
    sunIntensity: 2.4,
    sunDir: { x: -0.85, y: 0.42, z: -0.35 },
    windowGlow: { color: 0xffc46b, strength: 0.45 },
  },
  glyphs: 'latin',
  globe: { lat: 43.7, lon: -79.4 },
  cranes: false,
  // 80 buildings per chunk, so the Yonge corridor's offices and towers beside dense midtown are thinned less.
  buildingCapScale: 1.25,
};
