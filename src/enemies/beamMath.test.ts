import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { beamHits, pointSegmentDistance } from './beamMath';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('pointSegmentDistance', () => {
  const a = V(0, 0, 0);
  const b = V(1000, 0, 0);
  it('is the perpendicular distance for points alongside the segment', () => {
    expect(pointSegmentDistance(V(400, 0, 30), a, b)).toBeCloseTo(30);
    expect(pointSegmentDistance(V(400, 40, 0), a, b)).toBeCloseTo(40);
  });
  it('is the distance to the nearest end beyond either end', () => {
    expect(pointSegmentDistance(V(-30, 0, 40), a, b)).toBeCloseTo(50);
    expect(pointSegmentDistance(V(1030, 0, 40), a, b)).toBeCloseTo(50);
  });
});

describe('beamHits', () => {
  it('hits within the radius of the beam line and misses outside it', () => {
    const a = V(0, 200, 0);
    const b = V(0, 200, 1700);
    expect(beamHits(V(50, 200, 800), a, b, 93)).toBe(true);
    expect(beamHits(V(120, 200, 800), a, b, 93)).toBe(false);
  });
});
