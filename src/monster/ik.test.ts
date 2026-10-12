import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveTwoBone } from './ik';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('solveTwoBone', () => {
  it('keeps both bone lengths when reachable', () => {
    const hip = V(0, 300, 0);
    const foot = V(300, 0, 100);
    const knee = solveTwoBone(hip, foot, 250, 330, V(200, 700, 0), new THREE.Vector3());
    expect(knee.distanceTo(hip)).toBeCloseTo(250, 3);
    expect(knee.distanceTo(foot)).toBeCloseTo(330, 3);
  });
  it('bends toward the pole', () => {
    const hip = V(0, 300, 0);
    const foot = V(300, 0, 0);
    const knee = solveTwoBone(hip, foot, 250, 330, V(0, 1000, 0), new THREE.Vector3());
    const mid = hip.clone().add(foot).multiplyScalar(0.5);
    expect(knee.y).toBeGreaterThan(mid.y);
  });
  it('straightens toward unreachable targets', () => {
    const hip = V(0, 0, 0);
    const knee = solveTwoBone(hip, V(0, 0, 2000), 250, 330, V(0, 1, 0), new THREE.Vector3());
    expect(knee.x).toBeCloseTo(0, 1);
    expect(knee.z).toBeCloseTo(250, 0);
  });
});
