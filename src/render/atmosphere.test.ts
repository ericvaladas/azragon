import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import type { Atmosphere } from '../cities/types';
import { applyAtmosphere, fogDistances, lerpAtmosphere, windowGlowColor, type AtmosphereTargets } from './atmosphere';
import { Lighting } from './Lighting';
import { createSky, skyColors } from './Sky';

const DUSK: Atmosphere = {
  skyZenith: 0x4b4a8c, skyHorizon: 0xf2a46b, fog: 0xe9a985, fogNear: 1800, fogFar: 4200,
  hemiSky: 0xffc59a, hemiGround: 0x4a3550, hemiIntensity: 0.8,
  sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 },
  windowGlow: { color: 0xffc46b, strength: 0.5 },
};
const targets = (): AtmosphereTargets => ({
  fog: new THREE.Fog(0x000000, 1, 2),
  sky: { zenith: new THREE.Color(), horizon: new THREE.Color() },
  hemi: new THREE.HemisphereLight(),
  sun: new THREE.DirectionalLight(),
  sunDir: new THREE.Vector3(),
  windowGlow: new THREE.Color(),
});

describe('atmosphere', () => {
  it("TOKYO.atmosphere is exactly today's CONFIG palette, fog and light values, with no window glow", () => {
    const P = CONFIG.palette;
    expect(TOKYO.atmosphere).toEqual({
      skyZenith: P.skyZenith, skyHorizon: P.skyHorizon, fog: P.fog,
      hemiSky: P.hemiSky, hemiGround: P.hemiGround, hemiIntensity: 1.1,
      sun: P.sun, sunIntensity: 2.2, sunDir: { x: 0.45, y: 0.8, z: 0.35 },
      windowGlow: { color: 0xffd27a, strength: 0 },
    });
    expect(fogDistances(TOKYO.atmosphere)).toEqual(CONFIG.fog);
    expect(windowGlowColor(TOKYO.atmosphere, new THREE.Color(1, 1, 1)).getHex()).toBe(0);
  });

  it('applies every sky, fog, light and glow value, the sun direction normalised', () => {
    const t = targets();
    applyAtmosphere(DUSK, t);
    expect(t.sky.zenith.getHex()).toBe(0x4b4a8c);
    expect(t.sky.horizon.getHex()).toBe(0xf2a46b);
    expect(t.fog.color.getHex()).toBe(0xe9a985);
    expect([t.fog.near, t.fog.far]).toEqual([1800, 4200]);
    expect(t.hemi.color.getHex()).toBe(0xffc59a);
    expect(t.hemi.groundColor.getHex()).toBe(0x4a3550);
    expect(t.hemi.intensity).toBe(0.8);
    expect(t.sun.color.getHex()).toBe(0xffa25a);
    expect(t.sun.intensity).toBe(2);
    expect(t.sunDir.length()).toBeCloseTo(1);
    expect(t.sunDir.x).toBeLessThan(0);
    expect(t.sunDir.distanceTo(new THREE.Vector3(-0.9, 0.3, 0.2).normalize())).toBeLessThan(1e-9);
    expect(t.windowGlow.getHex()).toBe(new THREE.Color(0xffc46b).multiplyScalar(0.5).getHex());
  });

  it("applied to Tokyo, gives exactly what the scene was built with before (Tokyo's rendering is unchanged)", () => {
    const P = CONFIG.palette;
    const t = targets();
    applyAtmosphere(DUSK, t);
    applyAtmosphere(TOKYO.atmosphere, t);
    const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 1.1);
    const sun = new THREE.DirectionalLight(P.sun, 2.2);
    expect(t.hemi.color.equals(hemi.color)).toBe(true);
    expect(t.hemi.groundColor.equals(hemi.groundColor)).toBe(true);
    expect(t.hemi.intensity).toBe(1.1);
    expect(t.sun.color.equals(sun.color)).toBe(true);
    expect(t.sun.intensity).toBe(2.2);
    expect(t.sunDir.toArray()).toEqual(new THREE.Vector3(0.45, 0.8, 0.35).normalize().toArray());
    expect(t.fog.color.equals(new THREE.Color(P.fog))).toBe(true);
    expect([t.fog.near, t.fog.far]).toEqual([CONFIG.fog.near, CONFIG.fog.far]);
    expect(t.sky.zenith.equals(new THREE.Color(P.skyZenith))).toBe(true);
    expect(t.sky.horizon.equals(new THREE.Color(P.skyHorizon))).toBe(true);
    expect(t.windowGlow.getHex()).toBe(0);
  });

  it('Lighting and the sky dome are built from the atmosphere they are given', () => {
    const scene = new THREE.Scene();
    const lighting = new Lighting(scene, DUSK);
    expect(lighting.hemi.intensity).toBe(0.8);
    expect(lighting.sun.color.getHex()).toBe(0xffa25a);
    lighting.follow(new THREE.Vector3(100, 0, 200));
    const dir = lighting.sun.position.clone().sub(new THREE.Vector3(100, 0, 200)).normalize();
    expect(dir.x).toBeCloseTo(new THREE.Vector3(-0.9, 0.3, 0.2).normalize().x);
    const sky = createSky(scene, DUSK);
    expect(skyColors(sky).zenith.getHex()).toBe(0x4b4a8c);
    expect(skyColors(sky).horizon.getHex()).toBe(0xf2a46b);
    const fog = scene.fog as THREE.Fog;
    expect(fog.color.getHex()).toBe(0xe9a985);
    expect([fog.near, fog.far]).toEqual([1800, 4200]);
  });
});

describe('lerpAtmosphere', () => {
  const a = TOKYO.atmosphere;
  const out = (): Atmosphere => ({ ...DUSK, sunDir: { ...DUSK.sunDir }, windowGlow: { ...DUSK.windowGlow } });
  it('blend 0 restores the style exactly', () => {
    expect(lerpAtmosphere(a, DUSK, 0, out())).toEqual({ ...a, fogNear: fogDistances(a).near, fogFar: fogDistances(a).far });
  });
  it('blend 1 is the target', () => {
    expect(lerpAtmosphere(a, DUSK, 1, out())).toEqual(DUSK);
  });
  it('blend 0.5 is halfway', () => {
    const m = lerpAtmosphere(a, DUSK, 0.5, out());
    expect(m.hemiIntensity).toBeCloseTo((a.hemiIntensity + DUSK.hemiIntensity) / 2);
    for (const shift of [16, 8, 0]) {
      const ch = (hex: number) => (hex >> shift) & 0xff;
      const [lo, hi] = [ch(a.skyZenith), ch(DUSK.skyZenith)].sort((x, y) => x - y);
      expect(ch(m.skyZenith)).toBeGreaterThanOrEqual(lo!);
      expect(ch(m.skyZenith)).toBeLessThanOrEqual(hi!);
    }
  });
});
