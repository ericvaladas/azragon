import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Laser Cannon Truck model, in units of the truck size (`CONFIG.truck.size`). Truck space is
 * +Z forward, +Y up, origin on the ground under the turret pivot (the truck's position).
 * Static parts merge into one vertex-coloured chassis; the turret (yaw), cannon (yaw + pitch)
 * and outrigger parts are separate geometries so they can move per instance.
 */

/** Top of the deck's turret ring, where the stowed turret sits. */
const RING_TOP = 0.42;
/** How far the turret pedestal lifts the turret when deployed. */
const RISE = 0.18;
/** Cannon trunnion height above the turret base. */
export const TRUNNION = 0.26;
/** Cannon pivot height when stowed and when deployed. */
export const PIVOT_STOWED = RING_TOP + TRUNNION;
export const PIVOT_DEPLOYED = RING_TOP + RISE + TRUNNION;
/** Cannon pivot to the emitter lens (the beam's origin). */
export const BARREL = 0.58;

/** Outrigger hinge z positions (front pair, rear pair) and the beam's height under the deck. */
export const LEG_Z = [0.4, -0.8] as const;
const BEAM_Y = 0.26;
const BEAM_LEN = 0.3;
const BEAM_IN = 0.14;
const BEAM_OUT = 0.43;
const JACK_STOWED = 0.06;
const PAD_H = 0.03;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w, h, d)).translate(x, y, z), color);
}

/** A cylinder whose axis runs along `axis`, centred at (x, y, z). */
function cyl(rTop: number, rBottom: number, h: number, seg: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x, y, z)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('truckModel: merge failed');
  return g;
}

/** Cab, windows, deck, frame, wheels, fenders, bumpers, lights and the turret ring. */
export function chassisGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [];
  // Three axles of chunky octagonal tyres with hub caps.
  for (const z of [0.8, -0.26, -0.58]) {
    for (const sx of [-1, 1]) {
      parts.push(cyl(0.15, 0.15, 0.17, 8, 'x', sx * 0.29, 0.15, z, P.truckTyre));
      parts.push(cyl(0.07, 0.07, 0.02, 6, 'x', sx * 0.385, 0.15, z, P.truckHub));
    }
  }
  // Frame rails and fuel tank / tool boxes between the axles.
  parts.push(box(0.44, 0.08, 1.86, 0, 0.21, 0.08, P.truckDark));
  for (const sx of [-1, 1]) parts.push(box(0.1, 0.12, 0.26, sx * 0.29, 0.22, 0.08, P.truckDark));
  parts.push(cyl(0.06, 0.06, 0.24, 6, 'z', 0.31, 0.2, 0.08, P.truckHub));
  // Flatbed deck with raised side rails, a power pack behind the cab, and the turret ring.
  parts.push(box(0.64, 0.08, 1.34, 0, 0.34, -0.11, P.truck));
  for (const sx of [-1, 1]) parts.push(box(0.04, 0.05, 1.34, sx * 0.3, 0.405, -0.11, P.truckDark));
  parts.push(box(0.5, 0.12, 0.16, 0, 0.44, 0.46, P.truckDark));
  for (const k of [0, 1, 2]) parts.push(box(0.52, 0.02, 0.17, 0, 0.41 + k * 0.04, 0.46, P.truckHub));
  parts.push(cyl(0.25, 0.27, 0.04, 8, 'y', 0, 0.4, 0, P.truckDark));
  // Cable drum and a stowage locker on the rear deck.
  parts.push(cyl(0.11, 0.11, 0.3, 8, 'x', 0, 0.49, -0.6, P.cable));
  for (const sx of [-1, 1]) parts.push(cyl(0.13, 0.13, 0.03, 8, 'x', sx * 0.16, 0.49, -0.6, P.truckDark));
  parts.push(box(0.2, 0.1, 0.16, 0.18, 0.43, -0.36, P.truckDark));
  // Fenders over the front wheels and the rear tandem.
  for (const sx of [-1, 1]) {
    parts.push(box(0.22, 0.04, 0.38, sx * 0.29, 0.33, 0.8, P.truckDark));
    parts.push(box(0.22, 0.04, 0.68, sx * 0.29, 0.32, -0.42, P.truckDark));
  }
  // Cab: body, dark window band, roof, slanted-looking windshield, grille, lights, bumper, antenna.
  parts.push(box(0.62, 0.3, 0.46, 0, 0.4, 0.83, P.truck));
  parts.push(box(0.63, 0.11, 0.4, 0, 0.6, 0.82, P.truckWindow));
  parts.push(box(0.62, 0.06, 0.42, 0, 0.68, 0.8, P.truck));
  parts.push(box(0.52, 0.1, 0.02, 0, 0.6, 1.025, P.truckGlass));
  parts.push(box(0.38, 0.1, 0.02, 0, 0.36, 1.065, P.truckDark));
  for (const sx of [-1, 1]) parts.push(box(0.08, 0.06, 0.02, sx * 0.24, 0.37, 1.065, P.truckLight));
  parts.push(box(0.68, 0.07, 0.07, 0, 0.21, 1.08, P.truckTyre));
  parts.push(box(0.34, 0.04, 0.1, 0, 0.73, 0.82, P.truckDark));
  parts.push(box(0.015, 0.22, 0.015, -0.25, 0.82, 0.64, P.truckTyre));
  // Rear bumper in hazard stripes, with tail lights.
  for (let k = 0; k < 5; k++) parts.push(box(0.13, 0.07, 0.06, -0.26 + k * 0.13, 0.2, -0.85, k % 2 ? P.samHazardDark : P.samHazard));
  for (const sx of [-1, 1]) parts.push(box(0.07, 0.04, 0.02, sx * 0.24, 0.32, -0.79, P.samTube));
  return merge(parts);
}

/** Turret: pedestal, platform, armoured housing with heat fins, capacitor coils, trunnion cheeks. Origin at the turret base centre. */
export function turretGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    cyl(0.12, 0.13, RISE + 0.04, 8, 'y', 0, -(RISE + 0.04) / 2, 0, P.truckHub),
    cyl(0.24, 0.26, 0.06, 8, 'y', 0, 0.03, 0, P.truck),
    box(0.34, 0.14, 0.34, 0, 0.13, -0.08, P.truck),
    box(0.3, 0.03, 0.3, 0, 0.215, -0.1, P.truckDark),
  ];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 5; k++) parts.push(box(0.07, 0.12, 0.022, sx * 0.2, 0.13, -0.22 + k * 0.065, P.truckDark));
    parts.push(cyl(0.05, 0.05, 0.16, 6, 'y', sx * 0.09, 0.3, -0.18, P.truckCoil));
    for (const y of [0.25, 0.3, 0.35]) parts.push(cyl(0.058, 0.058, 0.016, 6, 'y', sx * 0.09, y, -0.18, P.truckDark));
    parts.push(box(0.04, 0.16, 0.14, sx * 0.11, TRUNNION - 0.02, 0.02, P.truckDark));
  }
  return merge(parts);
}

/** Cannon: breech, barrel, focusing rings, emitter dish and lens along +Z. Origin at the trunnion pivot. */
export function cannonGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    box(0.16, 0.15, 0.22, 0, 0, -0.04, P.truckDark),
    cyl(0.05, 0.05, 0.4, 6, 'z', 0, 0, 0.27, P.truckHub),
    cyl(0.17, 0.07, 0.09, 8, 'z', 0, 0, BARREL - 0.06, P.truckDark),
    cyl(0.13, 0.13, 0.02, 8, 'z', 0, 0, BARREL - 0.01, P.truckGlass),
  ];
  for (const z of [0.14, 0.24, 0.34]) parts.push(cyl(0.085, 0.085, 0.04, 8, 'z', 0, 0, z, P.truck));
  return merge(parts);
}

/** A unit box (the outrigger beams, jacks and pads are scaled instances of it, tinted per instance). */
export function legGeometry(): Part {
  return faceted(new THREE.BoxGeometry(1, 1, 1));
}

const smooth = (a: number, b: number, u: number) => {
  const t = THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pose of the deployable parts for deploy amount `u` (0 stowed for driving, 1 deployed). */
export type DeployPose = {
  /** Outrigger beam centre distance from the truck's centre line. */
  beamX: number;
  /** Jack length below the beam. */
  jack: number;
  /** Cannon pivot height. */
  pivotY: number;
  /** Share of the aim's pitch the cannon shows (it lies flat when stowed). */
  pitch: number;
};

export function deployPose(u: number): DeployPose {
  const out = smooth(0, 0.45, u);
  const down = smooth(0.35, 0.75, u);
  return {
    beamX: BEAM_IN + (BEAM_OUT - BEAM_IN) * out,
    jack: JACK_STOWED + (BEAM_Y - PAD_H - JACK_STOWED) * down,
    pivotY: PIVOT_STOWED + RISE * smooth(0.5, 1, u),
    pitch: smooth(0.7, 1, u),
  };
}

/** Local boxes (centre, size, part) of one outrigger on side `sx` (±1) at hinge z `z`, for pose `p`. */
export function legBoxes(p: DeployPose, sx: number, z: number): { c: THREE.Vector3Tuple; s: THREE.Vector3Tuple; part: 'beam' | 'jack' | 'pad' }[] {
  const tip = sx * (p.beamX + BEAM_LEN / 2 - 0.03);
  return [
    { c: [sx * p.beamX, BEAM_Y, z], s: [BEAM_LEN, 0.07, 0.08], part: 'beam' },
    { c: [tip, BEAM_Y - p.jack / 2, z], s: [0.06, p.jack, 0.06], part: 'jack' },
    { c: [tip, BEAM_Y - p.jack - PAD_H / 2, z], s: [0.16, PAD_H, 0.16], part: 'pad' },
  ];
}
