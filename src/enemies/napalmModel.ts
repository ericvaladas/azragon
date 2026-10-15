import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Propeller bomber model in world metres (CONFIG.napalm.span is the wingspan). Bomber space is +Z forward, +Y up,
 * origin at the fuselage's centre. The airframe is one vertex-coloured mesh: dark olive above, pale grey-green
 * below. The two propellers are separate meshes (spin about Z at PROPS) so they can turn.
 */
const S = CONFIG.napalm.span;

/** Propeller hubs (left, right), in front of the engine nacelles. */
export const PROPS = [new THREE.Vector3(0.2 * S, -0.012 * S, 0.215 * S), new THREE.Vector3(-0.2 * S, -0.012 * S, 0.215 * S)] as const;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w * S, h * S, d * S)).translate(x * S, y * S, z * S), color);
}

/** A cylinder along Z (radius rFront toward +Z), centred at (x, y, z). */
function tube(rFront: number, rBack: number, len: number, seg: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rFront * S, rBack * S, len * S, seg).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x * S, y * S, z * S)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('napalmModel: merge failed');
  return g;
}

/** Fuselage with a pale belly, glass nose and canopy, straight wings, two engine nacelles, twin-finned tail. */
export function bomberGeometry(): Part {
  const P = CONFIG.palette;
  const top = P.napalmBomber;
  const belly = P.napalmBelly;
  const dark = P.napalmDark;
  const glass = P.napalmGlass;
  const parts: Part[] = [
    // Fuselage: olive upper half over a pale belly, tapering into a tail cone.
    box(0.12, 0.07, 0.5, 0, 0.022, 0.02, top),
    box(0.112, 0.05, 0.46, 0, -0.035, 0.03, belly),
    tube(0.06, 0.03, 0.2, 6, 0, 0.0, -0.32, top),
    box(0.05, 0.03, 0.18, 0, -0.03, -0.31, belly),
    // Glass nose (bombardier's greenhouse) and the cockpit canopy.
    tube(0.035, 0.064, 0.11, 6, 0, -0.005, 0.32, glass),
    box(0.075, 0.04, 0.1, 0, 0.07, 0.17, glass),
    // Bomb-bay doors under the belly.
    box(0.07, 0.008, 0.18, 0, -0.062, 0.02, dark),
    // Straight wings: olive above, pale below.
    box(1.0, 0.022, 0.13, 0, 0.0, 0.05, top),
    box(0.98, 0.008, 0.12, 0, -0.014, 0.05, belly),
    // Tailplane and the twin fins at its tips.
    box(0.36, 0.016, 0.08, 0, 0.015, -0.41, top),
    box(0.34, 0.006, 0.075, 0, 0.004, -0.41, belly),
  ];
  for (const sx of [-1, 1]) {
    // Engine nacelle slung under the wing, a darker cowling ring at its front and a spinner on the hub.
    parts.push(tube(0.04, 0.03, 0.24, 6, sx * 0.2, -0.012, 0.08, top));
    parts.push(box(0.06, 0.03, 0.2, sx * 0.2, -0.035, 0.07, belly));
    parts.push(tube(0.042, 0.042, 0.03, 6, sx * 0.2, -0.012, 0.19, dark));
    parts.push(tube(0.004, 0.018, 0.04, 6, sx * 0.2, -0.012, 0.225, dark));
    // Twin fins.
    parts.push(box(0.016, 0.11, 0.09, sx * 0.17, 0.065, -0.43, top));
  }
  return merge(parts);
}

/** Three blades about the local origin in the XY plane (place at a PROPS hub; spins about Z). */
export function propGeometry(): Part {
  const parts: Part[] = [];
  for (let k = 0; k < 3; k++) parts.push(faceted(new THREE.BoxGeometry(0.022 * S, 0.1 * S, 0.008 * S)).translate(0, 0.05 * S, 0).rotateZ((k * Math.PI * 2) / 3));
  return merge(parts);
}

/** The faint blur disc the blades sweep (place at a PROPS hub, drawn translucent). */
export function propDiscGeometry(): Part {
  return new THREE.CircleGeometry(0.1 * S, 12);
}

/** A small dark bomb along Z, with a blunt nose and a tail fin cross. */
export function bombGeometry(): Part {
  const L = 0.2 * S;
  const R = 0.038 * S;
  return mergeGeometries([
    faceted(new THREE.CylinderGeometry(R, R, L, 6).rotateX(Math.PI / 2)),
    faceted(new THREE.CylinderGeometry(R * 0.4, R, L * 0.2, 6).rotateX(Math.PI / 2).translate(0, 0, L * 0.6)),
    faceted(new THREE.BoxGeometry(R * 3, R * 0.3, L * 0.22).translate(0, 0, -L * 0.5)),
    faceted(new THREE.BoxGeometry(R * 0.3, R * 3, L * 0.22).translate(0, 0, -L * 0.5)),
  ])!;
}

/**
 * A ragged splash outline: a fan of `n` points whose radius wobbles around 1, so a burning patch reads as
 * spilled fire rather than a clean disc. Lies flat (XZ), radius ~1, seeded so every patch shares one shape.
 */
export function splashGeometry(n = 14, wobble = 0.28, seed = 3): Part {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const pos: number[] = [];
  const radii = Array.from({ length: n }, () => 1 - wobble + rand() * wobble * 1.6);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const r0 = radii[k]!;
    const r1 = radii[(k + 1) % n]!;
    pos.push(0, 0, 0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1, Math.cos(a0) * r0, 0, Math.sin(a0) * r0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
