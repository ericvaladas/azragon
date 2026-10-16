import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { Cloth, type ClothBody, type ClothEnv } from './cloth';
import type { P3 } from './ospreyMath';

const C = CONFIG.osprey.cloth;
const N = 9;
const DT = 1 / 30;

/** An N×N sheet `spacing` apart, flat at height y, centred on (cx, cz). */
function sheet(spacing: number, y: number, cx = 0, cz = 0): Cloth {
  const cloth = new Cloth(N, spacing);
  const pts: P3[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push({ x: cx + (i - (N - 1) / 2) * spacing, y, z: cz + (j - (N - 1) / 2) * spacing });
  cloth.layout(pts);
  return cloth;
}

const env = (over: Partial<ClothEnv> = {}): ClothEnv => ({ groundY: -1e6, body: null, grip: false, catchMin: 0, homeTo: null, ...over });

function run(cloth: Cloth, seconds: number, e: ClothEnv): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) cloth.step(DT, e);
}

function points(cloth: Cloth): P3[] {
  const out = Array.from({ length: N * N }, () => ({ x: 0, y: 0, z: 0 }));
  cloth.write(out);
  return out;
}

const mean = (ps: P3[], k: 'x' | 'y' | 'z') => ps.reduce((a, p) => a + p[k], 0) / ps.length;

/** A flat-topped block `top` m high over |lx|, |lz| < size, in a frame at (x, 0, z) facing yaw. */
const block = (x: number, z: number, yaw: number, size: number, top: number): ClothBody => ({
  x, y: 0, z, yaw, surface: (lx, lz) => (Math.abs(lx) < size && Math.abs(lz) < size ? top : 0),
});

describe('Cloth', () => {
  it('falls under gravity', () => {
    const cloth = sheet(10, 0);
    run(cloth, 0.5, env());
    expect(mean(points(cloth), 'y')).toBeLessThan(-0.3 * 0.5 * C.gravity * 0.25);
  });

  it('heavy corners fall faster than the rest of the sheet', () => {
    const cloth = sheet(10, 0);
    const corners = [0, N - 1, N * N - 1, N * (N - 1)];
    for (const k of corners) cloth.setWeight(k, 5);
    run(cloth, 1, env());
    const p = points(cloth);
    const centre = p[(N * N - 1) / 2]!.y;
    for (const k of corners) expect(p[k]!.y).toBeLessThan(centre - 5);
  });

  it('a sheet of equal masses falls level', () => {
    const cloth = sheet(10, 0);
    run(cloth, 1, env());
    const p = points(cloth);
    expect(Math.abs(p[0]!.y - p[(N * N - 1) / 2]!.y)).toBeLessThan(1);
  });

  it('keeps its ropes near their length while hanging from two corners', () => {
    const cloth = sheet(10, 0);
    cloth.pin(0, { x: -40, y: 0, z: -40 });
    cloth.pin(N - 1, { x: 40, y: 0, z: -40 });
    run(cloth, 3, env());
    const p = points(cloth);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = p[i + j * N]!;
        const b = p[i + 1 + j * N]!;
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(10 * 1.15);
      }
    }
    expect(p[0]).toEqual({ x: -40, y: 0, z: -40 });
  });

  it('comes to rest flat on the ground', () => {
    const cloth = sheet(10, 60);
    run(cloth, 3, env({ groundY: 0 }));
    const p = points(cloth);
    for (const q of p) expect(q.y).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...p.map((q) => q.y))).toBeLessThan(2);
    expect(cloth.touchedGround).toBe(true);
  });

  it('drapes over a body: nothing ends up inside it, and it reports the contact', () => {
    const cloth = sheet(25, 300);
    const body = block(0, 0, 0, 60, 200);
    let touched = false;
    for (let t = 0; t < 3; t += DT) {
      cloth.step(DT, env({ groundY: 0, body }));
      touched ||= cloth.touchedBody;
    }
    expect(touched).toBe(true);
    for (const q of points(cloth)) {
      if (Math.abs(q.x) < 55 && Math.abs(q.z) < 55) expect(q.y).toBeGreaterThanOrEqual(200 + C.thickness - 1);
    }
  });

  it('catches rope on a high enough body and carries it as the body moves and turns', () => {
    const cloth = sheet(25, 300);
    const body = block(0, 0, 0, 60, 200);
    run(cloth, 2, env({ groundY: 0, body, grip: true, catchMin: 150 }));
    expect(cloth.caughtCount()).toBeGreaterThan(0);
    const before = points(cloth);
    const moved = block(100, 50, Math.PI / 2, 60, 200);
    cloth.step(DT, env({ groundY: 0, body: moved, grip: true, catchMin: 150 }));
    const after = points(cloth);
    // The rope over the centre of the block stays over the centre of the moved block.
    const mid = (N * N - 1) / 2;
    expect(before[mid]!.x).toBeCloseTo(0, 0);
    expect(after[mid]!.x).toBeCloseTo(100, 0);
    expect(after[mid]!.z).toBeCloseTo(50, 0);
  });

  it('does not catch on a body lower than catchMin', () => {
    const cloth = sheet(25, 300);
    run(cloth, 2, env({ groundY: 0, body: block(0, 0, 0, 60, 100), grip: true, catchMin: 150 }));
    expect(cloth.caughtCount()).toBe(0);
  });

  it('a falling sheet homing on a point drifts over it', () => {
    const cloth = sheet(10, 0);
    run(cloth, 2, env({ homeTo: { x: 200, z: -100 } }));
    const p = points(cloth);
    expect(mean(p, 'x')).toBeCloseTo(200, -1);
    expect(mean(p, 'z')).toBeCloseTo(-100, -1);
  });

  it('tearing along cut lines splits the sheet into pieces that fly apart and stay whole', () => {
    const cloth = sheet(10, 100);
    cloth.tear([4], [4]);
    expect(cloth.piece(0)).not.toBe(cloth.piece(N - 1));
    expect(cloth.piece(0)).toBe(cloth.piece(1 + N));
    cloth.kick(0, 0, 100, 0);
    run(cloth, 0.5, env());
    const p = points(cloth);
    const gap = (a: number, b: number) => Math.hypot(p[b]!.x - p[a]!.x, p[b]!.y - p[a]!.y, p[b]!.z - p[a]!.z);
    // Across the cut between columns 3 and 4 the rope is gone; within a piece it holds.
    expect(gap(3, 4)).toBeGreaterThan(10 * 3);
    expect(gap(0, 1)).toBeLessThan(10 * 1.15);
  });

  it('cut ropes no longer count as connections', () => {
    const cloth = sheet(10, 0);
    expect(cloth.joined(3, 4)).toBe(true);
    cloth.tear([4], []);
    expect(cloth.joined(3, 4)).toBe(false);
    expect(cloth.joined(2, 3)).toBe(true);
  });

  it('release frees pins and caught rope', () => {
    const cloth = sheet(25, 300);
    cloth.pin(0, { x: -100, y: 300, z: -100 });
    run(cloth, 2, env({ groundY: 0, body: block(0, 0, 0, 60, 200), grip: true, catchMin: 150 }));
    expect(cloth.caughtCount()).toBeGreaterThan(0);
    cloth.release();
    expect(cloth.caughtCount()).toBe(0);
    run(cloth, 3, env({ groundY: 0 }));
    expect(Math.max(...points(cloth).map((q) => q.y))).toBeLessThan(2);
  });
});
