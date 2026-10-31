import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { RainSpikes } from './RainSpikes';

const U = CONFIG.insect.ultimate;
const meshOf = (scene: THREE.Scene) => scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
/** Instance 0's position and its +Y axis (the spike's nose direction). */
const pose = (mesh: THREE.InstancedMesh) => {
  mesh.getMatrixAt(0, _m);
  _m.decompose(_p, _q, _s);
  return { pos: _p.clone(), nose: new THREE.Vector3(0, 1, 0).applyQuaternion(_q) };
};

describe('RainSpikes', () => {
  it('adds one mesh, empty until a launch', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    expect(scene.children).toHaveLength(1);
    expect(meshOf(scene).count).toBe(0);
    expect(s.flying).toBe(0);
  });

  it('a spike flies in a straight line and lands once, at its point, after the flight time', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    const from = new THREE.Vector3(0, 400, 0);
    const to = new THREE.Vector3(0, 0, 900);
    const lands: [number, THREE.Vector3, number][] = [];
    let t = 0;
    s.launch(from, to);
    const line = new THREE.Line3(from, to);
    const onLine = new THREE.Vector3();
    while (t < U.flight + 0.2) {
      t += 1 / 60;
      s.update(1 / 60, (i, at) => lands.push([i, at.clone(), t]));
      if (s.flying > 0) {
        const p = pose(meshOf(scene)).pos;
        expect(p.distanceTo(line.closestPointToPoint(p, true, onLine))).toBeLessThan(1e-3);
      }
    }
    expect(lands).toHaveLength(1);
    expect(Math.abs(lands[0]![2] - U.flight)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(lands[0]![1].distanceTo(to)).toBeLessThan(1e-6);
    expect(s.flying).toBe(0);
  });

  it('points along its line all the way', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    const dir = new THREE.Vector3(0, -400, 900).normalize();
    s.launch(new THREE.Vector3(0, 400, 0), new THREE.Vector3(0, 0, 900));
    for (const dt of [U.flight * 0.1, U.flight * 0.7]) {
      s.update(dt, () => {});
      expect(pose(meshOf(scene)).nose.dot(dir)).toBeGreaterThan(0.999);
    }
  });

  it('aimAt moves where it lands', () => {
    const s = new RainSpikes(new THREE.Scene(), 0xffffff);
    const i = s.launch(new THREE.Vector3(0, 400, 0), new THREE.Vector3(0, 0, 900));
    s.update(U.flight / 2, () => {});
    s.aimAt(i, new THREE.Vector3(300, 0, 700));
    let at = new THREE.Vector3();
    s.update(U.flight, (_i, p) => (at = p.clone()));
    expect(at.distanceTo(new THREE.Vector3(300, 0, 700))).toBeLessThan(1e-6);
  });

  it('a full pool refuses further launches', () => {
    const s = new RainSpikes(new THREE.Scene(), 0xffffff);
    for (let i = 0; i < U.pool; i++) expect(s.launch(new THREE.Vector3(), new THREE.Vector3(0, 0, 500))).toBeGreaterThanOrEqual(0);
    expect(s.launch(new THREE.Vector3(), new THREE.Vector3(0, 0, 500))).toBe(-1);
    expect(s.flying).toBe(U.pool);
  });

  it('clear empties it; dispose removes it', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    s.launch(new THREE.Vector3(), new THREE.Vector3(0, 0, 500));
    s.update(0.1, () => {});
    s.clear();
    expect(s.flying).toBe(0);
    expect(meshOf(scene).count).toBe(0);
    s.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
