import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ballistic, launchArc, spikeTargets } from './projectileMath';

describe('ballistic', () => {
  const a = new THREE.Vector3(0, 0, 0);
  const b = new THREE.Vector3(100, 50, 0);
  it('starts at from and ends at to', () => {
    expect(ballistic(a, b, 80, 0, new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    const end = ballistic(a, b, 80, 1, new THREE.Vector3());
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
  it('peaks arc above the straight line at the midpoint', () => {
    const mid = ballistic(a, b, 80, 0.5, new THREE.Vector3());
    expect(mid.y).toBeCloseTo(25 + 80);
  });
});

describe('spikeTargets', () => {
  it('primary first, then other distinct targets, then repeats primary', () => {
    expect(spikeTargets('p', ['a', 'b'], 1)).toEqual(['p']);
    expect(spikeTargets('p', ['a', 'p', 'b'], 3)).toEqual(['p', 'a', 'b']);
    expect(spikeTargets('p', ['a'], 3)).toEqual(['p', 'a', 'p']);
  });
});

describe('launchArc', () => {
  const RUN = 120;
  const RISE = 150;
  const BACK = 0.6;
  const from = new THREE.Vector3(10, 400, 20);
  /** A point on the curve from `from` facing along +Z, to `to`. */
  const on = (to: THREE.Vector3, t: number) => launchArc(from, 0, 1, to, RUN, RISE, BACK, t, new THREE.Vector3());
  /** A ground target `range` m from the tube, `angle` rad off the facing (+ toward +X). */
  const off = (angle: number, range = 900) => new THREE.Vector3(from.x + Math.sin(angle) * range, 0, from.z + Math.cos(angle) * range);

  it('starts at the tube and ends exactly on the target', () => {
    const to = off(0.7);
    expect(on(to, 0).distanceTo(from)).toBeLessThan(1e-9);
    expect(on(to, 1).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('leaves level along the facing, for a target ahead or beside it', () => {
    for (const a of [0, 0.7, -1.2, Math.PI / 2]) {
      const moved = on(off(a), 0.01).sub(from);
      expect(moved.z).toBeGreaterThan(0);
      expect(Math.abs(moved.y)).toBeLessThan(0.2 * moved.z);
    }
  });

  it('turns one way only, with no loop, wherever the target lies', () => {
    for (const a of [0.2, 0.7, Math.PI / 2, -Math.PI / 2, 2.4, -2.4, 3.0, -3.0, Math.PI]) {
      for (const range of [300, 900, 1800]) {
        const to = off(a, range);
        let sign = 0;
        let turned = 0;
        let prev: number | null = null;
        const N = 100;
        for (let i = 0; i < N; i++) {
          const p = on(to, i / N);
          const q = on(to, (i + 1) / N);
          const h = Math.atan2(q.x - p.x, q.z - p.z);
          if (prev !== null) {
            const d = Math.atan2(Math.sin(h - prev), Math.cos(h - prev));
            turned += d;
            if (Math.abs(d) > 1e-6) {
              if (sign !== 0) expect(Math.sign(d)).toBe(sign);
              sign = Math.sign(d);
            }
          }
          prev = h;
        }
        // Never more than the half turn from the facing to the target's direction.
        expect(Math.abs(turned)).toBeLessThanOrEqual(Math.PI + 1e-6);
      }
    }
  });

  it('peaks only a little above the tube, then comes down a diagonal', () => {
    for (const a of [0, 0.7, Math.PI / 2, Math.PI]) {
      const to = off(a);
      let peak = 0;
      for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, on(to, t).y);
      expect(peak).toBeLessThan(from.y + RISE * 0.3);
      // The last stretch still crosses ground: not a dive straight down.
      const end = on(to, 0.95);
      expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeGreaterThan(end.y * 0.5);
    }
  });
});
