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
    fx.update(0.016);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('flies a blob for its flight time, then bursts it into a cloud that fades out', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 100, 0);
    const to = new THREE.Vector3(600, 300, 0);
    fx.jet(from, to);
    fx.update(0.01);
    expect(fx.active.blobs).toBe(1);
    expect(meshOf(scene).visible).toBe(true);
    for (let t = 0; t < blobFlightTime(from.distanceTo(to)); t += 0.01) fx.update(0.01);
    expect(fx.active.blobs).toBe(0);
    const puffs = fx.active.puffs;
    expect(puffs).toBeGreaterThan(8);
    for (let t = 0; t < CLOUD.life + 0.3; t += 0.05) fx.update(0.05);
    expect(fx.active.puffs).toBe(0);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('clears the little puffs at the body within half a second of a jet', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 100, 0);
    // The cloud bursts far away; nothing may be left near the body.
    fx.jet(from, new THREE.Vector3(5000, 300, 0));
    for (let t = 0; t < 0.5; t += 0.01) fx.update(0.01);
    const mesh = meshOf(scene);
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) expect(at.setFromMatrixPosition((mesh.getMatrixAt(i, m), m)).distanceTo(from)).toBeGreaterThan(400);
  });

  it('draws the cloud translucent, never a solid blot', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 100, 0);
    const to = new THREE.Vector3(300, 200, 0);
    fx.jet(from, to);
    for (let t = 0; t < blobFlightTime(from.distanceTo(to)) + 0.02; t += 0.01) fx.update(0.01);
    expect(fx.active.blobs).toBe(0);
    let max = 0;
    for (let t = 0; t < 1; t += 0.02) {
      fx.update(0.02);
      const a = meshOf(scene).geometry.getAttribute('instAlpha');
      for (let i = 0; i < meshOf(scene).count; i++) max = Math.max(max, a.getX(i));
    }
    expect(max).toBeGreaterThan(0.3);
    expect(max).toBeLessThanOrEqual(0.42);
  });

  it('keeps the cloud compact so it never blankets the screen', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const at = new THREE.Vector3(0, 300, 0);
    fx.burst(at);
    const mesh = meshOf(scene);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    let maxR = 0;
    let maxD = 0;
    for (let t = 0; t < CLOUD.life; t += 0.05) {
      fx.update(0.05);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(pos, q, sc);
        maxR = Math.max(maxR, sc.x);
        maxD = Math.max(maxD, pos.distanceTo(at));
      }
    }
    expect(maxR).toBeLessThanOrEqual(80);
    expect(maxD).toBeLessThanOrEqual(130);
  });

  it('a bigger burst spreads wider', () => {
    const reach = (scale: number) => {
      const scene = new THREE.Scene();
      const fx = new InkFx(scene);
      const at = new THREE.Vector3(0, 300, 0);
      fx.burst(at, scale);
      const mesh = meshOf(scene);
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      let r = 0;
      let d = 0;
      for (let t = 0; t < CLOUD.life; t += 0.05) {
        fx.update(0.05);
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          m.decompose(pos, q, sc);
          r = Math.max(r, sc.x);
          d = Math.max(d, pos.distanceTo(at));
        }
      }
      return { r, d };
    };
    const one = reach(1);
    const three = reach(3);
    expect(three.d).toBeGreaterThan(one.d * 2);
    expect(three.r).toBeGreaterThan(one.r * 2);
  });

  it('a scaled jet bursts into a scaled cloud where it lands', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    const from = new THREE.Vector3(0, 600, 0);
    const to = new THREE.Vector3(500, 0, 0);
    fx.jet(from, to, 3);
    const flight = blobFlightTime(from.distanceTo(to));
    for (let t = 0; t < flight + 0.02; t += 0.01) fx.update(0.01);
    const mesh = meshOf(scene);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    let r = 0;
    for (let t = 0; t < 0.6; t += 0.05) {
      fx.update(0.05);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(pos, q, sc);
        if (pos.distanceTo(to) < 600) r = Math.max(r, sc.x);
      }
    }
    expect(r).toBeGreaterThan(100);
  });

  it('draws nothing around the body while there are no jets or clouds (no haze)', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    for (let i = 0; i < 60; i++) fx.update(0.05);
    expect(meshOf(scene).count).toBe(0);
    expect(meshOf(scene).visible).toBe(false);
  });

  it('clear drops every blob and cloud', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    fx.jet(ORIGIN, new THREE.Vector3(500, 0, 0));
    fx.burst(new THREE.Vector3(0, 200, 0));
    fx.clear();
    expect(fx.active).toEqual({ blobs: 0, puffs: 0 });
    expect(meshOf(scene).visible).toBe(false);
  });

  it('dispose takes its mesh out of the scene', () => {
    const scene = new THREE.Scene();
    const fx = new InkFx(scene);
    fx.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
