import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';

const SP = CONFIG.intro.space;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Earth's distance ahead: eases in to the atmosphere by entryTime, then a slow dive to earthEnd at the cut. */
export function earthDistance(t: number): number {
  if (t <= SP.entryTime) return SP.earthStart + (SP.earthEntry - SP.earthStart) * easeInOut(clamp01(t / SP.entryTime));
  return SP.earthEntry + (SP.earthEnd - SP.earthEntry) * clamp01((t - SP.entryTime) / (CUT_TIME - SP.entryTime));
}

/** Earth's centre relative to the pod (which sits at the origin, flying +Z): ahead and below. */
export function earthCenter(t: number, out: THREE.Vector3): THREE.Vector3 {
  const d = earthDistance(t);
  return out.set(0, -(SP.earthDrop + d * 0.3), d);
}

const _c = new THREE.Vector3();
/** Height of the pod above Earth's surface. */
export function podAltitude(t: number): number {
  return earthCenter(t, _c).length() - SP.earthRadius;
}

/** Re-entry heat 0..1: zero until the pod enters the atmosphere, white-hot at the cut. */
export function heatAt(t: number): number {
  return clamp01((t - SP.entryTime) / (CUT_TIME - SP.entryTime));
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
