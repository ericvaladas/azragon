import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** Drawn 1.3 × life size (like Tokyo Tower): 720 m to the antenna tip, the tallest structure in either city. */
export const CN_TOWER = { w: 100, d: 100, h: 720 } as const;
const CONCRETE = 0xd9d2c5;
const CONCRETE_DARK = 0xbfb6a6;
const GLASS = 0x2e3a4a;
const LIGHT = 0xffd98a;
const RED = 0xd8322a;
const WHITE = 0xf2f0ea;

/**
 * The CN Tower: a pale warm-grey three-sided shaft with three fins at the base stepping in as they rise; about
 * two-thirds up, the main pod (a flared underside, a dark glass band, a glowing light band, a white crown); the
 * smaller SkyPod above; a thin red-and-white antenna to the tip. Base centre at the origin, +Y up, vertex-coloured.
 */
export function cnTowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Three fins 120° apart, each tier reaching less far: the Y-shaped base tapering into the shaft. A fin runs along
  // local +x from the axis; rotateY turns it out from each face of the three-sided shaft.
  const tiers = [[0, 70, 46], [70, 160, 34], [160, 280, 24], [280, 400, 17]] as const;
  for (const [y0, y1, reach] of tiers) {
    for (let k = 0; k < 3; k++) parts.push(box(0, y0, -4.5, reach, y1, 4.5, CONCRETE).rotateY(Math.PI / 2 + (k * 2 * Math.PI) / 3));
  }
  parts.push(ring(18, 12, 0, 430, CONCRETE, 3));
  // Main pod.
  parts.push(ring(12, 34, 420, 436, CONCRETE_DARK, 16));
  parts.push(ring(34, 34, 436, 448, GLASS, 16));
  parts.push(ring(35, 35, 448, 452, LIGHT, 16));
  parts.push(ring(34, 30, 452, 466, WHITE, 16));
  parts.push(ring(30, 12, 466, 476, CONCRETE, 16));
  // Upper shaft and the SkyPod.
  parts.push(ring(10, 7, 476, 580, CONCRETE, 6));
  parts.push(ring(8, 13, 580, 586, CONCRETE_DARK, 12), ring(13, 13, 586, 594, GLASS, 12), ring(13, 6, 594, 600, WHITE, 12));
  // Antenna: red and white bands, tapering to the tip at CN_TOWER.h.
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const y0 = 600 + ((CN_TOWER.h - 600) * k) / bands;
    const y1 = 600 + ((CN_TOWER.h - 600) * (k + 1)) / bands;
    parts.push(ring(4.5 - (3.5 * k) / bands, 4.5 - (3.5 * (k + 1)) / bands, y0, y1, k % 2 ? WHITE : RED, 6));
  }
  return merge(parts);
}
