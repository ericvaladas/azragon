import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ballistic, spikeTargets } from './projectileMath';

describe('ballistic', () => {
  const a = new THREE.Vector3(0, 0, 0);
  const b = new THREE.Vector3(100, 50, 0);
  it('starts at from and ends at to', () => {
    expect(ballistic(a, b, 80, 0, new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    const end = ballistic(a, b, 80, 1, new THREE.Vector3());
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
  it('peaks arc above the straight line at the midpoint', () => {
    const mid = ballistic(a, b, 80, 0.5, new THREE.Vector3());
    expect(mid.y).toBeCloseTo(25 + 80);
  });
});

describe('spikeTargets', () => {
  it('primary first, then other distinct targets, then repeats primary', () => {
    expect(spikeTargets('p', ['a', 'b'], 1)).toEqual(['p']);
    expect(spikeTargets('p', ['a', 'p', 'b'], 3)).toEqual(['p', 'a', 'b']);
    expect(spikeTargets('p', ['a'], 3)).toEqual(['p', 'a', 'p']);
  });
});
