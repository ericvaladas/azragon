import { phaseLanded } from '../../monster/gait';

/** Eight tentacles around the mantle. */
export const ARM_COUNT = 8;

/** Body-relative yaw of arm i (0 = straight ahead, + = toward +X, the model's left): ±22.5°, ±67.5°, ±112.5°, ±157.5°. */
export function armAngle(i: number): number {
  return -Math.PI + (i + 0.5) * (Math.PI / 4);
}

/** The four most forward-facing arms do the crawling. */
export function isFrontArm(i: number): boolean {
  return Math.abs(armAngle(i)) < Math.PI / 2;
}

/** Crawl phase offsets of the front arms: a quarter cycle apart, alternating sides, so two always pull. */
const FRONT_OFFSET: Readonly<Record<number, number>> = { 5: 0, 3: 0.25, 4: 0.5, 2: 0.75 };

/** 0..1 position of arm i in the crawl cycle (only meaningful for front arms). */
export function crawlPhase(i: number, cycle: number): number {
  const p = cycle + (FRONT_OFFSET[i] ?? 0);
  return p - Math.floor(p);
}

export type ArmRole = 'pull' | 'reach' | 'free';

/**
 * What an arm is doing: while moving, each front arm spends half the cycle planted and pulling the mantle
 * forward and half reaching ahead for its next plant; back arms (and every arm at rest) are free to strike.
 */
export function armRole(i: number, cycle: number, moving: boolean): ArmRole {
  if (!moving || !isFrontArm(i)) return 'free';
  return crawlPhase(i, cycle) < 0.5 ? 'pull' : 'reach';
}

/**
 * True when front arm i planted between crawl positions prev and cur: crawling forward it plants as its pull begins
 * (phase 0); crawling backward the cycle plays in reverse, so it plants as its pull ends (phase 0.5).
 */
export function armPlanted(prev: number, cur: number, i: number): boolean {
  if (!isFrontArm(i)) return false;
  // The reach (the lifted half) runs from phase 0.5 to 1: offset by half a cycle, it is a swing of 0.5.
  return phaseLanded(prev, cur, FRONT_OFFSET[i]! + 0.5, 0.5);
}
