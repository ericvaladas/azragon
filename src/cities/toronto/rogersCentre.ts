import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** 144 m across (the largest drum its avenue-side block holds; Ruling R1), about 70 m tall. */
export const ROGERS_CENTRE = { w: 144, d: 144, h: 70 } as const;
const WALL = 0xe4e0d8;
const BAND = 0x3a4048;
const ROOF_A = 0xf0eeea;
const ROOF_B = 0xd6d3cc;
const SIDES = 24;
/** Wall radius; the window bands stand 1 m proud of it, out to the footprint's edge. */
const R = 71;

/** The Rogers Centre: a low round drum, pale walls with dark window bands, and a slightly domed roof of pale segmented panels. */
export function rogersCentreGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [ring(R, R, 0, 52, WALL, SIDES)];
  for (const y of [12, 26, 40]) parts.push(ring(R + 1, R + 1, y, y + 5, BAND, SIDES));
  // The roof: four panel rings stepping in and up to the crown, alternating two pale tones.
  const roof = [[R, 60, 52, 58], [60, 46, 58, 63], [46, 30, 63, 67], [30, 12, 67, 70]] as const;
  roof.forEach(([r0, r1, y0, y1], k) => parts.push(ring(r0, r1, y0, y1, k % 2 ? ROOF_B : ROOF_A, SIDES)));
  return merge(parts);
}
