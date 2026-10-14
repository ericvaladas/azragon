import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';

const RED = 0xd23a2c;
const WHITE = 0xf2f0ea;
const GREY = 0x8a9096;

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

/** Portal legs at x = ±LEG_X, z = ±LEG_Z; the jib runs from BACK_Z to TIP_Z at JIB_Y. */
const LEG_X = 10;
const LEG_Z = 12;
const PORTAL_TOP = 44;
const JIB_Y = 50;
const BACK_Z = -30;
const TIP_Z = 62;
const APEX_Y = 70;

/**
 * A ship-to-shore gantry crane, vertex coloured in red and white bands, base centre at the origin, about 70 m tall:
 * two leg frames (a portal the monster walks through), a top girder with the machinery house, and a jib reaching
 * 50 m past the front legs along +Z (out over the water), held by stays from an A-frame apex, with a counterweight
 * on the back reach.
 */
export function craneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Legs in alternating bands, and a sill along each leg frame's foot.
  const band = 11;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let y = 0, k = 0; y < PORTAL_TOP; y += band, k++) {
        parts.push(box(sx * LEG_X - 1.4, y, sz * LEG_Z - 1.4, sx * LEG_X + 1.4, Math.min(PORTAL_TOP, y + band), sz * LEG_Z + 1.4, k % 2 ? WHITE : RED));
      }
    }
    parts.push(box(sx * LEG_X - 1.6, 0, -LEG_Z - 2, sx * LEG_X + 1.6, 2, LEG_Z + 2, GREY));
    // Leg-frame cross brace and top beam.
    parts.push(strut(new THREE.Vector3(sx * LEG_X, 4, -LEG_Z), new THREE.Vector3(sx * LEG_X, PORTAL_TOP - 4, LEG_Z), 1.2, WHITE));
    parts.push(box(sx * LEG_X - 1.6, PORTAL_TOP, -LEG_Z - 2, sx * LEG_X + 1.6, PORTAL_TOP + 3, LEG_Z + 2, RED));
  }
  // Portal beams across the front and back.
  for (const sz of [-1, 1]) parts.push(box(-LEG_X - 1.6, PORTAL_TOP, sz * LEG_Z - 1.6, LEG_X + 1.6, PORTAL_TOP + 3, sz * LEG_Z + 1.6, WHITE));
  // The jib (boom and back reach) in bands, the machinery house on top of the portal, the counterweight behind.
  const seg = 12;
  for (let z = BACK_Z, k = 0; z < TIP_Z; z += seg, k++) {
    parts.push(box(-3, JIB_Y - 2, z, 3, JIB_Y + 2, Math.min(TIP_Z, z + seg), k % 2 ? WHITE : RED));
  }
  parts.push(box(-6, JIB_Y + 2, -LEG_Z - 4, 6, JIB_Y + 9, -2, WHITE));
  parts.push(box(-5, JIB_Y - 8, BACK_Z, 5, JIB_Y - 2, BACK_Z + 8, RED));
  // Trolley hanging under the boom.
  parts.push(box(-3.5, JIB_Y - 5, 30, 3.5, JIB_Y - 2, 36, GREY));
  // A-frame up to the apex and stays out to the tip and back to the counterweight.
  for (const sx of [-1, 1]) {
    const apex = new THREE.Vector3(sx * 2, APEX_Y, 0);
    parts.push(strut(new THREE.Vector3(sx * LEG_X, PORTAL_TOP + 3, -LEG_Z), apex, 1.6, RED));
    parts.push(strut(new THREE.Vector3(sx * LEG_X, PORTAL_TOP + 3, LEG_Z), apex, 1.6, RED));
    parts.push(strut(apex, new THREE.Vector3(sx * 2.5, JIB_Y + 2, TIP_Z - 2), 0.8, WHITE));
    parts.push(strut(apex, new THREE.Vector3(sx * 2.5, JIB_Y + 2, BACK_Z + 2), 0.8, WHITE));
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
