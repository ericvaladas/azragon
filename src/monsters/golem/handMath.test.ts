import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SWAT_TIMES } from '../../monster/tailSwat';
import { armJoints, BECKON_T, beckonLift, beckonPull, beckonResume, fistPoint, HAND_T, handBase, handFrame, handPhase, WENDIGO_SWAT } from './handMath';

describe('handPhase', () => {
  it("reaches the flyer exactly at the Wendigo's anti-air impact, fist closed", () => {
    expect(HAND_T.impact).toBe(WENDIGO_SWAT.impact);
    expect(HAND_T.emerge).toBe(WENDIGO_SWAT.windup);
    expect(handPhase(0).rise).toBe(0);
    expect(handPhase(HAND_T.emerge).rise).toBeCloseTo(0.25);
    expect(handPhase(HAND_T.impact).rise).toBeCloseTo(1);
    expect(handPhase(HAND_T.impact - 0.07).grip).toBe(0);
    expect(handPhase(HAND_T.impact).grip).toBeGreaterThan(0.2);
    expect(handPhase(HAND_T.impact).grip).toBeLessThan(0.6);
    expect(handPhase(HAND_T.impact + 0.12).grip).toBeCloseTo(1);
  });
  it('plays every phase about a third slower than the original grab, one heavy motion with the claw swat', () => {
    // Original phases (s): emerge 0.12, lunge 0.10, crush 0.14, drag 0.60, dissolve 0.45; fingers closed in 0.12.
    const ratio = (now: number, was: number) => now / was;
    for (const [now, was] of [
      [HAND_T.emerge, 0.12],
      [HAND_T.impact - HAND_T.emerge, 0.1],
      [HAND_T.hold - HAND_T.impact, 0.14],
      [HAND_T.drag - HAND_T.hold, 0.6],
      [HAND_T.total - HAND_T.drag, 0.45],
      [HAND_T.close, 0.12],
    ] as const) {
      expect(ratio(now, was)).toBeGreaterThanOrEqual(1.29);
      expect(ratio(now, was)).toBeLessThanOrEqual(1.41);
    }
    // The fingers take HAND_T.close to shut: barely started before, shut after.
    expect(handPhase(HAND_T.impact + HAND_T.close * 0.6).grip).toBeLessThan(1);
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

describe('WENDIGO_SWAT', () => {
  it('is a slower, heavier take on the shared anti-air timeline, with only a small delay to the damage', () => {
    expect(WENDIGO_SWAT.total / SWAT_TIMES.total).toBeGreaterThan(1.3);
    expect(WENDIGO_SWAT.total / SWAT_TIMES.total).toBeLessThan(1.45);
    expect(WENDIGO_SWAT.recover / SWAT_TIMES.recover).toBeGreaterThan(1.3);
    expect(WENDIGO_SWAT.impact).toBeGreaterThan(SWAT_TIMES.impact);
    expect(WENDIGO_SWAT.impact - SWAT_TIMES.impact).toBeLessThanOrEqual(0.08);
  });
});

describe('overhand grip', () => {
  const base = new THREE.Vector3(0, 0, 600);
  it('arcs the closing point up over the flyer and drops onto it exactly at impact', () => {
    for (const alt of [150, 300, 450]) {
      const flyer = new THREE.Vector3(40, alt, 200);
      const at = (t: number) => fistPoint(base, flyer, handPhase(t).rise, new THREE.Vector3());
      expect(at(HAND_T.impact).distanceTo(flyer)).toBeLessThan(1e-6);
      // Just before the grab the hand is above the flyer, coming down onto it.
      expect(at(HAND_T.impact - 0.04).y).toBeGreaterThan(flyer.y + 10);
      expect(at(HAND_T.impact - 0.01).y).toBeGreaterThan(flyer.y);
      // It starts low, at the pool.
      expect(at(0).y).toBeLessThan(60);
    }
  });
  it('turns the palm down over the flyer: back of the hand to the sky, fingers forward and down', () => {
    const flyer = new THREE.Vector3(40, 300, 200);
    const F = new THREE.Vector3();
    const S = new THREE.Vector3();
    const N = new THREE.Vector3();
    handFrame(base, flyer, 1, F, S, N);
    expect(N.y).toBeLessThan(-0.6);
    expect(F.y).toBeLessThan(0);
    // Fingers reach on past the flyer, away from the pool.
    const out = new THREE.Vector3(flyer.x - base.x, 0, flyer.z - base.z).normalize();
    expect(F.dot(out)).toBeGreaterThan(0.5);
    // An orthonormal, right-handed frame (S × F = N), so the palm slab and fingers stay unsheared.
    expect(F.length()).toBeCloseTo(1);
    expect(S.length()).toBeCloseTo(1);
    expect(F.dot(N)).toBeCloseTo(0);
    expect(new THREE.Vector3().crossVectors(S, F).distanceTo(N)).toBeLessThan(1e-6);
  });
  it('bursts out of the pool reaching up, palm toward the flyer, and rolls over smoothly as it rises', () => {
    const flyer = new THREE.Vector3(40, 300, 200);
    const F = new THREE.Vector3();
    const S = new THREE.Vector3();
    const N = new THREE.Vector3();
    handFrame(base, flyer, 0, F, S, N);
    expect(F.y).toBeGreaterThan(0.8);
    const prev = new THREE.Vector3();
    handFrame(base, flyer, 0, prev, S, N);
    for (let r = 0.02; r <= 1.0001; r += 0.02) {
      handFrame(base, flyer, r, F, S, N);
      expect(F.angleTo(prev)).toBeLessThan(0.12);
      prev.copy(F);
    }
  });
});

describe('beckon (the Wendigo claw over a whole Shadow Hands grab)', () => {
  it('rises slowly: at most half the old claw speed (full reach in 0.29 s before), the rise easing in', () => {
    expect(beckonLift(0)).toBe(0);
    expect(BECKON_T.rise).toBeGreaterThanOrEqual(2 * WENDIGO_SWAT.impact);
    expect(beckonLift(BECKON_T.rise)).toBeCloseTo(1);
    expect(beckonLift(0.1)).toBeLessThan(0.05);
    let prev = 0;
    for (let t = 0; t <= BECKON_T.end + 0.2; t += 1 / 120) {
      const v = beckonLift(t);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      if (t <= BECKON_T.rise) expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
  it('lingers, then lowers slowly back to the walk over the whole grab', () => {
    expect(BECKON_T.end).toBeGreaterThanOrEqual(HAND_T.total - 0.05);
    expect(beckonLift((BECKON_T.rise + BECKON_T.lower) / 2)).toBeCloseTo(1);
    expect(beckonLift(BECKON_T.end)).toBe(0);
    expect(beckonLift(BECKON_T.end + 1)).toBe(0);
  });
  it('tugs as the shadow hand clenches on the flyer, then hauls down with its drag', () => {
    expect(beckonPull(HAND_T.impact - 0.01)).toBe(0);
    expect(beckonPull(HAND_T.impact + 0.15)).toBeGreaterThan(0.15);
    expect(beckonPull(HAND_T.hold)).toBeLessThan(0.3);
    expect(beckonPull(HAND_T.drag)).toBeCloseTo(1);
    let prev = 0;
    for (let t = 0; t <= HAND_T.total; t += 1 / 120) {
      const v = beckonPull(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v - prev).toBeLessThan(0.03);
      prev = v;
    }
  });
  it('picks up a new grab from wherever the claw already is (no snap)', () => {
    for (const lift of [0, 0.2, 0.5, 0.9, 1]) {
      const t = beckonResume(lift);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(BECKON_T.rise);
      expect(beckonLift(t)).toBeCloseTo(lift, 2);
    }
  });
});
