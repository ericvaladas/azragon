import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * The boss mech, a chunky bipedal combat walker, in units of its standing height (1 tall, ground at y = 0, facing +Z,
 * +X its left). Each part is one merged, vertex-coloured geometry whose origin is its pivot (MECH_PIVOTS), so it can
 * be rotated in place: armoured legs with big feet and hazard-striped shins (at the hips), the pelvis (at hip height),
 * the torso with panel lines, rivets, warning lights, a back pack and two shoulder missile pods with tube faces (at
 * the waist), the small cockpit head (at the neck) and its visor slit (a separate part, at the neck, so it can glow),
 * and two heavy arms ending in big fists that hang a little forward of the chest (at the shoulders).
 */
export const MECH_PIVOTS = {
  hipY: 0.46,
  /** Each hip's distance out from the centre line. */
  hipX: 0.085,
  waistY: 0.5,
  neckY: 0.86,
  shoulderY: 0.79,
  shoulderX: 0.17,
  /** Missile pod launch face, in the torso's frame (from the waist): height, distance out, forward. */
  podY: 0.36,
  podX: 0.085,
  podZ: 0.015,
} as const;

export type MechParts = {
  pelvis: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  armL: THREE.BufferGeometry;
  armR: THREE.BufferGeometry;
  legL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry;
};

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

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('mechModel: merge failed');
  return g;
}

/** Alternating yellow and black bands, `n` of them `h` tall, stacked up from y0 on a w × d plate centred at (x, z). */
function hazardBands(n: number, w: number, h: number, d: number, x: number, y0: number, z: number): Part[] {
  const P = CONFIG.palette;
  const out: Part[] = [];
  for (let k = 0; k < n; k++) out.push(box(w, h, d, x, y0 + h * (k + 0.5), z, k % 2 ? P.gustavHazardDark : P.gustavHazard));
  return out;
}

/** One leg from the hip pivot down to the ground (hipY below it); `side` is +1 for the left leg, −1 for the right. */
function leg(side: number): Part {
  const P = CONFIG.palette;
  const H = MECH_PIVOTS.hipY;
  const out = side * 0.012;
  return merge([
    cyl(0.045, 0.11, 10, 'x', 0, 0, 0, P.mechMetal),
    // Thigh with an outer armour plate.
    box(0.1, 0.2, 0.12, 0, -0.12, 0, P.mech),
    box(0.02, 0.15, 0.1, out + side * 0.05, -0.12, 0, P.mechDark),
    // Knee cap.
    box(0.11, 0.06, 0.13, 0, -0.245, 0.025, P.mechDark),
    cyl(0.035, 0.12, 8, 'x', 0, -0.245, 0, P.mechMetal),
    // Shin with hazard bands on its front and a piston behind.
    box(0.11, 0.17, 0.13, 0, -0.35, 0, P.mech),
    ...hazardBands(4, 0.08, 0.025, 0.012, 0, -0.39, 0.068),
    cyl(0.014, 0.14, 6, 'y', 0, -0.33, -0.075, P.mechMetal),
    // Ankle and the big flat foot with a toe plate and heel spur.
    box(0.08, 0.04, 0.09, 0, -0.425, 0, P.mechMetal),
    box(0.14, 0.05, 0.24, 0, -H + 0.025, 0.04, P.mechDark),
    box(0.13, 0.025, 0.06, 0, -H + 0.062, 0.13, P.mech),
    box(0.09, 0.035, 0.05, 0, -H + 0.0175, -0.1, P.mechMetal),
  ]);
}

/** One arm from the shoulder pivot down to the fist; `side` is +1 for the left arm, −1 for the right. */
function arm(side: number): Part {
  const P = CONFIG.palette;
  const out = side * 0.02;
  return merge([
    // Shoulder pauldron with a hazard band along its edge and a warning light.
    box(0.11, 0.09, 0.15, out, 0.02, 0, P.mech),
    ...hazardBands(2, 0.112, 0.012, 0.152, out, -0.035, 0),
    box(0.02, 0.015, 0.02, out + side * 0.03, 0.072, -0.04, P.mechLight),
    // Upper arm, elbow and a heavy forearm angled forward.
    box(0.065, 0.18, 0.075, 0, -0.12, 0, P.mechMetal),
    cyl(0.04, 0.09, 8, 'x', 0, -0.22, 0.01, P.mechDark),
    box(0.1, 0.16, 0.11, 0, -0.3, 0.045, P.mech),
    box(0.104, 0.02, 0.114, 0, -0.24, 0.045, P.mechDark),
    // The big fist: a knuckle block, knuckle plate and thumb.
    box(0.12, 0.1, 0.12, 0, -0.42, 0.09, P.mechDark),
    box(0.11, 0.035, 0.03, 0, -0.4, 0.155, P.mechMetal),
    box(0.03, 0.05, 0.05, -side * 0.065, -0.41, 0.1, P.mechMetal),
  ]);
}

function torso(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const parts: Part[] = [
    // Armoured abdomen, chest and collar.
    box(0.16, 0.09, 0.15, 0, 0.045, 0, P.mechMetal),
    box(0.24, 0.22, 0.22, 0, 0.2, 0, P.mech),
    box(0.2, 0.05, 0.18, 0, 0.335, -0.01, P.mechDark),
    // Chest plate with panel lines, a vent and a row of rivets.
    box(0.18, 0.14, 0.02, 0, 0.21, 0.115, P.mech),
    box(0.006, 0.14, 0.022, 0, 0.21, 0.116, P.mechDark),
    box(0.18, 0.006, 0.022, 0, 0.17, 0.116, P.mechDark),
    box(0.1, 0.03, 0.012, 0, 0.115, 0.12, P.mechMetal),
    // Back pack (the reactor) with an exhaust either side.
    box(0.16, 0.16, 0.07, 0, 0.21, -0.14, P.mechDark),
    // Warning lights on the collar.
    box(0.02, 0.015, 0.02, 0.085, 0.365, 0.06, P.mechLight),
    box(0.02, 0.015, 0.02, -0.085, 0.365, 0.06, P.mechLight),
  ];
  for (const sx of [-1, 1]) {
    parts.push(box(0.006, 0.18, 0.2, sx * 0.121, 0.2, 0, P.mechDark));
    for (const y of [0.14, 0.19, 0.24]) parts.push(box(0.012, 0.012, 0.012, sx * 0.075, y, 0.127, P.mechMetal));
    parts.push(cyl(0.018, 0.08, 8, 'y', sx * 0.05, 0.3, -0.17, P.mechMetal));
    // Shoulder missile pod: a box launcher with hazard bands on its outer side and a 2 × 2 grid of tube mouths.
    const x = sx * V.podX;
    parts.push(box(0.07, 0.11, 0.12, x, V.podY, V.podZ - 0.06, P.mechDark));
    parts.push(...hazardBands(4, 0.006, 0.02, 0.1, x + sx * 0.036, V.podY - 0.04, V.podZ - 0.06));
    for (const dx of [-0.017, 0.017]) for (const dy of [-0.025, 0.025]) parts.push(cyl(0.013, 0.01, 8, 'z', x + dx, V.podY + dy, V.podZ, P.mechMetal));
  }
  return merge(parts);
}

/** The small cockpit head on its neck, with an antenna and a warning light (the visor slit is its own part). */
function head(): Part {
  const P = CONFIG.palette;
  return merge([
    cyl(0.03, 0.03, 8, 'y', 0, 0.015, 0, P.mechMetal),
    box(0.09, 0.07, 0.1, 0, 0.065, 0.01, P.mech),
    box(0.08, 0.02, 0.012, 0, 0.068, 0.062, P.mechDark),
    box(0.094, 0.012, 0.104, 0, 0.098, 0.01, P.mechDark),
    box(0.006, 0.04, 0.006, 0.03, 0.12, -0.02, P.mechMetal),
    box(0.016, 0.012, 0.016, -0.02, 0.11, -0.01, P.mechLight),
  ]);
}

export function mechParts(): MechParts {
  const P = CONFIG.palette;
  return {
    pelvis: merge([
      box(0.2, 0.1, 0.16, 0, 0, 0, P.mechDark),
      box(0.22, 0.05, 0.03, 0, -0.02, 0.085, P.mech),
      ...hazardBands(1, 0.08, 0.02, 0.01, 0, -0.03, 0.102),
    ]),
    torso: torso(),
    head: head(),
    visor: box(0.07, 0.012, 0.006, 0, 0.068, 0.069, P.mechVisor),
    armL: arm(1),
    armR: arm(-1),
    legL: leg(1),
    legR: leg(-1),
  };
}
