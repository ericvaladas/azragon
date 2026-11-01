import { CONFIG } from '../config';
import { openKinds, pickKind } from './spawnTable';
import { ENEMY_KINDS, type EnemyKind } from './types';

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

  /** Gives back the cost of a spawn that did not happen (no room for it), up to the budget cap. */
  refund(kind: EnemyKind): void {
    this.budget = Math.min(CONFIG.director.budgetCap, this.budget + CONFIG.spawns[kind].cost);
  }

  /** Spawns for this frame; the spending rate and unlocked kinds follow the player's level, limited to `kinds`, with the rate scaled by `rateMult`. */
  update(dt: number, alive: Record<EnemyKind, number>, level: number, kinds: readonly EnemyKind[] = ENEMY_KINDS, rateMult = 1): EnemyKind[] {
    const D = CONFIG.director;
    this.elapsed += dt;
    const rate = (D.baseRate + D.rateGrowthPerLevel * Math.max(0, level - 1)) * rateMult;
    this.budget = Math.min(D.budgetCap, this.budget + rate * dt);
    const counts = { ...alive };
    // A kind saved up for outside `kinds` is dropped, not spawned.
    if (this.next !== null && !kinds.includes(this.next)) this.next = null;
    const out: EnemyKind[] = [];
    for (;;) {
      if (this.next === null) this.next = pickKind(openKinds(level, counts, kinds), this.rng);
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
