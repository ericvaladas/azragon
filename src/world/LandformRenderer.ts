import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { LandformDetail, LandformSpec, Pt } from '../cities/types';
import { faceted, painted, toonMat } from '../render/toon';
import { allocateTrees, prepareLandform } from './landforms';

/** At most this many landform trees, shared across every landform in order. */
export const MAX_LANDFORM_TREES = 1200;
/** Heights of the land layers above the ground plane (the water lies at 0.1): sand, then grass over it. */
export const LANDFORM_Y = { sand: 0.6, grass: 0.7 } as const;
/** Tree seeds: CONFIG.world.seed + this (+ each landform's index). */
const SEED = 911;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Pulls a flat layer toward the camera by `offset` (as the city's ground layers do), so stacked layers never flicker. */
function layered<T extends THREE.Material>(mat: T, offset: number): T {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -offset * 0.25;
  mat.polygonOffsetUnits = -offset;
  return mat;
}

/** A flat shape from ground outlines at height y: the outline with its holes cut out, facing up. */
function flat(outline: readonly Pt[], holes: readonly (readonly Pt[])[], y: number): THREE.BufferGeometry {
  // Shape (x, y) → ground (x, z): shape y is −z, then rotating −90° about X lays it flat with its face up.
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.z))));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** A detail's solid, vertex-coloured, standing on the grass. */
function detailGeometry(d: LandformDetail): THREE.BufferGeometry {
  if (d.kind === 'dome') return painted(faceted(new THREE.IcosahedronGeometry(d.r, 1)), d.color).translate(d.x, LANDFORM_Y.grass + d.r * 0.5, d.z);
  if (d.kind === 'tower') {
    const body = painted(faceted(new THREE.CylinderGeometry(d.r * 0.7, d.r, d.h, 8).translate(0, d.h / 2, 0)), d.color);
    const cap = painted(faceted(new THREE.CylinderGeometry(d.r * 0.9, d.r * 0.9, d.r * 1.4, 8).translate(0, d.h + d.r * 0.7, 0)), d.cap);
    const roof = painted(faceted(new THREE.ConeGeometry(d.r, d.r * 1.2, 8).translate(0, d.h + d.r * 2, 0)), d.cap);
    return mergeGeometries([body, cap, roof])!.translate(d.x, LANDFORM_Y.grass, d.z);
  }
  const g = new THREE.BoxGeometry(d.w, d.h, d.d).translate(0, d.h / 2 + (d.y ?? 0), 0).rotateY(d.yaw);
  return painted(faceted(g), d.color).translate(d.x, LANDFORM_Y.grass, d.z);
}

/**
 * Scenery landforms over the water: every landform's sand in one mesh and grass in another (so overlapping landforms
 * never flicker against each other), lagoons cut through both, their trees in one instanced mesh (the city's tree
 * shape and material), and their details in one merged mesh. Rebuilt per city; nothing in gameplay reads it.
 */
export class Landforms {
  private built: THREE.Object3D[] = [];
  private sandMat = layered(toonMat(CONFIG.palette.landSand), 2);
  private grassMat = layered(toonMat(CONFIG.palette.landGrass), 3);
  private detailMat = toonMat(0xffffff, { vertexColors: true });

  constructor(
    private scene: THREE.Scene,
    private treeGeo: THREE.BufferGeometry,
    private treeMat: THREE.Material,
  ) {}

  meshes(): readonly THREE.Object3D[] {
    return this.built;
  }

  build(specs: readonly LandformSpec[]): void {
    this.clear();
    if (specs.length === 0) return;
    const prepared = specs.map(prepareLandform);
    const sand = new THREE.Mesh(mergeGeometries(prepared.map((p) => flat(p.outline, p.holes, LANDFORM_Y.sand)))!, this.sandMat);
    const grass = new THREE.Mesh(mergeGeometries(prepared.map((p) => flat(p.grass, p.holes, LANDFORM_Y.grass)))!, this.grassMat);
    sand.name = 'landform-sand';
    grass.name = 'landform-grass';
    sand.receiveShadow = grass.receiveShadow = true;
    const trees = allocateTrees(prepared, CONFIG.world.seed + SEED, MAX_LANDFORM_TREES).flat();
    const treeMesh = new THREE.InstancedMesh(this.treeGeo, this.treeMat, Math.max(1, trees.length));
    treeMesh.name = 'landform-trees';
    trees.forEach((t, i) => treeMesh.setMatrixAt(i, _m.compose(_p.set(t.x, LANDFORM_Y.grass, t.z), _q.identity(), _s.setScalar(t.s))));
    treeMesh.count = trees.length;
    const details = prepared.flatMap((p) => p.details.map(detailGeometry));
    const detailMesh = new THREE.Mesh(details.length ? mergeGeometries(details)! : new THREE.BufferGeometry(), this.detailMat);
    detailMesh.name = 'landform-details';
    detailMesh.castShadow = detailMesh.receiveShadow = true;
    this.built = [sand, grass, treeMesh, detailMesh];
    this.scene.add(...this.built);
  }

  /** Removes the landforms and frees their geometry (the shared tree geometry and materials are kept). */
  clear(): void {
    for (const o of this.built) {
      this.scene.remove(o);
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose();
    }
    this.built = [];
  }
}
