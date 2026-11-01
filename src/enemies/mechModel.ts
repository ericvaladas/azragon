import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * The boss mech, a four-legged spider tank, in units of its standing height (1 tall, ground at y = 0, facing +Z, +X
 * its left). The body parts (hip frame, hull, turret, visor, cannons, glow) share one origin, the body pivot at bodyY
 * on the centre line. The four legs mount on the hip frame, a compact black pelvis plate at the body pivot's height; the
 * white hull sits on a short neck above it, carrying the turret, the launcher and the cannons. Each leg is two shared
 * parts drawn four times: the upper segment (origin at the hip, with its armoured hip drum) and the lower blade (origin
 * at the knee, ending in a spike foot). A leg part is built in its own vertical plane: +Z points out along the leg, +Y
 * up, and the knee bends about its X axis.
 */
/** The hull's base above the hip frame (body pivot units): it clears the tops of the hip drums. */
export const TORSO_BASE = 0.085;
/**
 * The turret, visor, cannons and hull light strips are laid out for a hull top at y = 0.095 and raised this far to sit
 * on the hull's top.
 */
const RISE = 0.155;
/** The hip frame plate's thickness, centred on the body pivot's height. */
export const HIP_FRAME_T = 0.035;
/** The hip frame plate's width (x) and depth (z): a compact core under the hull, smaller than it both ways. */
export const HIP_FRAME_W = 0.15;
export const HIP_FRAME_D = 0.3;

/**
 * The box launcher: `rows` rows of two tube caps (radius capR, rows pitch apart, columns ±capDX) on a dark face that
 * fits them with `margin` all round, under a white lid `lid` tall.
 */
export const LAUNCHER = { rows: 3, pitch: 0.055, capR: 0.018, capDX: 0.025, margin: 0.014, lid: 0.03, width: 0.11, depth: 0.15 } as const;
/** The launcher face's height: its rows of caps and their margin. */
export const LAUNCHER_FACE = 2 * LAUNCHER.margin + 2 * LAUNCHER.capR + (LAUNCHER.rows - 1) * LAUNCHER.pitch;

export const MECH_PIVOTS = {
  /** The body pivot's height; the hips and the hip frame sit at this height too. */
  bodyY: 0.45,
  /** The knee, from the hip, in the leg's plane at rest: out along the leg (z) and up (y). */
  kneeZ: 0.32,
  kneeY: -0.02,
  /** The foot (the spike's tip), from the knee, in the leg's plane at rest. */
  footZ: 0.18,
  footY: -0.43,
  /** The cannon muzzles, from the body pivot (the upper barrel at muzzleY[0], the lower at muzzleY[1]). */
  muzzleX: -0.1,
  muzzleY: [0.275 + RISE, 0.205 + RISE] as readonly number[],
  muzzleZ: 0.5,
  /** The back of the cannon mount, from the body pivot, where each shot vents its smoke. */
  breechZ: -0.07,
  /** The top of the box launcher, from the body pivot. */
  launcherX: 0.1,
  launcherY: 0.297 + RISE,
  launcherZ: -0.02,
} as const;

/** The box launcher's 2 × 3 tube mouths on its front face, from the body pivot, where the barrage missiles leave. */
export const MECH_TUBES: readonly { x: number; y: number; z: number }[] = Array.from({ length: LAUNCHER.rows }, (_, row) => row).flatMap((row) =>
  [-LAUNCHER.capDX, LAUNCHER.capDX].map((dx) => ({
    x: MECH_PIVOTS.launcherX + dx,
    y: MECH_PIVOTS.launcherY - LAUNCHER.lid - LAUNCHER.margin - LAUNCHER.capR - row * LAUNCHER.pitch,
    z: MECH_PIVOTS.launcherZ + LAUNCHER.depth / 2,
  })),
);

/** Each leg's hip on the hip frame (x, z, from the body pivot) and its splay at rest (rad about +Y; 0 faces +Z). */
export type MechLeg = { x: number; z: number; splay: number };
const SPLAY_FRONT = 0.85;
const SPLAY_BACK = Math.PI - SPLAY_FRONT;
/** The hips' offsets from the body pivot, inside the hip frame's corners. */
const HIP_X = 0.065;
const HIP_Z = 0.12;
/** Front-left, front-right, rear-left, rear-right. Diagonal pairs (0 with 3, 1 with 2) step together. */
export const MECH_LEGS: readonly MechLeg[] = [
  { x: HIP_X, z: HIP_Z, splay: SPLAY_FRONT },
  { x: -HIP_X, z: HIP_Z, splay: -SPLAY_FRONT },
  { x: HIP_X, z: -HIP_Z, splay: SPLAY_BACK },
  { x: -HIP_X, z: -HIP_Z, splay: -SPLAY_BACK },
];

/** How far out from its hip a standing foot rests (the knee's and the foot's reach out along the leg). */
export const LEG_REACH = MECH_PIVOTS.kneeZ + MECH_PIVOTS.footZ;
/** The upper and lower segment lengths, hip to knee and knee to foot. */
export const UPPER_LEN = Math.hypot(MECH_PIVOTS.kneeZ, MECH_PIVOTS.kneeY);
export const LOWER_LEN = Math.hypot(MECH_PIVOTS.footZ, MECH_PIVOTS.footY);

export type MechParts = {
  /** The hip frame the legs mount on, with the neck up to the hull and the coolant cradles beneath. */
  hips: THREE.BufferGeometry;
  hull: THREE.BufferGeometry;
  turret: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  cannons: THREE.BufferGeometry;
  /** The cyan-glowing pieces: launcher tube caps, coolant canisters under the hip frame and hull light strips. */
  glow: THREE.BufferGeometry;
  legUpper: THREE.BufferGeometry;
  legLower: THREE.BufferGeometry;
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

/**
 * A box beam in a leg's plane from (y0, z0) to (y1, z1), `w` wide across the plane (x, centred on `x`) and `t` thick
 * in it, tapering to `taper` of its section at the far end.
 */
function beam(y0: number, z0: number, y1: number, z1: number, w: number, t: number, color: number, taper = 1, x = 0): Part {
  const len = Math.hypot(y1 - y0, z1 - z0);
  const g = new THREE.BoxGeometry(w, t, len).translate(0, 0, len / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > len / 2) pos.setXY(i, pos.getX(i) * taper, pos.getY(i) * taper);
  }
  g.rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(x, y0, z0);
  return painted(faceted(g), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('mechModel: merge failed');
  return g;
}

/**
 * The hip frame at the body pivot's height: a flat gunmetal-black pelvis plate with a raised rim, narrower and shorter
 * than the hull, with a hip drum over each corner; a gunmetal neck up to the hull's base, and the coolant canister
 * cradles beneath (the glowing canisters are in the glow part).
 */
function hips(): Part {
  const P = CONFIG.palette;
  const T = HIP_FRAME_T;
  const parts: Part[] = [
    box(HIP_FRAME_W, T, HIP_FRAME_D, 0, 0, 0, P.mechFrame),
    box(HIP_FRAME_W - 0.04, 0.012, HIP_FRAME_D - 0.05, 0, T / 2 + 0.006, 0, P.mechDark),
    cyl(0.045, TORSO_BASE - T / 2, 12, 'y', 0, (TORSO_BASE + T / 2) / 2, 0, P.mechMetal),
    box(0.08, 0.02, 0.15, 0, TORSO_BASE - 0.01, 0, P.mechFrame),
  ];
  for (const sx of [-1, 1]) parts.push(box(0.016, 0.035, 0.1, sx * 0.025, -T / 2 - 0.0175, 0.02, P.mechMetal));
  return merge(parts);
}

/** The compact armoured hull on the neck above the hip frame: gunmetal core, white plates and antennas. */
function hull(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    box(0.15, 0.12, 0.34, 0, 0, 0, P.mechDark),
    box(0.13, 0.03, 0.28, 0, 0.07, -0.01, P.mech),
    // Sloped white glacis and a dark sensor slot across the nose.
    beam(-0.04, 0.17, 0.06, 0.13, 0.12, 0.04, P.mech),
    box(0.08, 0.012, 0.02, 0, 0.005, 0.18, P.mechMetal),
    // A rear engine block with vents.
    box(0.1, 0.09, 0.06, 0, 0.0, -0.19, P.mechMetal),
    box(0.08, 0.01, 0.062, 0, 0.02, -0.19, P.mechDark),
    box(0.08, 0.01, 0.062, 0, -0.01, -0.19, P.mechDark),
    // Panel lines on the top plate.
    box(0.006, 0.032, 0.24, 0.03, 0.071, -0.01, P.mechDark),
    box(0.006, 0.032, 0.24, -0.03, 0.071, -0.01, P.mechDark),
  ];
  for (const sx of [-1, 1]) {
    // White side armour with a dark band, and two antennas at the back.
    parts.push(box(0.02, 0.1, 0.3, sx * 0.083, 0.0, 0, P.mech));
    parts.push(box(0.022, 0.012, 0.3, sx * 0.083, -0.025, 0, P.mechDark));
    parts.push(box(0.008, 0.2, 0.008, sx * 0.055, 0.17, -0.16, P.mechMetal));
    parts.push(box(0.016, 0.02, 0.016, sx * 0.055, 0.08, -0.16, P.mechDark));
  }
  return merge(parts);
}

/**
 * The box launcher on the turret's left (+X), from the body pivot: a dark face fitted to its rows of tube caps (the
 * caps are in the glow part), a white lid over a dark seam, a white panel and a gunmetal hinge on its outer side.
 */
export function mechLauncher(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const L = LAUNCHER;
  const faceTop = V.launcherY - L.lid;
  const faceMid = faceTop - LAUNCHER_FACE / 2;
  return merge([
    box(L.width, LAUNCHER_FACE, L.depth, V.launcherX, faceMid, V.launcherZ, P.mechDark),
    box(L.width + 0.002, L.lid, L.depth + 0.002, V.launcherX, V.launcherY - L.lid / 2, V.launcherZ, P.mech),
    box(L.width + 0.004, 0.006, L.depth + 0.004, V.launcherX, faceTop, V.launcherZ, P.mechDark),
    box(0.012, LAUNCHER_FACE - 0.03, L.depth - 0.03, V.launcherX + L.width / 2 + 0.005, faceMid, V.launcherZ, P.mech),
    box(0.012, 0.05, 0.1, V.launcherX + L.width / 2 + 0.012, faceTop - LAUNCHER_FACE + 0.03, V.launcherZ, P.mechMetal),
  ]);
}

/**
 * The turret on the hull: a rotating ring, a white armoured block with the sensor head out front (its eye is the
 * visor part), and the box launcher on its left (+X) on a short arm.
 */
function turret(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    cyl(0.07, 0.04, 14, 'y', 0, 0.1, 0, P.mechMetal),
    box(0.1, 0.1, 0.22, 0, 0.17, -0.02, P.mech),
    box(0.11, 0.015, 0.2, 0, 0.115, -0.02, P.mechDark),
    box(0.07, 0.02, 0.14, 0, 0.23, -0.04, P.mechDark),
    // Sensor head: a dark block, a white brow and a lens barrel round the eye.
    box(0.08, 0.07, 0.09, -0.01, 0.17, 0.12, P.mechDark),
    box(0.09, 0.025, 0.1, -0.01, 0.215, 0.12, P.mech),
    cyl(0.03, 0.03, 10, 'z', 0.02, 0.17, 0.17, P.mechMetal),
    cyl(0.016, 0.03, 8, 'z', -0.035, 0.155, 0.17, P.mechMetal),
    box(0.006, 0.12, 0.006, -0.04, 0.28, -0.08, P.mechMetal),
    // The launcher arm, low on the turret ring's side.
    box(0.04, 0.05, 0.08, 0.06, 0.115, -0.02, P.mechDark),
  ];
  return merge([merge(parts).translate(0, RISE, 0), mechLauncher()]);
}

/** Twin long cannons on the turret's right (−X), one over the other: white sleeves, gunmetal barrels, muzzle brakes. */
function cannons(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const x = V.muzzleX;
  const parts: Part[] = [box(0.07, 0.13, 0.14, x + 0.015, 0.24 + RISE, 0.0, P.mechDark), box(0.04, 0.04, 0.06, -0.07, 0.22 + RISE, 0.0, P.mechMetal)];
  for (const y of V.muzzleY) {
    parts.push(box(0.05, 0.05, 0.2, x, y, 0.17, P.mech));
    parts.push(box(0.052, 0.012, 0.2, x, y - 0.012, 0.17, P.mechDark));
    parts.push(cyl(0.015, 0.2, 8, 'z', x, y, 0.37, P.mechMetal));
    parts.push(box(0.035, 0.035, 0.04, x, y, V.muzzleZ - 0.02, P.mechDark));
  }
  return merge(parts);
}

/** The cyan glows: the launcher's 2 × 3 tube caps, two coolant canisters under the hip frame, and light strips. */
function glow(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [];
  for (const t of MECH_TUBES) parts.push(cyl(LAUNCHER.capR, 0.01, 8, 'z', t.x, t.y, t.z, P.mechGlow));
  for (const sx of [-1, 1]) {
    parts.push(cyl(0.022, 0.1, 8, 'z', sx * 0.045, -HIP_FRAME_T / 2 - 0.025, 0.02, P.mechGlow));
    // On the side armour of the scaled-up hull.
    parts.push(box(0.004, 0.012, 0.2, sx * 0.106, 0.017 + RISE, 0, P.mechGlow));
  }
  parts.push(box(0.01, 0.01, 0.06, -0.12, 0.265 + RISE, 0.0, P.mechGlow));
  return merge(parts);
}

/** The upper leg from the hip: an armoured hip drum and a thick white beam out to the knee. */
function legUpper(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  return merge([
    cyl(0.06, 0.11, 12, 'x', 0, 0, 0, P.mech),
    cyl(0.036, 0.13, 10, 'x', 0, 0, 0, P.mechMetal),
    box(0.114, 0.012, 0.096, 0, 0.0, 0, P.mechDark),
    beam(0, 0, V.kneeY, V.kneeZ, 0.105, 0.105, P.mech, 0.85),
    beam(-0.045, 0.02, V.kneeY - 0.045, V.kneeZ, 0.111, 0.0375, P.mechDark),
    // A hydraulic ram under the beam.
    beam(-0.06, 0.03, V.kneeY - 0.075, V.kneeZ - 0.03, 0.0375, 0.0375, P.mechMetal),
  ]);
}

/** The lower leg from the knee: a knee joint and cap, a long thick tapered white blade with a dark spine, and a spike foot. */
function legLower(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const len = Math.hypot(V.footY, V.footZ);
  const dy = V.footY / len;
  const dz = V.footZ / len;
  const spike = 0.08;
  const by = V.footY - dy * spike;
  const bz = V.footZ - dz * spike;
  const tip = new THREE.ConeGeometry(0.03, spike, 6).rotateX(Math.PI).translate(0, -spike / 2, 0);
  // Point the cone's tip along the leg, ending on the foot.
  tip.rotateX(-Math.atan2(dz, -dy)).translate(0, V.footY - dy * spike, V.footZ - dz * spike);
  return merge([
    cyl(0.0625, 0.15, 10, 'x', 0, 0, 0, P.mechMetal),
    box(0.12, 0.07, 0.13, 0, 0.045, 0.005, P.mech),
    beam(0, 0, by, bz, 0.09, 0.15, P.mech, 0.35),
    beam(-0.03, -0.06, by * 0.7, bz * 0.7 - 0.06, 0.096, 0.045, P.mechDark, 0.6),
    beam(-0.05, 0.05, -0.26, 0.13, 0.03, 0.03, P.mechMetal),
    box(0.099, 0.03, 0.09, 0, -0.18, 0.07, P.mechDark),
    painted(faceted(tip), P.mechMetal),
  ]);
}

export function mechParts(): MechParts {
  const P = CONFIG.palette;
  return {
    hips: hips(),
    // The hull is laid out a little small about its own centre, scaled up, and set with its base TORSO_BASE above the
    // hip frame.
    hull: hull().scale(1.12, 1.12, 1.12).translate(0, TORSO_BASE + 0.06 * 1.12, 0),
    turret: turret(),
    visor: cyl(0.02, 0.012, 10, 'z', 0.02, 0.17 + RISE, 0.188, P.mechVisor),
    cannons: cannons(),
    glow: glow(),
    legUpper: legUpper(),
    legLower: legLower(),
  };
}
