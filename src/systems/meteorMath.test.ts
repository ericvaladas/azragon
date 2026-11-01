import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { cutsceneK, cutsceneTotal, fallPosition, fallTilt, landTime, fallbackSite, pickLandSite } from './meteorMath';

const M = CONFIG.meteor;
const total = cutsceneTotal();
const sites = [
  { x: 1, z: 1, rubble: false },
  { x: 2, z: 2, rubble: true },
];

describe('pickLandSite', () => {
  it('skips blocked sites', () => {
    for (const r of [0, 0.3, 0.99]) expect(pickLandSite(sites, (x) => x === 1, () => r)).toEqual({ x: 2, z: 2 });
  });
  it('returns null when all are blocked', () => {
    expect(pickLandSite(sites, () => true, Math.random)).toBeNull();
  });
});

describe('fallbackSite', () => {
  it('sits in the land band', () => {
    for (let i = 0; i < 20; i++) {
      const p = fallbackSite({ x: 10, z: -20 }, Math.random, (v) => v);
      const d = Math.hypot(p.x - 10, p.z + 20);
      expect(d).toBeGreaterThanOrEqual(M.landMin - 1e-6);
      expect(d).toBeLessThanOrEqual(M.landMax + 1e-6);
    }
  });
});

describe('cutsceneK', () => {
  it('eases 0→1→0 over the total', () => {
    expect(cutsceneK(0)).toBe(0);
    expect(cutsceneK(M.lookUp / 2)).toBeGreaterThan(0);
    expect(cutsceneK(M.lookUp / 2)).toBeLessThan(1);
    expect(cutsceneK(M.lookUp)).toBe(1);
    expect(cutsceneK(landTime() + M.hold)).toBe(1);
    expect(cutsceneK(landTime())).toBe(1);
    expect(cutsceneK(total)).toBe(0);
    expect(cutsceneK(total + 5)).toBe(0);
    expect(cutsceneK(-1)).toBe(0);
  });
});

describe('timeline', () => {
  it('lasts 5 to 7 s, releases the gem during the ease-up and lands after it', () => {
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(7);
    expect(M.fallStart).toBeLessThan(M.lookUp);
    expect(landTime()).toBeGreaterThan(M.lookUp);
  });
  it('the camera comes home exactly', () => {
    expect(cutsceneK(total - 1e-6)).toBeCloseTo(0, 5);
    expect(cutsceneK(total)).toBe(0);
  });
});

describe('fallPosition', () => {
  it('starts high and ends on the ground at the target', () => {
    const a = fallPosition({ x: 100, z: 200 }, 0);
    expect(a.y).toBe(M.startHeight);
    expect(Math.hypot(a.x - 100, a.z - 200)).toBeCloseTo(M.slant);
    const b = fallPosition({ x: 100, z: 200 }, M.fallTime + 5);
    expect([b.x, b.y, b.z]).toEqual([100, 0, 200]);
  });

  it('fallTilt leans the gem top back along the fall path', () => {
    const a = fallPosition({ x: 0, z: 0 }, 0).clone();
    const b = fallPosition({ x: 0, z: 0 }, CONFIG.meteor.fallTime).clone();
    const back = a.sub(b).normalize();
    const top = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), fallTilt());
    expect(top.distanceTo(back)).toBeLessThan(1e-6);
  });
});
