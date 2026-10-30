import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rainDrop } from './rainMath';

const box = { size: 2000, height: 1200 };
const speed = 900;

describe('rainDrop', () => {
  it('every drop stays within the box at any t', () => {
    const p = new THREE.Vector3();
    for (let i = 0; i < 500; i++) {
      for (const t of [0, 0.3, 1.7, 12.5, 400]) {
        rainDrop(i, t, box, speed, p);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(box.size / 2);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(box.size / 2);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(box.height);
      }
    }
  });
  it("a drop's y falls between two close times, wrapping aside", () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let fell = 0;
    for (let i = 0; i < 200; i++) {
      rainDrop(i, 1, box, speed, a);
      rainDrop(i, 1.01, box, speed, b);
      if (b.y < a.y) fell++;
      else expect(a.y).toBeLessThan(speed * 0.01 + 1e-6);
    }
    expect(fell).toBeGreaterThan(190);
  });
  it('the same i and t give the same point, and different drops spread out', () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    rainDrop(7, 3.3, box, speed, a);
    rainDrop(7, 3.3, box, speed, b);
    expect(a.equals(b)).toBe(true);
    rainDrop(8, 3.3, box, speed, b);
    expect(a.distanceTo(b)).toBeGreaterThan(1);
  });
});
