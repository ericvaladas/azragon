import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * Attack helicopter model in world metres (CONFIG.heli.size is nose-to-tail length). Heli space is +Z forward,
 * +Y up, origin at the cabin's centre. The body is one vertex-coloured mesh; the main rotor (spins about Y at
 * MAIN_ROTOR) and the tail rotor (spins about X at TAIL_ROTOR) are separate meshes so they can turn.
 */
const S = CONFIG.heli.size;

export const MAIN_ROTOR = new THREE.Vector3(0, 0.235 * S, -0.02 * S);
export const TAIL_ROTOR = new THREE.Vector3(0.03 * S, 0.13 * S, -0.66 * S);
/** Rocket pod muzzles (left, right), where volleys leave the helicopter. */
export const PODS = [new THREE.Vector3(0.16 * S, -0.06 * S, 0.04 * S), new THREE.Vector3(-0.16 * S, -0.06 * S, 0.04 * S)] as const;

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w * S, h * S, d * S)).translate(x * S, y * S, z * S), color);
}

/** A cylinder along Z (top radius toward +Z when `forward`), centred at (x, y, z). */
function tube(rFront: number, rBack: number, len: number, seg: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rFront * S, rBack * S, len * S, seg).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x * S, y * S, z * S)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('heliModel: merge failed');
  return g;
}

/** Cabin, glass nose, engine, mast, tail boom, fin and stabiliser, stub wings with rocket pods, skids. */
export function bodyGeometry(): Part {
  const P = CONFIG.palette;
  const parts: Part[] = [
    box(0.2, 0.2, 0.36, 0, 0, -0.01, P.heli),
    // Glass nose bubble over an olive chin, with a glass strip along the cabin sides.
    tube(0.075, 0.11, 0.16, 6, 0, 0.01, 0.245, P.heliGlass),
    box(0.17, 0.07, 0.17, 0, -0.065, 0.24, P.heli),
    box(0.205, 0.06, 0.12, 0, 0.04, 0.09, P.heliGlass),
    box(0.15, 0.075, 0.25, 0, 0.135, -0.05, P.heliDark),
    tube(0.02, 0.03, 0.05, 6, 0, 0.14, -0.2, P.heliDark),
    tube(0.03, 0.065, 0.5, 6, 0, 0.04, -0.43, P.heli),
    box(0.02, 0.17, 0.09, 0, 0.11, -0.66, P.heli),
    box(0.19, 0.015, 0.05, 0, 0.04, -0.57, P.heliDark),
    box(0.36, 0.016, 0.07, 0, -0.03, -0.02, P.heli),
    box(0.022, 0.07, 0.022, 0, 0.2, -0.02, P.heliDark),
  ];
  for (const sx of [-1, 1]) {
    parts.push(tube(0.028, 0.032, 0.13, 6, sx * 0.16, -0.06, -0.02, P.heliDark));
    parts.push(box(0.022, 0.022, 0.46, sx * 0.12, -0.185, 0.0, P.heliDark));
    parts.push(box(0.022, 0.022, 0.07, sx * 0.12, -0.165, 0.245, P.heliDark));
    for (const z of [-0.12, 0.11]) parts.push(box(0.016, 0.08, 0.016, sx * 0.11, -0.135, z, P.heliDark));
  }
  return merge(parts);
}

/** Four thin blades and a hub, about the local origin (place at MAIN_ROTOR). */
export function mainRotorGeometry(): Part {
  const parts: Part[] = [faceted(new THREE.BoxGeometry(0.06 * S, 0.02 * S, 0.06 * S))];
  for (let k = 0; k < 4; k++) parts.push(faceted(new THREE.BoxGeometry(0.05 * S, 0.008 * S, 0.5 * S)).translate(0, 0, 0.25 * S).rotateY((k * Math.PI) / 2));
  return merge(parts);
}

/** The faint blur disc the blades sweep (place at MAIN_ROTOR, drawn translucent). */
export function rotorDiscGeometry(): Part {
  return new THREE.CircleGeometry(0.5 * S, 16).rotateX(-Math.PI / 2);
}

/** Two crossed blades in the YZ plane, about the local origin (place at TAIL_ROTOR; spins about X). */
export function tailRotorGeometry(): Part {
  return merge([
    faceted(new THREE.BoxGeometry(0.01 * S, 0.17 * S, 0.025 * S)),
    faceted(new THREE.BoxGeometry(0.01 * S, 0.025 * S, 0.17 * S)),
  ]);
}
