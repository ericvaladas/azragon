import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

const R = CONFIG.runaway;

/**
 * Detects the monster running away in one direction: its straight-line travel over the last CONFIG.runaway.window s
 * reaches `distance` m. Circling, zig-zagging and fighting stay well under that. Once running it keeps counting as
 * running until the travel falls below release × distance, so it doesn't flicker at the threshold.
 */
export class Runaway {
  /** Travel direction (unit) while the monster is running; null otherwise. */
  dir: Vec2 | null = null;
  private samples: { t: number; x: number; z: number }[] = [];
  private clock = 0;
  private sinceSample = R.sample;

  /** Records the monster at `pos`; true only on the update a run starts. */
  update(dt: number, pos: Vec2): boolean {
    this.clock += dt;
    this.sinceSample += dt;
    if (this.sinceSample < R.sample) return false;
    this.sinceSample = 0;
    this.samples.push({ t: this.clock, x: pos.x, z: pos.z });
    while (this.samples.length > 1 && this.clock - this.samples[0]!.t > R.window) this.samples.shift();
    const a = this.samples[0]!;
    const dx = pos.x - a.x;
    const dz = pos.z - a.z;
    const travel = Math.hypot(dx, dz);
    const was = this.dir !== null;
    const running = was ? travel >= R.distance * R.release : travel >= R.distance;
    this.dir = running && travel > 0 ? { x: dx / travel, z: dz / travel } : null;
    return running && !was;
  }

  reset(): void {
    this.dir = null;
    this.samples = [];
    this.clock = 0;
    this.sinceSample = R.sample;
  }
}

/**
 * Direction (unit, on the ground) from the monster to spawn an enemy: anywhere around it, or, while it runs in
 * `run`, within ±CONFIG.runaway.cone of that direction, so new enemies appear in its path.
 */
export function spawnDirection(rng: () => number, run: Vec2 | null): Vec2 {
  const base = run ? Math.atan2(run.z, run.x) : 0;
  const a = run ? base + (rng() * 2 - 1) * R.cone : rng() * Math.PI * 2;
  return { x: Math.cos(a), z: Math.sin(a) };
}
