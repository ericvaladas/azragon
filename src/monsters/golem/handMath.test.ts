import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SWAT_TIMES } from '../../monster/tailSwat';
import { armJoints, HAND_T, handBase, handPhase } from './handMath';

describe('handPhase', () => {
  it('reaches the flyer exactly at the shared anti-air impact, fist closed', () => {
    expect(HAND_T.impact).toBe(SWAT_TIMES.impact);
    expect(handPhase(0).rise).toBe(0);
    expect(handPhase(HAND_T.emerge).rise).toBeCloseTo(0.25);
    expect(handPhase(HAND_T.impact).rise).toBeCloseTo(1);
    expect(handPhase(HAND_T.impact - 0.05).grip).toBe(0);
    expect(handPhase(HAND_T.impact + 0.08).grip).toBeCloseTo(1);
  });
  it('rises monotonically, drags only after the hold, then fades out by the end', () => {
    let prev = -1;
    for (let t = 0; t <= HAND_T.impact; t += 0.01) {
      const r = handPhase(t).rise;
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(handPhase(HAND_T.hold).drag).toBe(0);
    expect(handPhase((HAND_T.hold + HAND_T.drag) / 2).drag).toBeGreaterThan(0);
    expect(handPhase(HAND_T.drag).drag).toBe(1);
    expect(handPhase(HAND_T.drag).fade).toBe(0);
    expect(handPhase(HAND_T.total).fade).toBe(1);
    expect(handPhase(HAND_T.total).pool).toBe(0);
  });
  it('opens its fist again when the flyer survived', () => {
    const t = HAND_T.hold + 0.3;
    expect(handPhase(t).grip).toBeCloseTo(1);
    expect(handPhase(t, true).grip).toBe(0);
  });
});

describe('handBase', () => {
  const monster = new THREE.Vector3(100, 0, -50);
  it('is on the ground beyond the flyer, away from the monster, set back by part of the altitude', () => {
    const flyer = new THREE.Vector3(100, 300, 400);
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const b = handBase(flyer, monster, r, new THREE.Vector3());
      expect(b.y).toBe(0);
      expect(Math.hypot(b.x - flyer.x, b.z - flyer.z)).toBeCloseTo(210);
      // Never back toward the monster: at least as far from it as the flyer's own ground point, give or take.
      expect(Math.hypot(b.x - monster.x, b.z - monster.z)).toBeGreaterThan(450 - 1);
    }
    const straight = handBase(flyer, monster, 0.5, new THREE.Vector3());
    expect(straight.x).toBeCloseTo(100);
    expect(straight.z).toBeCloseTo(610);
  });
  it('clamps the set-back for low and very high flyers, and copes with a flyer straight overhead', () => {
    const low = handBase(new THREE.Vector3(0, 50, 500), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(low.z).toBeCloseTo(620);
    const high = handBase(new THREE.Vector3(0, 2000, 500), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(high.z).toBeCloseTo(860);
    const over = handBase(new THREE.Vector3(0, 300, 0), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(Math.hypot(over.x, over.z)).toBeCloseTo(210);
  });
});

describe('armJoints', () => {
  const pts = () => Array.from({ length: 7 }, () => new THREE.Vector3());
  it('runs from the base to the wrist, bowed up at the middle by bend × length', () => {
    const base = new THREE.Vector3(0, 0, 0);
    const wrist = new THREE.Vector3(300, 400, 0);
    const j = armJoints(base, wrist, 0.2, 0, pts());
    expect(j[0]!.distanceTo(base)).toBeCloseTo(0);
    expect(j[6]!.distanceTo(wrist)).toBeCloseTo(0);
    // The curve's middle sits half the control offset off the line: 0.5 × 0.2 × 500 = 50 m, on the up side.
    const mid = j[3]!;
    const dir = wrist.clone().normalize();
    const off = mid.clone().sub(dir.clone().multiplyScalar(mid.dot(dir)));
    expect(off.length()).toBeCloseTo(50);
    expect(off.y).toBeGreaterThan(0);
  });
  it('twists sideways and survives a degenerate (zero-length) arm', () => {
    const j = armJoints(new THREE.Vector3(), new THREE.Vector3(0, 0, 400), 0, 0.25, pts());
    expect(Math.abs(j[3]!.x)).toBeCloseTo(50);
    const z = armJoints(new THREE.Vector3(5, 0, 5), new THREE.Vector3(5, 0, 5), 0.3, 0.1, pts());
    for (const p of z) expect(p.toArray()).toEqual([5, 0, 5]);
  });
});
