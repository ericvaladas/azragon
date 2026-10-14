import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';

/** The Tokyo Metropolitan Government Building's footprint (x × z) and height, metres. */
export const TMG = { w: 150, d: 90, h: 243 } as const;
const BASE = 0xbcb9b0;
const STONE = 0xd5d3cc;
const BAND = 0x6f7680;

/** A box from y to y + h, centred on (x, z). */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry =>
  painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)), color);

/**
 * Twin towers on a lower base. Each tower has dark window bands and narrows near the top, then splits into the
 * building's two crowning peaks. Base centre at the origin, +Y up, vertex-coloured.
 */
export function tmgGeometry(): THREE.BufferGeometry {
  const parts = [box(TMG.w, 40, TMG.d, 0, 0, 0, BASE)];
  for (const side of [-1, 1]) {
    const cx = side * 40;
    parts.push(box(56, 165, 56, cx, 40, 0, STONE));
    for (let y = 52; y < 200; y += 14) parts.push(box(57, 4, 57, cx, y, 0, BAND));
    parts.push(box(50, 18, 50, cx, 205, 0, STONE));
    for (const peak of [-1, 1]) parts.push(box(20, 20, 46, cx + peak * 14, 223, 0, STONE));
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
