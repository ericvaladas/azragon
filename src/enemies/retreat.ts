import { CONFIG } from '../config';
import { dist2, type Vec2 } from '../util/math';

/** The point `dist` m from `monster`, through `from`, on the side away from the monster (along +Z when `from` is the monster's position). */
export function fleePoint(from: Vec2, monster: Vec2, dist: number): Vec2 {
  const dx = from.x - monster.x;
  const dz = from.z - monster.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: monster.x, z: monster.z + dist };
  return { x: monster.x + (dx / len) * dist, z: monster.z + (dz / len) * dist };
}

/** True once `p` is at least CONFIG.cycle.exitDistance m from the monster: a retreating unit there is removed. */
export function escaped(p: Vec2, monster: Vec2): boolean {
  return dist2(p, monster) >= CONFIG.cycle.exitDistance;
}
