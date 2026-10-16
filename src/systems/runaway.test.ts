import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { Runaway, spawnDirection } from './runaway';
import { mulberry32 } from '../util/rng';
import type { Vec2 } from '../util/math';

const R = CONFIG.runaway;
const DT = 0.1;
const SPEED = 130;

/** Feeds `seconds` of the path `at(t)` from time `t0`; returns how many updates reported a run starting. */
function feed(r: Runaway, at: (t: number) => Vec2, t0: number, seconds: number): number {
  let starts = 0;
  for (let t = t0; t < t0 + seconds - 1e-9; t += DT) if (r.update(DT, at(t + DT))) starts++;
  return starts;
}

describe('Runaway', () => {
  it('detects a steady straight run and its direction, reporting the start once', () => {
    const r = new Runaway();
    const starts = feed(r, (t) => ({ x: SPEED * t, z: 0 }), 0, R.window + 5);
    expect(starts).toBe(1);
    expect(r.dir).not.toBeNull();
    expect(r.dir!.x).toBeCloseTo(1, 3);
    expect(r.dir!.z).toBeCloseTo(0, 3);
  });

  it('follows a diagonal run', () => {
    const r = new Runaway();
    feed(r, (t) => ({ x: -SPEED * t * Math.SQRT1_2, z: SPEED * t * Math.SQRT1_2 }), 0, R.window + 5);
    expect(r.dir!.x).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(r.dir!.z).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('ignores circling and zig-zagging at full speed', () => {
    const circle = new Runaway();
    expect(feed(circle, (t) => ({ x: 300 * Math.cos((SPEED / 300) * t), z: 300 * Math.sin((SPEED / 300) * t) }), 0, 60)).toBe(0);
    expect(circle.dir).toBeNull();
    const zig = new Runaway();
    // Back and forth along x every 4 s.
    const leg = SPEED * 4;
    expect(feed(zig, (t) => ({ x: Math.abs(((t * SPEED) % (2 * leg)) - leg), z: 0 }), 0, 60)).toBe(0);
    expect(zig.dir).toBeNull();
  });

  it('ignores walking slower than the run threshold', () => {
    const r = new Runaway();
    const slow = (R.distance / R.window) * 0.8;
    expect(feed(r, (t) => ({ x: slow * t, z: 0 }), 0, 60)).toBe(0);
  });

  it('releases once the monster stops, and can start a new run after', () => {
    const r = new Runaway();
    const end = SPEED * (R.window + 5);
    feed(r, (t) => ({ x: SPEED * t, z: 0 }), 0, R.window + 5);
    expect(r.dir).not.toBeNull();
    feed(r, () => ({ x: end, z: 0 }), R.window + 5, R.window + 1);
    expect(r.dir).toBeNull();
    const t0 = 2 * R.window + 6;
    expect(feed(r, (t) => ({ x: end, z: SPEED * (t - t0) }), t0, R.window + 5)).toBe(1);
    expect(r.dir!.z).toBeCloseTo(1, 3);
  });

  it('reset forgets the history', () => {
    const r = new Runaway();
    feed(r, (t) => ({ x: SPEED * t, z: 0 }), 0, R.window + 5);
    r.reset();
    expect(r.dir).toBeNull();
  });
});

describe('spawnDirection', () => {
  it('is a random unit direction all round when the monster is not running', () => {
    const rng = mulberry32(4);
    const dirs = Array.from({ length: 200 }, () => spawnDirection(rng, null));
    for (const d of dirs) expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
    expect(dirs.some((d) => d.x < -0.9)).toBe(true);
    expect(dirs.some((d) => d.x > 0.9)).toBe(true);
  });

  it('stays inside the cone ahead of a run', () => {
    const rng = mulberry32(5);
    const run = { x: 0, z: -1 };
    for (let k = 0; k < 200; k++) {
      const d = spawnDirection(rng, run);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
      expect(d.x * run.x + d.z * run.z).toBeGreaterThanOrEqual(Math.cos(R.cone) - 1e-9);
    }
  });
});
