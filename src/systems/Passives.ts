import { CONFIG } from '../config';
import type { AbilityId } from './Progression';

const P = CONFIG.passives;

/** Rank-derived passive values plus the Spike Storm and Brood Swarm timers. */
export class Passives {
  private stormT = 0;
  private broodT = 0;
  private novaT = 0;
  private mortarT = 0;
  private interceptBank = 0;

  constructor(private ranks: () => Record<AbilityId, number>) {}

  tetherMult(): number {
    return P.thrash.tetherMult[this.ranks().thrash] ?? 1;
  }

  thrashDamage(): number {
    return this.ranks().thrash > 0 ? P.thrash.damage : 0;
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

  mortarSplash(): number {
    return P.mortar.splash[this.ranks().mortar]!;
  }

  spineRadius(): number {
    return P.spines.radius[this.ranks().spines]!;
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
  }
}
