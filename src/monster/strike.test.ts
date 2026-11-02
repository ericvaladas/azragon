import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { footTargets, meleeLean, strikeFootPose, STRIKE_TIMES } from './strike';
import { strikePlan } from './strike';

const t = (x: number, z: number, opts: { airborne?: boolean; alive?: boolean; radius?: number } = {}) => ({
  position: { x, z },
  radius: opts.radius ?? 20,
  airborne: opts.airborne ?? false,
  isAlive: () => opts.alive ?? true,
});

describe('footTargets', () => {
  it('returns live ground targets whose footprint overlaps the foot radius', () => {
    const near = t(50, 0);
    const edge = t(64, 0, { radius: 20 });
    const far = t(200, 0);
    const air = t(10, 0, { airborne: true });
    const dead = t(5, 0, { alive: false });
    expect(footTargets({ x: 0, z: 0 }, 45, [near, edge, far, air, dead])).toEqual([near, edge]);
  });
});

describe('strikePlan', () => {
  // Monster at origin facing +Z (yaw 0): +X is its left.
  it('uses the front-left leg (0) for targets on the left (+X) and front-right (1) for the right', () => {
    expect(strikePlan({ x: 0, z: 0 }, 0, { x: 200, z: 300 }, 480).leg).toBe(0);
    expect(strikePlan({ x: 0, z: 0 }, 0, { x: -200, z: 300 }, 480).leg).toBe(1);
  });
  it('respects facing: when facing +X, a target at -Z is on the left', () => {
    expect(strikePlan({ x: 0, z: 0 }, Math.PI / 2, { x: 300, z: -100 }, 480).leg).toBe(0);
  });
  it('strikes the target point when in reach and clamps it to reach otherwise', () => {
    expect(strikePlan({ x: 0, z: 0 }, 0, { x: 100, z: 300 }, 480).point).toEqual({ x: 100, z: 300 });
    const p = strikePlan({ x: 0, z: 0 }, 0, { x: 0, z: 900 }, 480).point;
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(480);
  });
});

describe('strikeFootPose', () => {
  const W = 0.3;
  const gait = new THREE.Vector3(390, 0, 270);
  const lift = new THREE.Vector3(0, 420, -80);
  const target = new THREE.Vector3(600, 0, 500);
  const at = (t: number) => strikeFootPose(t, W, gait, lift, target, new THREE.Vector3());

  it('starts at the gait pose and is cocked high at the end of the windup', () => {
    expect(at(0).toArray()).toEqual(gait.toArray());
    expect(at(W).y).toBeCloseTo(420);
  });
  it('lands on the target and holds it', () => {
    expect(at(W + STRIKE_TIMES.strike).distanceTo(target)).toBeCloseTo(0);
    expect(at(W + STRIKE_TIMES.hold - 0.01).distanceTo(target)).toBeCloseTo(0);
  });
  it('eases back toward the gait pose during recovery (not stuck on the target)', () => {
    const mid = at(W + (STRIKE_TIMES.hold + STRIKE_TIMES.recover) / 2);
    expect(mid.distanceTo(target)).toBeGreaterThan(1);
    expect(mid.distanceTo(gait)).toBeGreaterThan(1);
    expect(at(W + STRIKE_TIMES.recover).distanceTo(gait)).toBeCloseTo(0);
  });
});

describe('meleeLean', () => {
  const T = { windup: 0.25, impact: 0.4, end: 0.8 };
  it('rears back by the windup, leans and sinks fully into the hit, and is upright at both ends', () => {
    expect(meleeLean(0, T)).toEqual({ pitch: 0, dip: 0 });
    expect(meleeLean(T.windup, T).pitch).toBeCloseTo(-0.12);
    expect(meleeLean(T.impact, T).pitch).toBeCloseTo(0.1);
    expect(meleeLean(T.impact, T).dip).toBeCloseTo(25);
    expect(meleeLean(T.end, T)).toEqual({ pitch: 0, dip: 0 });
  });
  it('never jumps between 60 fps frames', () => {
    let prev = meleeLean(0, T);
    for (let t = 1 / 60; t <= T.end + 0.05; t += 1 / 60) {
      const cur = meleeLean(t, T);
      expect(Math.abs(cur.pitch - prev.pitch)).toBeLessThan(0.05);
      expect(Math.abs(cur.dip - prev.dip)).toBeLessThan(6);
      prev = cur;
    }
  });
});
