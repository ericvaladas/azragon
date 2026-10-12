import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';

const SP = CONFIG.intro.space;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const R = SP.earthRadius;
/** Exponential closing rate: the altitude shrinks by the same fraction every second. */
const K = Math.log(SP.gapStart / SP.gapEnd) / CUT_TIME;

/** Height of the pod above Earth's surface: from gapStart down to gapEnd at the cut, never slowing visually. */
export function podAltitude(t: number): number {
  return SP.gapStart * Math.exp(-K * Math.min(CUT_TIME, Math.max(0, t)));
}

/** When the pod crosses into the atmosphere (and starts to burn). */
export const ENTRY_TIME = Math.log(SP.gapStart / (R * (SP.atmosphere - 1))) / K;

/**
 * Earth's centre relative to the pod (at the origin, flying +Z): `d` ahead and (earthDrop + 0.3d) below, with
 * d solved so the centre is exactly R + altitude away.
 */
export function earthCenter(t: number, out: THREE.Vector3): THREE.Vector3 {
  const c = R + podAltitude(t);
  // |(0, -(h + 0.3d), d)| = c  →  1.09d² + 0.6hd + h² - c² = 0
  const h = SP.earthDrop;
  const a = 1.09;
  const b = 0.6 * h;
  const d = (-b + Math.sqrt(b * b - 4 * a * (h * h - c * c))) / (2 * a);
  return out.set(0, -(h + 0.3 * d), d);
}

/**
 * Space camera (before shake): behind, above and to the side of the pod, looking ahead and down. Narrow
 * (portrait) screens get less sideways offset so the pod stays on screen. Below zoomAlt the whole offset
 * shrinks with the altitude, so the camera's own distance to the ground keeps falling as fast as the pod's.
 */
export function spaceCamera(t: number, aspect: number, pos: THREE.Vector3, look: THREE.Vector3): void {
  const L = SP.podLength;
  const z = Math.min(1, Math.max(SP.zoomMin, podAltitude(t) / SP.zoomAlt));
  pos.set(L * (aspect < 1 ? 0.5 : 1.2) * z, L * 0.9 * z, -L * 3.5 * z);
  look.set(0, -L * 0.3, L * 6);
}

/** Re-entry heat 0..1: zero until the pod enters the atmosphere, white-hot at the cut. */
export function heatAt(t: number): number {
  return clamp01((t - ENTRY_TIME) / (CUT_TIME - ENTRY_TIME));
}

const BLACK = new THREE.Color(0x000000);
const ORANGE = new THREE.Color(CONFIG.palette.fire);
const WHITE = new THREE.Color(0xffffff);

/** Emissive colour for a heat level: black, then fire orange (at 0.5), then white-hot. */
export function heatColor(h: number, out: THREE.Color): THREE.Color {
  if (h <= 0.5) return out.copy(BLACK).lerp(ORANGE, h / 0.5);
  return out.copy(ORANGE).lerp(WHITE, (h - 0.5) / 0.5);
}

/** Deterministic unit vectors spread uniformly over the sphere. */
export function starDirections(n: number, rng: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
}
