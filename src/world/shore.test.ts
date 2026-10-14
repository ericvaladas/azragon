import { describe, it, expect } from 'vitest';
import { TOKYO } from '../cities/tokyo';
import { isRiver, isBay } from './roads';
import { blockedAt, inBay, landingSpot, slideAlongShore } from './shore';
import { leapPosition } from '../monster/leap';

const R = 100;
const bay = TOKYO.bay!;
const island = TOKYO.island!;
/** World point at `along` metres seaward of the coast axis and `across` metres along it. */
const pt = (along: number, across: number) => ({
  x: along * bay.dir.x - across * bay.dir.z,
  z: along * bay.dir.z + across * bay.dir.x,
});

describe('shore', () => {
  it('blocks 300 m into the bay but not at the origin', () => {
    expect(blockedAt(TOKYO, 0, 0, R)).toBe(false);
    const p = pt(2300, 0);
    expect(blockedAt(TOKYO, p.x, p.z, R)).toBe(true);
  });

  it('blocks the island centre; a leap aimed at it lands on the mainland', () => {
    expect(blockedAt(TOKYO, island.center.x, island.center.z, R)).toBe(true);
    const from = pt(1500, -800);
    const spot = landingSpot(TOKYO, from, island.center, R);
    expect(inBay(TOKYO, spot.x, spot.z)).toBe(false);
    expect(blockedAt(TOKYO, spot.x, spot.z, R)).toBe(false);
    expect(Math.hypot(spot.x - island.center.x, spot.z - island.center.z)).toBeGreaterThan(1000);
  });

  it('never blocks river cells', () => {
    let rivers = 0;
    for (let ci = -30; ci < 30; ci++) for (let cj = -30; cj < 30; cj++) {
      if (isRiver(TOKYO, ci, cj) && !isBay(TOKYO, ci, cj)) {
        rivers++;
        expect(inBay(TOKYO, ci * 200 + 100, cj * 200 + 100)).toBe(false);
      }
    }
    expect(rivers).toBeGreaterThan(0);
  });

  it('keeps a land point when a move would enter the bay', () => {
    const prev = pt(1500, 0);
    const next = pt(2600, 0);
    const out = slideAlongShore(TOKYO, prev, next, R);
    expect(blockedAt(TOKYO, out.x, out.z, R)).toBe(false);
  });

  it('slides along the coast with progress when moving diagonally into it', () => {
    let p = pt(1500, 0);
    const start = p;
    for (let i = 0; i < 60; i++) {
      // 45 degrees seaward, 45 degrees along the coast
      const step = pt(0, 0);
      const d = { x: (bay.dir.x - bay.dir.z) * 0.7071 * 30, z: (bay.dir.z + bay.dir.x) * 0.7071 * 30 };
      p = slideAlongShore(TOKYO, p, { x: p.x + d.x + step.x, z: p.z + d.z + step.z }, R);
      expect(blockedAt(TOKYO, p.x, p.z, R)).toBe(false);
    }
    const along = (q: { x: number; z: number }) => -q.x * bay.dir.z + q.z * bay.dir.x;
    expect(Math.abs(along(p) - along(start))).toBeGreaterThan(200);
  });

  it('landingSpot toward a bay point returns the last land within 20 m of the shore', () => {
    const from = pt(1000, 0);
    const to = pt(3000, 0);
    const spot = landingSpot(TOKYO, from, to, R);
    expect(blockedAt(TOKYO, spot.x, spot.z, R)).toBe(false);
    const ahead = { x: spot.x + (to.x - from.x) / 2000 * 20, z: spot.z + (to.z - from.z) / 2000 * 20 };
    expect(blockedAt(TOKYO, ahead.x, ahead.z, R)).toBe(true);
  });

  it('landingSpot over a narrow inlet returns the far side unchanged', () => {
    let found = false;
    for (let along = 1700; along < 2300 && !found; along += 20) {
      for (let across = -4000; across < 4000 && !found; across += 50) {
        for (const len of [300, 500, 800]) {
          const a = pt(along, across);
          const b = pt(along, across + len);
          const mid = pt(along, across + len / 2);
          if (blockedAt(TOKYO, a.x, a.z, R) || blockedAt(TOKYO, b.x, b.z, R) || !blockedAt(TOKYO, mid.x, mid.z, R)) continue;
          expect(landingSpot(TOKYO, a, b, R)).toEqual(b);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('sweep: 50 seeded land points never end a step blocked', () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < 50; n++) {
      let p = pt(1400 + rnd() * 500, (rnd() - 0.5) * 3000);
      while (blockedAt(TOKYO, p.x, p.z, R)) p = pt(1000 + rnd() * 400, (rnd() - 0.5) * 3000);
      const target = pt(2200 + rnd() * 1500, (rnd() - 0.5) * 3000);
      for (let i = 0; i < 200; i++) {
        const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1;
        p = slideAlongShore(TOKYO, p, { x: p.x + (dx / d) * 60, z: p.z + (dz / d) * 60 }, R);
        expect(blockedAt(TOKYO, p.x, p.z, R)).toBe(false);
      }
    }
  });

  it('a dash straight into the bay stops at the wall', () => {
    const from = pt(1200, 0);
    const to = pt(3000, 0);
    let p = from;
    for (let f = 1; f <= 120; f++) {
      const q = leapPosition(from, to, f / 120, 1, 0);
      p = slideAlongShore(TOKYO, p, q, R);
      expect(blockedAt(TOKYO, p.x, p.z, R)).toBe(false);
    }
    expect(Math.hypot(p.x - to.x, p.z - to.z)).toBeGreaterThan(500);
  });
});
