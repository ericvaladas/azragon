import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Schwerer Gustav land battleship in units of CONFIG.gustav.size (the instance matrix scales it). Space is +Z forward,
 * +Y up, origin on the ground under the turret pivot. Two meshes: the hull (four track units with road wheels and
 * fenders, side skirts, the armoured hull with its sloped bow, rust weathering, exhaust stacks and stowage on the rear
 * deck) yawed to the heading, and the turret (the box-girder gun carriage with bracing, ladders and vents, the crew
 * platform, the breech, a mantlet with a hazard band, and the enormous tapering barrel) yawed to its aim.
 */
export const GUN = {
  /** Height of the turret ring. */
  ringY: 0.2,
  /** Gun trunnion: height and distance forward of the turret pivot. */
  pivotY: 0.36,
  pivotZ: 0.02,
  /** Barrel elevation (rad) and muzzle distance along the barrel from the trunnion. */
  pitch: 0.08,
  muzzle: 0.92,
} as const;

type Part = THREE.BufferGeometry;
type V3 = [number, number, number];

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

/** A cylinder along +Z from z0, `len` long, radius r at z0 tapering to rEnd. */
function tube(r: number, len: number, seg: number, z0: number, color: number, rEnd = r): Part {
  return painted(faceted(new THREE.CylinderGeometry(rEnd, r, len, seg).rotateX(Math.PI / 2).translate(0, 0, z0 + len / 2)), color);
}

/** A slab whose side profile is the polygon `zy`, `w` wide across x, centred on x. */
function profile(zy: [number, number][], w: number, color: number): Part {
  const shape = new THREE.Shape(zy.map(([z, y]) => new THREE.Vector2(z, y)));
  // Shape (x, y) extruded along +Z; rotating -90° about Y sends shape x to world z and the extrusion to world -x.
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }).rotateY(-Math.PI / 2);
  return painted(faceted(g.translate(w / 2, 0, 0)), color);
}

/** A w×h box stretched from `a` to `b` (its local +Z along a→b, local +Y as close to world up as possible). */
function beam(a: V3, b: V3, w: number, h: number, color: number): Part {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  // Matrix4.lookAt(eye, target) points +Z from target to eye.
  const m = new THREE.Matrix4().lookAt(to, from, THREE.Object3D.DEFAULT_UP).setPosition(from.clone().add(to).multiplyScalar(0.5));
  return painted(faceted(new THREE.BoxGeometry(w, h, from.distanceTo(to)).applyMatrix4(m)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('gustavModel: merge failed');
  return g;
}

/** Geometry built along the barrel axis (+Z from the trunnion), raised GUN.pitch and moved onto the trunnion. */
function onAxis(parts: Part[]): Part {
  return merge(parts).rotateX(-GUN.pitch).translate(0, GUN.pivotY, GUN.pivotZ);
}

/** Four track units (two per side, front and rear), side skirts, the armoured hull and its rear deck. */
export function hullGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.19;
    for (const zc of [0.25, -0.25]) {
      parts.push(profile([[zc - 0.22, 0.07], [zc - 0.18, 0], [zc + 0.18, 0], [zc + 0.22, 0.07], [zc + 0.2, 0.1], [zc - 0.2, 0.1]], 0.1, P.gustavTrack).translate(x, 0, 0));
      for (const dz of [-0.15, -0.05, 0.05, 0.15]) parts.push(cyl(0.035, 0.012, 8, 'x', sx * 0.245, 0.045, zc + dz, P.gustavMetal));
      parts.push(box(0.12, 0.015, 0.46, x, 0.108, zc, P.gustav));
    }
    parts.push(box(0.02, 0.05, 0.9, sx * 0.25, 0.09, 0, P.gustavDark));
  }
  parts.push(box(0.3, 0.08, 0.96, 0, 0.09, 0, P.gustavDark));
  // Upper hull: a flat deck running into a sloped bow, and a short slope down at the stern.
  parts.push(profile([[-0.5, 0.12], [-0.5, 0.19], [-0.46, 0.21], [0.34, 0.21], [0.52, 0.14], [0.5, 0.12]], 0.44, P.gustav));
  // Rust weathering on the deck.
  parts.push(box(0.16, 0.006, 0.09, 0.1, 0.212, -0.3, P.gustavRust));
  parts.push(box(0.1, 0.006, 0.07, -0.12, 0.212, 0.24, P.gustavRust));
  // Rear deck: twin exhaust stacks and a stowage bin.
  for (const sx of [-1, 1]) parts.push(cyl(0.025, 0.1, 8, 'y', sx * 0.1, 0.26, -0.42, P.gustavMetal));
  parts.push(box(0.3, 0.03, 0.08, 0, 0.225, -0.34, P.gustavDark));
  return merge(parts);
}

/** The turret ring, the box-girder carriage, the crew platform and the gun. */
export function turretGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [cyl(0.16, 0.03, 12, 'y', 0, GUN.ringY + 0.015, 0, P.gustavDark)];
  for (const sx of [-1, 1]) {
    const x = sx * 0.11;
    const out = x + sx * 0.018;
    // A tall girder wall with X-bracing, a ladder and vents on its outer face, and a rust streak.
    parts.push(box(0.03, 0.2, 0.4, x, 0.33, -0.02, P.gustav));
    parts.push(beam([out, 0.25, -0.2], [out, 0.41, 0.16], 0.008, 0.02, P.gustavDark));
    parts.push(beam([out, 0.41, -0.2], [out, 0.25, 0.16], 0.008, 0.02, P.gustavDark));
    parts.push(box(0.006, 0.18, 0.03, x + sx * 0.02, 0.32, -0.18, P.gustavMetal));
    for (let k = 0; k < 3; k++) parts.push(box(0.006, 0.015, 0.05, out, 0.39 - k * 0.03, -0.08, P.gustavDark));
    parts.push(box(0.006, 0.08, 0.02, out, 0.3, 0.1, P.gustavRust));
  }
  // Crew platform behind the breech, with a rail.
  parts.push(box(0.26, 0.02, 0.18, 0, 0.44, -0.12, P.gustavDark));
  parts.push(box(0.26, 0.04, 0.012, 0, 0.47, -0.21, P.gustavMetal));
  const band: Part[] = [];
  for (let k = 0; k < 6; k++) band.push(box(0.03, 0.165, 0.055, -0.075 + k * 0.03, 0, 0.02, k % 2 ? P.gustavHazardDark : P.gustavHazard));
  parts.push(
    onAxis([
      box(0.16, 0.14, 0.2, 0, 0, -0.12, P.gustavDark),
      box(0.18, 0.16, 0.05, 0, 0, 0.02, P.gustav),
      ...band,
      tube(0.045, GUN.muzzle - 0.09, 10, 0.05, P.gustav, 0.03),
      tube(0.04, 0.04, 10, GUN.muzzle - 0.04, P.gustavDark),
    ]),
  );
  return merge(parts);
}

/** Muzzle of a Gustav of `size` with its turret yawed `yaw`, relative to its ground origin (world units). */
export function gustavMuzzle(yaw: number, size: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(GUN.pitch);
  const along = GUN.pivotZ + GUN.muzzle * c;
  return out.set(Math.sin(yaw) * along, GUN.pivotY + GUN.muzzle * Math.sin(GUN.pitch), Math.cos(yaw) * along).multiplyScalar(size);
}
