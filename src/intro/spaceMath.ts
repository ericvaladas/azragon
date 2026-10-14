import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME, chaseFrame } from './timeline';

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

/** Space camera (before shake): the shared chase framing, behind and well above the pod, at a fixed offset (no zoom). */
export function spaceCamera(pos: THREE.Vector3, look: THREE.Vector3): void {
  chaseFrame(SP.podLength, pos, look);
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

/** Earth's spin through the space phase (rad/s), eastward about its own axis. */
export const EARTH_SPIN = 0.04;
const RAD = Math.PI / 180;

/**
 * Unit direction, in the globe's own frame, of the point at (lat, lon) degrees as SphereGeometry textures it:
 * the texture's u = (lon + 180) / 360 runs from −X (lon ±180) through +Z (−90), +X (0) and −Z (+90); north is +Y.
 */
export function globeDir(lat: number, lon: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(lat * RAD);
  return out.set(c * Math.cos(lon * RAD), Math.sin(lat * RAD), -c * Math.sin(lon * RAD));
}

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _north = new THREE.Vector3();
const _east = new THREE.Vector3();
const _spin = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * The globe's world orientation at time t: at the cut, the point at `globe` (lat, lon) sits straight under the pod
 * (on the line from Earth's centre to the pod) with its north pointing ahead along the flight (+Z), so the city's
 * continent reads right-way-up from the chase camera. Before the cut it is turned back about Earth's own axis by
 * EARTH_SPIN rad/s, so the Earth spins slowly eastward and carries the city in under the pod.
 */
export function globeQuaternion(globe: { lat: number; lon: number }, t: number, out: THREE.Quaternion): THREE.Quaternion {
  // The globe's local frame at the city: east, north, up (the outward normal).
  const lat = globe.lat * RAD;
  const lon = globe.lon * RAD;
  const up = globeDir(globe.lat, globe.lon, _n);
  _north.set(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
  _east.crossVectors(_north, up);
  _m.makeBasis(_east, _north, up);
  // The world frame under the pod at the cut: up toward the pod, north along +Z flattened onto the ground there.
  earthCenter(CUT_TIME, _n).negate().normalize();
  _north.set(0, 0, 1).addScaledVector(_n, -_n.z).normalize();
  _east.crossVectors(_north, _n);
  _w.makeBasis(_east, _north, _n);
  out.setFromRotationMatrix(_w.multiply(_m.transpose()));
  return out.multiply(_spin.setFromAxisAngle(AXIS_Y, (t - CUT_TIME) * EARTH_SPIN));
}
