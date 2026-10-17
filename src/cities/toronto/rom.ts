import * as THREE from 'three';
import { box, merge } from '../shapes';

/** The Royal Ontario Museum: a stone wing 120 m wide, the Crystal leaning north to 45 m. */
export const ROM = { w: 120, d: 110, h: 45 } as const;
const STONE = 0xc8a882;
const ROOF = 0x6e5a4a;
const WINDOW = 0x2e3a44;
const ALUMINIUM = 0xc9ccd0;
const GLASS = 0x6f8ea6;

/** A box from (x0, 0, z0) to (x1, h, z1) whose top is slid kx along x and kz along z per metre of height. */
function shard(x0: number, x1: number, z0: number, z1: number, h: number, kx: number, kz: number, color: number): THREE.BufferGeometry {
  return box(x0, 0, z0, x1, h, z1, color).applyMatrix4(new THREE.Matrix4().set(1, kx, 0, 0, 0, 1, 0, 0, 0, kz, 1, 0, 0, 0, 0, 1));
}

/**
 * The Royal Ontario Museum: the buff stone heritage wing on the south (+z) half, with a band of windows and a dark roof,
 * and the Crystal on the north (−z) half facing Bloor: four slanted shards of aluminium and glass leaning north and
 * apart. Base centre at the origin, +Y up, vertex-coloured.
 */
export function romGeometry(): THREE.BufferGeometry {
  return merge([
    box(-60, 0, 0, 60, 18, 55, STONE),
    box(-58, 18, 2, 58, 21, 53, ROOF),
    box(-56, 8, 55, 56, 12, 55.3, WINDOW),
    shard(-45, -10, -20, 0, 42, -0.15, -0.6, ALUMINIUM),
    shard(-15, 20, -25, -2, 45, 0, -0.65, GLASS),
    shard(15, 50, -18, 0, 34, 0.2, -0.5, ALUMINIUM),
    shard(40, 60, -10, 0, 24, 0, -0.4, GLASS),
  ]);
}
