import { CONFIG } from '../config';
import type { AbilityId } from './Progression';

const P = CONFIG.passives;

/** Rank-derived passive values plus the Spike Storm and Brood Swarm timers. */
export class Passives {
  private stormT = 0;
  private broodT = 0;

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

  /** Advance timers; returns how many storm spikes and brood drones to release this frame. */
  update(dt: number): { storm: number; brood: number } {
    const r = this.ranks();
    let storm = 0;
    let brood = 0;
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
    return { storm, brood };
  }

  reset(): void {
    this.stormT = 0;
    this.broodT = 0;
  }
}
