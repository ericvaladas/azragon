import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { BreathBeam } from './BreathBeam';

const B = CONFIG.kaiju.breath;

describe('BreathBeam', () => {
  it('charges, fires once with one end per beam, lingers, then is free again', () => {
    const beam = new BreathBeam(new THREE.Scene());
    const jaws = new THREE.Vector3(0, 300, 0);
    const fired: THREE.Vector3[][] = [];
    beam.start(new THREE.Vector3(0, 0, 600), 3);
    expect(beam.busy).toBe(true);
    let t = 0;
    while (t < B.charge - 0.05) {
      beam.update(0.05, jaws, 1300, (_f, ends) => fired.push(ends.map((e) => e.clone())));
      t += 0.05;
    }
    expect(fired).toHaveLength(0);
    expect(beam.charge).toBeGreaterThan(0.5);
    beam.update(0.1, jaws, 1300, (_f, ends) => fired.push(ends.map((e) => e.clone())));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toHaveLength(3);
    for (const e of fired[0]!) expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(1300 + 1e-6);
    // The middle beam goes straight through the aim and stops at the ground there.
    expect(fired[0]![1]!.z).toBeCloseTo(600);
    beam.start(new THREE.Vector3(500, 0, 0), 1);
    for (let i = 0; i < 20; i++) beam.update(0.05, jaws, 1300, () => fired.push([]));
    expect(fired).toHaveLength(1);
    expect(beam.busy).toBe(false);
  });
  it('caps the fan at maxLines and clear() cancels', () => {
    const beam = new BreathBeam(new THREE.Scene());
    let n = 0;
    beam.start(new THREE.Vector3(0, 0, 500), 99);
    for (let i = 0; i < 20; i++) beam.update(0.05, new THREE.Vector3(0, 300, 0), 1300, (_f, ends) => (n = ends.length));
    expect(n).toBe(B.maxLines);
    beam.start(new THREE.Vector3(0, 0, 500), 1);
    beam.clear();
    expect(beam.busy).toBe(false);
    expect(beam.charge).toBe(0);
  });
});
