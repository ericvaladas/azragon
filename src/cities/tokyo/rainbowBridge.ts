import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';
import type { LandmarkSpec } from '../types';
import { TOKYO_BAY } from './layout';

const WHITE = 0xf2f0ea;
const DECK_SIDE = 0xdedcd6;
const TRUSS = 0xc4c8cd;
const ROAD = 0x4b4f56;
const CONCRETE = 0xb8b4aa;

/**
 * The Rainbow Bridge: a white suspension bridge from a shore anchorage at `from` straight out along the bay's dir to
 * an anchorage just inside the island's near edge cell, `length` m away. Towers `h` m tall at 30% and 70% of the
 * length, legs `towerX` m either side of the centreline; the roadway's top is `deckY` m up; nothing reaches more than
 * `halfWidth` m to either side of the centreline.
 */
export const RAINBOW_BRIDGE = { from: { x: -1658, z: -958 }, length: 1080, h: 160, deckY: 50, towerX: 19, halfWidth: 24 } as const;
/** Each anchorage: a concrete block `long` m beyond its end of the span, `wide` m across, `tall` m up (under the deck). */
const ANCHOR = { long: 30, wide: 36, tall: 46 } as const;
/** The towers stand at these fractions of the length. */
const TOWER_AT = [0.3, 0.7] as const;
/** Main cables rest on the anchorage saddles at this height and pass over the tower tops at TOWER_TOP. */
const SADDLE_Y = 58;
const TOWER_TOP = 157;
/** The main cables' lowest point, at mid-span, above the deck. */
const SAG_Y = 58;
const HANGER_GAP = 27;

/** A box from (x0, y0, z0) to (x1, y1, z1). */
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) =>
  painted(faceted(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), color);

/** A strut from a to b with square cross-section `t`. */
function strut(a: THREE.Vector3, b: THREE.Vector3, t: number, color: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, dir.length(), t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return painted(faceted(g), color);
}

/**
 * The bridge in its own frame: the deck runs along local +Z from the shore anchorage (z = 0) to the island anchorage
 * (z = length); each anchorage is a concrete block reaching ANCHOR.long beyond its end, the deck resting on it. A
 * double deck (a white girder under a pale slab with a dark roadway and rails), two white towers (two legs and three
 * cross beams each, on a concrete footing), and two main cables as chains of thin boxes: parabolas from each
 * anchorage saddle over the tower tops, dipping to just above the deck at mid-span, with vertical hangers to the deck.
 * Base at y = 0, vertex-coloured, no wider than RAINBOW_BRIDGE.halfWidth either side.
 */
export function rainbowBridgeGeometry(length: number): THREE.BufferGeometry {
  const { deckY, towerX, h } = RAINBOW_BRIDGE;
  const z0 = -ANCHOR.long, z1 = length + ANCHOR.long;
  const parts: THREE.BufferGeometry[] = [];
  const W = ANCHOR.wide / 2;
  // Anchorages, with a saddle for each cable.
  for (const [a, b] of [[z0, 0], [length, z1]] as const) {
    parts.push(box(-W, 0, a, W, ANCHOR.tall, b, CONCRETE));
    for (const s of [-1, 1]) parts.push(box(s * towerX - 4, ANCHOR.tall, (a + b) / 2 - 7, s * towerX + 4, SADDLE_Y + 2, (a + b) / 2 + 7, CONCRETE));
  }
  // Deck: girder, slab, roadway, rails; truss posts down the girder's sides.
  parts.push(box(-14, deckY - 12, z0, 14, deckY - 4, z1, WHITE));
  parts.push(box(-15, deckY - 4, z0, 15, deckY, z1, DECK_SIDE));
  parts.push(box(-12, deckY, z0, 12, deckY + 0.4, z1, ROAD));
  for (const s of [-1, 1]) parts.push(box(s * 14.5 - 0.5, deckY, z0, s * 14.5 + 0.5, deckY + 1.4, z1, WHITE));
  for (let z = 15; z < length; z += 30) for (const s of [-1, 1]) parts.push(box(s * 14.2 - 0.5, deckY - 12, z - 1, s * 14.2 + 0.5, deckY - 4, z + 1, TRUSS));
  // Towers: footing, two legs, three cross beams (one carrying the deck), caps.
  const towers = TOWER_AT.map((f) => f * length);
  for (const tz of towers) {
    parts.push(box(-towerX - 4, 0, tz - 13, towerX + 4, 10, tz + 13, CONCRETE));
    for (const s of [-1, 1]) {
      parts.push(box(s * towerX - 4, 10, tz - 4, s * towerX + 4, h - 4, tz + 4, WHITE));
      parts.push(box(s * towerX - 5, h - 4, tz - 5, s * towerX + 5, h, tz + 5, WHITE));
    }
    for (const [y0, y1] of [[deckY - 22, deckY - 12], [104, 112], [144, 152]] as const) parts.push(box(-towerX, y0, tz - 3, towerX, y1, tz + 3, WHITE));
  }
  // Main cables: the main span a parabola between the tower tops; the side spans sag slightly from saddle to tower.
  const [ta, tb] = towers as [number, number];
  const cableY = (z: number): number => {
    if (z >= ta && z <= tb) {
      const u = (2 * (z - ta)) / (tb - ta) - 1;
      return SAG_Y + (TOWER_TOP - SAG_Y) * u * u;
    }
    const [s0, s1] = z < ta ? [z0 / 2, ta] : [z1 - ANCHOR.long / 2, tb];
    const t = (z - s0) / (s1 - s0);
    return SADDLE_Y + (TOWER_TOP - SADDLE_Y) * t - 14 * 4 * t * (1 - t);
  };
  const spans: [number, number, number][] = [[z0 / 2, ta, 8], [ta, tb, 16], [tb, z1 - ANCHOR.long / 2, 8]];
  for (const s of [-1, 1]) {
    const x = s * towerX;
    for (const [a, b, n] of spans) {
      for (let k = 0; k < n; k++) {
        const za = a + ((b - a) * k) / n, zb = a + ((b - a) * (k + 1)) / n;
        parts.push(strut(new THREE.Vector3(x, cableY(za), za), new THREE.Vector3(x, cableY(zb), zb), 2.2, WHITE));
      }
      // Hangers, clear of the towers and anchorages.
      for (let z = a + HANGER_GAP; z < b - HANGER_GAP / 2; z += HANGER_GAP) {
        if (cableY(z) - deckY > 3) parts.push(box(x - 0.4, deckY, z - 0.4, x + 0.4, cableY(z), z + 0.4, WHITE));
      }
    }
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** The bridge's far end: `length` m from `from` along the bay's dir, just inside the island's near edge cell. */
const TO = {
  x: RAINBOW_BRIDGE.from.x + TOKYO_BAY.dir.x * RAINBOW_BRIDGE.length,
  z: RAINBOW_BRIDGE.from.z + TOKYO_BAY.dir.z * RAINBOW_BRIDGE.length,
};

/** The shore anchorage's centre, half its length back from `from` (inland); 47 m square covers it turned 45°. */
const SHORE_ANCHOR = {
  x: RAINBOW_BRIDGE.from.x - (TOKYO_BAY.dir.x * ANCHOR.long) / 2,
  z: RAINBOW_BRIDGE.from.z - (TOKYO_BAY.dir.z * ANCHOR.long) / 2,
  size: 47,
};

/** The landmark: owned by the chunk of `from`; its (x, z) and footprint are the shore anchorage's. */
export const RAINBOW_BRIDGE_LANDMARK: LandmarkSpec = {
  id: 'rainbow-bridge',
  x: SHORE_ANCHOR.x,
  z: SHORE_ANCHOR.z,
  w: SHORE_ANCHOR.size,
  d: SHORE_ANCHOR.size,
  h: RAINBOW_BRIDGE.h,
  span: {
    from: RAINBOW_BRIDGE.from,
    to: TO,
    halfWidth: RAINBOW_BRIDGE.halfWidth,
    deckY: RAINBOW_BRIDGE.deckY,
    towers: TOWER_AT.map((f) => f * RAINBOW_BRIDGE.length),
  },
  build: () => rainbowBridgeGeometry(RAINBOW_BRIDGE.length),
};
