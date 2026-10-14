import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';

/** A faceted, vertex-coloured box from (x0, y0, z0) to (x1, y1, z1). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): THREE.BufferGeometry {
  return painted(faceted(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), color);
}

/** A faceted, vertex-coloured `sides`-gon prism or frustum on the y axis from y0 to y1, corner radius r0 at the bottom to r1 at the top. */
export function ring(r0: number, r1: number, y0: number, y1: number, color: number, sides = 12): THREE.BufferGeometry {
  return painted(faceted(new THREE.CylinderGeometry(r1, r0, y1 - y0, sides).translate(0, (y0 + y1) / 2, 0)), color);
}

/** Merge vertex-coloured parts into one geometry (uvs dropped) and free the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
