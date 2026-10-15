import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Towed field howitzer in units of CONFIG.artillery.size (the instance matrix scales it). Gun space is +Z forward
 * (toward the target), +Y up, origin on the ground under the axle. Two meshes: the carriage (wheels, split trail
 * legs spread on the ground, gun shield, trunnion saddle, cradle and recoil cylinders) and the barrel (breech,
 * tube, fume extractor, muzzle brake), which slides back along its axis by the recoil offset when the gun fires.
 */
export const GUN = {
  /** Barrel elevation above the horizon (rad). */
  pitch: 0.6,
  /** Trunnion the barrel and cradle pivot on. */
  pivot: { y: 0.42, z: 0.02 },
  /** Barrel extent along its axis from the pivot: breech face and muzzle. */
  breech: -0.48,
  muzzle: 1.55,
  /** How far the barrel slides back along its axis at full recoil. */
  kick: 0.22,
} as const;

type Part = THREE.BufferGeometry;
type V3 = [number, number, number];

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), color);
}

/** A cylinder along +Z of radius r and length len, starting at axis position z0 (axis through x = y = 0). */
function tube(r: number, len: number, seg: number, z0: number, color: number, rEnd = r): Part {
  const g = new THREE.CylinderGeometry(rEnd, r, len, seg).rotateX(Math.PI / 2).translate(0, 0, z0 + len / 2);
  return painted(faceted(g), color);
}

/** A w×h box stretched from `a` to `b` (its local +Z along a→b, local +Y as close to world up as possible). */
function beam(a: V3, b: V3, w: number, h: number, color: number): Part {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const len = from.distanceTo(to);
  // Matrix4.lookAt(eye, target) points +Z from target to eye.
  const m = new THREE.Matrix4().lookAt(to, from, THREE.Object3D.DEFAULT_UP).setPosition(from.clone().add(to).multiplyScalar(0.5));
  return painted(faceted(new THREE.BoxGeometry(w, h, len).applyMatrix4(m)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('artyModel: merge failed');
  return g;
}

/** Geometry built along the barrel axis (+Z from the pivot), pitched up GUN.pitch and moved onto the trunnion. */
function onAxis(parts: Part[]): Part {
  return merge(parts).rotateX(-GUN.pitch).translate(0, GUN.pivot.y, GUN.pivot.z);
}

/** One road wheel on the axle at side sx: tyre, rim and hub cap. */
function wheel(sx: number): Part[] {
  const P = CONFIG.palette;
  const at = (g: THREE.CylinderGeometry, x: number, color: number) => painted(faceted(g.rotateZ(Math.PI / 2).translate(x, 0.19, 0)), color);
  return [
    at(new THREE.CylinderGeometry(0.19, 0.19, 0.13, 10), sx * 0.44, P.artilleryTyre),
    at(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 10), sx * 0.445, P.artilleryHub),
    at(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 6), sx * 0.45, P.artilleryDark),
  ];
}

/** Wheels and axle, split trail legs ending in spades, lower carriage, gun shield, trunnion saddle, cradle. */
export function carriageGeometry(): Part {
  const P = CONFIG.palette;
  const olive = P.artillery;
  const dark = P.artilleryDark;
  const sand = P.artillerySand;
  const parts: Part[] = [...wheel(-1), ...wheel(1)];
  // Axle and the lower carriage it carries.
  parts.push(painted(faceted(new THREE.CylinderGeometry(0.04, 0.04, 0.82, 6).rotateZ(Math.PI / 2).translate(0, 0.19, 0)), dark));
  parts.push(box(0.5, 0.12, 0.42, 0, 0.24, -0.04, olive));
  parts.push(box(0.36, 0.06, 0.3, 0, 0.32, -0.04, dark));
  // Split trail legs spread wide behind the gun, each with a sand camo band, a lifting handle and a ground spade.
  for (const sx of [-1, 1]) {
    const hinge: V3 = [sx * 0.16, 0.22, -0.18];
    const foot: V3 = [sx * 0.62, 0.05, -1.12];
    parts.push(beam(hinge, foot, 0.1, 0.1, olive));
    parts.push(beam([sx * 0.3, 0.17, -0.48], [sx * 0.42, 0.13, -0.7], 0.11, 0.11, sand));
    parts.push(beam([sx * 0.56, 0.09, -0.98], [sx * 0.64, 0.05, -1.14], 0.12, 0.12, dark));
    parts.push(box(0.2, 0.14, 0.04, sx * 0.64, 0.04, -1.16, dark));
    parts.push(beam([sx * 0.5, 0.15, -0.88], [sx * 0.5, 0.25, -0.92], 0.03, 0.03, dark));
  }
  // Gun shield: two angled side plates flanking a notch for the barrel, with a sand camo patch and a top lip.
  const shield = (sx: number): Part[] => [
    box(0.32, 0.34, 0.035, sx * 0.25, 0.48, 0, olive).rotateY(sx * 0.32).translate(0, 0, 0.2),
    box(0.16, 0.14, 0.04, sx * 0.29, 0.52, 0.004, sand).rotateY(sx * 0.32).translate(0, 0, 0.2),
    box(0.32, 0.03, 0.06, sx * 0.25, 0.66, -0.01, dark).rotateY(sx * 0.32).translate(0, 0, 0.2),
  ];
  parts.push(...shield(-1), ...shield(1));
  parts.push(box(0.2, 0.08, 0.035, 0, 0.3, 0.24, olive));
  // Trunnion saddle: cheeks either side of the cradle and the trunnion pin.
  for (const sx of [-1, 1]) parts.push(box(0.05, 0.22, 0.2, sx * 0.13, 0.36, GUN.pivot.z, dark));
  parts.push(painted(faceted(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6).rotateZ(Math.PI / 2).translate(0, GUN.pivot.y, GUN.pivot.z)), dark));
  // Equilibrator struts from the carriage up to the cradle, both sides.
  for (const sx of [-1, 1]) {
    const c = Math.cos(GUN.pitch);
    const s = Math.sin(GUN.pitch);
    const top: V3 = [sx * 0.1, GUN.pivot.y + 0.32 * s + 0.04 * c, GUN.pivot.z + 0.32 * c - 0.04 * s];
    parts.push(beam([sx * 0.12, 0.28, -0.16], top, 0.04, 0.04, olive));
  }
  // Cradle round the barrel's rear half with twin recoil cylinders riding on top and a buffer below.
  parts.push(
    onAxis([
      box(0.17, 0.15, 0.62, 0, 0, 0.06, olive),
      box(0.19, 0.03, 0.5, 0, 0.085, 0.06, dark),
      box(0.175, 0.1, 0.2, 0, -0.01, -0.12, P.artillerySand),
      ...[-1, 1].map((sx) => tube(0.035, 0.66, 6, -0.18, dark).translate(sx * 0.055, 0.12, 0)),
      ...[-1, 1].map((sx) => box(0.035, 0.035, 0.08, sx * 0.055, 0.12, 0.5, P.artilleryHub)),
      tube(0.04, 0.5, 6, -0.12, dark).translate(0, -0.1, 0),
    ]),
  );
  return merge(parts);
}

/**
 * The recoiling barrel: breech ring and block, long tube with a fume extractor bulge two thirds along, and a
 * slotted double-baffle muzzle brake at GUN.muzzle.
 */
export function barrelGeometry(): Part {
  const P = CONFIG.palette;
  const len = GUN.muzzle - GUN.breech;
  return onAxis([
    box(0.15, 0.15, 0.2, 0, 0, GUN.breech + 0.1, P.artilleryDark),
    box(0.11, 0.11, 0.04, 0, 0, GUN.breech - 0.01, P.artilleryMetal),
    tube(0.05, len - 0.16, 8, GUN.breech + 0.12, P.artillery, 0.04),
    // Sand camo band partway up the tube.
    tube(0.049, 0.22, 8, 0.42, P.artillerySand, 0.046),
    // Fume extractor: a fat sleeve with tapered ends.
    tube(0.04, 0.05, 8, 0.86, P.artillery, 0.068),
    tube(0.068, 0.18, 8, 0.91, P.artillery),
    tube(0.068, 0.05, 8, 1.09, P.artillery, 0.04),
    tube(0.07, 0.02, 8, 0.93, P.artilleryDark),
    // Muzzle brake: two baffles with dark side ports between them, and the dark bore at the very end.
    tube(0.075, 0.07, 6, GUN.muzzle - 0.17, P.artilleryDark),
    box(0.17, 0.08, 0.04, 0, 0, GUN.muzzle - 0.08, P.artilleryMetal),
    tube(0.075, 0.06, 6, GUN.muzzle - 0.06, P.artilleryDark),
    tube(0.03, 0.01, 6, GUN.muzzle, P.artilleryMetal),
  ]);
}

/** Unit barrel axis for a gun yawed `yaw` (0 faces +Z; rotation about +Y): GUN.pitch above the horizon. */
export function artyBarrelDir(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(GUN.pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(GUN.pitch), Math.cos(yaw) * c);
}

/** Muzzle of a gun of `size` yawed `yaw`, in world units relative to the gun's ground origin (barrel at rest). */
export function artyMuzzle(yaw: number, size: number, out: THREE.Vector3): THREE.Vector3 {
  artyBarrelDir(yaw, out).multiplyScalar(GUN.muzzle);
  out.y += GUN.pivot.y;
  out.x += Math.sin(yaw) * GUN.pivot.z;
  out.z += Math.cos(yaw) * GUN.pivot.z;
  return out.multiplyScalar(size);
}

/** Barrel slide back along its axis (in GUN.kick units, 0..1) `t` seconds after firing: a snap back, slow run-out. */
export function recoilOffset(t: number, duration: number): number {
  if (t < 0 || t >= duration) return 0;
  const snap = 0.06;
  if (t < snap) return t / snap;
  const u = (t - snap) / (duration - snap);
  return 1 - u * u * (3 - 2 * u);
}
