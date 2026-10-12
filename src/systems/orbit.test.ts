import { describe, it, expect } from 'vitest';
import { applyDrag, applyZoom, cameraPose, fovForAspect, type OrbitState } from './orbit';
import { CONFIG } from '../config';

const C = CONFIG.camera;
const base: OrbitState = { yaw: 0, pitch: C.defaultPitch, distance: C.defaultDistance };

describe('cameraPose', () => {
  it('at yaw 0 sits behind (-Z), above, and to the right (-X) of the target, looking ahead (+Z)', () => {
    const { pos, look } = cameraPose(base, { x: 0, y: 0, z: 0 });
    expect(pos[2]).toBeLessThan(0);
    expect(pos[1]).toBeGreaterThan(C.shoulderHeight);
    expect(pos[0]).toBeLessThan(0);
    expect(look[2]).toBeGreaterThan(0);
  });
  it('at yaw π/2 sits on the -X side, looking toward +X', () => {
    const { pos, look } = cameraPose({ ...base, yaw: Math.PI / 2 }, { x: 0, y: 0, z: 0 });
    expect(pos[0]).toBeLessThan(-100);
    expect(look[0]).toBeGreaterThan(0);
  });
  it('raises the camera as pitch increases', () => {
    const lo = cameraPose({ ...base, pitch: 0.2 }, { x: 0, y: 0, z: 0 });
    const hi = cameraPose({ ...base, pitch: 1.0 }, { x: 0, y: 0, z: 0 });
    expect(hi.pos[1]).toBeGreaterThan(lo.pos[1]);
  });
});

describe('applyDrag / applyZoom', () => {
  it('drag right turns the view right (yaw decreases), drag down raises pitch', () => {
    const s = applyDrag(base, 100, 50);
    expect(s.yaw).toBeLessThan(0);
    expect(s.pitch).toBeGreaterThan(base.pitch);
  });
  it('clamps pitch and distance', () => {
    expect(applyDrag(base, 0, 1e6).pitch).toBe(C.maxPitch);
    expect(applyDrag(base, 0, -1e6).pitch).toBe(C.minPitch);
    expect(applyZoom(base, 1e6).distance).toBe(C.maxDistance);
    expect(applyZoom(base, -1e6).distance).toBe(C.minDistance);
  });
});

describe('fovForAspect', () => {
  it('keeps the base vertical FOV in portrait', () => {
    expect(fovForAspect(390 / 844, 60, 82)).toBeCloseTo(60);
  });
  it('narrows vertical FOV in wide landscape so horizontal FOV stays at the cap', () => {
    const v = fovForAspect(1.6, 60, 82);
    expect(v).toBeLessThan(60);
    const h = (2 * Math.atan(Math.tan((v * Math.PI) / 360) * 1.6) * 180) / Math.PI;
    expect(h).toBeCloseTo(82, 3);
  });
});
