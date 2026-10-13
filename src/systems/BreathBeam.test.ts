import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { BreathBeam } from './BreathBeam';
import { lineTargets } from './sweep';

const B = CONFIG.kaiju.breath;
const O = { x: 0, z: 0 };

describe('BreathBeam', () => {
  it('charges, fires once with one end per beam, lingers, then is free again', () => {
    const beam = new BreathBeam(new THREE.Scene());
    const jaws = new THREE.Vector3(0, 300, 0);
    const fired: THREE.Vector3[][] = [];
    beam.start(new THREE.Vector3(0, 0, 600), 3);
    expect(beam.busy).toBe(true);
    let t = 0;
    while (t < B.charge - 0.05) {
      beam.update(0.05, jaws, O, 1300, true, (_f, ends) => fired.push(ends.map((e) => e.clone())));
      t += 0.05;
    }
    expect(fired).toHaveLength(0);
    expect(beam.charge).toBeGreaterThan(0.5);
    beam.update(0.1, jaws, O, 1300, true, (_f, ends) => fired.push(ends.map((e) => e.clone())));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toHaveLength(3);
    for (const e of fired[0]!) expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(1300 + 1e-6);
    // A ground aim: the middle beam runs the whole lane to full range.
    expect(fired[0]![1]!.z).toBeCloseTo(1300);
    beam.start(new THREE.Vector3(500, 0, 0), 1);
    for (let i = 0; i < 20; i++) beam.update(0.05, jaws, O, 1300, true, () => fired.push([]));
    expect(fired).toHaveLength(1);
    expect(beam.busy).toBe(false);
  });
  it('keeps an airborne aim: the beam passes through the target', () => {
    const beam = new BreathBeam(new THREE.Scene());
    let end: THREE.Vector3 | null = null;
    beam.start(new THREE.Vector3(0, 500, 600), 1);
    for (let i = 0; i < 20; i++) beam.update(0.05, new THREE.Vector3(0, 300, 0), O, 1300, true, (_f, ends) => (end = ends[0]!.clone()));
    const e = end as unknown as THREE.Vector3;
    expect(e.x).toBeCloseTo(0);
    expect(e.z).toBeGreaterThanOrEqual(600);
    expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(1300 + 1e-6);
    expect(e.y).toBeGreaterThan(500);
  });
  it('caps the fan at maxLines and clear() cancels', () => {
    const beam = new BreathBeam(new THREE.Scene());
    let n = 0;
    beam.start(new THREE.Vector3(0, 0, 500), 99);
    for (let i = 0; i < 20; i++) beam.update(0.05, new THREE.Vector3(0, 300, 0), O, 1300, true, (_f, ends) => (n = ends.length));
    expect(n).toBe(B.maxLines);
    beam.start(new THREE.Vector3(0, 0, 500), 1);
    beam.clear();
    expect(beam.busy).toBe(false);
    expect(beam.charge).toBe(0);
  });
  it('hits a target at 90 degrees or behind along the drawn jaws line, with range measured from the monster', () => {
    const jaws = new THREE.Vector3(0, 300, 210);
    const run = (aim: THREE.Vector3) => {
      const beam = new BreathBeam(new THREE.Scene());
      let got: { from: THREE.Vector3; end: THREE.Vector3 } | null = null;
      beam.start(aim, 1);
      for (let i = 0; i < 20; i++) beam.update(0.05, jaws, O, 1300, true, (f, ends) => (got = { from: f.clone(), end: ends[0]!.clone() }));
      return got as unknown as { from: THREE.Vector3; end: THREE.Vector3 };
    };
    const cases: [number, number][] = [[400, 0], [0, -300], [-500, 100]];
    for (const [x, z] of cases) {
      const r = run(new THREE.Vector3(x, 0, z));
      expect(Math.hypot(r.end.x - O.x, r.end.z - O.z)).toBeCloseTo(1300);
      const target = { position: { x, z }, radius: 40, isAlive: () => true };
      expect(lineTargets(r.from, r.end, B.halfWidth, [target])).toHaveLength(1);
      // The old feet-origin segment missed the 90 degree target.
      if (x === 400) expect(lineTargets(O, r.end, B.halfWidth, [target])).toHaveLength(0);
    }
  });

  it('holds the charged breath until the head is on target, and gives up if it never gets there', () => {
    const W = CONFIG.kaiju.neck.maxWait;
    const beam = new BreathBeam(new THREE.Scene());
    const jaws = new THREE.Vector3(0, 300, 0);
    let fired = 0;
    beam.start(new THREE.Vector3(0, 0, 600), 1);
    for (let t = 0; t < B.charge + 0.2; t += 0.05) beam.update(0.05, jaws, { x: 0, z: 0 }, 1300, false, () => fired++);
    expect(fired).toBe(0);
    expect(beam.busy).toBe(true);
    beam.update(0.05, jaws, { x: 0, z: 0 }, 1300, true, () => fired++);
    expect(fired).toBe(1);

    const stuck = new BreathBeam(new THREE.Scene());
    stuck.start(new THREE.Vector3(0, 0, 600), 1);
    for (let t = 0; t < B.charge + W + 0.2; t += 0.05) stuck.update(0.05, jaws, { x: 0, z: 0 }, 1300, false, () => fired++);
    expect(fired).toBe(1);
    expect(stuck.busy).toBe(false);
  });
});

