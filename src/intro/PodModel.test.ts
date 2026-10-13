import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PodModel } from './PodModel';

const meshes = (pod: PodModel) => {
  const out: THREE.Mesh[] = [];
  pod.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};
const greenish = (c: { r: number; g: number; b: number }) => c.g > c.r + 0.1 && c.g > c.b + 0.1;

describe('PodModel', () => {
  it('has no green stripes: nothing on the shell is drawn green, before or while it throbs', () => {
    const pod = new PodModel(1);
    for (const k of [0, 0.5, 1]) {
      pod.setGlow(k);
      for (const m of meshes(pod)) {
        const mat = m.material as THREE.MeshToonMaterial;
        expect(greenish(mat.color)).toBe(false);
        expect(greenish(mat.emissive ?? new THREE.Color())).toBe(false);
        const col = m.geometry.getAttribute('color');
        if (col) for (let i = 0; i < col.count; i++) expect(greenish({ r: col.getX(i), g: col.getY(i), b: col.getZ(i) })).toBe(false);
      }
    }
  });

  it('is one organic, detailed mesh: a lumpy shell with growths, in more than one tone', () => {
    const pod = new PodModel(1);
    const ms = meshes(pod);
    expect(ms).toHaveLength(1);
    const geo = ms[0]!.geometry;
    expect(geo.getAttribute('position').count).toBeGreaterThan(600);
    const col = geo.getAttribute('color');
    const tones = new Set<string>();
    for (let i = 0; i < col.count; i++) tones.add(`${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`);
    expect(tones.size).toBeGreaterThan(3);
    // Lumpy: the surface is not a perfect solid of revolution (radius varies around the axis at the waist).
    const pos = geo.getAttribute('position');
    const radii: number[] = [];
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i)) < 0.04) radii.push(Math.hypot(pos.getX(i), pos.getY(i)));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.03);
  });

  it('throbs a deep red as it is about to split, on top of its heat', () => {
    const pod = new PodModel(1);
    pod.setHeat(new THREE.Color(0, 0, 0));
    pod.setGlow(1);
    const e = (meshes(pod)[0]!.material as THREE.MeshToonMaterial).emissive;
    expect(e.r).toBeGreaterThan(0.1);
    expect(e.r).toBeGreaterThan(e.g * 2);
    pod.setGlow(0);
    expect(e.getHex()).toBe(0);
  });
});
