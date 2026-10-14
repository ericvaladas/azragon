import * as THREE from 'three';
import type { CityStyle } from '../cities/types';
import { isWater, PITCH } from '../world/roads';
import type { Particles } from './Particles';

/** Most splash particles (spray plus ring) one frame may spawn, however many things hit water. */
export const SPLASH_PER_FRAME = 40;

const SPRAY_PER_SIZE = 8;
const RING_PER_SIZE = 6;
const MAX_SIZE = 3;

const _at = new THREE.Vector3();

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

  /** Splashes at `p` when its lattice cell is water. `size` scales the particle count (1 = a footfall). */
  at(p: THREE.Vector3, size = 1): boolean {
    if (!isWater(this.style(), Math.floor(p.x / PITCH), Math.floor(p.z / PITCH))) return false;
    const s = Math.min(MAX_SIZE, Math.max(0.3, size));
    const spray = Math.min(this.left, Math.round(SPRAY_PER_SIZE * s));
    this.left -= spray;
    const ring = Math.min(this.left, Math.round(RING_PER_SIZE * s));
    this.left -= ring;
    if (spray > 0) this.fx.emit('splash', _at.set(p.x, 2, p.z), spray, 0.5 + s * 0.25);
    if (ring > 0) this.fx.ring('splash', _at.set(p.x, 0, p.z), 30 * s, ring);
    return true;
  }

  /** Splashes at a water point within the square footprint (centre x, z, side `size`), if any touches water. */
  footprint(x: number, z: number, size: number): boolean {
    const h = size / 2;
    for (const dx of [0, -h, h]) for (const dz of [0, -h, h]) if (this.at(_at.set(x + dx, 0, z + dz), size / 60)) return true;
    return false;
  }
}
