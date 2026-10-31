import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { LanceBeam } from './LanceBeam';

const U = CONFIG.kaiju.ultimate;
const parts = (scene: THREE.Scene) => ({
  beams: scene.children.filter((c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh)) as THREE.Mesh[],
  scars: scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh,
});

describe('LanceBeam', () => {
  it('adds three meshes, hidden until shown', () => {
    const scene = new THREE.Scene();
    new LanceBeam(scene);
    const { beams, scars } = parts(scene);
    expect(scene.children).toHaveLength(3);
    expect(beams).toHaveLength(2);
    for (const b of beams) expect(b.visible).toBe(false);
    expect(scars.count).toBe(0);
  });

  it('shows a beam from the jaws to its end and hides it', () => {
    const scene = new THREE.Scene();
    const beam = new LanceBeam(scene);
    const from = new THREE.Vector3(0, 300, 0);
    const to = new THREE.Vector3(200, 0, 1200);
    beam.show(from, to, 1, 0.5);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    for (const b of parts(scene).beams) {
      expect(b.visible).toBe(true);
      expect(b.position.distanceTo(mid)).toBeLessThan(1e-6);
    }
    beam.hide();
    for (const b of parts(scene).beams) expect(b.visible).toBe(false);
  });

  it('a scar fades away over scarLife', () => {
    const scene = new THREE.Scene();
    const beam = new LanceBeam(scene);
    beam.scar(new THREE.Vector3(0, 0, 800));
    beam.update(0.01);
    expect(parts(scene).scars.count).toBe(1);
    beam.update(U.scarLife + 0.1);
    expect(parts(scene).scars.count).toBe(0);
  });

  it('burns a trench of scars along the whole ground line it is given', () => {
    const scene = new THREE.Scene();
    const beam = new LanceBeam(scene);
    const from = new THREE.Vector3(0, 0, 150);
    const to = new THREE.Vector3(0, 0, 1260);
    beam.burn(from, to);
    beam.update(0.01);
    const scars = parts(scene).scars;
    const zs: number[] = [];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < scars.count; i++) zs.push(p.setFromMatrixPosition((scars.getMatrixAt(i, m), m)).z);
    expect(scars.count).toBe(Math.floor((to.z - from.z) / U.scarSpacing) + 1);
    expect(Math.min(...zs)).toBeCloseTo(from.z);
    expect(Math.max(...zs)).toBeGreaterThan(to.z - U.scarSpacing);
  });

  it('clear and dispose leave nothing', () => {
    const scene = new THREE.Scene();
    const beam = new LanceBeam(scene);
    beam.show(new THREE.Vector3(0, 300, 0), new THREE.Vector3(0, 0, 1000), 1, 0);
    beam.scar(new THREE.Vector3(0, 0, 1000));
    beam.update(0.01);
    beam.clear();
    for (const b of parts(scene).beams) expect(b.visible).toBe(false);
    expect(parts(scene).scars.count).toBe(0);
    beam.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
