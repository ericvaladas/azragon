import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';
import { hipRoof } from './queensPark';

/** About 100 m across: the hall, the square Norman tower to the east and the round tower to the west, 58 m to its tip. */
export const CASA_LOMA = { w: 100, d: 70, h: 58 } as const;
/** The square tower: centre and half side (m), its parapet's merlons above `top`. */
export const CASA_LOMA_TOWER = { x: 32, z: -4, half: 10, top: 46 } as const;
/** The great round tower at the west end: centre and wall radius. */
export const CASA_LOMA_TURRET = { x: -39, z: -6, r: 9 } as const;
const STONE = 0xdcc89e;
const STONE_DARK = 0xb3a283;
const STONE_LIGHT = 0xe8d8b2;
const ROOF = 0x4c5a52;
const WINDOW = 0x2f3436;

/** Merlons (3 m wide, about every 6 m, one on each corner) along each edge of the square x0..x1 × z0..z1, on top of y, `h` m tall and 1.5 m thick. */
function battlements(x0: number, z0: number, x1: number, z1: number, y: number, h = 3.5): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // Evenly spaced from corner to corner, about 6 m apart.
  const along = (a0: number, a1: number, fn: (a: number) => void) => {
    const n = Math.max(1, Math.round((a1 - a0 - 3) / 6));
    for (let k = 0; k <= n; k++) fn(a0 + 1.5 + (k * (a1 - a0 - 3)) / n);
  };
  along(x0, x1, (a) => parts.push(box(a - 1.5, y, z0, a + 1.5, y + h, z0 + 1.5, STONE_LIGHT), box(a - 1.5, y, z1 - 1.5, a + 1.5, y + h, z1, STONE_LIGHT)));
  along(z0, z1, (a) => parts.push(box(x0, y, a - 1.5, x0 + 1.5, y + h, a + 1.5, STONE_LIGHT), box(x1 - 1.5, y, a - 1.5, x1, y + h, a + 1.5, STONE_LIGHT)));
  return parts;
}

/** A round turret at (x, z): a stone drum of radius r to y1, a pale band, then a dark cone `cone` m tall. */
function turret(x: number, z: number, r: number, y1: number, cone: number): THREE.BufferGeometry[] {
  return [
    ring(r, r, 0, y1, STONE, 12).translate(x, 0, z),
    ring(r + 0.6, r + 0.6, y1 - 3, y1, STONE_LIGHT, 12).translate(x, 0, z),
    ring(r + 1.5, 0.4, y1, y1 + cone, ROOF, 12).translate(x, 0, z),
  ];
}

/**
 * Casa Loma: a buff-stone castle. The main hall under a steep dark green-grey hipped roof, battlements along its
 * eaves; the tall square Norman tower at the east end, crowned by corbels and merlons; the great round tower at the
 * west end and three smaller round turrets on the hall's corners, all with conical roofs; a low garden terrace in
 * front (+z). Base centre at the origin, +Y up, vertex-coloured.
 */
export function casaLomaGeometry(): THREE.BufferGeometry {
  const T = CASA_LOMA_TOWER;
  const W = CASA_LOMA_TURRET;
  const parts: THREE.BufferGeometry[] = [];
  // The terrace and the hall.
  parts.push(box(-46, 0, 18, 46, 3, 32, STONE_DARK));
  parts.push(box(-32, 0, -18, 24, 24, 18, STONE), hipRoof(-30, -16, 22, 16, 24, 33, ROOF, 0.2));
  parts.push(...battlements(-32, -18, 24, 18, 24, 2.5));
  // Gabled dormer bays on the front: stone boxes with small pyramid caps.
  for (const x of [-20, -4, 12]) parts.push(box(x - 4, 18, 14, x + 4, 30, 19, STONE), hipRoof(x - 4.5, 13.5, x + 4.5, 19.5, 30, 36, ROOF, 0));
  for (const y of [5, 13]) for (let x = -28; x <= 20; x += 6) parts.push(box(x - 1.2, y, 18, x + 1.2, y + 4.5, 18.5, WINDOW), box(x - 1.2, y, -18.5, x + 1.2, y + 4.5, -18, WINDOW));
  // The square tower: shaft, corbelled crown, flat roof, merlons; slit windows.
  parts.push(box(T.x - T.half + 1, 0, T.z - T.half + 1, T.x + T.half - 1, T.top - 4, T.z + T.half - 1, STONE));
  parts.push(box(T.x - T.half, T.top - 4, T.z - T.half, T.x + T.half, T.top, T.z + T.half, STONE_LIGHT));
  parts.push(...battlements(T.x - T.half, T.z - T.half, T.x + T.half, T.z + T.half, T.top));
  for (const y of [8, 18, 28, 36]) parts.push(box(T.x - 1.5, y, T.z + T.half - 1.4, T.x + 1.5, y + 5, T.z + T.half - 0.6, WINDOW), box(T.x - T.half + 0.6, y, T.z - 1.5, T.x - T.half + 1.4, y + 5, T.z + 1.5, WINDOW));
  // The great round tower and the corner turrets.
  parts.push(...turret(W.x, W.z, W.r, 36, CASA_LOMA.h - 36));
  for (const y of [10, 20, 29]) parts.push(box(W.x - 1.4, y, W.z + W.r - 0.6, W.x + 1.4, y + 4, W.z + W.r + 0.4, WINDOW));
  parts.push(...turret(-32, 18, 4, 30, 11), ...turret(24, 18, 4, 30, 11), ...turret(-32, -18, 4, 28, 10));
  return merge(parts);
}
