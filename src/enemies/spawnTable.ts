import { CONFIG } from '../config';
import { ENEMY_KINDS, type Difficulty, type EnemyKind } from './types';

export function difficulty(tSec: number): Difficulty {
  const m = Math.max(0, tSec) / 60;
  return { hpMult: 1 + CONFIG.difficulty.hpPerMin * m, dmgMult: 1 + CONFIG.difficulty.dmgPerMin * m };
}

/** Kinds unlocked at tSec whose concurrent count is under cap, in ENEMY_KINDS order. */
export function openKinds(tSec: number, alive: Record<EnemyKind, number>): EnemyKind[] {
  return ENEMY_KINDS.filter((k) => tSec >= CONFIG.spawns[k].unlock && alive[k] < CONFIG.spawns[k].cap);
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
