import { describe, it, expect } from 'vitest';
import { TOKYO } from '../cities/tokyo';
import { isRiver, isBay } from './roads';
import type { CityStyle } from '../cities/types';

import { blockedAt, inBay, landingSpot, shoreStep, shoreStopped, slideAlongShore } from './shore';
import { CONFIG } from '../config';
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
      const d = { x: (bay.dir.x - bay.dir.z) * 0.7071 * 30, z: (bay.dir.z + bay.dir.x) * 0.7071 * 30 };
      p = slideAlongShore(TOKYO, p, { x: p.x + d.x, z: p.z + d.z }, R);
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

  it('a shallow dash past a coast step never skips: it ends at the shore instead', () => {
    const FRAMES = 36;
    let worst = 0;
    let wallHits = 0;
    for (let a = 0; a < 360; a += 15) {
      for (const along of [1500, 1700, 1850]) {
        for (let across = -3000; across <= 3000; across += 400) {
          const from = pt(along, across);
          if (blockedAt(TOKYO, from.x, from.z, R)) continue;
          const yaw = (a * Math.PI) / 180;
          const to = { x: from.x + Math.sin(yaw) * 700, z: from.z + Math.cos(yaw) * 700 };
          let pos = from;
          let dashing = true;
          for (let f = 1; f <= FRAMES && dashing; f++) {
            const raw = leapPosition(from, to, f / FRAMES, 1, 0);
            const step = shoreStep(TOKYO, pos, raw, R);
            worst = Math.max(worst, Math.hypot(step.pos.x - pos.x, step.pos.z - pos.z));
            expect(blockedAt(TOKYO, step.pos.x, step.pos.z, R)).toBe(false);
            if (step.slid) { dashing = false; wallHits++; }
            pos = step.pos;
          }
        }
      }
    }
    expect(wallHits).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(700 / FRAMES + 1e-6);
  });

  describe('a move tapped into the bay', () => {
    const shore = landingSpot(TOKYO, pt(1000, 0), pt(3000, 0), R);
    const tap = pt(2600, 300);
    /** Walks straight at `goal` 10 m a frame against the shore; the frame the order ends ('arrived' or 'stopped'). */
    const walk = (goal: { x: number; z: number }) => {
      let pos = { ...shore };
      for (let f = 0; f < 600; f++) {
        const d = Math.hypot(goal.x - pos.x, goal.z - pos.z);
        if (d <= CONFIG.monster.arriveRadius) return { end: 'arrived', f };
        const k = Math.min(1, 10 / d);
        const next = { x: pos.x + (goal.x - pos.x) * k, z: pos.z + (goal.z - pos.z) * k };
        const step = shoreStep(TOKYO, pos, next, R);
        if (shoreStopped(pos, next, step.pos)) return { end: 'stopped', f };
        pos = step.pos;
      }
      return { end: 'walking', f: 600 };
    };

    it('the raw bay point is unreachable: the shore stops the walk dead, so the order must clear', () => {
      expect(blockedAt(TOKYO, tap.x, tap.z, R)).toBe(true);
      expect(walk(tap).end).toBe('stopped');
    });

    it('clamped with landingSpot at tap time, it is on land and the walk arrives', () => {
      const to = landingSpot(TOKYO, shore, tap, R);
      expect(blockedAt(TOKYO, to.x, to.z, R)).toBe(false);
      expect(walk(to).end).toBe('arrived');
    });

    it('shoreStopped: only a move the shore held at prev, never a free step or a standstill', () => {
      const prev = { x: 0, z: 0 };
      const next = { x: 5, z: 0 };
      expect(shoreStopped(prev, next, prev)).toBe(true);
      expect(shoreStopped(prev, next, next)).toBe(false);
      expect(shoreStopped(prev, next, { x: 3, z: 0 })).toBe(false);
      expect(shoreStopped(prev, { ...prev }, prev)).toBe(false);
    });
  });
});

describe('shore with a north–south river', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130 }, bay: undefined, island: undefined };
  it('never blocks its cells: the monster wades through', () => {
    let rivers = 0;
    for (let ci = 0; ci <= 12; ci++) for (let cj = -20; cj <= 20; cj++) {
      if (!isRiver(NS, ci, cj)) continue;
      rivers++;
      expect(inBay(NS, ci * 200 + 100, cj * 200 + 100)).toBe(false);
      expect(blockedAt(NS, ci * 200 + 100, cj * 200 + 100, 100)).toBe(false);
    }
    expect(rivers).toBeGreaterThan(20);
  });
});
