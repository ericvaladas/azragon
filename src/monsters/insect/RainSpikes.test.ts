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

  it('a spike flies a high arc and lands once, at its point, after the flight time', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    const lands: [number, THREE.Vector3, number][] = [];
    let t = 0;
    s.launch(new THREE.Vector3(0, 400, 0), new THREE.Vector3(0, 0, 900));
    let midY = 0;
    while (t < U.flight + 0.2) {
      t += 1 / 60;
      s.update(1 / 60, (i, at) => lands.push([i, at.clone(), t]));
      if (Math.abs(t - U.flight / 2) < 1 / 120) midY = pose(meshOf(scene)).pos.y;
    }
    expect(midY).toBeGreaterThan(400 + 0.5 * U.arc);
    expect(lands).toHaveLength(1);
    expect(Math.abs(lands[0]![2] - U.flight)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(lands[0]![1].distanceTo(new THREE.Vector3(0, 0, 900))).toBeLessThan(1e-6);
    expect(s.flying).toBe(0);
  });

  it('points along its flight: nose up rising, nose down falling', () => {
    const scene = new THREE.Scene();
    const s = new RainSpikes(scene, 0xffffff);
    s.launch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 900));
    s.update(U.flight * 0.1, () => {});
    expect(pose(meshOf(scene)).nose.y).toBeGreaterThan(0.3);
    s.update(U.flight * 0.8, () => {});
    expect(pose(meshOf(scene)).nose.y).toBeLessThan(-0.3);
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
