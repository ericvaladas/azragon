import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHeightfield, surfaceAt } from './heightfield';

/** A root at (x, 0, z) facing `yaw`, holding a w×h×d box standing on the ground at local (bx, bz). */
function body(x: number, z: number, yaw: number, bx: number, bz: number, w: number, h: number, d: number): THREE.Group {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  box.position.set(bx, h / 2, bz);
  root.add(box);
  root.updateMatrixWorld(true);
  return root;
}

describe('heightfield', () => {
  it('records the top of the body over its footprint and 0 beside it', () => {
    const hf = buildHeightfield(body(0, 0, 0, 0, 0, 100, 200, 100), { x: 0, y: 0, z: 0, yaw: 0 }, 300, 30);
    expect(surfaceAt(hf, 0, 0)).toBeCloseTo(200, 0);
    expect(surfaceAt(hf, 200, 0)).toBe(0);
    expect(surfaceAt(hf, 0, -250)).toBe(0);
  });

  it('works in the body frame: a body moved and turned gives the same local surface', () => {
    const hf = buildHeightfield(body(500, -300, Math.PI / 2, 100, 0, 60, 150, 60), { x: 500, y: 0, z: -300, yaw: Math.PI / 2 }, 300, 30);
    expect(surfaceAt(hf, 100, 0)).toBeCloseTo(150, 0);
    expect(surfaceAt(hf, -100, 0)).toBe(0);
    expect(surfaceAt(hf, 0, 100)).toBe(0);
  });

  it('is 0 outside the sampled square', () => {
    const hf = buildHeightfield(body(0, 0, 0, 0, 0, 100, 200, 100), { x: 0, y: 0, z: 0, yaw: 0 }, 300, 30);
    expect(surfaceAt(hf, 1000, 0)).toBe(0);
    expect(surfaceAt(hf, 0, -1000)).toBe(0);
  });
});
