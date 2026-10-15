import { CONFIG } from '../config';

/** Smallest remaining time an attack leaves, so the next update still ends the snare and reports it. */
const LAST_MOMENT = 1e-3;

/**
 * The monster's snare (an Osprey net): while active it walks at CONFIG.snare.speedMult and cannot leap or dash.
 * Each attack shortens it by CONFIG.snare.perAttack, never ending it sooner than CONFIG.snare.minDuration after it
 * started. Starting again resets the time; snares never stack.
 */
export class Snare {
  private remaining = 0;
  private elapsed = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  get speedMult(): number {
    return this.active ? CONFIG.snare.speedMult : 1;
  }

  get blocksMobility(): boolean {
    return this.active;
  }

  start(duration: number): void {
    this.remaining = duration;
    this.elapsed = 0;
  }

  onAttack(): void {
    if (!this.active) return;
    const floor = Math.max(LAST_MOMENT, CONFIG.snare.minDuration - this.elapsed);
    this.remaining = Math.max(floor, this.remaining - CONFIG.snare.perAttack);
  }

  /** Counts down; true only on the update that ends it. */
  update(dt: number): boolean {
    if (!this.active) return false;
    this.elapsed += dt;
    this.remaining -= dt;
    if (this.remaining > 0) return false;
    this.remaining = 0;
    return true;
  }

  /** Ends it without reporting an end (death, a new run). */
  clear(): void {
    this.remaining = 0;
    this.elapsed = 0;
  }
}
