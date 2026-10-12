import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { steerToward } from './steer';

describe('steerToward', () => {
  it('turns by at most maxAngle and stays unit length', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    const turned = steerToward(dir, new THREE.Vector3(1, 0, 0), 0.1);
    expect(Math.abs(turned)).toBeCloseTo(0.1);
    expect(dir.length()).toBeCloseTo(1);
    expect(dir.angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.1);
  });
  it('turning toward +X (left) reports a positive yaw turn', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    expect(steerToward(dir, new THREE.Vector3(1, 0, 0), 0.1)).toBeGreaterThan(0);
  });
  it('snaps when within maxAngle, and handles a reversed desire', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    steerToward(dir, new THREE.Vector3(0.01, 0, 1).normalize(), 0.5);
    expect(dir.z).toBeCloseTo(1, 3);
    const back = new THREE.Vector3(0, 0, 1);
    steerToward(back, new THREE.Vector3(0, 0, -1), 0.2);
    expect(back.angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.2);
  });
});
