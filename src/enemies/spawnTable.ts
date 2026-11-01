import { CONFIG } from '../config';
import { ENEMY_KINDS, type Difficulty, type EnemyKind } from './types';

/** Enemy HP/damage multipliers for the player's current level (1x at level 1). */
export function difficulty(level: number): Difficulty {
  const l = Math.max(0, level - 1);
  return { hpMult: 1 + CONFIG.difficulty.hpPerLevel * l, dmgMult: 1 + CONFIG.difficulty.dmgPerLevel * l };
}

/** Per-kind replacements for the usual CONFIG.spawns caps. */
export type SpawnCaps = Partial<Record<EnemyKind, number>>;

/** Kinds among `kinds` unlocked at the player's level whose concurrent count is under cap (`caps`, else their usual one), in `kinds` order. */
export function openKinds(level: number, alive: Record<EnemyKind, number>, kinds: readonly EnemyKind[] = ENEMY_KINDS, caps: SpawnCaps = {}): EnemyKind[] {
  return kinds.filter((k) => level >= CONFIG.spawns[k].unlockLevel && alive[k] < (caps[k] ?? CONFIG.spawns[k].cap));
}

/** Weighted random pick by CONFIG.spawns[k].weight. */
export function pickKind(kinds: readonly EnemyKind[], rng: () => number): EnemyKind | null {
  if (kinds.length === 0) return null;
  const total = kinds.reduce((s, k) => s + CONFIG.spawns[k].weight, 0);
  let r = rng() * total;
  for (const k of kinds) {
    r -= CONFIG.spawns[k].weight;
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1]!;
}
