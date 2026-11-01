import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * The boss mech, a four-legged spider tank, in units of its standing height (1 tall, ground at y = 0, facing +Z, +X
 * its left). The body parts (hull, turret, visor, cannons, glow) share one origin, the body pivot at bodyY on the
 * centre line. Each leg is two shared parts drawn four times: the upper segment (origin at the hip, with its armoured
 * hip drum) and the lower blade (origin at the knee, ending in a spike foot). A leg part is built in its own vertical
 * plane: +Z points out along the leg, +Y up, and the knee bends about its X axis.
 */
export const MECH_PIVOTS = {
  /** The body pivot's height; the hips sit at this height too. */
  bodyY: 0.56,
  /** The knee, from the hip, in the leg's plane at rest: out along the leg (z) and up (y). */
  kneeZ: 0.26,
  kneeY: -0.02,
  /** The foot (the spike's tip), from the knee, in the leg's plane at rest. */
  footZ: 0.18,
  footY: -0.54,
  /** The cannon muzzles, from the body pivot (the upper barrel at muzzleY[0], the lower at muzzleY[1]). */
  muzzleX: -0.15,
  muzzleY: [0.275, 0.205] as readonly number[],
  muzzleZ: 0.5,
  /** The top of the box launcher, from the body pivot. */
  launcherX: 0.15,
  launcherY: 0.44,
  launcherZ: -0.02,
} as const;

/** The box launcher's 2 × 3 tube mouths on its front face, from the body pivot, where the barrage missiles leave. */
export const MECH_TUBES: readonly { x: number; y: number; z: number }[] = [0, 1, 2].flatMap((row) =>
  [-0.025, 0.025].map((dx) => ({ x: MECH_PIVOTS.launcherX + dx, y: 0.335 - row * 0.055, z: MECH_PIVOTS.launcherZ + 0.075 })),
);

/** Each leg's hip on the hull (x, z, from the body pivot) and its splay at rest (rad about +Y; 0 faces +Z). */
export type MechLeg = { x: number; z: number; splay: number };
const SPLAY_FRONT = 0.75;
const SPLAY_BACK = Math.PI - 0.75;
/** Front-left, front-right, rear-left, rear-right. Diagonal pairs (0 with 3, 1 with 2) step together. */
export const MECH_LEGS: readonly MechLeg[] = [
  { x: 0.14, z: 0.13, splay: SPLAY_FRONT },
  { x: -0.14, z: 0.13, splay: -SPLAY_FRONT },
  { x: 0.14, z: -0.13, splay: SPLAY_BACK },
  { x: -0.14, z: -0.13, splay: -SPLAY_BACK },
];

/** How far out from its hip a standing foot rests (the knee's and the foot's reach out along the leg). */
export const LEG_REACH = MECH_PIVOTS.kneeZ + MECH_PIVOTS.footZ;
/** The upper and lower segment lengths, hip to knee and knee to foot. */
export const UPPER_LEN = Math.hypot(MECH_PIVOTS.kneeZ, MECH_PIVOTS.kneeY);
export const LOWER_LEN = Math.hypot(MECH_PIVOTS.footZ, MECH_PIVOTS.footY);

export type MechParts = {
  hull: THREE.BufferGeometry;
  turret: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  cannons: THREE.BufferGeometry;
  /** The cyan-glowing pieces: launcher tube caps, coolant canisters and hull light strips. */
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

/** The compact armoured hull slung between the hips: gunmetal core, white plates, hip sockets and antennas. */
function hull(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    box(0.3, 0.14, 0.34, 0, -0.01, 0, P.mechDark),
    box(0.26, 0.03, 0.28, 0, 0.07, -0.01, P.mech),
    box(0.2, 0.06, 0.24, 0, -0.1, 0, P.mechMetal),
    // Sloped white glacis and a dark sensor slot across the nose.
    beam(-0.06, 0.17, 0.06, 0.13, 0.24, 0.04, P.mech),
    box(0.16, 0.012, 0.02, 0, 0.005, 0.18, P.mechMetal),
    // A rear engine block with vents.
    box(0.2, 0.09, 0.06, 0, 0.0, -0.19, P.mechMetal),
    box(0.16, 0.01, 0.062, 0, 0.02, -0.19, P.mechDark),
    box(0.16, 0.01, 0.062, 0, -0.01, -0.19, P.mechDark),
    // Panel lines on the top plate.
    box(0.006, 0.032, 0.24, 0.06, 0.071, -0.01, P.mechDark),
    box(0.006, 0.032, 0.24, -0.06, 0.071, -0.01, P.mechDark),
  ];
  for (const sx of [-1, 1]) {
    // White side armour with a dark band, and two antennas at the back.
    parts.push(box(0.02, 0.08, 0.16, sx * 0.158, 0.0, 0, P.mech));
    parts.push(box(0.022, 0.012, 0.16, sx * 0.158, -0.025, 0, P.mechDark));
    parts.push(box(0.008, 0.2, 0.008, sx * 0.11, 0.17, -0.16, P.mechMetal));
    parts.push(box(0.016, 0.02, 0.016, sx * 0.11, 0.08, -0.16, P.mechDark));
  }
  for (const leg of MECH_LEGS) parts.push(cyl(0.055, 0.1, 10, 'y', leg.x, 0, leg.z, P.mechMetal));
  // Coolant canister cradles under the hull (the glowing canisters are in the glow part).
  for (const sx of [-1, 1]) parts.push(box(0.02, 0.05, 0.1, sx * 0.03, -0.14, 0.02, P.mechMetal));
  return merge(parts);
}

/**
 * The turret on the hull: a rotating ring, a white armoured block with the sensor head out front (its eye is the
 * visor part), and the box launcher on its left (+X) with a gunmetal frame and white panels.
 */
function turret(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const parts: Part[] = [
    cyl(0.1, 0.04, 14, 'y', 0, 0.1, 0, P.mechMetal),
    box(0.18, 0.1, 0.22, 0, 0.17, -0.02, P.mech),
    box(0.19, 0.015, 0.2, 0, 0.115, -0.02, P.mechDark),
    box(0.12, 0.02, 0.14, 0, 0.23, -0.04, P.mechDark),
    // Sensor head: a dark block, a white brow and a lens barrel round the eye.
    box(0.12, 0.07, 0.09, -0.01, 0.17, 0.12, P.mechDark),
    box(0.13, 0.025, 0.1, -0.01, 0.215, 0.12, P.mech),
    cyl(0.03, 0.03, 10, 'z', 0.02, 0.17, 0.17, P.mechMetal),
    cyl(0.016, 0.03, 8, 'z', -0.035, 0.155, 0.17, P.mechMetal),
    box(0.006, 0.12, 0.006, -0.05, 0.28, -0.08, P.mechMetal),
    // The launcher arm and the box launcher.
    box(0.05, 0.05, 0.08, 0.09, 0.2, -0.02, P.mechDark),
    box(0.11, 0.26, 0.15, V.launcherX, V.launcherY - 0.13, V.launcherZ, P.mechDark),
    box(0.012, 0.2, 0.12, V.launcherX + 0.06, V.launcherY - 0.13, V.launcherZ, P.mech),
    box(0.1, 0.06, 0.14, V.launcherX, V.launcherY - 0.03, V.launcherZ - 0.005, P.mech),
    box(0.112, 0.012, 0.152, V.launcherX, V.launcherY - 0.006, V.launcherZ, P.mechDark),
    box(0.012, 0.06, 0.1, V.launcherX + 0.067, V.launcherY - 0.22, V.launcherZ, P.mechMetal),
  ];
  return merge(parts);
}

/** Twin long cannons on the turret's right (−X), one over the other: white sleeves, gunmetal barrels, muzzle brakes. */
function cannons(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const x = V.muzzleX;
  const parts: Part[] = [box(0.06, 0.13, 0.14, x + 0.01, 0.24, 0.0, P.mechDark), box(0.04, 0.04, 0.06, -0.09, 0.22, 0.0, P.mechMetal)];
  for (const y of V.muzzleY) {
    parts.push(box(0.05, 0.05, 0.2, x, y, 0.17, P.mech));
    parts.push(box(0.052, 0.012, 0.2, x, y - 0.012, 0.17, P.mechDark));
    parts.push(cyl(0.015, 0.2, 8, 'z', x, y, 0.37, P.mechMetal));
    parts.push(box(0.035, 0.035, 0.04, x, y, V.muzzleZ - 0.02, P.mechDark));
  }
  return merge(parts);
}

/** The cyan glows: the launcher's 2 × 3 tube caps, two coolant canisters under the hull, and light strips. */
function glow(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [];
  for (const t of MECH_TUBES) parts.push(cyl(0.018, 0.01, 8, 'z', t.x, t.y, t.z, P.mechGlow));
  for (const sx of [-1, 1]) {
    parts.push(cyl(0.028, 0.1, 8, 'z', sx * 0.06, -0.165, 0.02, P.mechGlow));
    // On the side armour of the scaled-up hull.
    parts.push(box(0.004, 0.012, 0.11, sx * 0.19, 0.017, 0, P.mechGlow));
  }
  parts.push(box(0.01, 0.01, 0.06, -0.12, 0.265, 0.0, P.mechGlow));
  return merge(parts);
}

/** The upper leg from the hip: an armoured hip drum and a white beam out to the knee. */
function legUpper(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  return merge([
    cyl(0.07, 0.1, 12, 'x', 0, 0, 0, P.mech),
    cyl(0.04, 0.12, 10, 'x', 0, 0, 0, P.mechMetal),
    box(0.104, 0.012, 0.11, 0, 0.0, 0, P.mechDark),
    beam(0, 0, V.kneeY, V.kneeZ, 0.07, 0.07, P.mech, 0.85),
    beam(-0.03, 0.02, V.kneeY - 0.03, V.kneeZ, 0.074, 0.025, P.mechDark),
    // A hydraulic ram under the beam.
    beam(-0.04, 0.03, V.kneeY - 0.05, V.kneeZ - 0.03, 0.025, 0.025, P.mechMetal),
  ]);
}

/** The lower leg from the knee: a knee joint and cap, a long tapered white blade with a dark spine, and a spike foot. */
function legLower(): Part {
  const P = CONFIG.palette;
  const V = MECH_PIVOTS;
  const len = Math.hypot(V.footY, V.footZ);
  const dy = V.footY / len;
  const dz = V.footZ / len;
  const spike = 0.08;
  const by = V.footY - dy * spike;
  const bz = V.footZ - dz * spike;
  const tip = new THREE.ConeGeometry(0.02, spike, 6).rotateX(Math.PI).translate(0, -spike / 2, 0);
  // Point the cone's tip along the leg, ending on the foot.
  tip.rotateX(-Math.atan2(dz, -dy)).translate(0, V.footY - dy * spike, V.footZ - dz * spike);
  return merge([
    cyl(0.045, 0.1, 10, 'x', 0, 0, 0, P.mechMetal),
    box(0.08, 0.05, 0.09, 0, 0.035, 0.005, P.mech),
    beam(0, 0, by, bz, 0.06, 0.1, P.mech, 0.35),
    beam(-0.02, -0.04, by * 0.7, bz * 0.7 - 0.04, 0.064, 0.03, P.mechDark, 0.6),
    beam(-0.05, 0.03, -0.26, 0.1, 0.02, 0.02, P.mechMetal),
    box(0.066, 0.02, 0.06, 0, -0.18, 0.06, P.mechDark),
    painted(faceted(tip), P.mechMetal),
  ]);
}

export function mechParts(): MechParts {
  const P = CONFIG.palette;
  return {
    // The hull is laid out a little small and scaled up about the body pivot to fill out the body between the hips.
    hull: hull().scale(1.12, 1.12, 1.12),
    turret: turret(),
    visor: cyl(0.02, 0.012, 10, 'z', 0.02, 0.17, 0.188, P.mechVisor),
    cannons: cannons(),
    glow: glow(),
    legUpper: legUpper(),
    legLower: legLower(),
  };
}
