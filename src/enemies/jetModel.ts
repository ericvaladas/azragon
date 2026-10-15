import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Low-poly fighter jet model in world metres (CONFIG.jet.size is nose-to-nozzle length). Jet space is +Z forward,
 * +Y up, origin at the fuselage's centre. The airframe is one vertex-coloured mesh: gunmetal above, pale grey
 * below. The afterburner glow is a separate mesh so it can be drawn unlit.
 */
const S = CONFIG.jet.size;

/** Nose tip and nozzle exit (z), and the wingtip half-span (x), as fractions of S. */
export const JET_DIMS = { nose: 0.5, tail: -0.5, halfSpan: 0.46, finTop: 0.27 } as const;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w * S, h * S, d * S)).translate(x * S, y * S, z * S), color);
}

/** A cylinder along Z (radius rFront toward +Z), centred at (x, y, z). */
function tube(rFront: number, rBack: number, len: number, seg: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rFront * S, rBack * S, len * S, seg).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x * S, y * S, z * S)), color);
}

/** A flat plate whose planform is the polygon `xz` (fractions of S, in the XZ plane), `t` thick, centred on y. */
function plate(xz: [number, number][], t: number, y: number, color: number): Part {
  const shape = new THREE.Shape(xz.map(([x, z]) => new THREE.Vector2(x * S, z * S)));
  // Shape (x, y) extruded along +Z; rotating +90° about X sends shape y to world z and the extrusion to world -y.
  const g = new THREE.ExtrudeGeometry(shape, { depth: t * S, bevelEnabled: false }).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(0, (y + t / 2) * S, 0)), color);
}

/** A thin vertical fin whose side profile is the polygon `zy` (fractions of S), `t` thick, centred on x. */
function fin(zy: [number, number][], t: number, x: number, color: number): Part {
  const shape = new THREE.Shape(zy.map(([z, y]) => new THREE.Vector2(z * S, y * S)));
  // Shape (x, y) extruded along +Z; rotating -90° about Y sends shape x to world z and the extrusion to world -x.
  const g = new THREE.ExtrudeGeometry(shape, { depth: t * S, bevelEnabled: false }).rotateY(-Math.PI / 2);
  return painted(faceted(g.translate((x + t / 2) * S, 0, 0)), color);
}

/** Mirror a right-hand (+x) planform to the left. */
const mirror = (xz: [number, number][]): [number, number][] => xz.map(([x, z]) => [-x, z] as [number, number]).reverse();

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('jetModel: merge failed');
  return g;
}

/**
 * Fuselage with a pointed nose and pale belly, bubble canopy, chin intake, swept delta wings with leading-edge
 * strakes and wingtip missiles, swept tailplanes, one tall fin, and a dark engine nozzle.
 */
export function jetGeometry(): Part {
  const P = CONFIG.palette;
  const top = P.jet;
  const belly = P.jetBelly;
  const dark = P.jetDark;
  const wing: [number, number][] = [[0.05, 0.14], [0.05, -0.24], [0.44, -0.2], [0.46, -0.13]];
  const strake: [number, number][] = [[0.04, 0.3], [0.04, 0.1], [0.12, 0.08]];
  const tailplane: [number, number][] = [[0.04, -0.29], [0.04, -0.45], [0.22, -0.46], [0.22, -0.4]];
  const parts: Part[] = [
    // Fuselage: nose cone, forward body, wide centre body over a pale belly, tapering tail.
    tube(0.0, 0.042, 0.15, 8, 0, 0.0, 0.425, top),
    tube(0.004, 0.012, 0.03, 8, 0, 0.0, 0.485, dark),
    tube(0.042, 0.052, 0.2, 8, 0, 0.0, 0.25, top),
    box(0.12, 0.06, 0.44, 0, 0.012, -0.08, top),
    box(0.11, 0.04, 0.5, 0, -0.03, -0.05, belly),
    tube(0.054, 0.046, 0.14, 8, 0, 0.0, -0.36, top),
    // Engine nozzle: a darker ring flaring out at the tail.
    tube(0.04, 0.044, 0.07, 8, 0, 0.0, -0.465, P.jetNozzle),
    // Dorsal spine stripe from the canopy back to the fin.
    box(0.036, 0.012, 0.36, 0, 0.047, -0.1, dark),
    // Chin intake under the cockpit, with a dark mouth.
    box(0.08, 0.055, 0.2, 0, -0.065, 0.06, belly),
    box(0.068, 0.04, 0.02, 0, -0.067, 0.16, dark),
    // Wings and strakes: gunmetal above, pale below.
    plate(wing, 0.014, 0.004, top),
    plate(mirror(wing), 0.014, 0.004, top),
    plate(wing, 0.006, -0.008, belly),
    plate(mirror(wing), 0.006, -0.008, belly),
    plate(strake, 0.012, 0.006, top),
    plate(mirror(strake), 0.012, 0.006, top),
    // Dark leading-edge stripes on the wings.
    plate([[0.05, 0.14], [0.05, 0.11], [0.45, -0.145], [0.46, -0.13]], 0.016, 0.004, dark),
    plate(mirror([[0.05, 0.14], [0.05, 0.11], [0.45, -0.145], [0.46, -0.13]]), 0.016, 0.004, dark),
    // Swept tailplanes.
    plate(tailplane, 0.012, 0.0, top),
    plate(mirror(tailplane), 0.012, 0.0, top),
    plate(tailplane, 0.005, -0.008, belly),
    plate(mirror(tailplane), 0.005, -0.008, belly),
    // One tall swept fin, with a pale band and a dark tip.
    fin([[-0.2, 0.04], [-0.44, 0.04], [-0.46, JET_DIMS.finTop], [-0.39, JET_DIMS.finTop]], 0.014, 0, top),
    fin([[-0.345, 0.2], [-0.45, 0.2], [-0.453, 0.225], [-0.36, 0.225]], 0.018, 0, belly),
    fin([[-0.375, 0.245], [-0.456, 0.245], [-0.46, JET_DIMS.finTop], [-0.39, JET_DIMS.finTop]], 0.018, 0, dark),
  ];
  // Raised bubble canopy over the cockpit.
  const canopy = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.036 * S, 0.052 * S, 0.11 * S);
  parts.push(painted(faceted(canopy.translate(0, 0.04 * S, 0.24 * S)), P.jetCanopy));
  for (const sx of [-1, 1]) {
    // Wingtip rail missiles: pale body, dark seeker nose and fins.
    parts.push(tube(0.011, 0.011, 0.2, 6, sx * 0.465, 0.0, -0.13, P.missile));
    parts.push(tube(0.0, 0.011, 0.04, 6, sx * 0.465, 0.0, -0.01, dark));
    parts.push(box(0.04, 0.004, 0.025, sx * 0.465, 0.0, -0.22, dark));
    // Under-wing missile on a pylon.
    parts.push(box(0.008, 0.02, 0.08, sx * 0.25, -0.02, -0.08, dark));
    parts.push(tube(0.012, 0.012, 0.18, 6, sx * 0.25, -0.04, -0.06, P.missile));
    parts.push(tube(0.0, 0.012, 0.035, 6, sx * 0.25, -0.04, 0.047, dark));
  }
  return merge(parts);
}

/** The afterburner flame: a short cone pointing back out of the nozzle (draw unlit in CONFIG.palette.jetBurner). */
export function burnerGeometry(): Part {
  return new THREE.CylinderGeometry(0.034 * S, 0.0, 0.1 * S, 8).rotateX(Math.PI / 2).translate(0, 0, -0.53 * S);
}
