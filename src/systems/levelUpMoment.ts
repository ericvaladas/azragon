import { CONFIG } from '../config';

/**
 * The slow-motion beat between filling the EXP bar and showing the upgrade cards.
 * Timed in real (unscaled) seconds so its length doesn't stretch with the slow motion.
 */
export class LevelUpMoment {
  active = false;
  private t = 0;

  /** Starts the moment; a second start while running is ignored. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.t = 0;
  }

  /** World time multiplier: slowed while the moment runs. */
  timeScale(): number {
    return this.active ? CONFIG.levelUp.timeScale : 1;
  }

  /** Advance by real seconds. Returns true exactly once, on the frame the moment ends. */
  update(realDt: number): boolean {
    if (!this.active) return false;
    this.t += realDt;
    if (this.t < CONFIG.levelUp.momentTime) return false;
    this.active = false;
    return true;
  }

  reset(): void {
    this.active = false;
    this.t = 0;
  }
}

/** Whether a level-up moment may start now: levels are pending, the game is playing, and no ultimate is running (it waits for the end). */
export function levelUpNow(pending: number, playing: boolean, ultimateRunning: boolean): boolean {
  return pending > 0 && playing && !ultimateRunning;
}
