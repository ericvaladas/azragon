import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SWAT_TIMES } from '../../monster/tailSwat';
import { ARM_BEND, armJointsTo, BECKON_T, dragPoint, beckonLift, beckonPull, beckonResume, fingerPoints, fistPoint, HAND_DIM, jointCurl, thumbPoints, HAND_T, handBase, handFrame, handPhase, WENDIGO_SWAT } from './handMath';

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
  it('never opens its fist once it has grabbed: shut from just after impact to the end, whether the flyer survived or not', () => {
    for (const survived of [false, true]) {
      for (let t = HAND_T.impact + HAND_T.close; t <= HAND_T.total; t += 0.01) expect(handPhase(t, survived).grip).toBeGreaterThan(0.999);
    }
  });
});

describe('handBase', () => {
  const monster = new THREE.Vector3(100, 0, -50);
  it('is on the ground beyond the flyer, away from the monster, set back by more than the altitude (a leaning arm)', () => {
    const flyer = new THREE.Vector3(100, 300, 400);
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const b = handBase(flyer, monster, r, new THREE.Vector3());
      expect(b.y).toBe(0);
      expect(Math.hypot(b.x - flyer.x, b.z - flyer.z)).toBeCloseTo(390);
      // Never back toward the monster: at least as far from it as the flyer's own ground point, give or take.
      expect(Math.hypot(b.x - monster.x, b.z - monster.z)).toBeGreaterThan(450 - 1);
    }
    const straight = handBase(flyer, monster, 0.5, new THREE.Vector3());
    expect(straight.x).toBeCloseTo(100);
    expect(straight.z).toBeCloseTo(790);
  });
  it('clamps the set-back for low and very high flyers, and copes with a flyer straight overhead', () => {
    const low = handBase(new THREE.Vector3(0, 50, 500), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(low.z).toBeCloseTo(680);
    const high = handBase(new THREE.Vector3(0, 2000, 500), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(high.z).toBeCloseTo(1100);
    const over = handBase(new THREE.Vector3(0, 300, 0), new THREE.Vector3(), 0.5, new THREE.Vector3());
    expect(Math.hypot(over.x, over.z)).toBeCloseTo(390);
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
  it('turns the palm down over the flyer: back of the hand to the sky, fingers reaching on past it', () => {
    const flyer = new THREE.Vector3(40, 300, 200);
    const F = new THREE.Vector3();
    const S = new THREE.Vector3();
    const N = new THREE.Vector3();
    handFrame(base, flyer, 1, F, S, N);
    expect(N.y).toBeLessThan(-0.9);
    // Fingers about level (a touch up, so the arm need hardly bend to them), reaching on past the flyer.
    expect(Math.abs(F.y)).toBeLessThan(0.35);
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

describe('fist grasp', () => {
  const D = HAND_DIM;
  const hold = new THREE.Vector3(0, D.holdFwd, D.holdIn);
  const pts = () => Array.from({ length: 4 }, () => new THREE.Vector3());
  it('flexes each finger knuckle first, then the middle joint, then the tip; index leading, little finger last', () => {
    const a = jointCurl(0.3, 0, 1);
    const open = jointCurl(0, 0, 1);
    const shut = jointCurl(1, 0, 1);
    const k = (j: 0 | 1 | 2) => (a[j] - open[j]) / (shut[j] - open[j]);
    expect(k(0)).toBeGreaterThan(k(1));
    expect(k(1)).toBeGreaterThan(k(2));
    expect(jointCurl(0.4, 0, 0)[0]).toBeGreaterThan(jointCurl(0.4, 0, 3)[0]);
  });
  it('opens wide on the approach: straight out past the palm, bent back a little (hyperextended)', () => {
    const open = jointCurl(0, 0, 2);
    expect(open[0]).toBeLessThan(0);
    for (let f = 0; f < 4; f++) {
      const P = fingerPoints(0, 0, f, pts());
      expect(P[3]!.y).toBeGreaterThan(D.palmLen + 0.75 * (D.phalanx[0] + D.phalanx[1] + D.phalanx[2]) * D.fingerScale[f]!);
      expect(P[3]!.z).toBeLessThanOrEqual(0);
      expect(P[3]!.distanceTo(hold)).toBeGreaterThan(45);
    }
  });
  it('closes into a fist round the prize: every finger curled round it, tips back in on the palm side', () => {
    for (let f = 0; f < 4; f++) {
      const P = fingerPoints(1, 0, f, pts());
      expect(P[3]!.z).toBeGreaterThan(10);
      expect(P[3]!.y).toBeLessThan(D.palmLen);
      for (const p of P.slice(1)) expect(Math.hypot(p.y - hold.y, p.z - hold.z)).toBeLessThan(32);
    }
    const T = thumbPoints(1, 0, pts());
    expect(T[3]!.distanceTo(hold)).toBeLessThan(28);
    // The thumb crosses over toward the fingers (opposed), from its root on the index side.
    expect(T[3]!.x).toBeGreaterThan(T[0]!.x + 15);
    const To = thumbPoints(0, 0, pts());
    expect(To[3]!.x).toBeLessThan(To[0]!.x - 15);
  });
  it('squeezes tighter in the crush', () => {
    const a = fingerPoints(1, 0, 1, pts());
    const b = fingerPoints(1, 1, 1, pts());
    expect(Math.hypot(b[3]!.y - hold.y, b[3]!.z - hold.z)).toBeLessThan(Math.hypot(a[3]!.y - hold.y, a[3]!.z - hold.z) + 1e-9);
    expect(jointCurl(1, 1, 1)[1]).toBeGreaterThan(jointCurl(1, 0, 1)[1]);
  });
  it('squeezes only while it holds a wreck, but stays shut on a survivor too', () => {
    expect(handPhase(HAND_T.impact - 0.01).squeeze).toBe(0);
    expect(handPhase(HAND_T.hold).squeeze).toBeGreaterThan(0.8);
    expect(handPhase(HAND_T.hold, true).squeeze).toBe(0);
    expect(handPhase(HAND_T.hold + 0.3, true).grip).toBeCloseTo(1);
  });
});

describe('rigid wrist', () => {
  it('a long, nearly straight arm leaning in from its pool, bending only a little at the elbow, the forearm running straight into the hand', () => {
    const F = new THREE.Vector3();
    const S = new THREE.Vector3();
    const N = new THREE.Vector3();
    const a = new THREE.Vector3();
    const w = new THREE.Vector3();
    const J = Array.from({ length: 8 }, () => new THREE.Vector3());
    for (const flyer of [new THREE.Vector3(0, 300, 400), new THREE.Vector3(250, 150, 300), new THREE.Vector3(-200, 450, 250), new THREE.Vector3(0, 600, 500)]) {
      const base = handBase(flyer, new THREE.Vector3(), 0.5, new THREE.Vector3()).setY(-25);
      for (let t = 0.1; t < HAND_T.drag; t += 0.02) {
        const ph = handPhase(t);
        if (t < HAND_T.impact) fistPoint(base, flyer, ph.rise, a);
        else dragPoint(base, flyer, ph.drag, a);
        handFrame(base, flyer, t < HAND_T.impact ? ph.rise : 1, F, S, N, ph.drag);
        w.copy(a).addScaledVector(F, -HAND_DIM.holdFwd * 2).addScaledVector(N, -HAND_DIM.holdIn * 2);
        armJointsTo(base, w, F, ARM_BEND, 0.03, J);
        expect(J[0]!.distanceTo(base)).toBeLessThan(1e-6);
        expect(J[7]!.distanceTo(w)).toBeLessThan(1e-6);
        const fore = J[7]!.clone().sub(J[6]!).normalize();
        expect(fore.angleTo(F)).toBeLessThan((3 * Math.PI) / 180);
        // Nearly straight: little turn between bones along the arm, a modest elbow, under 1.5 rad in all (was ~2.7).
        let total = 0;
        for (let k = 1; k < 7; k++) {
          const g = J[k]!.clone().sub(J[k - 1]!).angleTo(J[k + 1]!.clone().sub(J[k]!));
          total += g;
          expect(g).toBeLessThan(k < 6 ? 0.25 : 1.1);
        }
        expect(total).toBeLessThan(1.5);
      }
    }
  });

  it('drags its prize down into the ground out beyond the pool, toward the flyer, the hand tipping on over', () => {
    const base = new THREE.Vector3(0, -25, 600);
    const held = new THREE.Vector3(40, 300, 200);
    expect(dragPoint(base, held, 0, new THREE.Vector3()).distanceTo(held)).toBeLessThan(1e-9);
    const end = dragPoint(base, held, 1, new THREE.Vector3());
    expect(end.y).toBeLessThan(0);
    const out = Math.hypot(end.x - base.x, end.z - base.z);
    expect(out).toBeGreaterThan(100);
    expect(out).toBeLessThan(Math.hypot(held.x - base.x, held.z - base.z));
    const F = new THREE.Vector3();
    const S = new THREE.Vector3();
    const N = new THREE.Vector3();
    handFrame(base, held, 1, F, S, N, 1);
    expect(F.y).toBeLessThan(-0.3);
    expect(N.y).toBeLessThan(-0.85);
    handFrame(base, held, 1, F, S, N, 0);
    expect(N.y).toBeLessThan(-0.6);
  });
});
