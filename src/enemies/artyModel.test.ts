import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GUN, artyBarrelDir, artyMuzzle, barrelGeometry, carriageGeometry, recoilOffset } from './artyModel';

const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('towed howitzer model', () => {
  it('points the barrel GUN.pitch above the horizon toward the gun front, for any yaw', () => {
    for (const yaw of [0, 1, -2.5]) {
      const d = artyBarrelDir(yaw, new THREE.Vector3());
      expect(d.length()).toBeCloseTo(1, 6);
      expect(Math.asin(d.y)).toBeCloseTo(GUN.pitch, 6);
      expect(Math.atan2(d.x, d.z)).toBeCloseTo(yaw, 6);
    }
  });

  it('puts the muzzle at the tip of the barrel, on the axis through the trunnion, rotating with yaw', () => {
    const barrel = bounds(barrelGeometry());
    const m = artyMuzzle(0, 1, new THREE.Vector3());
    expect(barrelGeometry().getAttribute('color')).toBeDefined();
    expect(carriageGeometry().getAttribute('color')).toBeDefined();
    // The muzzle face is the barrel's highest, most forward point (within the brake's radius).
    expect(m.x).toBeCloseTo(0, 6);
    expect(barrel.max.y - m.y).toBeGreaterThanOrEqual(0);
    expect(barrel.max.y - m.y).toBeLessThan(0.1);
    expect(barrel.max.z - m.z).toBeLessThan(0.1);
    expect(m.y).toBeGreaterThan(bounds(carriageGeometry()).max.y);
    const back = m.clone().addScaledVector(artyBarrelDir(0, new THREE.Vector3()), -GUN.muzzle);
    expect(back.y).toBeCloseTo(GUN.pivot.y, 6);
    expect(back.z).toBeCloseTo(GUN.pivot.z, 6);
    const turned = artyMuzzle(Math.PI / 2, 40, new THREE.Vector3());
    expect(turned.x).toBeCloseTo(m.z * 40, 6);
    expect(turned.y).toBeCloseTo(m.y * 40, 6);
    expect(turned.z).toBeCloseTo(0, 6);
  });

  it('kicks the barrel fully back just after firing and runs it out to rest', () => {
    expect(recoilOffset(Infinity, 0.7)).toBe(0);
    expect(recoilOffset(0, 0.7)).toBe(0);
    expect(recoilOffset(0.06, 0.7)).toBeCloseTo(1, 6);
    let prev = 1;
    for (let t = 0.07; t < 0.7; t += 0.05) {
      const r = recoilOffset(t, 0.7);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(0);
      prev = r;
    }
    expect(recoilOffset(0.7, 0.7)).toBe(0);
  });
});
