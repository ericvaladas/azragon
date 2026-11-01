import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';
import type { OpenSite } from '../world/City';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A random unblocked site, or null when every site is blocked. */
export function pickLandSite(sites: readonly OpenSite[], blocked: (x: number, z: number) => boolean, rng: () => number): Vec2 | null {
  const free = sites.filter((s) => !blocked(s.x, s.z));
  if (free.length === 0) return null;
  const s = free[Math.min(free.length - 1, Math.floor(rng() * free.length))]!;
  return { x: s.x, z: s.z };
}

/** The nearest land to a point in a random direction, mid-band from the monster. */
export function fallbackSite(monster: Vec2, rng: () => number, nearestLand: (p: Vec2) => Vec2): Vec2 {
  const a = rng() * Math.PI * 2;
  const r = (CONFIG.meteor.landMin + CONFIG.meteor.landMax) / 2;
  return nearestLand({ x: monster.x + Math.sin(a) * r, z: monster.z + Math.cos(a) * r });
}

/** Cutscene time (s) at which the gem lands. */
export function landTime(): number {
  return CONFIG.meteor.fallStart + CONFIG.meteor.fallTime;
}

/** Whole cutscene length (s): fall release, fall, hold, camera back. */
export function cutsceneTotal(): number {
  return landTime() + CONFIG.meteor.hold + CONFIG.meteor.lookBack;
}

/** Camera blend toward the sky at cutscene time t: eases up while the gem is already falling, holds through the landing, eases back; 0 outside the cutscene. */
export function cutsceneK(t: number): number {
  const m = CONFIG.meteor;
  const holdEnd = landTime() + m.hold;
  if (t <= 0 || t >= cutsceneTotal()) return 0;
  if (t < m.lookUp) return easeInOutCubic(t / m.lookUp);
  if (t <= holdEnd) return 1;
  return easeInOutCubic(1 - (t - holdEnd) / m.lookBack);
}

const _fall = new THREE.Vector3();

/** The falling gem t seconds after release: a straight slant from `to + slant` at `startHeight` to the ground at `to`. Returns a shared vector. */
/** How far the gem leans from upright while falling (rad, about Z): its top points back up the slanted path, toward +X. */
export function fallTilt(): number {
  const m = CONFIG.meteor;
  return -Math.atan2(m.slant, m.startHeight);
}

export function fallPosition(to: Vec2, t: number): THREE.Vector3 {
  const m = CONFIG.meteor;
  const u = Math.min(1, Math.max(0, t / m.fallTime));
  return _fall.set(to.x + m.slant * (1 - u), m.startHeight * (1 - u), to.z);
}
