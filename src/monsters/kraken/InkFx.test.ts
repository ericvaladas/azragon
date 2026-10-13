import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { InkFx } from './InkFx';
import { blobFlightTime, CLOUD } from './inkMath';

const ORIGIN = new THREE.Vector3();
const meshOf = (scene: THREE.Scene) => scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

describe('InkFx', () => {
  it('adds a single instanced mesh, hidden while there is nothing to draw', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    expect(scene.children).toHaveLength(1);
    fx.update(0.016, ORIGIN, 0);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('flies a blob for its flight time, then bursts it into a cloud that fades out', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 100, 0);
    const to = new THREE.Vector3(600, 300, 0);
    fx.jet(from, to);
    fx.update(0.01, ORIGIN, 0);
    expect(fx.active.blobs).toBe(1);
    expect(meshOf(scene).visible).toBe(true);
    for (let t = 0; t < blobFlightTime(from.distanceTo(to)); t += 0.01) fx.update(0.01, ORIGIN, 0);
    expect(fx.active.blobs).toBe(0);
    const puffs = fx.active.puffs;
    expect(puffs).toBeGreaterThan(8);
    for (let t = 0; t < CLOUD.life + 0.3; t += 0.05) fx.update(0.05, ORIGIN, 0);
    expect(fx.active.puffs).toBe(0);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('dissipates the haze quickly once the charge is spent', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    for (let i = 0; i < 60; i++) fx.update(0.05, ORIGIN, 1);
    for (let t = 0; t < 0.15; t += 0.01) fx.update(0.01, ORIGIN, 0);
    expect(fx.active.haze).toBe(0);
  });

  it('draws the cloud translucent, never a solid blot', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 100, 0);
    const to = new THREE.Vector3(300, 200, 0);
    fx.jet(from, to);
    for (let t = 0; t < blobFlightTime(from.distanceTo(to)) + 0.02; t += 0.01) fx.update(0.01, ORIGIN, 0);
    expect(fx.active.blobs).toBe(0);
    let max = 0;
    for (let t = 0; t < 1; t += 0.02) {
      fx.update(0.02, ORIGIN, 0);
      const a = meshOf(scene).geometry.getAttribute('instAlpha');
      for (let i = 0; i < meshOf(scene).count; i++) max = Math.max(max, a.getX(i));
    }
    expect(max).toBeGreaterThan(0.3);
    expect(max).toBeLessThanOrEqual(0.66);
  });

  it('grows the haze with the intercept charge and thins it when spent', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    for (let i = 0; i < 60; i++) fx.update(0.05, ORIGIN, 1);
    expect(fx.active.haze).toBe(1);
    expect(meshOf(scene).count).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) fx.update(0.05, ORIGIN, 0);
    expect(fx.active.haze).toBe(0);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('clear drops every blob, cloud and the haze', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    for (let i = 0; i < 40; i++) fx.update(0.05, ORIGIN, 1);
    fx.jet(ORIGIN, new THREE.Vector3(500, 0, 0));
    fx.burst(new THREE.Vector3(0, 200, 0));
    fx.clear();
    expect(fx.active).toEqual({ blobs: 0, puffs: 0, haze: 0 });
    expect(meshOf(scene).visible).toBe(false);
  });
});
