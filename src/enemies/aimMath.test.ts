import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rotateToward, stepAngle, wrapAngle, yawPitch } from './aimMath';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const angle = (a: THREE.Vector3, b: THREE.Vector3) => a.angleTo(b);

describe('rotateToward', () => {
  it('never turns more than the step, and stays unit length', () => {
    const dir = v(0, 0, 1);
    const target = v(1, 0.3, 0);
    for (let i = 0; i < 50; i++) {
      const before = dir.clone();
      rotateToward(dir, target, 0.05, dir);
      expect(angle(before, dir)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(dir.length()).toBeCloseTo(1, 9);
    }
  });

  it('converges onto the target direction and then holds it', () => {
    const dir = v(0, 0, 1);
    const target = v(-3, 1, -2);
    for (let i = 0; i < 100; i++) rotateToward(dir, target, 0.1, dir);
    expect(angle(dir, target)).toBeLessThan(1e-9);
    rotateToward(dir, target, 0.1, dir);
    expect(angle(dir, target)).toBeLessThan(1e-9);
  });

  it('snaps onto a target within the step', () => {
    const out = rotateToward(v(0, 0, 1), v(0.01, 0, 1), 0.5, new THREE.Vector3());
    expect(angle(out, v(0.01, 0, 1))).toBeLessThan(1e-9);
  });

  it('turns away from a target exactly behind, by exactly the step, in the horizontal plane', () => {
    const out = rotateToward(v(0, 0, 1), v(0, 0, -1), 0.2, new THREE.Vector3());
    expect(angle(v(0, 0, 1), out)).toBeCloseTo(0.2, 9);
    expect(out.y).toBeCloseTo(0, 9);
    expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
  });

  it('turns from straight up toward straight down without NaN', () => {
    const out = rotateToward(v(0, 1, 0), v(0, -1, 0), 0.3, new THREE.Vector3());
    expect(angle(v(0, 1, 0), out)).toBeCloseTo(0.3, 9);
  });

  it('keeps the current direction for a zero target', () => {
    const out = rotateToward(v(0, 0, 2), v(0, 0, 0), 0.3, new THREE.Vector3());
    expect(out.toArray()).toEqual([0, 0, 1]);
  });

  it('takes the target direction when the current one is zero', () => {
    const out = rotateToward(v(0, 0, 0), v(0, 0, -5), 0.3, new THREE.Vector3());
    expect(out.toArray()).toEqual([0, 0, -1]);
  });

  it('returns a forward unit vector when both are zero', () => {
    const out = rotateToward(v(0, 0, 0), v(0, 0, 0), 0.3, new THREE.Vector3());
    expect(out.toArray()).toEqual([0, 0, 1]);
  });

  it('tolerates near-parallel unnormalised inputs (dot slightly above 1)', () => {
    const out = rotateToward(v(1e-9, 0, 3), v(0, 0, 7), 0.1, new THREE.Vector3());
    expect(Number.isNaN(out.x)).toBe(false);
    expect(out.z).toBeCloseTo(1, 9);
  });
});

describe('wrapAngle', () => {
  it('maps any angle into [-π, π)', () => {
    for (const a of [0, 1, -1, Math.PI, -Math.PI, 3 * Math.PI, -7.5, 100]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
    }
  });
});

describe('stepAngle', () => {
  it('moves by at most the step', () => {
    expect(stepAngle(0, 2, 0.5)).toBeCloseTo(0.5, 9);
    expect(stepAngle(0, -2, 0.5)).toBeCloseTo(-0.5, 9);
  });

  it('lands on a target within the step', () => {
    expect(stepAngle(1, 1.2, 0.5)).toBeCloseTo(1.2, 9);
  });

  it('turns the short way across ±π', () => {
    const a = stepAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    // From 179° toward -179°: the short way is +, through π.
    expect(Math.cos(a)).toBeCloseTo(Math.cos(Math.PI - 0.05), 9);
    expect(Math.sin(a)).toBeCloseTo(Math.sin(Math.PI - 0.05), 9);
    const b = stepAngle(-Math.PI + 0.1, Math.PI - 0.1, 1);
    expect(Math.cos(b)).toBeCloseTo(Math.cos(Math.PI - 0.1), 9);
    expect(Math.sin(b)).toBeCloseTo(Math.sin(Math.PI - 0.1), 9);
  });

  it('converges from any start and keeps the result wrapped', () => {
    let a = 5;
    for (let i = 0; i < 100; i++) a = stepAngle(a, -2.5, 0.2);
    expect(a).toBeCloseTo(-2.5, 9);
  });

  it('never exceeds the step for random pairs', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 20 - 10;
    for (let i = 0; i < 500; i++) {
      const from = rnd();
      const next = stepAngle(from, rnd(), 0.3);
      expect(Math.abs(wrapAngle(next - from))).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });
});

describe('yawPitch', () => {
  it('reads yaw about +Y from +Z and pitch up from the horizontal', () => {
    const f = yawPitch(v(1, 0, 0));
    expect(f.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(f.pitch).toBeCloseTo(0, 9);
    const u = yawPitch(v(0, 1, 1));
    expect(u.yaw).toBeCloseTo(0, 9);
    expect(u.pitch).toBeCloseTo(Math.PI / 4, 9);
  });

  it('clamps pitch for a slightly over-long vector', () => {
    expect(yawPitch(v(0, 1.0000001, 0)).pitch).toBeCloseTo(Math.PI / 2, 6);
  });
});
