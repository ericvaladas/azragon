import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** Varsity Stadium: an open bowl 140 × 100 m, its west stand 15 m tall. */
export const VARSITY_STADIUM = { w: 140, d: 100, h: 15 } as const;
const FIELD = 0x4f8f3e;
const TRACK = 0x3a6ea8;
const STAND = 0x9a9a98;
const SEATS = 0x5d6670;

/**
 * Varsity Stadium: a green field inside a blue running track, a tall stepped stand on the west (−x) side, and low
 * stands round the other three. Base centre at the origin, +Y up, vertex-coloured.
 */
export function varsityStadiumGeometry(): THREE.BufferGeometry {
  return merge([
    box(-60, 0, -44, 60, 0.3, 44, TRACK),
    box(-48, 0, -32, 48, 0.5, 32, FIELD),
    box(-70, 0, -50, -66, 15, 50, STAND),
    box(-66, 0, -50, -63, 10, 50, SEATS),
    box(-63, 0, -50, -60, 5, 50, STAND),
    box(60, 0, -50, 70, 6, 50, SEATS),
    box(-60, 0, -50, 60, 4, -44, SEATS),
    box(-60, 0, 44, 60, 4, 50, SEATS),
  ]);
}
