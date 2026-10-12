/** Regeneration capped at maxHp. A monster at or below 0 HP stays at 0 so death is never undone. */
export function regen(hp: number, maxHp: number, perSec: number, dt: number): number {
  if (hp <= 0) return 0;
  return Math.min(maxHp, hp + perSec * dt);
}

/** Feeding Frenzy heal on a kill, capped at maxHp. A dead monster is never healed. */
export function healOnKill(hp: number, maxHp: number, amount: number, alive: boolean): number {
  if (!alive) return hp;
  return Math.min(maxHp, hp + amount);
}
