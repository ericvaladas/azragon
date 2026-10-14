import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';
import { CRANE_PORTAL } from './chunks';

const RED = 0xd23a2c;
const WHITE = 0xf2f0ea;
const GREY = 0x6f757b;

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

/** Legs at x = ±LEG_X, z = ±LEG_Z (CRANE_PORTAL, which the generator keeps buildings out of), LEG m square. */
const LEG_X = CRANE_PORTAL.halfAlong;
const LEG_Z = CRANE_PORTAL.halfAcross;
const LEG = CRANE_PORTAL.leg;
const PORTAL_TOP = 58;
/** The jib's girder: centre height, half width, half depth; it runs from BACK_Z to TIP_Z, 80 m past the front legs. */
const JIB_Y = 64;
const JIB_HW = 4;
const JIB_HH = 3.5;
const BACK_Z = -42;
const TIP_Z = LEG_Z + 80;
const APEX_Y = 95;

/**
 * A ship-to-shore gantry crane, vertex coloured in bold red and white bands, base centre at the origin, about 95 m
 * tall: two leg frames (a portal the monster walks through), portal beams with the machinery house, and a jib reaching
 * 80 m past the front legs along +Z (about 60 m out over the water from its quay), held by stays from an A-frame apex,
 * with a counterweight on the back reach.
 */
export function craneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const band = 14.5;
  const h = LEG / 2;
  for (const sx of [-1, 1]) {
    // Legs in alternating bands.
    for (const sz of [-1, 1]) {
      for (let y = 0, k = 0; y < PORTAL_TOP; y += band, k++) {
        parts.push(box(sx * LEG_X - h, y, sz * LEG_Z - h, sx * LEG_X + h, Math.min(PORTAL_TOP, y + band), sz * LEG_Z + h, k % 2 ? WHITE : RED));
      }
    }
    // Sill along the leg frame's foot, a diagonal brace, a mid beam and the top beam.
    parts.push(box(sx * LEG_X - h - 0.5, 0, -LEG_Z - h - 2, sx * LEG_X + h + 0.5, 3, LEG_Z + h + 2, GREY));
    parts.push(strut(new THREE.Vector3(sx * LEG_X, 6, -LEG_Z), new THREE.Vector3(sx * LEG_X, PORTAL_TOP - 6, LEG_Z), 2, WHITE));
    parts.push(box(sx * LEG_X - h, 26, -LEG_Z, sx * LEG_X + h, 29, LEG_Z, RED));
    parts.push(box(sx * LEG_X - h - 0.5, PORTAL_TOP, -LEG_Z - h - 1, sx * LEG_X + h + 0.5, PORTAL_TOP + 4, LEG_Z + h + 1, RED));
  }
  // Portal beams across the front and back.
  for (const sz of [-1, 1]) parts.push(box(-LEG_X - h, PORTAL_TOP, sz * LEG_Z - h, LEG_X + h, PORTAL_TOP + 4, sz * LEG_Z + h, WHITE));
  // The jib (boom and back reach) in bands; the machinery house on the portal; the counterweight behind.
  const seg = 13;
  for (let z = BACK_Z, k = 0; z < TIP_Z; z += seg, k++) {
    parts.push(box(-JIB_HW, JIB_Y - JIB_HH, z, JIB_HW, JIB_Y + JIB_HH, Math.min(TIP_Z, z + seg), k % 2 ? WHITE : RED));
  }
  parts.push(box(-8, JIB_Y + JIB_HH, -LEG_Z - 6, 8, JIB_Y + JIB_HH + 10, -2, WHITE));
  parts.push(box(-7, JIB_Y - JIB_HH - 9, BACK_Z, 7, JIB_Y - JIB_HH, BACK_Z + 10, RED));
  // Trolley and spreader hanging under the boom, over the water.
  parts.push(box(-5, JIB_Y - JIB_HH - 4, LEG_Z + 34, 5, JIB_Y - JIB_HH, LEG_Z + 42, GREY));
  parts.push(box(-4, JIB_Y - 30, LEG_Z + 36, 4, JIB_Y - 28, LEG_Z + 40, GREY));
  // A-frame up to the apex and stays out to the tip and back to the counterweight.
  for (const sx of [-1, 1]) {
    const apex = new THREE.Vector3(sx * 3, APEX_Y, 0);
    parts.push(strut(new THREE.Vector3(sx * LEG_X, PORTAL_TOP + 4, -LEG_Z), apex, 2.6, RED));
    parts.push(strut(new THREE.Vector3(sx * LEG_X, PORTAL_TOP + 4, LEG_Z), apex, 2.6, RED));
    parts.push(strut(apex, new THREE.Vector3(sx * 3.5, JIB_Y + JIB_HH, TIP_Z - 3), 1.3, WHITE));
    parts.push(strut(apex, new THREE.Vector3(sx * 3.5, JIB_Y + JIB_HH, LEG_Z + 30), 1.3, WHITE));
    parts.push(strut(apex, new THREE.Vector3(sx * 3.5, JIB_Y + JIB_HH, BACK_Z + 3), 1.3, WHITE));
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
