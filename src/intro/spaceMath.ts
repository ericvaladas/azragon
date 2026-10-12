import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Pod-to-Earth distance: closes slowly at first, then rushes in, reaching earthEnd at the cut. */
export function earthDistance(t: number): number {
  const u = clamp01(t / CUT_TIME);
  return SP.earthStart + (SP.earthEnd - SP.earthStart) * u * u;
}

/** Re-entry heat 0..1: zero in space, rising through re-entry, white-hot at the cut. */
export function heatAt(t: number): number {
  return clamp01((t - S.reentry) / (S.clouds - S.reentry));
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
