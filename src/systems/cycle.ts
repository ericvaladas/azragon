import { CONFIG } from '../config';

/** Where the loop is: the army attacks, retreats while the meteor/boss comes, fights the boss, or recovers. */
export type Phase = 'army' | 'retreat' | 'boss' | 'recover';

/** One-shot signals from `Cycle.update`, each fired at most once per phase entry. */
export type CycleEvent = 'retreat' | 'cutscene' | 'dismiss' | 'boss' | 'recover' | 'army';

/** Float slack so accumulated 0.1 s steps still reach a threshold on the intended step. */
const EPS = 1e-6;

/**
 * The army / retreat / boss / recover state machine. Pure timing: it counts `dt` and reports events;
 * GameScene reacts to them. The first retreat waits for the meteor (cutscene, landing, collection);
 * later retreats end after `CONFIG.cycle.breakTime`.
 */
export class Cycle {
  private _phase: Phase = 'army';
  private _cycles = 0;

  private readonly armyTime: number;
  private clock = 0;
  private cutsceneFired = false;
  private dismissFired = false;
  private landedAt: number | null = null;
  private collectedAt: number | null = null;
  private defeated = false;

  constructor(armyTime: number = CONFIG.cycle.armyTime) {
    this.armyTime = armyTime;
  }

  /** The current phase. */
  get phase(): Phase {
    return this._phase;
  }

  /** Completed army cycles (boss fights survived). */
  get cycles(): number {
    return this._cycles;
  }

  /** True while the army is spawning (the army phase only). */
  get spawning(): boolean {
    return this.phase === 'army';
  }

  /** True in every phase except army. */
  get retreating(): boolean {
    return this.phase !== 'army';
  }

  /** Back to a fresh run: army phase, clock 0, no cycles. */
  reset(): void {
    this._phase = 'army';
    this._cycles = 0;
    this.clearPhaseState();
  }

  /** Advances the phase clock by `dt` seconds and returns the events that fired. */
  update(dt: number): CycleEvent[] {
    const out: CycleEvent[] = [];
    this.clock += dt;
    const t = this.clock + EPS;
    const first = this.cycles === 0;
    switch (this.phase) {
      case 'army':
        if (t >= this.armyTime) this.enter('retreat', out);
        break;
      case 'retreat': {
        if (!this.dismissFired && t >= CONFIG.cycle.retreatTimeout) {
          this.dismissFired = true;
          out.push('dismiss');
        }
        if (first) {
          if (!this.cutsceneFired && t >= CONFIG.meteor.cutsceneDelay) {
            this.cutsceneFired = true;
            out.push('cutscene');
          }
          const collected = this.collectedAt !== null && t >= this.collectedAt + CONFIG.meteor.bossDelay;
          const grace = this.landedAt !== null && t >= this.landedAt + CONFIG.meteor.graceTime;
          if (collected || grace) this.enter('boss', out);
        } else if (t >= CONFIG.cycle.breakTime) {
          this.enter('boss', out);
        }
        break;
      }
      case 'boss':
        if (this.defeated) this.enter('recover', out);
        break;
      case 'recover':
        if (t >= CONFIG.cycle.recoverTime) {
          this._cycles++;
          this.enter('army', out);
        }
        break;
    }
    return out;
  }

  /** The first break's meteor hit the ground. Outside the first retreat this has no effect on the phase. */
  meteorLanded(): void {
    if (this.landedAt === null) this.landedAt = this.clock;
  }

  /** The player picked up the meteor. Outside the first retreat this has no effect on the phase. */
  meteorCollected(): void {
    if (this.collectedAt === null) this.collectedAt = this.clock;
  }

  /** The boss is dead; the next update moves to recover. */
  bossDefeated(): void {
    if (this.phase === 'boss') this.defeated = true;
  }

  private enter(phase: Phase, out: CycleEvent[]): void {
    this._phase = phase;
    this.clearPhaseState();
    out.push(phase);
  }

  private clearPhaseState(): void {
    this.clock = 0;
    this.cutsceneFired = false;
    this.dismissFired = false;
    this.landedAt = null;
    this.collectedAt = null;
    this.defeated = false;
  }
}

/** Parses `?army=<seconds>` (a positive number) from a query string; null when absent or invalid. */
export function devArmyTime(search: string): number | null {
  const raw = new URLSearchParams(search).get('army');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
