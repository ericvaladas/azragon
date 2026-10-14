import * as THREE from 'three';
import type { CityStyle } from '../cities/types';
import { SEA_WALL_SIZE } from '../world/chunks';
import { isWater, lineWidth, PITCH } from '../world/roads';
import type { Particles } from './Particles';

/** Most splash particles (spray plus ring) one frame may spawn, however many things hit water. */
export const SPLASH_PER_FRAME = 40;

const SPRAY_PER_SIZE = 8;
const RING_PER_SIZE = 6;
const MAX_SIZE = 3;

/** Scratch for `at`'s particle positions. */
const _fx = new THREE.Vector3();
/** Scratch for `footprint`'s sample points. */
const _foot = new THREE.Vector3();

/** How far into a water cell the paved strip along a land edge reaches: half the edge line's road plus the sea wall. */
const bankStrip = (line: number): number => lineWidth(line) / 2 + SEA_WALL_SIZE.thick;

/**
 * True when (x, z) is open water: its lattice cell is water and the point is clear of the road and sea wall along
 * every land edge of that cell (corner neighbours included).
 */
export function openWater(style: CityStyle, x: number, z: number): boolean {
  const ci = Math.floor(x / PITCH);
  const cj = Math.floor(z / PITCH);
  if (!isWater(style, ci, cj)) return false;
  const nearW = x - PITCH * ci < bankStrip(ci);
  const nearE = PITCH * (ci + 1) - x < bankStrip(ci + 1);
  const nearS = z - PITCH * cj < bankStrip(cj);
  const nearN = PITCH * (cj + 1) - z < bankStrip(cj + 1);
  for (const [di, near_i] of [[-1, nearW], [0, true], [1, nearE]] as const) {
    for (const [dj, near_j] of [[-1, nearS], [0, true], [1, nearN]] as const) {
      if ((di === 0 && dj === 0) || !near_i || !near_j) continue;
      if (!isWater(style, ci + di, cj + dj)) return false;
    }
  }
  return true;
}

/** Spray and an expanding ring where something lands on water; a per-frame particle budget keeps collapses cheap. */
export class Splasher {
  private left = SPLASH_PER_FRAME;

  constructor(
    private style: () => CityStyle,
    private fx: Pick<Particles, 'emit' | 'ring'>,
  ) {}

  /** Restores the budget; called once per frame. */
  newFrame(): void {
    this.left = SPLASH_PER_FRAME;
  }

  /** Splashes at `p` when it is open water (see openWater). `size` scales the particle count (1 = a footfall). */
  at(p: THREE.Vector3, size = 1): boolean {
    if (!openWater(this.style(), p.x, p.z)) return false;
    const s = Math.min(MAX_SIZE, Math.max(0.3, size));
    const spray = Math.min(this.left, Math.round(SPRAY_PER_SIZE * s));
    this.left -= spray;
    const ring = Math.min(this.left, Math.round(RING_PER_SIZE * s));
    this.left -= ring;
    if (spray > 0) this.fx.emit('splash', _fx.set(p.x, 2, p.z), spray, 0.5 + s * 0.25);
    if (ring > 0) this.fx.ring('splash', _fx.set(p.x, 0, p.z), 30 * s, ring);
    return true;
  }

  /** Splashes at an open-water point within the square footprint (centre x, z, side `size`), if any touches water. */
  footprint(x: number, z: number, size: number): boolean {
    const h = size / 2;
    for (const dx of [0, -h, h]) for (const dz of [0, -h, h]) if (this.at(_foot.set(x + dx, 0, z + dz), size / 60)) return true;
    return false;
  }
}
