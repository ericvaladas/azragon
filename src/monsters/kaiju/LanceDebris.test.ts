import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { LanceDebris } from './LanceDebris';
import { bearingOf } from './plasmaLance';

const U = CONFIG.kaiju.ultimate;
const O = { x: 100, z: -50 };
const YAW = 0.7;
const mesh = (scene: THREE.Scene) => scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
const seeded = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

describe('LanceDebris', () => {
  it('scatters the pieces all around the Kaiju, within reach of the camera', () => {
    const d = new LanceDebris(new THREE.Scene(), seeded());
    d.scatter(O);
    expect(d.count).toBe(U.debris);
    let front = 0;
    let behind = 0;
    for (const p of d.positions()) {
      const r = Math.hypot(p.x - O.x, p.z - O.z);
      expect(r).toBeGreaterThanOrEqual(U.debrisNear);
      expect(r).toBeLessThanOrEqual(U.debrisRange);
      if (Math.abs(bearingOf(O, YAW, { x: p.x, z: p.z })) < Math.PI / 2) front++;
      else behind++;
    }
    expect(front).toBeGreaterThan(U.debris * 0.3);
    expect(behind).toBeGreaterThan(U.debris * 0.3);
  });

  it('rises straight up: no piece drifts sideways', () => {
    const d = new LanceDebris(new THREE.Scene(), seeded());
    d.scatter(O);
    const before = d.positions().map((p) => [p.x, p.z]);
    d.update(2, 1);
    d.positions().forEach((p, i) => {
      expect(p.x).toBe(before[i]![0]);
      expect(p.z).toBe(before[i]![1]);
    });
  });

  it('rises with lift, never past debrisLift plus its variation', () => {
    const d = new LanceDebris(new THREE.Scene(), seeded());
    d.scatter(O);
    d.update(0.5, 0);
    for (const p of d.positions()) expect(p.y).toBe(0);
    d.update(2, 1);
    const ys = d.positions().map((p) => p.y);
    expect(ys.reduce((a, b) => a + b, 0) / ys.length).toBeGreaterThan(0.8 * U.debrisLift);
    expect(Math.max(...ys)).toBeLessThan(1.3 * U.debrisLift);
  });

  it('a vaporized piece is gone', () => {
    const scene = new THREE.Scene();
    const d = new LanceDebris(scene, seeded());
    d.scatter(O);
    d.update(0.1, 0.5);
    const before = mesh(scene).count;
    d.vaporize(3);
    d.update(0.1, 0.5);
    expect(d.alive(3)).toBe(false);
    expect(mesh(scene).count).toBe(before - 1);
  });

  it('settle brings every live piece down and away', () => {
    const d = new LanceDebris(new THREE.Scene(), seeded());
    d.scatter(O);
    d.update(2, 1);
    d.settle();
    d.update(1.5, 1);
    for (let i = 0; i < d.count; i++) expect(d.alive(i)).toBe(false);
  });

  it('clear resets', () => {
    const scene = new THREE.Scene();
    const d = new LanceDebris(scene, seeded());
    d.scatter(O);
    d.update(1, 1);
    d.clear();
    for (let i = 0; i < d.count; i++) expect(d.alive(i)).toBe(false);
    expect(mesh(scene).count).toBe(0);
    expect(mesh(scene).visible).toBe(false);
    d.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
