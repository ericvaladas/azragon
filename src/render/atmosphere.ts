import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from '../cities/types';

/** Everything an atmosphere drives: the scene fog, the sky dome's colours, the two lights, the sun's direction, the window glow. */
export type AtmosphereTargets = {
  fog: THREE.Fog;
  sky: { zenith: THREE.Color; horizon: THREE.Color };
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** Unit vector toward the sun; Lighting.follow places the sun along it. */
  sunDir: THREE.Vector3;
  /** The facade shader's lit-window colour (a uniform value). */
  windowGlow: THREE.Color;
};

/** Fog near and far under `a`: its own, else CONFIG.fog's. */
export function fogDistances(a: Atmosphere): { near: number; far: number } {
  return { near: a.fogNear ?? CONFIG.fog.near, far: a.fogFar ?? CONFIG.fog.far };
}

/** The lit-window colour under `a`: its glow colour times its strength (black when the strength is 0). */
export function windowGlowColor(a: Atmosphere, out: THREE.Color): THREE.Color {
  return out.setHex(a.windowGlow.color).multiplyScalar(a.windowGlow.strength);
}

/** Set every target from `a`. */
export function applyAtmosphere(a: Atmosphere, t: AtmosphereTargets): void {
  t.sky.zenith.setHex(a.skyZenith);
  t.sky.horizon.setHex(a.skyHorizon);
  t.fog.color.setHex(a.fog);
  const f = fogDistances(a);
  t.fog.near = f.near;
  t.fog.far = f.far;
  t.hemi.color.setHex(a.hemiSky);
  t.hemi.groundColor.setHex(a.hemiGround);
  t.hemi.intensity = a.hemiIntensity;
  t.sun.color.setHex(a.sun);
  t.sun.intensity = a.sunIntensity;
  t.sunDir.set(a.sunDir.x, a.sunDir.y, a.sunDir.z).normalize();
  windowGlowColor(a, t.windowGlow);
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();
const mixHex = (a: number, b: number, k: number): number => _ca.setHex(a).lerp(_cb.setHex(b), k).getHex();
const mix = (a: number, b: number, k: number): number => a * (1 - k) + b * k;

/** `a` blended toward `b` by k (0..1, clamped) into `out`: colours in linear RGB, numbers and the sun direction linearly, fog distances filled in. */
export function lerpAtmosphere(a: Atmosphere, b: Atmosphere, k: number, out: Atmosphere): Atmosphere {
  const t = Math.min(1, Math.max(0, k));
  const fa = fogDistances(a);
  const fb = fogDistances(b);
  out.skyZenith = mixHex(a.skyZenith, b.skyZenith, t);
  out.skyHorizon = mixHex(a.skyHorizon, b.skyHorizon, t);
  out.fog = mixHex(a.fog, b.fog, t);
  out.fogNear = mix(fa.near, fb.near, t);
  out.fogFar = mix(fa.far, fb.far, t);
  out.hemiSky = mixHex(a.hemiSky, b.hemiSky, t);
  out.hemiGround = mixHex(a.hemiGround, b.hemiGround, t);
  out.hemiIntensity = mix(a.hemiIntensity, b.hemiIntensity, t);
  out.sun = mixHex(a.sun, b.sun, t);
  out.sunIntensity = mix(a.sunIntensity, b.sunIntensity, t);
  out.sunDir.x = mix(a.sunDir.x, b.sunDir.x, t);
  out.sunDir.y = mix(a.sunDir.y, b.sunDir.y, t);
  out.sunDir.z = mix(a.sunDir.z, b.sunDir.z, t);
  out.windowGlow.color = mixHex(a.windowGlow.color, b.windowGlow.color, t);
  out.windowGlow.strength = mix(a.windowGlow.strength, b.windowGlow.strength, t);
  return out;
}
