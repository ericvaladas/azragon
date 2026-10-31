import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { angularSize, bearingOf, crossed, inWedge, lancePhase, lanceRoarWorldLength } from './plasmaLance';

const U = CONFIG.kaiju.ultimate;
const T = U.t;
const O = { x: 0, z: 0 };
const at = (bearing: number, r: number) => ({ x: Math.sin(bearing) * r, z: Math.cos(bearing) * r });

describe('lancePhase', () => {
  it('slows the world, turns the sky, then sweeps right to left during the sweep beat', () => {
    expect(lancePhase(0).time).toBe(1);
    expect(lancePhase(1).time).toBeCloseTo(U.timeScale);
    expect(lancePhase(T.end).time).toBe(1);
    expect(lancePhase(T.sky).sky).toBe(1);
    expect(lancePhase(T.fire - 0.01).beam).toBe(0);
    const mid = (T.fire + T.sweepTo) / 2;
    expect(lancePhase(mid).beam).toBe(1);
    expect(lancePhase(T.fire).sweep).toBeCloseTo(-U.halfAngle);
    expect(lancePhase(mid).sweep).toBeCloseTo(0);
    expect(lancePhase(T.sweepTo).sweep).toBeCloseTo(U.halfAngle);
    let last = -Infinity;
    for (let t = 0; t <= T.end; t += 0.05) {
      const s = lancePhase(t).sweep;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(lancePhase(T.end).done).toBe(true);
    expect(lancePhase(T.end - 0.01).done).toBe(false);
  });

  it('roars from Q as the camera pulls out, until it turns to aim: its length in world (slowed) seconds', () => {
    const w = lanceRoarWorldLength();
    expect(w).toBeLessThan(T.roarTo);
    expect(w).toBeGreaterThan(T.roarTo * U.timeScale);
    expect(T.roarTo).toBeLessThan(T.fire);
  });

  it('after the roar the head eases round to the right edge, then follows the beam, with no jump', () => {
    expect(lancePhase(T.roarTo - 0.01).look).toBeNull();
    expect(lancePhase(T.roarTo).look).toBeCloseTo(0);
    expect(lancePhase(T.fire).look).toBeCloseTo(-U.halfAngle);
    expect(lancePhase((T.fire + T.sweepTo) / 2).look).toBeCloseTo(lancePhase((T.fire + T.sweepTo) / 2).sweep);
    expect(lancePhase(T.sweepTo + 0.2).look).toBeNull();
    let prev = lancePhase(T.roarTo).look!;
    for (let t = T.roarTo + 0.01; t <= T.sweepTo; t += 0.01) {
      const look = lancePhase(t).look!;
      expect(Math.abs(look - prev)).toBeLessThan(0.05);
      prev = look;
    }
  });

  it('blazes through the build-up; the debris starts rising slowly during the roar and keeps climbing through the sweep', () => {
    expect(lancePhase(T.glowFrom).blaze).toBe(0);
    expect(lancePhase(T.glowTo).blaze).toBe(1);
    expect(lancePhase(T.end).blaze).toBe(0);
    expect(lancePhase(T.liftFrom).lift).toBe(0);
    const roaring = lancePhase(T.roarTo).lift;
    expect(roaring).toBeGreaterThan(0);
    expect(roaring).toBeLessThan(0.3);
    expect(lancePhase(T.fire).lift).toBeLessThan(lancePhase((T.fire + T.sweepTo) / 2).lift);
    expect(lancePhase(T.sweepTo).lift).toBe(1);
  });

  it('the sky darkens over the whole roar', () => {
    expect(T.sky).toBe(T.roarTo);
    expect(lancePhase(T.roarTo / 2).sky).toBeGreaterThan(0.2);
    expect(lancePhase(T.roarTo / 2).sky).toBeLessThan(0.8);
  });
});

describe('the wedge', () => {
  it('bearings are measured from the facing, positive to its left, and wrap', () => {
    expect(bearingOf(O, 0, { x: -100, z: 100 })).toBeCloseTo(-Math.PI / 4);
    expect(bearingOf(O, 0, { x: 100, z: 100 })).toBeCloseTo(Math.PI / 4);
    expect(bearingOf(O, 3.0, { x: Math.sin(3) * 500, z: Math.cos(3) * 500 })).toBeCloseTo(0);
    expect(Math.abs(bearingOf(O, 3.0, { x: -Math.sin(3) * 500, z: -Math.cos(3) * 500 }))).toBeCloseTo(Math.PI);
  });

  it("the wedge is the front 120° to its range, widened by a target's size", () => {
    expect(inWedge(O, 0, { x: 0, z: 1399 }, 0)).toBe(true);
    expect(inWedge(O, 0, { x: 0, z: 1450 }, 0)).toBe(false);
    expect(inWedge(O, 0, { x: 0, z: 1450 }, 60)).toBe(true);
    expect(inWedge(O, 0, at(1.1, 500), 0)).toBe(false);
    expect(inWedge(O, 0, at(1.1, 500), 60)).toBe(true);
    expect(inWedge(O, 0, { x: 0, z: -300 }, 0)).toBe(false);
    expect(inWedge(O, 0, { x: 0, z: -300 }, 60)).toBe(false);
  });

  it("a target's angular size grows as it gets closer, never past a right angle", () => {
    expect(angularSize(500, 60)).toBeCloseTo(Math.asin(60 / 500));
    expect(angularSize(30, 60)).toBeCloseTo(Math.PI / 2);
    expect(angularSize(500, 0)).toBe(0);
  });

  it('crossed catches a bearing anywhere the beam passed, however big the step', () => {
    expect(crossed(-1, -0.9, -0.95, 0)).toBe(true);
    expect(crossed(-1, 0.5, 0.2, 0)).toBe(true);
    expect(crossed(-1, -0.9, -0.85, 0)).toBe(false);
    expect(crossed(-1, -0.9, -0.85, 0.06)).toBe(true);
    expect(crossed(-0.9, -0.9, -0.9, 0)).toBe(false);
  });
});
