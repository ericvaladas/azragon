import { CONFIG } from '../config';
import type { AbilityId } from './Progression';

const P = CONFIG.passives;
const MELTDOWN_OFF = { active: false, damage: 1, cooldown: 1 } as const;
const MELTDOWN_ON = { active: true, damage: P.meltdown.damageMult, cooldown: P.meltdown.cooldownMult } as const;

/** Rank-derived passive values plus the Spike Storm and Brood Swarm timers. */
export class Passives {
  private stormT = 0;
  private broodT = 0;
  private novaT = 0;
  private mortarT = 0;
  private interceptBank = 0;
  private overloadCd = 0;
  private bubbleT = 0;
  private bubbleCd = 0;
  private reflectT = 0;
  private reflectCd = 0;

  constructor(private ranks: () => Record<AbilityId, number>) {}

  /** Overload: if taken and off cooldown, absorb this beam/orbital hit (starting the cooldown). */
  tryOverload(): boolean {
    const r = this.ranks().overload;
    if (r <= 0 || this.overloadCd > 0) return false;
    this.overloadCd = P.overload.cooldown[r]!;
    return true;
  }

  deflectChance(): number {
    return this.ranks().chitin * P.chitin.perRank;
  }

  frenzyHeal(): number {
    return this.ranks().frenzy * P.frenzy.perRank;
  }

  acidPool(): { radius: number; life: number } | null {
    const r = this.ranks().acid;
    if (r === 0) return null;
    return { radius: P.acid.radius * (1 + (r - 1) * P.acid.radiusPerRank), life: P.acid.life + (r - 1) * P.acid.lifePerRank };
  }

  /** Tail Swat (base kit at rank 0): cooldown, reach from the head, damage, and how many flyers per swing. */
  swat(): { cooldown: number; range: number; damage: number; targets: number } {
    const r = this.ranks().swat;
    return { cooldown: P.swat.cooldown[r]!, range: P.swat.range[r]!, damage: P.swat.damage[r]!, targets: P.swat.targets[r]! };
  }

  nova(): { radius: number; damage: number } {
    const r = this.ranks().nova;
    return { radius: P.nova.radius[r]!, damage: P.nova.damage[r]! };
  }

  /** Sucker Grip (Kraken): radius and damage of the crush on each plant, or null if not taken. */
  grip(): { radius: number; damage: number } | null {
    const r = this.ranks().grip;
    return r > 0 ? { radius: P.grip.radius[r]!, damage: P.grip.damage[r]! } : null;
  }

  /** Ravenous Hunger (Wendigo): max damage bonus at full heat, withering-aura radius and damage per second, or null if not taken. */
  core(): { bonus: number; radius: number; dps: number } | null {
    const r = this.ranks().core;
    return r > 0 ? { bonus: P.core.bonus[r]!, radius: P.core.radius[r]!, dps: P.core.dps[r]! } : null;
  }

  mortarSplash(): number {
    return P.mortar.splash[this.ranks().mortar]!;
  }

  spineRadius(): number {
    return P.spines.radius[this.ranks().spines]!;
  }

  /** Spine Shield's banked shots as a fraction of its one-second cap (0..1); 0 when not taken. */
  interceptCharge(): number {
    const rate = P.spines.rate[this.ranks().spines]!;
    return rate > 0 ? Math.min(1, this.interceptBank / rate) : 0;
  }

  bubbleActive(): boolean {
    return this.bubbleT > 0;
  }

  /** Meltdown (Kaiju): below the rank's HP fraction (and still alive), damage up and the ranged attack recharges faster. */
  meltdown(hpFrac: number): { active: boolean; damage: number; cooldown: number } {
    const r = this.ranks().meltdown;
    return r > 0 && hpFrac > 0 && hpFrac < P.meltdown.threshold[r]! ? MELTDOWN_ON : MELTDOWN_OFF;
  }

  reflectActive(): boolean {
    return this.reflectT > 0;
  }

  /** Auto-shields: each fires if taken, off cooldown, and `threat` (something about to hit). Returns which fired. */
  tryShields(threat: boolean): { bubble: boolean; reflect: boolean } {
    const r = this.ranks();
    const out = { bubble: false, reflect: false };
    if (!threat) return out;
    if (r.bubble > 0 && this.bubbleCd <= 0 && this.bubbleT <= 0) {
      this.bubbleT = P.bubble.duration[r.bubble]!;
      this.bubbleCd = this.bubbleT + P.bubble.cooldown[r.bubble]!;
      out.bubble = true;
    }
    if (r.reflect > 0 && this.reflectCd <= 0 && this.reflectT <= 0) {
      this.reflectT = P.reflect.duration[r.reflect]!;
      this.reflectCd = this.reflectT + P.reflect.cooldown[r.reflect]!;
      out.reflect = true;
    }
    return out;
  }

  /** Spine Shield shots that were actually used this frame. */
  spendIntercepts(n: number): void {
    this.interceptBank = Math.max(0, this.interceptBank - n);
  }

  /**
   * Advance timers. Returns this frame's storm spikes, brood drones, nova pulses (0/1), mortar globs,
   * and the Spine Shield shots available (banked up to one second's worth; spend what you use).
   */
  update(dt: number): { storm: number; brood: number; nova: number; mortar: number; intercepts: number } {
    const r = this.ranks();
    let storm = 0;
    let brood = 0;
    let nova = 0;
    let mortar = 0;
    if (r.nova > 0) {
      this.novaT += dt;
      const interval = P.nova.interval[r.nova]!;
      if (this.novaT >= interval) {
        this.novaT -= interval;
        nova = 1;
      }
    }
    if (r.mortar > 0) {
      this.mortarT += dt;
      const interval = P.mortar.interval[r.mortar]!;
      if (this.mortarT >= interval) {
        this.mortarT -= interval;
        mortar = P.mortar.globs[r.mortar]!;
      }
    }
    this.overloadCd = Math.max(0, this.overloadCd - dt);
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    this.bubbleCd = Math.max(0, this.bubbleCd - dt);
    this.reflectT = Math.max(0, this.reflectT - dt);
    this.reflectCd = Math.max(0, this.reflectCd - dt);
    const rate = P.spines.rate[r.spines]!;
    this.interceptBank = Math.min(rate, this.interceptBank + rate * dt);
    const intercepts = Math.floor(this.interceptBank + 1e-9);
    if (r.storm > 0) {
      this.stormT += dt;
      const interval = P.storm.interval - (r.storm - 1) * P.storm.intervalStep;
      if (this.stormT >= interval) {
        this.stormT -= interval;
        storm = P.storm.spikes + (r.storm - 1) * P.storm.extraSpikes;
      }
    }
    if (r.brood > 0) {
      this.broodT += dt;
      if (this.broodT >= P.brood.interval) {
        this.broodT -= P.brood.interval;
        brood = P.brood.drones + (r.brood - 1) * P.brood.extraDrones;
      }
    }
    return { storm, brood, nova, mortar, intercepts };
  }

  reset(): void {
    this.stormT = 0;
    this.broodT = 0;
    this.novaT = 0;
    this.mortarT = 0;
    this.interceptBank = 0;
    this.bubbleT = this.bubbleCd = this.reflectT = this.reflectCd = 0;
    this.overloadCd = 0;
  }
}
