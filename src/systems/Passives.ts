import { CONFIG } from '../config';
import type { AbilityId } from './Progression';

const P = CONFIG.passives;

/** Rank-derived passive values plus the interval timers (Homing Barrage, Area Pulse, Auto Mortar). */
export class Passives {
  private stormT = 0;
  private novaT = 0;
  private mortarT = 0;
  private interceptBank = 0;
  private overloadCd = 0;
  /** Seconds left in which beam and orbital hits are absorbed for free. */
  private absorbT = 0;
  private bubbleT = 0;
  private reflectT = 0;
  private reflectCd = 0;

  constructor(private ranks: () => Record<AbilityId, number>) {}

  /**
   * Overload, on a beam or orbital hit: 'trigger' absorbs it, starting the cooldown and the absorb window; 'window' absorbs
   * it free inside that window; null lets it through.
   */
  tryOverload(): 'trigger' | 'window' | null {
    const r = this.ranks().overload;
    if (r <= 0) return null;
    if (this.absorbT > 0) return 'window';
    if (this.overloadCd > 0) return null;
    this.overloadCd = P.overload.cooldown[r]!;
    this.absorbT = P.overload.absorbTime;
    return 'trigger';
  }

  /** Seconds a triggered Overload cuts from the active abilities' cooldowns. */
  overloadCut(): number {
    return P.overload.cooldownCut[this.ranks().overload]!;
  }

  deflectChance(): number {
    return this.ranks().chitin * P.chitin.perRank;
  }

  /**
   * The anti-air swat: cooldown, reach from the head, damage, and how many flyers per swing; null until Anti-Air is
   * taken. A `builtIn` swat (the Insect's tail) is always there at rank-1 strength (its Anti-Air pick does other things).
   */
  swat(builtIn = false): { cooldown: number; range: number; damage: number; targets: number } | null {
    const r = builtIn ? 1 : this.ranks().swat;
    if (r === 0) return null;
    return { cooldown: P.swat.cooldown[r]!, range: P.swat.range[r]!, damage: P.swat.damage[r]!, targets: P.swat.targets[r]! };
  }

  /** The Insect's Anti-Air: its tail spikes may shoot aircraft, with this damage and cooldown multiplier on them; null until taken. */
  antiAirSpikes(): { damageMult: number; cooldownMult: number } | null {
    const r = this.ranks().swat;
    if (r === 0) return null;
    return { damageMult: P.antiAirSpikes.damageMult[r]!, cooldownMult: P.antiAirSpikes.cooldownMult[r]! };
  }

  nova(): { radius: number; damage: number } {
    const r = this.ranks().nova;
    return { radius: P.nova.radius[r]!, damage: P.nova.damage[r]! };
  }


  /** Haste When Hurt: extra cooldown recovery at full heat (1 + haste times as fast), or null if not taken. */
  core(): { haste: number } | null {
    const r = this.ranks().core;
    return r > 0 ? { haste: P.core.haste[r]! } : null;
  }

  mortarSplash(): number {
    return P.mortar.splash[this.ranks().mortar]!;
  }

  spineRadius(): number {
    return P.spines.radius[this.ranks().spines]!;
  }

  bubbleActive(): boolean {
    return this.bubbleT > 0;
  }


  reflectActive(): boolean {
    return this.reflectT > 0;
  }

  /** Shield Bubble (button; its cooldown is kept by Abilities): invincible for the rank's duration. */
  startBubble(): void {
    const r = this.ranks().bubble;
    if (r > 0) this.bubbleT = P.bubble.duration[r]!;
  }

  /** Reflect Shield (auto): fires if taken, off cooldown, and `threat` (something about to hit). Returns whether it fired. */
  tryReflect(threat: boolean): boolean {
    const r = this.ranks().reflect;
    if (!threat || r === 0 || this.reflectCd > 0 || this.reflectT > 0) return false;
    this.reflectT = P.reflect.duration[r]!;
    this.reflectCd = this.reflectT + P.reflect.cooldown[r]!;
    return true;
  }

  /** Spine Shield shots that were actually used this frame. */
  spendIntercepts(n: number): void {
    this.interceptBank = Math.max(0, this.interceptBank - n);
  }

  /**
   * Advance timers. Returns this frame's storm spikes, nova pulses (0/1), mortar globs,
   * and the Spine Shield shots available (banked up to one second's worth, at least one shot; spend what you use). `interceptScale` scales the rate for the monster kind.
   * `cdRate` (Haste When Hurt) speeds the interval timers and cooldowns; shield durations still run on `dt`.
   */
  update(dt: number, interceptScale = 1, cdRate = 1): { storm: number; nova: number; mortar: number; intercepts: number } {
    const r = this.ranks();
    const cdDt = dt * cdRate;
    let storm = 0;
    let nova = 0;
    let mortar = 0;
    if (r.nova > 0) {
      this.novaT += cdDt;
      const interval = P.nova.interval[r.nova]!;
      if (this.novaT >= interval) {
        this.novaT -= interval;
        nova = 1;
      }
    }
    if (r.mortar > 0) {
      this.mortarT += cdDt;
      const interval = P.mortar.interval[r.mortar]!;
      if (this.mortarT >= interval) {
        this.mortarT -= interval;
        mortar = P.mortar.globs[r.mortar]!;
      }
    }
    this.overloadCd = Math.max(0, this.overloadCd - cdDt);
    this.absorbT = Math.max(0, this.absorbT - dt);
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    this.reflectT = Math.max(0, this.reflectT - dt);
    this.reflectCd = Math.max(0, this.reflectCd - cdDt);
    const rate = P.spines.rate[r.spines]! * interceptScale;
    this.interceptBank = Math.min(interceptCap(rate), this.interceptBank + rate * dt);
    const intercepts = Math.floor(this.interceptBank + 1e-9);
    if (r.storm > 0) {
      this.stormT += cdDt;
      const interval = P.storm.interval - (r.storm - 1) * P.storm.intervalStep;
      if (this.stormT >= interval) {
        this.stormT -= interval;
        storm = P.storm.spikes + (r.storm - 1) * P.storm.extraSpikes;
      }
    }
    return { storm, nova, mortar, intercepts };
  }

  reset(): void {
    this.stormT = 0;
    this.novaT = 0;
    this.mortarT = 0;
    this.interceptBank = 0;
    this.bubbleT = this.reflectT = this.reflectCd = 0;
    this.overloadCd = this.absorbT = 0;
  }
}

/** The intercept bank's cap: one second's worth, but never under one shot (so a slowed rate still fires). */
function interceptCap(rate: number): number {
  return Math.max(1, rate);
}
