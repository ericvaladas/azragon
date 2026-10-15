import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TURRET, hullGeometry, turretGeometry } from './tankModel';

const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('tank model', () => {
  it('sits the hull on the ground, about one size unit long, vertex-coloured', () => {
    const g = hullGeometry();
    const b = bounds(g);
    expect(g.getAttribute('color')).toBeDefined();
    expect(b.min.y).toBeCloseTo(0, 2);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.95);
    expect(b.max.z - b.min.z).toBeLessThan(1.1);
  });

  it('ends the gun at TURRET.muzzle on the turret axis, above the hull', () => {
    const g = turretGeometry();
    const b = bounds(g);
    expect(g.getAttribute('color')).toBeDefined();
    expect(b.max.z).toBeCloseTo(TURRET.muzzle, 6);
    expect(TURRET.gunY).toBeGreaterThan(bounds(hullGeometry()).max.y);
  });
});
