import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CUT_TIME, EMERGE_TIME, FALL_PITCH, IMPACT_TIME, INTRO_LENGTH, blackAt, cameraPath, flashAt, gameplayPose, introFog, monsterCrouch, phaseAt, podLengthFor, podPath, podSpin, shakeAt } from './timeline';
import { spaceCamera } from './spaceMath';
import { CONFIG } from '../config';

const S = CONFIG.intro.starts;
const POD = 620;
const cam = (t: number) => cameraPath(t, POD, { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() });

describe('phaseAt', () => {
  it('maps times to phases with in-phase progress', () => {
    expect(phaseAt(0)).toEqual({ phase: 'space', k: 0 });
    expect(phaseAt(S.reentry)).toEqual({ phase: 'reentry', k: 0 });
    const mid = phaseAt((S.reentry + S.clouds) / 2);
    expect(mid.phase).toBe('reentry');
    expect(mid.k).toBeCloseTo(0.5);
    expect(phaseAt(S.impact + 0.01).phase).toBe('impact');
    expect(phaseAt(INTRO_LENGTH).phase).toBe('done');
    expect(phaseAt(999).phase).toBe('done');
  });
  it('places the cut at the end of re-entry, and impact/emerge at their phase starts', () => {
    expect(CUT_TIME).toBe(S.clouds);
    expect(IMPACT_TIME).toBe(S.impact);
    expect(EMERGE_TIME).toBe(S.emerge);
    expect(INTRO_LENGTH).toBe(S.done);
  });
});

describe('podPath', () => {
  it('joins the fall part-way at the cut (the first 3 s of clouds are skipped), lands on the origin at impact, then stays put', () => {
    const p = new THREE.Vector3();
    podPath(CUT_TIME, p);
    // Where the old 5 s fall was 3 s in (u = 0.6).
    expect(p.y).toBeCloseTo(CONFIG.intro.dropHeight * (1 - 0.6 * 0.6));
    expect(p.z).toBeCloseTo(-CONFIG.intro.dropBack * (1 - 0.6 * 0.6));
    podPath(IMPACT_TIME, p);
    expect(p.length()).toBeCloseTo(0);
    podPath(IMPACT_TIME + 1, p);
    expect(p.length()).toBeCloseTo(0);
    podPath(EMERGE_TIME - 0.01, p);
    expect(p.length()).toBeCloseTo(0);
  });
  it('drops in a straight line along its nose (FALL_PITCH below horizontal)', () => {
    for (const t of [CUT_TIME, CUT_TIME + 0.7, IMPACT_TIME - 0.3]) {
      const p = podPath(t, new THREE.Vector3());
      expect(Math.atan2(p.y, -p.z)).toBeCloseTo(FALL_PITCH);
    }
    expect(FALL_PITCH).toBeGreaterThan(1.1);
    expect(FALL_PITCH).toBeLessThan(1.45);
  });
  it('falls at the same pace as before the trim (no squashed, rushed drop)', () => {
    const v = (t: number) => (podPath(t, new THREE.Vector3()).y - podPath(t + 0.01, new THREE.Vector3()).y) / 0.01;
    // The old fall: y = H(1 - u²), u over 5 s, so dy/dt at u = 0.6 was 2 * 0.6 * H / 5.
    expect(v(CUT_TIME)).toBeCloseTo((2 * 0.6 * CONFIG.intro.dropHeight) / 5, -1);
  });
  it('cuts the intro 3 s shorter, all of it from the cloud scene', () => {
    expect(S.descent - S.clouds).toBe(0);
    expect(INTRO_LENGTH).toBe(12);
  });
  it('falls faster and faster (accelerating descent)', () => {
    const y = (t: number) => podPath(t, new THREE.Vector3()).y;
    const d1 = y(CUT_TIME) - y(CUT_TIME + 1);
    const d2 = y(IMPACT_TIME - 1) - y(IMPACT_TIME);
    expect(d2).toBeGreaterThan(d1);
  });
});

describe('podSpin', () => {
  it('turns steadily through space and the fall, then freezes where it was at impact (no snap)', () => {
    expect(podSpin(0)).toBe(0);
    expect(podSpin(CUT_TIME + 0.01) - podSpin(CUT_TIME - 0.01)).toBeCloseTo(0.02 * CONFIG.intro.spin);
    expect(podSpin(IMPACT_TIME + 2)).toBeCloseTo(podSpin(IMPACT_TIME));
  });
});

describe('cameraPath', () => {
  it('ends exactly on the gameplay pose (no jump when play starts)', () => {
    const g = gameplayPose();
    for (const t of [INTRO_LENGTH, INTRO_LENGTH + 5]) {
      const c = cam(t);
      expect(c.pos.distanceTo(g.pos)).toBeCloseTo(0);
      expect(c.look.distanceTo(g.look)).toBeCloseTo(0);
    }
  });
  it('is continuous across the descent, impact, and emerge boundaries', () => {
    for (const b of [S.descent, IMPACT_TIME, EMERGE_TIME, INTRO_LENGTH]) {
      const a = cam(b - 1e-4);
      const c = cam(b + 1e-4);
      expect(a.pos.distanceTo(c.pos)).toBeLessThan(1);
      expect(a.look.distanceTo(c.look)).toBeLessThan(1);
    }
  });
  it('opens behind and above the falling pod at the cut', () => {
    const t = CUT_TIME + 0.05;
    const pod = podPath(t, new THREE.Vector3());
    const c = cam(t);
    expect(c.pos.y).toBeGreaterThan(pod.y);
    // Behind it along its direction of travel (down and forward).
    const travel = podPath(t + 0.01, new THREE.Vector3()).sub(pod);
    expect(c.pos.clone().sub(pod).dot(travel)).toBeLessThan(0);
  });
  it('frames the pod exactly as the space shot did (same angle, scaled to the pod), from the cut until the cocoon splits', () => {
    const sp = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    spaceCamera(sp.pos, sp.look);
    const L = CONFIG.intro.space.podLength;
    // Back into the pod's travel frame: undo the fall's nose-down pitch.
    const unpitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -FALL_PITCH);
    for (const t of [CUT_TIME + 0.01, CUT_TIME + 1, IMPACT_TIME - 0.01, IMPACT_TIME + 0.5, EMERGE_TIME - 0.01]) {
      const pod = podPath(t, new THREE.Vector3());
      const c = cam(t);
      const pos = c.pos.clone().sub(pod).applyQuaternion(unpitch).divideScalar(POD);
      const look = c.look.clone().sub(pod).applyQuaternion(unpitch).divideScalar(POD);
      expect(pos.distanceTo(sp.pos.clone().divideScalar(L))).toBeLessThan(1e-6);
      expect(look.distanceTo(sp.look.clone().divideScalar(L))).toBeLessThan(1e-6);
      expect(c.up.clone().applyQuaternion(unpitch).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    }
  });
  it('looks steeply down at the city during the fall', () => {
    const c = cam(CUT_TIME + 0.5);
    const dir = c.look.clone().sub(c.pos).normalize();
    expect(dir.y).toBeLessThan(-0.9);
  });
  it('hands back an upright camera at the end', () => {
    expect(cam(INTRO_LENGTH).up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0);
  });
});

describe('blackAt', () => {
  it('opens on black and fades in over fadeIn, ahead of the re-entry', () => {
    const F = CONFIG.intro.fadeIn;
    expect(blackAt(0)).toBe(1);
    expect(blackAt(F / 2)).toBeGreaterThan(0);
    expect(blackAt(F / 2)).toBeLessThan(1);
    expect(blackAt(F / 4)).toBeGreaterThan(blackAt(F / 2));
    expect(blackAt(F)).toBe(0);
    expect(blackAt(INTRO_LENGTH)).toBe(0);
    expect(F).toBeLessThan(S.reentry);
  });
});

describe('introFog', () => {
  it('pushes the fog out while the camera is high, so the city below stays visible, and is the game fog near the ground', () => {
    const f = { near: 0, far: 0 };
    introFog(5000, f);
    // The ground straight below (and out to the frame's edges) is clear of fog.
    expect(f.near).toBeGreaterThan(5000 * 1.05);
    expect(f.far).toBeGreaterThan(5000 * 2.2);
    introFog(300, f);
    expect(f).toEqual(CONFIG.fog);
  });
});

describe('flashAt', () => {
  const F = CONFIG.intro.flash;
  it('is clear in space, builds to white at the cut, holds, then fades', () => {
    expect(flashAt(0)).toBe(0);
    expect(flashAt(CUT_TIME - F.rise - 0.01)).toBe(0);
    expect(flashAt(CUT_TIME - 0.001)).toBeGreaterThan(0.95);
    expect(flashAt(CUT_TIME)).toBe(1);
    expect(flashAt(CUT_TIME + F.hold + F.fade / 2)).toBeCloseTo(0.5);
    expect(flashAt(CUT_TIME + F.hold + F.fade + 0.01)).toBe(0);
  });
  it('flashes again at impact and is clear when play starts', () => {
    expect(flashAt(IMPACT_TIME)).toBeCloseTo(F.impactPeak);
    expect(flashAt(IMPACT_TIME + F.impactFade + 0.01)).toBe(0);
    expect(flashAt(INTRO_LENGTH)).toBe(0);
  });
});

describe('shakeAt', () => {
  it('is calm in space, strongest at impact, and zero when play starts', () => {
    expect(shakeAt(1)).toBe(0);
    expect(shakeAt(IMPACT_TIME + 0.1)).toBe(1);
    expect(shakeAt(CUT_TIME - 0.1)).toBeGreaterThan(shakeAt(CONFIG.intro.starts.reentry + 0.2));
    expect(shakeAt(INTRO_LENGTH - 0.01)).toBe(0);
  });
});

describe('monsterCrouch', () => {
  it('stays fully curled inside the cocoon until it splits, then stands up within riseTime', () => {
    expect(monsterCrouch(0)).toBe(1);
    expect(monsterCrouch(EMERGE_TIME - 0.01)).toBe(1);
    expect(monsterCrouch(EMERGE_TIME)).toBe(1);
    expect(monsterCrouch(EMERGE_TIME + CONFIG.intro.riseTime / 2)).toBeLessThan(0.5);
    expect(monsterCrouch(EMERGE_TIME + CONFIG.intro.riseTime)).toBe(0);
    expect(monsterCrouch(INTRO_LENGTH)).toBe(0);
  });
});

describe('podLengthFor', () => {
  it('fits the monster\'s largest dimension with room to spare (the Insect gets the 620 m cocoon)', () => {
    expect(podLengthFor({ width: 484, length: 451, height: 344 })).toBeCloseTo(620, -1);
    const big = podLengthFor({ width: 300, length: 700, height: 400 });
    expect(big).toBeGreaterThan(700);
    expect(big).toBeCloseTo(700 * CONFIG.intro.podFit);
  });
});
