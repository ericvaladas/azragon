import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * V-22 Osprey model in world metres (CONFIG.osprey.size is nose-to-tail length). Body space is +Z forward, +Y up,
 * origin at the fuselage's centre. The airframe is one vertex-coloured mesh. Each wingtip carries a pod (pivot at
 * PODS, built pointing +Z) that swivels about X from forward (tilt 0) to straight up (tilt π/2); its three-blade
 * rotor sits at ROTOR_HUB in pod space and spins about the pod's Z axis.
 */
const S = CONFIG.osprey.size;
const WINGTIP = 0.39;
const ROTOR_R = 0.33;

export const PODS = [new THREE.Vector3(WINGTIP * S, 0.1 * S, 0.02 * S), new THREE.Vector3(-WINGTIP * S, 0.1 * S, 0.02 * S)] as const;
export const ROTOR_HUB = new THREE.Vector3(0, 0, 0.19 * S);
const X_AXIS = new THREE.Vector3(1, 0, 0);

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
  if (!g) throw new Error('ospreyModel: merge failed');
  return g;
}

/** Boxy fuselage with a tapered nose and cockpit glass, high straight wing, landing-gear sponsons, cargo ramp, twin-finned tail. */
export function bodyGeometry(): Part {
  const P = CONFIG.palette;
  const body = P.ospreyBody;
  const dark = P.ospreyDark;
  const parts: Part[] = [
    box(0.17, 0.17, 0.62, 0, 0, 0.02, body),
    tube(0.05, 0.085, 0.16, 6, 0, -0.01, 0.41, body),
    box(0.15, 0.05, 0.08, 0, 0.05, 0.36, P.ospreyGlass),
    box(0.12, 0.12, 0.2, 0, 0.03, -0.38, body),
    box(0.13, 0.015, 0.18, 0, -0.08, -0.3, dark),
    box(2 * WINGTIP, 0.03, 0.13, 0, 0.1, 0.02, body),
    box(2 * WINGTIP - 0.04, 0.008, 0.12, 0, 0.118, 0.02, dark),
    box(0.26, 0.02, 0.08, 0, 0.05, -0.46, body),
  ];
  for (const sx of [-1, 1]) {
    parts.push(box(0.05, 0.06, 0.2, sx * 0.11, -0.06, 0.05, dark));
    parts.push(box(0.02, 0.16, 0.09, sx * 0.13, 0.13, -0.46, body));
  }
  return merge(parts);
}

/** Engine nacelle about the pod pivot, pointing +Z, with a dark intake ring at its front. */
export function podGeometry(): Part {
  const P = CONFIG.palette;
  return merge([tube(0.045, 0.05, 0.22, 8, 0, 0, 0.05, P.ospreyBody), tube(0.048, 0.048, 0.03, 8, 0, 0, 0.17, P.ospreyDark)]);
}

/** Three blades and a spinner in the pod's XY plane, about the local origin (place at ROTOR_HUB; spins about Z). */
export function rotorGeometry(): Part {
  const parts: Part[] = [faceted(new THREE.CylinderGeometry(0.025 * S, 0.035 * S, 0.05 * S, 6).rotateX(Math.PI / 2))];
  for (let k = 0; k < 3; k++) parts.push(faceted(new THREE.BoxGeometry(0.035 * S, ROTOR_R * S, 0.008 * S)).translate(0, (ROTOR_R / 2) * S, 0).rotateZ((k * 2 * Math.PI) / 3));
  return merge(parts);
}

/** The faint blur disc the blades sweep (place at ROTOR_HUB, drawn translucent). */
export function rotorDiscGeometry(): Part {
  return new THREE.CircleGeometry(ROTOR_R * S, 16);
}

/** Rotor hub in body space for a pod at `pivot` swivelled up by `tilt` (the pod's group rotation.x is -tilt). */
export function rotorHubAt(pivot: THREE.Vector3, tilt: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(ROTOR_HUB).applyAxisAngle(X_AXIS, -tilt).add(pivot);
}
