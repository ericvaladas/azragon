import type { Vec2 } from '../util/math';

export type Tether = { x: number; z: number; length: number };

/**
 * Clamp a proposed move so the monster never ends further from any anchor than that tether allows.
 * The allowed radius is max(length, current distance), so a monster already beyond its length can
 * move inward but not outward. Projections onto discs are non-expansive, so the result never lies
 * further from `from` than `to` does.
 */
export function clampToTethers(from: Vec2, to: Vec2, tethers: readonly Tether[]): Vec2 {
  if (tethers.length === 0) return to;
  let x = to.x;
  let z = to.z;
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (const t of tethers) {
      const allowed = Math.max(t.length, Math.hypot(from.x - t.x, from.z - t.z));
      const dx = x - t.x;
      const dz = z - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > allowed + 1e-9) {
        x = t.x + (dx / dist) * allowed;
        z = t.z + (dz / dist) * allowed;
        moved = true;
      }
    }
    if (!moved) return { x, z };
  }
  // Alternating projections converge slowly in thin overlaps; if still outside any circle, stay put.
  for (const t of tethers) {
    const allowed = Math.max(t.length, Math.hypot(from.x - t.x, from.z - t.z));
    if (Math.hypot(x - t.x, z - t.z) > allowed + 1e-6) return { x: from.x, z: from.z };
  }
  return { x, z };
}
