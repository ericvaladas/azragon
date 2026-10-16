import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GUN, gustavMuzzle, hullGeometry, turretGeometry } from './gustavModel';

const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('Gustav model', () => {
  it('sits the hull on the ground, about one size unit long, vertex-coloured', () => {
    const g = hullGeometry();
    const b = bounds(g);
    expect(g.getAttribute('color')).toBeDefined();
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.95);
    expect(b.max.z - b.min.z).toBeLessThan(1.1);
  });

  it('ends the gun at the muzzle point, above the hull, turning with yaw', () => {
    const t = bounds(turretGeometry());
    expect(turretGeometry().getAttribute('color')).toBeDefined();
    const m = gustavMuzzle(0, 1, new THREE.Vector3());
    expect(m.x).toBeCloseTo(0, 6);
    expect(t.max.z - m.z).toBeLessThan(0.06);
    expect(t.max.z - m.z).toBeGreaterThan(-0.06);
    expect(m.y).toBeGreaterThan(bounds(hullGeometry()).max.y);
    expect(m.y).toBeGreaterThan(GUN.pivotY);
    const turned = gustavMuzzle(Math.PI / 2, 160, new THREE.Vector3());
    expect(turned.x).toBeCloseTo(m.z * 160, 6);
    expect(turned.z).toBeCloseTo(0, 6);
  });
});
