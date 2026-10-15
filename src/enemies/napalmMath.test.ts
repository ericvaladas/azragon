import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { bombPosition, bombReleases, bomberDone, bomberPosition, impactPoints, newRun, patchDps, warningAlpha } from './napalmMath';

const N = CONFIG.napalm;
const M = { x: 300, z: -200 };

describe('napalm bomber flight', () => {
  it('starts spawnDist out on the bearing, flies straight over the aim point at altitude, and is done exitDist past it', () => {
    const run = newRun(M, 0.7);
    const p0 = bomberPosition(run, 0);
    expect(Math.hypot(p0.x - M.x, p0.z - M.z)).toBeCloseTo(N.spawnDist, 3);
    expect(p0.y).toBe(650);
    expect(N.altitude).toBe(650);
    // Over the aim point at spawnDist / speed seconds.
    const over = bomberPosition(run, N.spawnDist / N.speed);
    expect(over.x).toBeCloseTo(M.x, 3);
    expect(over.z).toBeCloseTo(M.z, 3);
    // Straight line: the midpoint of start and overhead is the position halfway in time.
    const mid = bomberPosition(run, N.spawnDist / N.speed / 2);
    expect(mid.x).toBeCloseTo((p0.x + M.x) / 2, 3);
    expect(mid.z).toBeCloseTo((p0.z + M.z) / 2, 3);
    const end = (N.spawnDist + N.exitDist) / N.speed;
    expect(bomberDone(run, end - 0.05)).toBe(false);
    expect(bomberDone(run, end + 0.05)).toBe(true);
    const far = bomberPosition(run, end);
    expect(Math.hypot(far.x - M.x, far.z - M.z)).toBeCloseTo(N.exitDist, 3);
  });

  it('keeps the aim point fixed at spawn', () => {
    const run = newRun(M, 2.1);
    expect(run.aim).toEqual({ x: M.x, z: M.z });
  });
});

describe('napalm drop planning', () => {
  it('lays bombs impacts in a line along the heading, centred on the aim point, spacing apart', () => {
    const run = newRun(M, 4.0);
    const pts = impactPoints(run);
    expect(pts.length).toBe(6);
    expect(N.bombs).toBe(6);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    expect(cx).toBeCloseTo(M.x, 6);
    expect(cz).toBeCloseTo(M.z, 6);
    for (let k = 1; k < pts.length; k++) {
      const dx = pts[k]!.x - pts[k - 1]!.x;
      const dz = pts[k]!.z - pts[k - 1]!.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(N.spacing, 6);
      // Along the heading, in flight order.
      expect(dx * run.hx + dz * run.hz).toBeCloseTo(N.spacing, 6);
    }
  });

  it('releases each bomb so that its fall lands on its planned point', () => {
    const run = newRun(M, 1.3);
    const pts = impactPoints(run);
    const rel = bombReleases(run);
    expect(rel.length).toBe(pts.length);
    for (let k = 0; k < rel.length; k++) {
      const r = rel[k]!;
      expect(r.t).toBeGreaterThan(0);
      if (k > 0) expect(r.t).toBeGreaterThan(rel[k - 1]!.t);
      // Released from the bomber.
      const at = bomberPosition(run, r.t);
      const p0 = bombPosition(run, r, 0);
      expect(p0.x).toBeCloseTo(at.x, 4);
      expect(p0.y).toBeCloseTo(at.y, 4);
      expect(p0.z).toBeCloseTo(at.z, 4);
      // Lands on its point after the fall time, and is still above ground just before.
      const land = bombPosition(run, r, r.fall);
      expect(land.x).toBeCloseTo(pts[k]!.x, 4);
      expect(land.z).toBeCloseTo(pts[k]!.z, 4);
      expect(land.y).toBeCloseTo(0, 4);
      expect(bombPosition(run, r, r.fall * 0.9).y).toBeGreaterThan(0);
      // Falling faster as it goes (ballistic): the second half of the fall drops more than the first.
      const half = bombPosition(run, r, r.fall / 2).y;
      expect(N.altitude - half).toBeLessThan(half);
    }
  });
});

describe('napalm warning strip', () => {
  it('fades in warnLead s before the first release and out once the last bomb has landed', () => {
    const run = newRun(M, 0.2);
    const rel = bombReleases(run);
    const first = rel[0]!.t;
    const lastLand = rel[rel.length - 1]!.t + rel[rel.length - 1]!.fall;
    expect(warningAlpha(run, first - N.warnLead - 0.05)).toBe(0);
    expect(warningAlpha(run, first)).toBeGreaterThan(0.5);
    expect(warningAlpha(run, (first + lastLand) / 2)).toBeGreaterThan(0);
    expect(warningAlpha(run, lastLand + 0.01)).toBe(0);
  });
});

describe('napalm patches', () => {
  const patch = (x: number, z: number, age = 0) => ({ x, z, age });
  const reach = N.patchRadius + N.contactFrac * CONFIG.monster.bodyRadius;

  it('burns at dps only while the monster is within the patch reach, and never stacks', () => {
    const pts = [patch(0, 0)];
    expect(patchDps(pts, { x: 0, z: 0 })).toBe(N.dps);
    expect(N.dps).toBe(12);
    expect(patchDps(pts, { x: reach - 1, z: 0 })).toBe(N.dps);
    expect(patchDps(pts, { x: reach + 1, z: 0 })).toBe(0);
    expect(patchDps([patch(0, 0), patch(10, 0), patch(-10, 5)], { x: 0, z: 0 })).toBe(N.dps);
  });

  it('stops burning once a patch has lived its life', () => {
    expect(patchDps([patch(0, 0, N.patchLife - 0.01)], { x: 0, z: 0 })).toBe(N.dps);
    expect(patchDps([patch(0, 0, N.patchLife)], { x: 0, z: 0 })).toBe(0);
  });
});
