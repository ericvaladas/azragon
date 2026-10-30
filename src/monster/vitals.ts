/** Regeneration capped at maxHp. A monster at or below 0 HP stays at 0 so death is never undone. */
export function regen(hp: number, maxHp: number, perSec: number, dt: number): number {
  if (hp <= 0) return 0;
  return Math.min(maxHp, hp + perSec * dt);
}
