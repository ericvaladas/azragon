import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Mobile SAM launcher in units of CONFIG.sam.size (the instance matrix scales it). Launcher space is +Z forward
 * (toward the monster), +Y up, origin on the ground at the turntable's centre. An armoured turntable carries a cab,
 * a radar panel on a mast, and a 2×2 pod of boxy missile tubes pitched up RACK.pitch on a cradle.
 */
export const RACK = {
  /** Elevation of the tube axis above the horizon (rad). */
  pitch: Math.PI / 4,
  /** Cradle trunnion the pod pivots on. */
  pivot: { y: 0.4, z: -0.22 },
  /** Pod extent along the tube axis, from the pivot: back end and mouth. */
  back: -0.12,
  mouth: 0.86,
  /** Tube centre offsets across the pod (x) and along the pod's "up" side (u). */
  spread: 0.12,
  tube: 0.21,
} as const;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), color);
}

function cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y, z)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('samModel: merge failed');
  return g;
}

/** Pod tube k (0..3): its centre across the pod (x) and along the pod's up side (u). */
function tubeOffset(k: number): { x: number; u: number } {
  return { x: (k % 2 ? 1 : -1) * RACK.spread, u: (k < 2 ? 1 : -1) * RACK.spread };
}

/**
 * The pod, built along +Y from the pivot (tube axis = +Y, pod "up" side = -Z so it faces the sky once pitched):
 * four boxy olive tubes in a darker frame, each mouth a dark square with a white collar and red missile nose.
 */
function podGeometry(): Part {
  const P = CONFIG.palette;
  const len = RACK.mouth - RACK.back;
  const mid = (RACK.mouth + RACK.back) / 2;
  const w = RACK.spread * 2 + RACK.tube;
  const parts: Part[] = [];
  for (let k = 0; k < 4; k++) {
    const { x, u } = tubeOffset(k);
    const z = -u;
    parts.push(box(RACK.tube, len, RACK.tube, x, mid, z, P.samPod));
    // Dark mouth, white missile collar, red nose cone poking out.
    parts.push(box(RACK.tube * 0.78, 0.02, RACK.tube * 0.78, x, RACK.mouth + 0.005, z, P.samBodyDark));
    parts.push(cyl(0.06, 0.06, 0.04, 6, x, RACK.mouth + 0.02, z, P.missile));
    parts.push(cyl(0.0, 0.06, 0.1, 6, x, RACK.mouth + 0.09, z, P.samTube));
  }
  // Frame bands around the pod near each end, and a hazard band on the up side behind the mouths.
  for (const y of [RACK.back + 0.08, RACK.mouth - 0.1]) parts.push(box(w + 0.05, 0.07, w + 0.05, 0, y, 0, P.samBodyDark));
  for (let k = 0; k < 4; k++) {
    const c = k % 2 ? P.samHazardDark : P.samHazard;
    const a = -w / 2 + (k + 0.5) * (w / 4);
    parts.push(box(w / 4, 0.06, 0.02, a, RACK.mouth - 0.22, -w / 2 - 0.01, c));
    parts.push(box(0.02, 0.06, w / 4, w / 2 + 0.01, RACK.mouth - 0.22, a, c));
    parts.push(box(0.02, 0.06, w / 4, -w / 2 - 0.01, RACK.mouth - 0.22, a, c));
  }
  // Rear cap.
  parts.push(box(w, 0.03, w, 0, RACK.back - 0.01, 0, P.samBodyDark));
  return merge(parts).rotateX(RACK.pitch).translate(0, RACK.pivot.y, RACK.pivot.z);
}

/** The whole launcher (turntable, cab, radar, cradle and pitched pod) as one vertex-coloured geometry. */
export function samLauncherGeometry(): Part {
  const P = CONFIG.palette;
  const body = P.samBody;
  const dark = P.samBodyDark;
  const parts: Part[] = [
    // Octagonal plinth and armoured turntable with a hazard rim.
    cyl(0.56, 0.6, 0.12, 8, 0, 0.06, 0, dark),
    cyl(0.5, 0.54, 0.14, 8, 0, 0.19, 0, body),
    cyl(0.52, 0.52, 0.03, 8, 0, 0.135, 0, P.samHazard),
    // Front cab with a dark vision slit and sloped glacis.
    box(0.36, 0.16, 0.2, -0.17, 0.34, 0.26, body),
    box(0.3, 0.035, 0.02, -0.17, 0.37, 0.365, dark),
    // Cradle: two side arms holding the pod's trunnion, and an elevation ram.
    box(0.07, 0.24, 0.16, -0.27, 0.34, RACK.pivot.z, dark),
    box(0.07, 0.24, 0.16, 0.27, 0.34, RACK.pivot.z, dark),
    cyl(0.05, 0.05, 0.6, 6, 0, 0, 0, dark).rotateZ(Math.PI / 2).translate(0, RACK.pivot.y, RACK.pivot.z),
    box(0.06, 0.3, 0.06, 0, 0.36, 0.08, dark),
    // Radar mast at the rear right with a tilted panel array.
    box(0.05, 0.42, 0.05, 0.36, 0.47, -0.3, dark),
  ];
  const panel = merge([box(0.34, 0.26, 0.04, 0, 0, 0, dark), box(0.28, 0.2, 0.02, 0, 0, 0.022, P.samRadar), box(0.28, 0.025, 0.025, 0, 0, 0.03, dark)]);
  parts.push(panel.rotateX(-0.35).translate(0.38, 0.78, -0.3));
  parts.push(podGeometry());
  return merge(parts);
}

const _v = new THREE.Vector3();

/**
 * Mouth of tube k (0..3) in world units relative to the launcher's ground origin, for a launcher of `size`
 * yawed `yaw` (0 faces +Z; rotation about +Y).
 */
export function samMuzzle(k: number, yaw: number, size: number, out: THREE.Vector3): THREE.Vector3 {
  const { x, u } = tubeOffset(k);
  const c = Math.cos(RACK.pitch);
  const s = Math.sin(RACK.pitch);
  // Pod-local (x, mouth, -u) pitched about X: y' = y c + u s, z' = y s - u c.
  _v.set(x, RACK.pivot.y + RACK.mouth * c + u * s, RACK.pivot.z + RACK.mouth * s - u * c);
  return out.copy(_v).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiplyScalar(size);
}

/** Unit tube axis for a launcher yawed `yaw`: RACK.pitch above the horizon, toward the launcher's front. */
export function samLaunchDir(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(RACK.pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(RACK.pitch), Math.cos(yaw) * c);
}
