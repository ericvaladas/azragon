import { CONFIG } from '../config';
import { openKinds, pickKind } from './spawnTable';
import type { EnemyKind } from './types';

/**
 * Budget-based escalation over the spawn table, driven by the player's level. The next kind is rolled first and saved up for,
 * so expensive enemies are not starved by cheap ones. Caps limit concurrent enemies per kind.
 */
export class SpawnDirector {
  elapsed = 0;
  private budget = 0;
  private next: EnemyKind | null = null;

  constructor(private rng: () => number) {}

  reset(): void {
    this.elapsed = 0;
    this.budget = 0;
    this.next = null;
  }

  /** Spawns for this frame; the spending rate and unlocked kinds follow the player's level. */
  update(dt: number, alive: Record<EnemyKind, number>, level: number): EnemyKind[] {
    const D = CONFIG.director;
    this.elapsed += dt;
    const rate = D.baseRate + D.rateGrowthPerLevel * Math.max(0, level - 1);
    this.budget = Math.min(D.budgetCap, this.budget + rate * dt);
    const counts = { ...alive };
    const out: EnemyKind[] = [];
    for (;;) {
      if (this.next === null) this.next = pickKind(openKinds(level, counts), this.rng);
      if (this.next === null) break;
      const rule = CONFIG.spawns[this.next];
      if (counts[this.next] >= rule.cap) {
        this.next = null;
        break;
      }
      if (this.budget < rule.cost) break;
      this.budget -= rule.cost;
      out.push(this.next);
      counts[this.next]++;
      this.next = null;
    }
    return out;
  }
}
