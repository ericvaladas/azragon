import * as THREE from 'three';

/**
 * A body's top surface seen from above, in its own frame (+X left, +Z forward, heights above the frame's y):
 * (cells + 1)² samples over the square ±half, 0 where nothing is below.
 */
export type Heightfield = { half: number; cells: number; h: Float32Array };

/** The frame a heightfield is measured in: a ground point and the yaw the body faces. */
export type BodyFrame = { x: number; y: number; z: number; yaw: number };

const RAY_TOP = 1e4;
const DOWN = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3();

/** Casts a ray straight down at every sample over the visible meshes under `root` (its world matrices current). */
export function buildHeightfield(root: THREE.Object3D, frame: BodyFrame, half: number, cells: number): Heightfield {
  const meshes: THREE.Object3D[] = [];
  root.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });
  const ray = new THREE.Raycaster();
  const h = new Float32Array((cells + 1) * (cells + 1));
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  const step = (2 * half) / cells;
  for (let j = 0; j <= cells; j++) {
    const lz = -half + j * step;
    for (let i = 0; i <= cells; i++) {
      const lx = -half + i * step;
      _o.set(frame.x + lx * c + lz * s, frame.y + RAY_TOP, frame.z - lx * s + lz * c);
      ray.set(_o, DOWN);
      const hit = ray.intersectObjects(meshes, false)[0];
      h[i + j * (cells + 1)] = hit ? Math.max(0, hit.point.y - frame.y) : 0;
    }
  }
  return { half, cells, h };
}

/** Surface height at body-frame (lx, lz), bilinear between samples; 0 outside the sampled square. */
export function surfaceAt(hf: Heightfield, lx: number, lz: number): number {
  const u = ((lx + hf.half) / (2 * hf.half)) * hf.cells;
  const v = ((lz + hf.half) / (2 * hf.half)) * hf.cells;
  if (u < 0 || v < 0 || u > hf.cells || v > hf.cells) return 0;
  const i = Math.min(hf.cells - 1, Math.floor(u));
  const j = Math.min(hf.cells - 1, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const n = hf.cells + 1;
  const a = hf.h[i + j * n]!;
  const b = hf.h[i + 1 + j * n]!;
  const d = hf.h[i + (j + 1) * n]!;
  const e = hf.h[i + 1 + (j + 1) * n]!;
  return (a * (1 - fu) + b * fu) * (1 - fv) + (d * (1 - fu) + e * fu) * fv;
}
