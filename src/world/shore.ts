import type { CityStyle } from '../cities/types';
import type { Vec2 } from '../util/math';
import { leapTarget } from '../monster/leap';
import { isBay, isIsland, PITCH } from './roads';

const LANDING_STEP = 20;

/** True when the point lies in a bay or island cell; the island is unreachable, so it counts as sea. Rivers never do. */
export function inBay(style: CityStyle, x: number, z: number): boolean {
  const ci = Math.floor(x / PITCH);
  const cj = Math.floor(z / PITCH);
  return isBay(style, ci, cj) || isIsland(style, ci, cj);
}

/** True when a body of `radius` centred here touches the bay: the centre or any of its four compass points is in it. */
export function blockedAt(style: CityStyle, x: number, z: number, radius: number): boolean {
  return (
    inBay(style, x, z) ||
    inBay(style, x + radius, z) ||
    inBay(style, x - radius, z) ||
    inBay(style, x, z + radius) ||
    inBay(style, x, z - radius)
  );
}

/**
 * Resolves a move from `prev` to `next` against the shore: a free move passes, a blocked one slides along whichever
 * axis keeps more progress, and a fully blocked one stays at `prev`.
 */
export function slideAlongShore(style: CityStyle, prev: Vec2, next: Vec2, radius: number): Vec2 {
  if (!blockedAt(style, next.x, next.z, radius)) return next;
  const alongX = { x: next.x, z: prev.z };
  const alongZ = { x: prev.x, z: next.z };
  const moved = (p: Vec2): number => Math.hypot(p.x - prev.x, p.z - prev.z);
  const candidates = [alongX, alongZ]
    .filter((p) => !blockedAt(style, p.x, p.z, radius))
    .sort((a, b) => moved(b) - moved(a));
  return candidates[0] ?? prev;
}

/** The leap target `to`, or the last unblocked point on the line back toward `from` (20 m steps) when it is in the bay. */
export function landingSpot(style: CityStyle, from: Vec2, to: Vec2, radius: number): Vec2 {
  if (!blockedAt(style, to.x, to.z, radius)) return to;
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  if (dist === 0) return from;
  const ux = (from.x - to.x) / dist;
  const uz = (from.z - to.z) / dist;
  for (let d = LANDING_STEP; d < dist; d += LANDING_STEP) {
    const p = { x: to.x + ux * d, z: to.z + uz * d };
    if (!blockedAt(style, p.x, p.z, radius)) return p;
  }
  return from;
}
/**
 * One ground frame against the shore: the resolved position, and whether the shore changed the move. A dash that
 * is `slid` has hit the wall and must end, because its next frame would otherwise jump back onto the straight line.
 */
export function shoreStep(style: CityStyle, prev: Vec2, next: Vec2, radius: number): { pos: Vec2; slid: boolean } {
  const pos = slideAlongShore(style, prev, next, radius);
  return { pos, slid: pos !== next };
}

/** Where a leap aimed at `ground` lands: clamped to `range`, then pulled back to the last land. */
export function leapLanding(style: CityStyle, from: Vec2, ground: Vec2, range: number, radius: number): Vec2 {
  return landingSpot(style, from, leapTarget(from, ground, range), radius);
}

/**
 * True when the shore held a frame's move dead at `prev` (shoreStep resolved `next` to `prev` itself). A walk order
 * whose frame ends like this cannot make progress and is dropped; a standstill (`next` at `prev`) never counts.
 */
export function shoreStopped(prev: Vec2, next: Vec2, pos: Vec2): boolean {
  return pos === prev && (next.x !== prev.x || next.z !== prev.z);
}
