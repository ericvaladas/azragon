import { angleDelta } from '../util/math';
import { describe, it, expect } from 'vitest';
import { applyDrag, applyZoom, blendOrbit, cameraPose, fovForAspect, type OrbitState, swingBehind } from './orbit';
import { CONFIG } from '../config';

const C = CONFIG.camera;
const base: OrbitState = { yaw: 0, pitch: C.defaultPitch, distance: C.defaultDistance };

describe('cameraPose', () => {
  it('at yaw 0 sits directly behind (-Z) and above the target, centred, looking ahead (+Z)', () => {
    const { pos, look } = cameraPose(base, { x: 0, y: 0, z: 0 });
    expect(pos[2]).toBeLessThan(0);
    expect(pos[1]).toBeGreaterThan(C.shoulderHeight);
    expect(pos[0]).toBeCloseTo(0);
    expect(look[0]).toBeCloseTo(0);
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

describe('swingBehind', () => {
  const base = { yaw: 0, pitch: 0.7, distance: 1000 };
  it('closes on the monster yaw over time, leaving pitch and distance alone', () => {
    const a = swingBehind(base, 1, 3, 0.1);
    expect(a.yaw).toBeGreaterThan(0);
    expect(a.yaw).toBeLessThan(1);
    expect(a.pitch).toBe(0.7);
    expect(a.distance).toBe(1000);
    let s = base;
    for (let i = 0; i < 100; i++) s = swingBehind(s, 1, 3, 0.1);
    expect(s.yaw).toBeCloseTo(1, 5);
  });
  it('goes the short way round', () => {
    const s = swingBehind({ ...base, yaw: 3 }, -3, 3, 0.1);
    expect(s.yaw).toBeGreaterThan(3);
  });
});

describe('blendOrbit', () => {
  it("blend 0 keeps the player's orbit, 1 is the pull-back, yaw untouched", () => {
    const player: OrbitState = { yaw: 1.2, pitch: 0.5, distance: 900 };
    const pull = { pitch: 1.05, distance: 2000 };
    expect(blendOrbit(player, pull, 0)).toEqual(player);
    expect(blendOrbit(player, pull, 1)).toEqual({ yaw: 1.2, ...pull });
    const mid = blendOrbit(player, pull, 0.5);
    expect(mid.yaw).toBe(1.2);
    expect(mid.distance).toBeCloseTo(1450);
  });

  it('swings the yaw the short way round to a given yaw', () => {
    const player: OrbitState = { yaw: 3.0, pitch: 0.5, distance: 900 };
    const half = blendOrbit(player, { pitch: 0.5, distance: 900, yaw: -3.0 }, 0.5);
    expect(half.yaw).toBeCloseTo(3.0 + angleDelta(3.0, -3.0) * 0.5);
    expect(half.yaw).toBeGreaterThan(3.0);
    expect(blendOrbit(player, { pitch: 0.5, distance: 900 }, 0.5).yaw).toBe(3.0);
  });
});
