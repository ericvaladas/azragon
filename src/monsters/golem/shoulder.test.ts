import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clampShoulder, inShoulder, reachTwist, softCap, springStep } from './shoulder';

const LIM = { back: 0.26, tilt: 0.45, medial: 0.6, raise: 0.95 };
const B = LIM;
const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

describe('shoulder range', () => {
  it('leaves a direction inside the range untouched', () => {
    for (const d of [dir(0.2, -1, 0.4), dir(1, -0.5, 0.3), dir(0.5, 0.2, 1), dir(-0.3, -1, 0.5), dir(0, -1, 0)]) {
      const out = new THREE.Vector3();
      expect(clampShoulder(d, B, out)).toBe(0);
      expect(out.distanceTo(d)).toBeLessThan(1e-9);
      expect(inShoulder(d, B)).toBe(true);
    }
  });

  it('stops a level arm swinging behind the back past the coronal plane by `back`', () => {
    const out = new THREE.Vector3();
    const moved = clampShoulder(dir(1, 0, -1), B, out);
    expect(moved).toBeGreaterThan(0.4);
    expect(out.z).toBeCloseTo(-Math.sin(LIM.back), 3);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.x).toBeGreaterThan(0.9);
    expect(out.length()).toBeCloseTo(1);
  });

  it('lets a hanging arm extend further back than a level one (the back limit tilts)', () => {
    const hang = new THREE.Vector3();
    clampShoulder(dir(0, -1, -1), B, hang);
    expect(hang.z).toBeLessThan(-Math.sin(LIM.back) - 0.1);
    expect(inShoulder(hang, B, 1e-6)).toBe(true);
  });

  it('limits adduction across the chest and raising above the head', () => {
    const across = new THREE.Vector3();
    clampShoulder(dir(-1, -0.2, 0.3), B, across);
    expect(across.x).toBeCloseTo(-Math.sin(LIM.medial), 3);
    const up = new THREE.Vector3();
    clampShoulder(dir(0.2, 1, 0.1), B, up);
    expect(up.y).toBeCloseTo(Math.sin(LIM.raise), 3);
  });

  it('brings any direction into the range, and clamping twice changes nothing', () => {
    const r = mulberry(7);
    const out = new THREE.Vector3();
    const again = new THREE.Vector3();
    for (let i = 0; i < 2000; i++) {
      const d = dir(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      clampShoulder(d, B, out);
      expect(inShoulder(out, B, 1e-6)).toBe(true);
      expect(out.length()).toBeCloseTo(1, 6);
      expect(clampShoulder(out, B, again)).toBeLessThan(1e-5);
    }
  });

  it('turns an arm reaching straight back outward round the side, never across behind the back or over to the front', () => {
    const out = new THREE.Vector3();
    for (const x of [-0.08, -0.02, 0, 0.02, 0.08]) {
      clampShoulder(dir(x, -0.76, -0.65), B, out);
      expect(out.x).toBeGreaterThan(0);
      expect(out.z).toBeLessThan(0);
      expect(out.y).toBeCloseTo(dir(x, -0.76, -0.65).y, 6);
    }
  });

  it('moves nearby directions to nearby directions as a reach swings behind the shoulder', () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      const t = -0.3 + (i / 200) * 0.6;
      clampShoulder(dir(t, -0.5, -1), B, a);
      clampShoulder(dir(t + 0.003, -0.5, -1), B, b);
      expect(a.distanceTo(b)).toBeLessThan(0.05);
    }
  });

  it('moves a direction only a little when it is only a little outside', () => {
    const edge = dir(1, 0, -Math.tan(LIM.back + 0.02));
    expect(clampShoulder(edge, B, new THREE.Vector3())).toBeLessThan(0.03);
  });
});

describe('reach recruitment', () => {
  it('needs no twist while the hand is within the shoulder alone', () => {
    expect(reachTwist(0.4, -0.5, 1.6, 0.7)).toBe(0);
    expect(reachTwist(1.6, -0.5, 1.6, 0.7)).toBe(0);
    expect(reachTwist(-0.5, -0.5, 1.6, 0.7)).toBe(0);
  });

  it('twists toward a hand target behind the shoulder, outward', () => {
    expect(reachTwist(1.8, -0.5, 1.6, 0.7)).toBeCloseTo(0.2, 1);
    expect(reachTwist(2.4, -0.5, 1.6, 0.7)).toBeGreaterThan(reachTwist(2, -0.5, 1.6, 0.7));
  });

  it('coils away from a hand cocked across the chest', () => {
    expect(reachTwist(-0.9, -0.5, 1.6, 0.7)).toBeLessThan(-0.3);
  });

  it('never twists past the cap, however far behind the target is', () => {
    for (const b of [2, 2.5, Math.PI, 4]) expect(Math.abs(reachTwist(b, -0.5, 1.6, 0.7))).toBeLessThan(0.7);
    expect(reachTwist(Math.PI, -0.5, 1.6, 0.7)).toBeGreaterThan(0.6);
  });

  it('soft-caps a deficit: linear when small, saturating at max', () => {
    expect(softCap(0, 1)).toBe(0);
    expect(softCap(0.05, 1)).toBeCloseTo(0.05, 3);
    expect(softCap(10, 0.5)).toBeCloseTo(0.5, 3);
    expect(softCap(-10, 0.5)).toBeCloseTo(-0.5, 3);
  });
});

describe('springStep', () => {
  it('settles on its target', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 120; i++) springStep(s, 1, 16, 0.5, 1 / 60);
    expect(s.x).toBeCloseTo(1, 3);
    expect(s.v).toBeCloseTo(0, 2);
  });

  it('overshoots when underdamped (follow-through), then settles', () => {
    const s = { x: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      springStep(s, 1, 16, 0.45, 1 / 60);
      peak = Math.max(peak, s.x);
    }
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThan(1.35);
  });

  it('stays stable at a long frame', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 40; i++) springStep(s, 1, 16, 0.45, 0.1);
    expect(s.x).toBeCloseTo(1, 2);
  });
});

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
