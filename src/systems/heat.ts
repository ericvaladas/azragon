/** Haste When Hurt heat after taking `damage`: up by the hit's share of max HP × gain, capped at 1. */
export function heatAfterHit(heat: number, damage: number, maxHp: number, gain: number): number {
  return Math.min(1, heat + (Math.max(0, damage) / maxHp) * gain);
}

/** Heat after cooling for dt seconds at `rate` per second. */
export function coolHeat(heat: number, dt: number, rate: number): number {
  return Math.max(0, heat - rate * dt);
}

/** How many times as fast cooldowns recover at this heat: 1 when cold, 1 + maxHaste at full heat. */
export function coreCooldownRate(heat: number, maxHaste: number): number {
  return 1 + heat * maxHaste;
}
