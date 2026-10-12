import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

export function strikeFill(t: number, fillTime: number): number {
  return Math.min(1, Math.max(0, t / fillTime));
}

export function strikeHits(monster: Vec2, strike: Vec2, radius: number): boolean {
  return Math.hypot(monster.x - strike.x, monster.z - strike.z) <= radius;
}

/** Strikes per salvo: baseSalvo at the artillery unlock level, +1 every levelsPerExtra levels, capped at maxSalvo. */
export function salvoSize(level: number): number {
  const A = CONFIG.artillery;
  const extra = Math.floor(Math.max(0, level - CONFIG.spawns.artillery.unlockLevel) / A.levelsPerExtra);
  return Math.min(A.maxSalvo, A.baseSalvo + extra);
}

/** First strike on `center` (where the monster is); the rest scattered uniformly within `spread`. */
export function strikePoints(center: Vec2, n: number, spread: number, rng: () => number): Vec2[] {
  const out: Vec2[] = [{ x: center.x, z: center.z }];
  for (let i = 1; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * spread;
    out.push({ x: center.x + Math.cos(a) * d, z: center.z + Math.sin(a) * d });
  }
  return out;
}
