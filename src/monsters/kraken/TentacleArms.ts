import * as THREE from 'three';
import type { Target } from '../../combat';
import { ARM_COUNT, type ArmRole } from './crawl';

export type StrikeKind = 'slam' | 'hurl' | 'fling';
export type StrikeTiming = { windup: number; impact: number; end: number };
export type ArmStrike = { kind: StrikeKind; t: number; target: THREE.Vector3; live: Target | null; timing: StrikeTiming; hit: boolean };

/**
 * Per-tentacle state shared by the Kraken's body and the game. The body writes each arm's crawl role and
 * world tip every frame; the game starts strikes on free arms and resolves their impacts; the body poses
 * each arm from its strike. An arm can strike only when free in the crawl, idle, rested, and not spinning.
 */
export class TentacleArms {
  readonly roles: ArmRole[] = new Array<ArmRole>(ARM_COUNT).fill('free');
  readonly tips: THREE.Vector3[] = Array.from({ length: ARM_COUNT }, () => new THREE.Vector3());
  readonly strikes: (ArmStrike | null)[] = new Array<ArmStrike | null>(ARM_COUNT).fill(null);
  /** Seconds into the Whirlpool spin, or -1. */
  spinT = -1;
  /** Arm reserved for the anti-air lash (set by the body while a flyer is lashed), or -1. */
  lashArm = -1;
  private cooldown: number[] = new Array<number>(ARM_COUNT).fill(0);

  isFree(i: number): boolean {
    return this.roles[i] === 'free' && this.strikes[i] === null && this.cooldown[i]! <= 0 && this.spinT < 0 && this.lashArm !== i;
  }

  freeArms(): number[] {
    const out: number[] = [];
    for (let i = 0; i < ARM_COUNT; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  /** Targets an arm is already swinging at, so no second arm piles on. */
  striking(): Set<Target> {
    const s = new Set<Target>();
    for (const k of this.strikes) if (k?.live) s.add(k.live);
    return s;
  }

  /** Start a strike on arm `i` (ignored unless it is free); its cooldown runs from now. */
  start(i: number, kind: StrikeKind, target: THREE.Vector3, live: Target | null, cooldown: number, timing: StrikeTiming): void {
    if (!this.isFree(i)) return;
    this.strikes[i] = { kind, t: 0, target: target.clone(), live, timing: { ...timing }, hit: false };
    this.cooldown[i] = cooldown;
  }

  /** Whirlpool: every arm spins outward together. */
  spin(): void {
    this.spinT = 0;
  }

  /**
   * Advance strikes (each follows its live target while it lives, lands once at its impact time via
   * `onImpact`, and ends at its end time), cooldowns, and the spin (lasting `spinTime`).
   */
  update(dt: number, spinTime: number, onImpact: (arm: number, s: ArmStrike) => void): void {
    for (let i = 0; i < ARM_COUNT; i++) {
      this.cooldown[i] = Math.max(0, this.cooldown[i]! - dt);
      const s = this.strikes[i];
      if (!s) continue;
      if (s.live?.isAlive()) s.target.copy(s.live.position);
      s.t += dt;
      if (!s.hit && s.t >= s.timing.impact) {
        s.hit = true;
        onImpact(i, s);
      }
      if (s.t >= s.timing.end) this.strikes[i] = null;
    }
    if (this.spinT >= 0) {
      this.spinT += dt;
      if (this.spinT >= spinTime) this.spinT = -1;
    }
  }

  clear(): void {
    this.strikes.fill(null);
    this.cooldown.fill(0);
    this.roles.fill('free');
    this.spinT = -1;
    this.lashArm = -1;
  }
}
