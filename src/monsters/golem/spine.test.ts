import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bendAngleAt, bendPoint, outwardBearing, pivotStep, stepToward } from './spine';

const Z0 = -150;
const Z1 = 150;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const bend = (p: THREE.Vector3, a: number) => bendPoint(p, a, Z0, Z1, new THREE.Vector3());

describe('spine bend', () => {
  it('leaves the body alone when straight, and the rump behind the bend always', () => {
    for (const p of [v(30, 400, -40), v(-80, 500, 200), v(0, 450, 400)]) expect(bend(p, 0).distanceTo(p)).toBeLessThan(1e-9);
    expect(bend(v(60, 380, -170), 1.4).distanceTo(v(60, 380, -170))).toBeLessThan(1e-9);
    expect(bendAngleAt(-170, 1.4, Z0, Z1)).toBe(0);
  });

  it('curves the spine in an arc of the given angle and carries the front on rigidly, turned by it', () => {
    const a = 1.4;
    expect(bendAngleAt(Z1, a, Z0, Z1)).toBeCloseTo(a);
    expect(bendAngleAt(0, a, Z0, Z1)).toBeCloseTo(a / 2);
    const end = bend(v(0, 0, Z1), a);
    const tip = bend(v(0, 0, Z1 + 100), a);
    const dir = tip.clone().sub(end).normalize();
    expect(dir.x).toBeCloseTo(Math.sin(a));
    expect(dir.z).toBeCloseTo(Math.cos(a));
    // Lengths along the front are kept, and the front turns toward +X (left) for a positive angle.
    expect(tip.distanceTo(end)).toBeCloseTo(100);
    expect(bend(v(0, 0, 400), a).x).toBeGreaterThan(200);
  });

  it('keeps the spine its length (no stretch) and the bend continuous', () => {
    const a = 1.2;
    let len = 0;
    let prev = bend(v(0, 0, Z0), a);
    for (let z = Z0 + 3; z <= Z1 + 1e-9; z += 3) {
      const p = bend(v(0, 0, z), a);
      len += p.distanceTo(prev);
      prev = p;
    }
    expect(len).toBeCloseTo(Z1 - Z0, 0);
    for (let z = Z0 - 30; z < Z1 + 60; z += 1) expect(bend(v(50, 0, z + 1), a).distanceTo(bend(v(50, 0, z), a))).toBeLessThan(2.5);
  });

  it('bends the other way for a negative angle (mirror image), and stays sound for a tiny angle', () => {
    const p = v(70, 420, 120);
    const l = bend(p, 0.9);
    const r = bend(v(-70, 420, 120), -0.9);
    expect(r.x).toBeCloseTo(-l.x);
    expect(r.z).toBeCloseTo(l.z);
    expect(bend(p, 1e-7).distanceTo(p)).toBeLessThan(1e-3);
  });
});

describe('outwardBearing', () => {
  it('reads a hand target from the shoulder: ahead 0, outward +, across the chest −, behind past π not −π', () => {
    expect(outwardBearing(0, 1)).toBeCloseTo(0);
    expect(outwardBearing(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(outwardBearing(-1, 1)).toBeCloseTo(-Math.PI / 4);
    // Behind the shoulder, even a little inward of it: round the outside, not across the chest.
    expect(outwardBearing(-0.3, -1)).toBeGreaterThan(Math.PI);
    expect(outwardBearing(0.3, -1)).toBeLessThan(Math.PI);
    expect(outwardBearing(0.3, -1)).toBeGreaterThan(2.5);
  });
});

describe('pivot step', () => {
  it('lifts the hand off, carries it over and sets it down: no slide while it is on the ground', () => {
    expect(pivotStep(0)).toEqual({ blend: 0, lift: 0 });
    expect(pivotStep(1).blend).toBe(1);
    expect(pivotStep(1).lift).toBeCloseTo(0);
    expect(pivotStep(0.5).lift).toBeCloseTo(1);
    // Barely moved along while barely lifted, at both ends.
    expect(pivotStep(0.05).blend).toBeLessThan(0.02);
    expect(pivotStep(0.95).blend).toBeGreaterThan(0.98);
  });

  it('steps out and back over a fixed time', () => {
    let s = 0;
    for (let i = 0; i < 10; i++) s = stepToward(s, true, 0.022, 0.22);
    expect(s).toBeCloseTo(1);
    s = stepToward(s, true, 0.1, 0.22);
    expect(s).toBe(1);
    s = stepToward(s, false, 0.11, 0.22);
    expect(s).toBeCloseTo(0.5);
  });
});
