import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** About 1.3 × life, narrowed to fit its block: 140 m across the front, the central tower 66 m to its tip. */
export const QUEENS_PARK = { w: 140, d: 72, h: 66 } as const;
const SANDSTONE = 0xdf9f8c;
const SANDSTONE_DARK = 0xb87a6a;
const TRIM = 0xf0c8b5;
const ROOF = 0x4f4248;
const WINDOW = 0x3a2c32;

/**
 * A hipped roof over the rectangle x0..x1 × z0..z1, from y0 (the eaves) to y1: a four-sided frustum whose top is
 * `top` of its base (0 comes to a point).
 */
export function hipRoof(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, color: number, top = 0.25): THREE.BufferGeometry {
  return ring(Math.SQRT2, Math.SQRT2 * top, y0, y1, color, 4)
    .rotateY(Math.PI / 4)
    .scale((x1 - x0) / 2, 1, (z1 - z0) / 2)
    .translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
}

/** A row of dark window slots on the face z = zf (facing +z when `out` is 1, −z when −1), every `gap` m from x0 to x1, at height y. */
function windowRow(x0: number, x1: number, zf: number, out: 1 | -1, y: number, gap = 6, w = 2.6, h = 4.5): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.floor((x1 - x0) / gap);
  const start = (x0 + x1) / 2 - ((n - 1) * gap) / 2;
  for (let k = 0; k < n; k++) {
    const x = start + k * gap;
    parts.push(box(x - w / 2, y, out > 0 ? zf - 0.2 : zf - 0.4, x + w / 2, y + h, out > 0 ? zf + 0.4 : zf + 0.2, WINDOW));
  }
  return parts;
}

/**
 * The Ontario Legislative Building: Romanesque, in pink sandstone. A long front (local +z faces down University
 * Avenue): a tall central block, a lower wing to each side ending in a projecting pavilion, all under dark hipped
 * roofs; a square central tower over the entrance with a pyramid roof, flanked by two pyramid-capped turrets; rows of
 * dark windows and a pale string course. Base centre at the origin, +Y up, vertex-coloured.
 */
export function queensParkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // A dark plinth, the central block, the wings and the end pavilions.
  parts.push(box(-68, 0, -30, 68, 3, 20, SANDSTONE_DARK));
  parts.push(box(-30, 0, -30, 30, 34, 22, SANDSTONE), hipRoof(-31, -31, 31, 23, 34, 45, ROOF, 0.3));
  for (const s of [-1, 1]) {
    parts.push(box(s > 0 ? 30 : -58, 0, -24, s > 0 ? 58 : -30, 25, 18, SANDSTONE));
    parts.push(hipRoof(s > 0 ? 30 : -58, -25, s > 0 ? 58 : -30, 19, 25, 32, ROOF, 0.2));
    parts.push(box(s > 0 ? 57 : -70, 0, -28, s > 0 ? 70 : -57, 29, 21, SANDSTONE));
    parts.push(hipRoof(s > 0 ? 57 : -70, -28.5, s > 0 ? 70 : -57, 21.5, 29, 38, ROOF, 0.15));
    // Turrets flanking the tower, on the central block's front corners.
    parts.push(box(s * 26 - 4, 0, 18, s * 26 + 4, 40, 26, SANDSTONE), hipRoof(s * 26 - 4.5, 17.5, s * 26 + 4.5, 26.5, 40, 49, ROOF, 0));
  }
  // The central tower over the entrance, its pyramid roof to the full height.
  parts.push(box(-9, 0, 18, 9, 48, 36, SANDSTONE), hipRoof(-9.5, 17.5, 9.5, 36, 48, QUEENS_PARK.h, ROOF, 0));
  parts.push(box(-6, 0, 35.6, 6, 10, 36, WINDOW));
  for (const y of [22, 32, 40]) parts.push(box(-3, y, 35.6, 3, y + 5, 36, WINDOW));
  // Pale string courses, and windows: three rows on the central block, two on the wings and pavilions, front and back.
  parts.push(box(-30.3, 17, -30.3, 30.3, 18.2, 22.3, TRIM));
  for (const s of [-1, 1]) parts.push(box(s > 0 ? 30 : -58, 12, -24.3, s > 0 ? 58 : -30, 13, 18.3, TRIM));
  for (const y of [6, 20, 27]) {
    parts.push(...windowRow(-27, -10, 22, 1, y), ...windowRow(10, 27, 22, 1, y), ...windowRow(-27, 27, -30, -1, y));
  }
  for (const s of [-1, 1]) {
    const [x0, x1] = s > 0 ? [31, 57] : [-57, -31];
    for (const y of [5, 15]) parts.push(...windowRow(x0, x1, 18, 1, y), ...windowRow(x0, x1, -24, -1, y));
    const [p0, p1] = s > 0 ? [58, 70] : [-70, -58];
    for (const y of [6, 17]) parts.push(...windowRow(p0, p1, 21, 1, y, 5));
  }
  return merge(parts);
}
