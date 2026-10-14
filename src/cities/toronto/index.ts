import type { CityStyle } from '../types';
import { TORONTO_DISTRICTS } from './districts';
import { CITY_HALL_SITE, CN_TOWER_SITE, DON, ROGERS_CENTRE_SITE, TORONTO_ISLANDS, TORONTO_LAKE, districtAt } from './layout';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';

export const TORONTO: CityStyle = {
  id: 'toronto',
  name: 'Toronto',
  colors: {
    paved: 0x9a948c,
    pavedSpeck: 0x8a847c,
    park: 0x5f9a43,
    road: 0x4f4b48,
    roadLine: 0xeeeae0,
    crosswalk: 0xf0ece2,
    roof: 0x5e5550,
    tree: 0x3f7a2f,
    quay: 0xb3aa9a,
    water: 0x3d8fa8,
  },
  // Warm white, amber, cyan, magenta, mint: no reds (they belong to threats).
  signColors: [0xfff4d6, 0xffc23a, 0x35e8ff, 0xff3fb4, 0x5cf2a0],
  districtAt,
  districts: TORONTO_DISTRICTS,
  parkTrees: [20, 28],
  landmarks: [
    { id: 'cn-tower', x: CN_TOWER_SITE.x, z: CN_TOWER_SITE.z, w: CN_TOWER.w, d: CN_TOWER.d, h: CN_TOWER.h, build: cnTowerGeometry },
    { id: 'rogers-centre', x: ROGERS_CENTRE_SITE.x, z: ROGERS_CENTRE_SITE.z, w: ROGERS_CENTRE.w, d: ROGERS_CENTRE.d, h: ROGERS_CENTRE.h, build: rogersCentreGeometry },
    { id: 'city-hall', x: CITY_HALL_SITE.x, z: CITY_HALL_SITE.z, w: CITY_HALL.w, d: CITY_HALL.d, h: CITY_HALL.h, build: cityHallGeometry },
  ],
  specialLots: [],
  overlays: [],
  river: DON,
  bay: TORONTO_LAKE,
  island: TORONTO_ISLANDS,
  // A very regular grid: fewer removed streets than Tokyo (neon and port per Ruling R8).
  roadRemoval: { highrise: 0.1, neon: 0.1, office: 0.15, residential: 0.15, park: 0.4, port: 0.15 },
  keepNodes: [],
  // A warm evening: the sun low in the west (−X), so shadows fall long to the east.
  atmosphere: {
    skyZenith: 0x4b4a8c,
    skyHorizon: 0xf2a46b,
    fog: 0xe9a985,
    hemiSky: 0xffc59a,
    hemiGround: 0x4a3550,
    hemiIntensity: 0.8,
    sun: 0xffa25a,
    sunIntensity: 2,
    sunDir: { x: -0.9, y: 0.3, z: 0.2 },
    windowGlow: { color: 0xffc46b, strength: 0.45 },
  },
  glyphs: 'latin',
  cranes: false,
};
