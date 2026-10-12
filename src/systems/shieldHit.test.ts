import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shieldHitPoint } from './shieldHit';

describe('shieldHitPoint', () => {
  const c = new THREE.Vector3(100, 300, -50);
  it('projects the hit onto the shield surface along the line from the centre', () => {
    const p = shieldHitPoint(c, 380, new THREE.Vector3(100, 300, 150), new THREE.Vector3());
    expect(p.toArray()).toEqual([100, 300, 330]);
  });
  it('works for hits inside or outside the shield', () => {
    const inside = shieldHitPoint(c, 380, new THREE.Vector3(150, 300, -50), new THREE.Vector3());
    const outside = shieldHitPoint(c, 380, new THREE.Vector3(1000, 300, -50), new THREE.Vector3());
    expect(inside.distanceTo(c)).toBeCloseTo(380);
    expect(outside.distanceTo(c)).toBeCloseTo(380);
    expect(inside.x).toBeGreaterThan(c.x);
  });
  it('falls back to the top of the shield for a hit exactly at the centre', () => {
    const p = shieldHitPoint(c, 380, c.clone(), new THREE.Vector3());
    expect(p.toArray()).toEqual([100, 680, -50]);
  });
});
