import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Landforms, MAX_LANDFORM_TREES, LANDFORM_Y } from './LandformRenderer';
import { TORONTO_LANDFORMS } from '../cities/toronto/waterfront';

const make = () => {
  const scene = new THREE.Scene();
  const lf = new Landforms(scene, new THREE.ConeGeometry(0.5, 1.6, 5), new THREE.MeshBasicMaterial());
  return { scene, lf };
};
const names = (lf: Landforms) => lf.meshes().map((m) => m.name).sort();

describe('Landforms', () => {
  it('draws all landforms as one sand and one grass mesh, plus trees and details', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    expect(names(lf)).toEqual(['landform-details', 'landform-grass', 'landform-sand', 'landform-trees']);
    const trees = lf.meshes().find((m) => m.name === 'landform-trees') as THREE.InstancedMesh;
    expect(trees.count).toBeGreaterThan(200);
    expect(trees.count).toBeLessThanOrEqual(MAX_LANDFORM_TREES);
  });

  it('builds nothing for a city without landforms, and rebuilding leaves exactly one set', () => {
    const { scene, lf } = make();
    lf.build([]);
    expect(lf.meshes()).toEqual([]);
    const before = scene.children.length;
    lf.build(TORONTO_LANDFORMS);
    lf.build(TORONTO_LANDFORMS);
    expect(lf.meshes()).toHaveLength(4);
    lf.build([]);
    expect(lf.meshes()).toEqual([]);
    expect(scene.children.length).toBe(before);
  });

  it('lays the land flat just above the water, grass over sand', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    const ys = (name: string) => {
      const m = lf.meshes().find((o) => o.name === name) as THREE.Mesh;
      const b = new THREE.Box3().setFromObject(m);
      return [b.min.y, b.max.y] as const;
    };
    const [s0, s1] = ys('landform-sand');
    const [g0, g1] = ys('landform-grass');
    expect(s0).toBeCloseTo(LANDFORM_Y.sand, 3);
    expect(s1).toBeCloseTo(LANDFORM_Y.sand, 3);
    expect(g0).toBeGreaterThan(s1);
    expect(g1).toBeCloseTo(LANDFORM_Y.grass, 3);
    expect(LANDFORM_Y.sand).toBeGreaterThan(0.1);
  });

  it('cuts the lagoons out of the land', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    const grass = lf.meshes().find((o) => o.name === 'landform-grass') as THREE.Mesh;
    const ray = new THREE.Raycaster(new THREE.Vector3(-250, 100, 4300), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(grass)).toHaveLength(0);
    ray.set(new THREE.Vector3(-900, 100, 4500), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(grass).length).toBeGreaterThan(0);
  });
});
