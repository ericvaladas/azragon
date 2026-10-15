import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Main battle tank in units of CONFIG.tank.size (the instance matrix scales it). Tank space is +Z forward, +Y up,
 * origin on the ground under the turret ring. Two meshes: the hull (tracks, road wheels, sprockets, fenders,
 * sloped glacis, engine deck, exhausts) yawed to the heading, and the turret (faceted turret, mantlet, gun with
 * fume extractor and muzzle brake, cupola, hatches, smoke dischargers, bustle rack, antenna) yawed to its aim.
 */
export const TURRET = {
  /** Height of the gun's axis above the ground. */
  gunY: 0.38,
  /** Muzzle distance in front of the turret ring centre. */
  muzzle: 0.9,
} as const;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), color);
}

/** A cylinder whose axis runs along `axis`, centred at (x, y, z). */
function cyl(r: number, h: number, seg: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x, y, z)), color);
}

/** A slab whose side profile is the polygon `zy`, `w` wide across x, centred on x. */
function profile(zy: [number, number][], w: number, color: number): Part {
  const shape = new THREE.Shape(zy.map(([z, y]) => new THREE.Vector2(z, y)));
  // Shape (x, y) extruded along +Z; rotating -90° about Y sends shape x to world z and the extrusion to world -x.
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }).rotateY(-Math.PI / 2);
  return painted(faceted(g.translate(w / 2, 0, 0)), color);
}

/** A block whose plan is the polygon `xz`, spanning heights y0..y1. */
function plan(xz: [number, number][], y0: number, y1: number, color: number): Part {
  const shape = new THREE.Shape(xz.map(([x, z]) => new THREE.Vector2(x, z)));
  // Shape (x, y) extruded along +Z; rotating +90° about X sends shape y to world z and the extrusion to world -y.
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false }).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(0, y1, 0)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('tankModel: merge failed');
  return g;
}

/** Tracks with road wheels, drive sprocket and idler, fenders, lower hull, sloped upper hull and engine deck. */
export function hullGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.27;
    // Track run: a side profile with sloped front and rear ends, ground contact shorter than the top run.
    parts.push(profile([[-0.5, 0.12], [-0.42, 0], [0.4, 0], [0.52, 0.13], [0.48, 0.17], [-0.47, 0.17]], 0.13, P.tankTrack).translate(x, 0, 0));
    // Road wheels on the outer face, with the sprocket at the rear and the idler at the front.
    for (const z of [-0.32, -0.16, 0, 0.16, 0.32]) {
      parts.push(cyl(0.065, 0.02, 10, 'x', sx * 0.34, 0.075, z, P.tankWheel));
      parts.push(cyl(0.025, 0.03, 6, 'x', sx * 0.345, 0.075, z, P.tankMetal));
    }
    parts.push(cyl(0.06, 0.03, 8, 'x', sx * 0.34, 0.12, -0.45, P.tankMetal));
    parts.push(cyl(0.055, 0.03, 8, 'x', sx * 0.34, 0.12, 0.46, P.tankWheel));
    // Fender shelf over the track, with a mud flap at the front.
    parts.push(box(0.15, 0.02, 1.0, x, 0.18, -0.01, P.tank));
    parts.push(box(0.15, 0.06, 0.02, x, 0.155, 0.49, P.tankDark));
    // Stowage boxes on the rear fenders.
    parts.push(box(0.11, 0.05, 0.18, x, 0.215, -0.32, P.tankDark));
  }
  // Lower hull between the tracks.
  parts.push(box(0.42, 0.13, 0.92, 0, 0.13, 0, P.tankDark));
  // Upper hull: steep sloped glacis at the front, flat deck, slight slope down at the rear.
  parts.push(profile([[-0.5, 0.17], [-0.5, 0.25], [-0.46, 0.29], [0.3, 0.29], [0.52, 0.19], [0.5, 0.17]], 0.56, P.tank));
  // Driver's hatch and periscope on the glacis.
  parts.push(box(0.12, 0.02, 0.1, 0.1, 0.29, 0.28, P.tankDark));
  // Headlights on the front corners.
  for (const sx of [-1, 1]) parts.push(box(0.05, 0.03, 0.03, sx * 0.24, 0.215, 0.5, P.tankLight));
  // Engine deck grilles and twin exhausts at the rear.
  for (const sx of [-1, 1]) parts.push(box(0.18, 0.015, 0.22, sx * 0.12, 0.295, -0.34, P.tankDark));
  for (const sx of [-1, 1]) parts.push(box(0.08, 0.05, 0.03, sx * 0.14, 0.24, -0.51, P.tankMetal));
  return merge(parts);
}

/** Turret, mantlet and gun, cupola and hatches, smoke dischargers, bustle rack and antenna. */
export function turretGeometry(): Part {
  const P = CONFIG.palette;
  const g = TURRET.gunY;
  const parts: Part[] = [];
  // Turret ring and the angular turret: wedge-shaped front cheeks, straight sides, narrower bustle at the rear.
  parts.push(cyl(0.2, 0.03, 12, 'y', 0, 0.305, 0, P.tankDark));
  const outline: [number, number][] = [[0.1, 0.32], [0.23, 0.14], [0.23, -0.18], [0.17, -0.32], [-0.17, -0.32], [-0.23, -0.18], [-0.23, 0.14], [-0.1, 0.32]];
  parts.push(plan(outline, 0.31, 0.45, P.tank));
  parts.push(plan(outline.map(([x, z]) => [x * 0.9, z * 0.9] as [number, number]), 0.45, 0.47, P.tank));
  // Gun mantlet and the gun: thick base sleeve, long tube, fume extractor, muzzle brake.
  parts.push(box(0.15, 0.11, 0.08, 0, g, 0.33, P.tankDark));
  parts.push(cyl(0.04, 0.12, 8, 'z', 0, g, 0.42, P.tankDark));
  parts.push(cyl(0.026, TURRET.muzzle - 0.48, 8, 'z', 0, g, (TURRET.muzzle + 0.48) / 2, P.tank));
  parts.push(cyl(0.042, 0.11, 8, 'z', 0, g, 0.64, P.tank));
  parts.push(cyl(0.038, 0.06, 6, 'z', 0, g, TURRET.muzzle - 0.03, P.tankDark));
  // Commander's cupola with a hatch, the loader's flat hatch beside it.
  parts.push(cyl(0.065, 0.05, 8, 'y', 0.1, 0.495, -0.08, P.tank));
  parts.push(cyl(0.055, 0.015, 8, 'y', 0.1, 0.525, -0.08, P.tankDark));
  parts.push(box(0.1, 0.015, 0.1, -0.1, 0.475, -0.04, P.tankDark));
  // Smoke grenade dischargers on the front cheeks.
  for (const sx of [-1, 1]) {
    for (const k of [0, 1, 2]) parts.push(cyl(0.015, 0.06, 5, 'z', sx * (0.17 + k * 0.022), 0.43, 0.17 - k * 0.03, P.tankMetal));
  }
  // Stowage rack on the bustle and a whip antenna at the rear corner.
  parts.push(box(0.36, 0.06, 0.07, 0, 0.42, -0.36, P.tankDark));
  parts.push(box(0.012, 0.32, 0.012, -0.15, 0.62, -0.26, P.tankMetal));
  return merge(parts);
}
