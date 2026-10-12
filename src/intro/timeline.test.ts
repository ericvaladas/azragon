import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CUT_TIME, EMERGE_TIME, IMPACT_TIME, INTRO_LENGTH, cameraPath, flashAt, gameplayPose, monsterCrouch, phaseAt, podPath, shakeAt } from './timeline';
import { CONFIG } from '../config';

const S = CONFIG.intro.starts;
const cam = (t: number) => cameraPath(t, { pos: new THREE.Vector3(), look: new THREE.Vector3() });

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
  it('starts high and behind at the cut, lands on the origin at impact, then rests half-buried', () => {
    const p = new THREE.Vector3();
    podPath(CUT_TIME, p);
    expect(p.y).toBeCloseTo(CONFIG.intro.dropHeight);
    expect(p.z).toBeCloseTo(-CONFIG.intro.dropBack);
    podPath(IMPACT_TIME, p);
    expect(p.length()).toBeCloseTo(0);
    podPath(IMPACT_TIME + 1, p);
    expect(p.y).toBeCloseTo(CONFIG.intro.podRestY);
  });
  it('falls faster and faster (accelerating descent)', () => {
    const y = (t: number) => podPath(t, new THREE.Vector3()).y;
    const d1 = y(CUT_TIME) - y(CUT_TIME + 1);
    const d2 = y(IMPACT_TIME - 1) - y(IMPACT_TIME);
    expect(d2).toBeGreaterThan(d1);
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
  it('follows behind and above the falling pod during the clouds', () => {
    const t = CUT_TIME + 1;
    const pod = podPath(t, new THREE.Vector3());
    const c = cam(t);
    expect(c.pos.y).toBeGreaterThan(pod.y);
    expect(c.pos.z).toBeLessThan(pod.z);
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
