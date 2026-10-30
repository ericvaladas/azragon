import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../../config';
import { faceted, painted } from '../../render/toon';

const T = CONFIG.wendigo.ultimate.t;
const C = CONFIG.wendigo.colors;

/** A figure's life runs from the emerge beat to the end of the drag; the grasp and the drag start fall here (0..1). */
const LIFE = T.dragTo - T.emergeFrom;
export const DEMON_GRASP = (T.grasp - T.emergeFrom) / LIFE;
const DRAG = (T.dragFrom - T.emergeFrom) / LIFE;
/** Fraction of the life the claws take to close on the victim. */
const CLOSE = 0.08;
/** Where the claws close, in figure units (+Z forward, +Y up, feet at the origin). */
export const DEMON_CLAW = { y: 0.85, z: 0.55 } as const;

type Part = THREE.BufferGeometry;
type V3 = [number, number, number];

/** A w×h box stretched from `a` to `b`. */
function beam(a: V3, b: V3, w: number, h: number, color: number): Part {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const m = new THREE.Matrix4().lookAt(to, from, THREE.Object3D.DEFAULT_UP).setPosition(from.clone().add(to).multiplyScalar(0.5));
  return painted(faceted(new THREE.BoxGeometry(w, h, from.distanceTo(to)).applyMatrix4(m)), color);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), color);
}

/** One side's long arm (sx = +1 is the figure's left), ending in three hooked claws reaching ahead. */
function arm(sx: number): Part[] {
  const shoulder: V3 = [0.13 * sx, 0.66, 0.1];
  const elbow: V3 = [0.2 * sx, 0.7, 0.3];
  const wrist: V3 = [0.1 * sx, DEMON_CLAW.y - 0.02, DEMON_CLAW.z - 0.08];
  const parts = [beam(shoulder, elbow, 0.05, 0.05, C.demon), beam(elbow, wrist, 0.04, 0.04, C.demon), box(0.07, 0.03, 0.07, wrist[0], wrist[1], wrist[2], C.demon)];
  for (let k = -1; k <= 1; k++) {
    const tip: V3 = [wrist[0] + 0.03 * k - 0.02 * sx, DEMON_CLAW.y + 0.03, DEMON_CLAW.z + 0.06];
    parts.push(beam(wrist, tip, 0.015, 0.015, C.demonRim));
  }
  return parts;
}

/**
 * A demonic figure of Devour, 1 unit tall, feet at the origin, facing +Z: a hunched, emaciated near-black body on
 * thin legs, a skull-like head with two swept horns and glowing eyes, and two long arms reaching forward and up into
 * hooked claws (closing at DEMON_CLAW). One vertex-coloured geometry.
 */
export function demonGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    // Legs, bent under the hunch.
    beam([0.07, 0, -0.02], [0.08, 0.2, 0.06], 0.05, 0.05, C.demon),
    beam([0.08, 0.2, 0.06], [0.06, 0.36, -0.02], 0.05, 0.05, C.demon),
    beam([-0.07, 0, -0.02], [-0.08, 0.2, 0.06], 0.05, 0.05, C.demon),
    beam([-0.08, 0.2, 0.06], [-0.06, 0.36, -0.02], 0.05, 0.05, C.demon),
    // Hips, a hunched ribcage, the spine ridge.
    box(0.16, 0.06, 0.08, 0, 0.37, -0.02, C.demon),
    beam([0, 0.38, -0.02], [0, 0.68, 0.12], 0.2, 0.12, C.demon),
    beam([0, 0.42, -0.07], [0, 0.72, 0.06], 0.04, 0.05, C.demonRim),
    // Neck and head, thrust forward.
    beam([0, 0.68, 0.12], [0, 0.76, 0.22], 0.05, 0.05, C.demon),
    box(0.11, 0.1, 0.13, 0, 0.78, 0.26, C.demon),
    box(0.07, 0.04, 0.06, 0, 0.74, 0.33, C.demonRim),
    box(0.025, 0.02, 0.01, 0.03, 0.79, 0.33, C.demonEye),
    box(0.025, 0.02, 0.01, -0.03, 0.79, 0.33, C.demonEye),
    // Horns sweeping up and back.
    beam([0.04, 0.82, 0.24], [0.1, 0.92, 0.18], 0.025, 0.025, C.demonRim),
    beam([0.1, 0.92, 0.18], [0.12, 1, 0.08], 0.018, 0.018, C.demonRim),
    beam([-0.04, 0.82, 0.24], [-0.1, 0.92, 0.18], 0.025, 0.025, C.demonRim),
    beam([-0.1, 0.92, 0.18], [-0.12, 1, 0.08], 0.018, 0.018, C.demonRim),
    ...arm(1),
    ...arm(-1),
  ];
  const g = mergeGeometries(parts);
  if (!g) throw new Error('demonModel: merge failed');
  // The legs' thickness dips just below the feet: stand the lowest point on the ground.
  g.computeBoundingBox();
  return g.translate(0, -g.boundingBox!.min.y, 0);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

/** A figure's pose at life fraction u: risen out of the ground by the grasp, reaching, clutching from the grasp, sinking over the drag. */
export function demonPose(u: number): { rise: number; reach: number; clutch: number; sink: number } {
  return {
    rise: u >= DEMON_GRASP ? 1 : smooth(u / DEMON_GRASP),
    reach: smooth(u / DEMON_GRASP) * (1 - smooth((u - DRAG) / (1 - DRAG))),
    clutch: u <= DEMON_GRASP ? 0 : smooth((u - DEMON_GRASP) / CLOSE),
    sink: u <= DRAG ? 0 : smooth((u - DRAG) / (1 - DRAG)),
  };
}

/** A figure's life fraction at Devour time t. */
export function demonLife(t: number): number {
  return clamp01((t - T.emergeFrom) / LIFE);
}
