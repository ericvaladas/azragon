import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Vec2 } from '../../util/math';
import { bearingOf } from '../kaiju/plasmaLance';

const M = CONFIG.monster;

/** True when the Insect's tail, on a body at `from` facing `yaw`, may target `p`: anywhere but the cone straight behind. */
export function inTailReach(from: Vec2, yaw: number, p: Vec2): boolean {
  return Math.abs(bearingOf(from, yaw, p)) <= Math.PI - M.spikeBlindHalf;
}

/** The target the tail wants: an ordered one first, else the one it is on while that is still `valid`, else the nearest. */
export function tailWant(current: Target | null, ordered: Target | null, nearest: Target | null, valid: (t: Target) => boolean): Target | null {
  if (ordered) return ordered;
  if (current && valid(current)) return current;
  return nearest;
}

/**
 * Which target the Insect's tail is on. It takes its first at once and keeps it while it is wanted; when it loses it
 * (it died, or another is wanted instead) it lets go and waits M.spikeRetarget seconds before taking the next.
 */
export class TailTargeting {
  private current: Target | null = null;
  private wait = 0;

  /** The tail's target this frame, given the one it would like (`want`). */
  update(want: Target | null, dt: number): Target | null {
    if (this.current && (!this.current.isAlive() || want !== this.current)) {
      this.current = null;
      this.wait = M.spikeRetarget;
    }
    if (this.current) return this.current;
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - dt);
      return null;
    }
    this.current = want?.isAlive() ? want : null;
    return this.current;
  }

  reset(): void {
    this.current = null;
    this.wait = 0;
  }
}
