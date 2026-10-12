import { CONFIG } from '../config';

export type SpawnKind = 'tank' | 'jet';

/**
 * Budget-based escalation: spending points per second grow linearly with time.
 * The next enemy kind is rolled first and saved up for, so expensive jets are not starved by cheap tanks.
 * Caps limit concurrent enemies.
 */
export class SpawnDirector {
  elapsed = 0;
  private budget = 0;
  private next: SpawnKind | null = null;

  constructor(private rng: () => number) {}

  reset(): void {
    this.elapsed = 0;
    this.budget = 0;
    this.next = null;
  }

  update(dt: number, alive: { tanks: number; jets: number }): SpawnKind[] {
    const D = CONFIG.director;
    this.elapsed += dt;
    const rate = D.baseRate + (D.rateGrowthPerMin * this.elapsed) / 60;
    this.budget = Math.min(D.budgetCap, this.budget + rate * dt);
    const out: SpawnKind[] = [];
    let tanks = alive.tanks;
    let jets = alive.jets;
    for (;;) {
      if (this.next === null) {
        const jetsOpen = this.elapsed >= D.jetUnlockTime && jets < D.maxJets;
        this.next = jetsOpen && this.rng() < D.jetChance ? 'jet' : 'tank';
      }
      const atCap = this.next === 'jet' ? jets >= D.maxJets : tanks >= D.maxTanks;
      if (atCap) {
        this.next = null;
        break;
      }
      const cost = this.next === 'jet' ? D.jetCost : D.tankCost;
      if (this.budget < cost) break;
      this.budget -= cost;
      out.push(this.next);
      if (this.next === 'jet') jets++;
      else tanks++;
      this.next = null;
    }
    return out;
  }
}
