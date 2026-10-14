import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** 1.3 × life size. Footprint x × z and the taller tower's height. */
export const CITY_HALL = { w: 130, d: 90, h: 130 } as const;
const CONCRETE = 0xe2ddd2;
const GLASS = 0x34404c;
const RIB = 0xf2efe8;
const PODIUM = 0xcfc9bd;
const WHITE = 0xf6f4ef;
/** The east (+X) tower is the taller. */
const TOWERS = [{ side: 1, h: 130 }, { side: -1, h: 105 }] as const;
/** Each tower is an arc about the complex's centre: radius, wall thickness, half its angular spread, segments. */
const ARC_R = 52;
const THICK = 14;
const SPREAD = Math.PI / 4;
const SEGMENTS = 8;

/**
 * Toronto City Hall: two pale concrete towers curving toward each other like brackets (arcs about the centre, their
 * concave inner faces dark glass with pale vertical ribs), and a white saucer-shaped council chamber on a low podium
 * between them. Base centre at the origin, +Y up, vertex-coloured.
 */
export function cityHallGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(-55, 0, -30, 55, 10, 30, PODIUM)];
  for (const { side, h } of TOWERS) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a0 = -SPREAD + (2 * SPREAD * k) / SEGMENTS;
      const a1 = a0 + (2 * SPREAD) / SEGMENTS;
      const am = (a0 + a1) / 2;
      // A chord of the arc, a little long so neighbouring segments overlap.
      const len = 2 * ARC_R * Math.sin((a1 - a0) / 2) + 0.6;
      const theta = side > 0 ? am : Math.PI - am;
      // Local x runs out from the centre, local z along the arc; rotateY(−θ) turns local +x onto (cos θ, 0, sin θ).
      const place = (g: THREE.BufferGeometry, r: number) => g.rotateY(-theta).translate(r * Math.cos(theta), 0, r * Math.sin(theta));
      parts.push(place(box(-THICK / 2, 0, -len / 2, THICK / 2, h, len / 2, CONCRETE), ARC_R));
      parts.push(place(box(-0.6, 4, -len / 2, 0.6, h - 4, len / 2, GLASS), ARC_R - THICK / 2 - 0.6));
      parts.push(place(box(-1.2, 4, -0.6, 1.2, h - 2, 0.6, RIB), ARC_R - THICK / 2 - 1));
    }
  }
  // The council chamber: a white saucer on a short stem.
  parts.push(ring(8, 8, 10, 16, CONCRETE, 12), ring(10, 26, 16, 22, WHITE, 16), ring(26, 24, 22, 24, WHITE, 16), ring(24, 8, 24, 30, WHITE, 16));
  return merge(parts);
}
