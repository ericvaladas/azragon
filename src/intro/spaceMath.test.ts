import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';
import { ENTRY_TIME, earthCenter, globeDir, globeQuaternion, heatAt, heatColor, podAltitude, spaceCamera, starDirections } from './spaceMath';
import { mulberry32 } from '../util/rng';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;

describe('approach', () => {
  it('closes from far out to just above the surface at the cut', () => {
    expect(podAltitude(0)).toBeCloseTo(SP.gapStart);
    expect(podAltitude(CUT_TIME)).toBeCloseTo(SP.gapEnd);
    expect(podAltitude(CUT_TIME + 3)).toBeCloseTo(SP.gapEnd);
  });
  it('never slows down: the altitude shrinks by the same fraction every moment, before and after entry', () => {
    const rate = (t: number) => Math.log(podAltitude(t - 0.05) / podAltitude(t + 0.05)) / 0.1;
    const r0 = rate(0.5);
    expect(r0).toBeGreaterThan(0.5);
    for (let t = 0.5; t < CUT_TIME - 0.1; t += 0.25) expect(rate(t)).toBeCloseTo(r0, 5);
    expect(rate(ENTRY_TIME)).toBeCloseTo(r0, 5);
  });
  it('places Earth so its surface is exactly that far below the pod', () => {
    const c = new THREE.Vector3();
    for (const t of [0, 2, ENTRY_TIME, CUT_TIME]) expect(earthCenter(t, c).length() - SP.earthRadius).toBeCloseTo(podAltitude(t), 3);
  });
});

describe('spaceCamera', () => {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const c = new THREE.Vector3();
  const gap = (t: number) => {
    spaceCamera(pos, look);
    return pos.distanceTo(earthCenter(t, c)) - SP.earthRadius;
  };
  it('holds the same offset from the pod the whole way down (no zoom as it starts to burn)', () => {
    spaceCamera(pos, look);
    const first = pos.clone();
    for (let t = 0; t <= CUT_TIME; t += 0.1) {
      spaceCamera(pos, look);
      expect(pos.distanceTo(first)).toBeLessThan(1e-9);
    }
  });
  it('sits well above the pod, looking down on it (not level with or below it)', () => {
    spaceCamera(pos, look);
    // Seen from the camera, the pod is at least 20 degrees below the horizon.
    const toPod = pos.clone().negate().normalize();
    expect(Math.asin(-toPod.y)).toBeGreaterThan((20 * Math.PI) / 180);
    expect(look.y).toBeLessThan(0);
  });
  it('still closes on the surface right up to the cut', () => {
    for (let t = 0.5; t <= CUT_TIME - 0.1; t += 0.1) expect(gap(t + 0.1)).toBeLessThan(gap(t));
  });
  it('stays above the surface and behind the pod', () => {
    for (let t = 0; t <= CUT_TIME; t += 0.25) {
      expect(gap(t)).toBeGreaterThan(0);
      expect(pos.z).toBeLessThan(0);
    }
  });
});

describe('heat', () => {
  const thickness = SP.earthRadius * (SP.atmosphere - 1);
  it('starts burning exactly when the pod enters the atmosphere', () => {
    expect(podAltitude(ENTRY_TIME)).toBeCloseTo(thickness);
    expect(ENTRY_TIME).toBeGreaterThan(S.reentry);
    expect(ENTRY_TIME).toBeLessThan(CUT_TIME - 0.8);
    expect(heatAt(ENTRY_TIME - 0.01)).toBe(0);
    expect(heatAt(ENTRY_TIME + 0.2)).toBeGreaterThan(0);
  });
  it('is white-hot by the cut, deep in the atmosphere but still above the ground', () => {
    expect(heatAt(CUT_TIME)).toBe(1);
    expect(podAltitude(CUT_TIME)).toBeGreaterThan(0);
    expect(podAltitude(CUT_TIME)).toBeLessThan(thickness);
  });
  it('maps heat to black, then fire orange, then white', () => {
    const c = new THREE.Color();
    expect(heatColor(0, c).getHex()).toBe(0x000000);
    expect(heatColor(0.5, c).getHex()).toBe(new THREE.Color(CONFIG.palette.fire).getHex());
    expect(heatColor(1, c).getHex()).toBe(0xffffff);
  });
});

describe('starDirections', () => {
  it('gives n deterministic unit vectors', () => {
    const a = starDirections(50, mulberry32(1));
    expect(a).toHaveLength(50);
    for (const v of a) expect(v.length()).toBeCloseTo(1);
    expect(starDirections(50, mulberry32(1))).toEqual(a);
  });
});

describe('globe orientation', () => {
  const deg = (r: number) => (r * 180) / Math.PI;
  it('globeDir matches the texel SphereGeometry samples there (u = (lon + 180) / 360, v = (lat + 90) / 180)', () => {
    const geo = new THREE.SphereGeometry(1, 40, 24);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      const v = uv.getY(i);
      if (v <= 0.01 || v >= 0.99) continue; // the poles: every longitude meets there
      p.fromBufferAttribute(pos, i).normalize();
      globeDir(v * 180 - 90, uv.getX(i) * 360 - 180, d);
      expect(deg(d.angleTo(p))).toBeLessThan(0.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });
  it('puts lon 0 on +X, lon -90 on +Z and the north pole on +Y', () => {
    const d = new THREE.Vector3();
    expect(globeDir(0, 0, d).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
    expect(globeDir(0, -90, d).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
    expect(globeDir(90, 37, d).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
  });
  for (const [name, globe] of [['Tokyo', { lat: 35.7, lon: 139.7 }], ['Toronto', { lat: 43.7, lon: -79.4 }]] as const) {
    it(`turns ${name} to sit under the pod at the cut`, () => {
      const target = earthCenter(CUT_TIME, new THREE.Vector3()).negate().normalize();
      const q = globeQuaternion(globe, CUT_TIME, new THREE.Quaternion());
      const city = globeDir(globe.lat, globe.lon, new THREE.Vector3()).applyQuaternion(q);
      expect(deg(city.angleTo(target))).toBeLessThan(5);
    });
    it(`keeps ${name}'s north pointing ahead (up the screen) at the cut`, () => {
      const q = globeQuaternion(globe, CUT_TIME, new THREE.Quaternion());
      const target = earthCenter(CUT_TIME, new THREE.Vector3()).negate().normalize();
      const north = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const tangentNorth = north.sub(target.clone().multiplyScalar(north.dot(target))).normalize();
      const ahead = new THREE.Vector3(0, 0, 1);
      const tangentAhead = ahead.sub(target.clone().multiplyScalar(ahead.dot(target))).normalize();
      expect(deg(tangentNorth.angleTo(tangentAhead))).toBeLessThan(5);
    });
    it(`spins ${name}'s Earth slowly eastward about its own axis through space`, () => {
      const q0 = globeQuaternion(globe, 0, new THREE.Quaternion());
      const q1 = globeQuaternion(globe, CUT_TIME, new THREE.Quaternion());
      const axis0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
      const axis1 = new THREE.Vector3(0, 1, 0).applyQuaternion(q1);
      expect(deg(axis0.angleTo(axis1))).toBeLessThan(1e-6);
      expect(deg(q0.angleTo(q1))).toBeCloseTo(deg(CUT_TIME * 0.04), 3);
      // Eastward: a point on the equator at the cut was further west (smaller longitude) earlier.
      const city = globeDir(globe.lat, globe.lon, new THREE.Vector3());
      const east = globeDir(globe.lat, globe.lon + 1, new THREE.Vector3());
      const cityAtCut = city.clone().applyQuaternion(q1);
      const eastAtStart = east.applyQuaternion(q0);
      const cityAtStart = city.applyQuaternion(q0);
      expect(eastAtStart.angleTo(cityAtCut)).toBeLessThan(cityAtStart.angleTo(cityAtCut));
    });
  }
});
