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
