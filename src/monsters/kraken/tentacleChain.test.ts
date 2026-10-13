import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type ChainTuning, type Ellipsoid, pushOut, resample, TentacleChain } from './tentacleChain';

const TUNE: ChainTuning = { omegaRoot: 20, omegaTip: 8, zetaRoot: 0.9, zetaTip: 0.4 };
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const line = (n: number, len: number, dx = 1, dz = 0) =>
  Array.from({ length: n + 1 }, (_, j) => v((j / n) * len * dx, 0, (j / n) * len * dz));

describe('resample', () => {
  it('spaces points evenly along the polyline and returns its length', () => {
    const src = [v(0, 0, 0), v(10, 0, 0), v(10, 0, 30)];
    const out = Array.from({ length: 5 }, () => v(0, 0, 0));
    expect(resample(src, out)).toBeCloseTo(40);
    expect(out.map((p) => [p.x, p.z])).toEqual([[0, 0], [10, 0], [10, 10], [10, 20], [10, 30]]);
  });
});

describe('pushOut', () => {
  const e: Ellipsoid = { c: v(0, 100, 0), r: v(50, 100, 50) };
  it('moves an inside point onto the padded surface along its direction', () => {
    const p = v(10, 100, 0);
    expect(pushOut(p, e, 10)).toBe(true);
    expect(p.x).toBeCloseTo(60);
    expect(p.y).toBeCloseTo(100);
  });
  it('leaves outside points alone', () => {
    const p = v(80, 100, 0);
    expect(pushOut(p, e, 10)).toBe(false);
    expect(p.x).toBe(80);
  });
});

describe('TentacleChain', () => {
  const N = 10;
  const run = (c: TentacleChain, targets: THREE.Vector3[], seconds: number, bodies: Ellipsoid[] = [], segLen = 10) => {
    for (let t = 0; t < seconds; t += 1 / 60) c.step(1 / 60, targets, segLen, TUNE, bodies, () => 0);
  };

  it('snaps to its targets on the first step', () => {
    const c = new TentacleChain(N);
    const tg = line(N, 100);
    c.step(1 / 60, tg, 10, TUNE, [], () => 0);
    expect(c.joints[N]!.x).toBeCloseTo(100);
  });

  it('keeps every segment at the given length and the root pinned', () => {
    const c = new TentacleChain(N);
    run(c, line(N, 100), 0.1);
    run(c, line(N, 100, 0, 1), 0.3);
    expect(c.joints[0]!.length()).toBeCloseTo(0);
    for (let j = 1; j <= N; j++) expect(c.joints[j]!.distanceTo(c.joints[j - 1]!)).toBeCloseTo(10, 3);
  });

  it('whips: after a sudden swing the tip lags the middle, then settles on target', () => {
    const c = new TentacleChain(N);
    run(c, line(N, 100), 0.1);
    const swung = line(N, 100, 0, 1);
    run(c, swung, 0.1);
    const err = (j: number) => c.joints[j]!.distanceTo(swung[j]!);
    expect(err(N)).toBeGreaterThan(err(N / 2) * 1.5);
    run(c, swung, 2);
    expect(err(N)).toBeLessThan(2);
  });

  it('holds a pinned tip exactly on its target while the root end moves', () => {
    const c = new TentacleChain(N);
    const tg = line(N, 100);
    run(c, tg, 0.1);
    const moved = tg.map((p, j) => p.clone().add(v(0, 0, 30 * (1 - j / N))));
    for (let t = 0; t < 0.2; t += 1 / 60) c.step(1 / 60, moved, 10.5, TUNE, [], () => 0, 2, true);
    expect(c.joints[N]!.distanceTo(moved[N]!)).toBeLessThan(0.5);
    expect(c.joints[0]!.distanceTo(moved[0]!)).toBeLessThan(1e-6);
  });

  it('resists sharp bends when given bending stiffness', () => {
    const zig = Array.from({ length: N + 1 }, (_, j) => v(j * 10, 0, j % 2 ? 6 : 0));
    const sharpest = (bend: number) => {
      const c = new TentacleChain(N);
      run(c, line(N, 100), 0.05);
      for (let t = 0; t < 0.3; t += 1 / 60) c.step(1 / 60, zig, 10, { ...TUNE, bend }, [], () => 0);
      let worst = 0;
      for (let j = 1; j < N; j++) {
        const a = c.joints[j]!.clone().sub(c.joints[j - 1]!).normalize();
        const b = c.joints[j + 1]!.clone().sub(c.joints[j]!).normalize();
        worst = Math.max(worst, a.angleTo(b));
      }
      return worst;
    };
    expect(sharpest(0.5)).toBeLessThan(sharpest(0) * 0.6);
  });

  it('wraps around a body instead of passing through it', () => {
    const c = new TentacleChain(N);
    const body: Ellipsoid = { c: v(50, 0, 0), r: v(20, 20, 20) };
    run(c, line(N, 100), 1, [body], 10.5);
    for (let j = 2; j <= N; j++) {
      const q = c.joints[j]!.clone().sub(body.c);
      expect(Math.hypot(q.x / 20, q.y / 20, q.z / 20)).toBeGreaterThanOrEqual(0.999);
    }
  });

  it('carries over a moved frame and snaps after a teleport', () => {
    const c = new TentacleChain(N);
    const tg = line(N, 100);
    run(c, tg, 0.1);
    c.shift(new THREE.Matrix4().makeTranslation(5, 0, 0), 1000);
    expect(c.joints[N]!.x).toBeCloseTo(105);
    c.shift(new THREE.Matrix4().makeTranslation(5000, 0, 0), 1000);
    c.step(1 / 60, tg, 10, TUNE, [], () => 0);
    expect(c.joints[N]!.x).toBeCloseTo(100);
  });
});
