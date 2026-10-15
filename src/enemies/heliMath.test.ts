import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { heliPosition, newHeliState, orbitDir, stepHeli, type HeliState } from './heliMath';

const H = CONFIG.heli;
const DT = 1 / 60;

type Pt = { x: number; z: number };
const dist = (s: HeliState, m: Pt) => {
  const p = heliPosition(s);
  return Math.hypot(p.x - m.x, p.z - m.z);
};

/** Steps `seconds` of flight around `m`; returns the time of every volley and the rockets in it. */
function fly(s: HeliState, m: Pt, seconds: number, each?: (t: number) => void) {
  const volleys: { t: number; rockets: number }[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i++) {
    const rockets = stepHeli(s, m, DT, H);
    const t = i * DT;
    if (rockets > 0) volleys.push({ t, rockets });
    each?.(t);
  }
  return volleys;
}

describe('heli orbit', () => {
  it('flies in from the spawn ring without snapping, then holds the orbit radius and altitude', () => {
    const m = { x: 300, z: -200 };
    const s = newHeliState(m, 1.1, 2400, 1);
    let prev = heliPosition(s);
    let maxStep = 0;
    let minD = Infinity;
    fly(s, m, 40, (t) => {
      const p = heliPosition(s);
      maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      prev = p;
      if (t > 25) minD = Math.min(minD, dist(s, m));
    });
    // Never faster than the approach speed (plus the orbit speed) allows in one frame.
    expect(maxStep).toBeLessThanOrEqual((H.approachSpeed + H.orbitSpeed) * DT + 1e-6);
    expect(minD).toBeGreaterThan(H.radius - 10);
    expect(dist(s, m)).toBeCloseTo(H.radius, -1);
    expect(heliPosition(s).y).toBeCloseTo(H.altitude, 3);
    expect(s.orbiting).toBe(true);
  });

  it('circles at the orbit speed once settled', () => {
    const m = { x: 0, z: 0 };
    const s = newHeliState(m, 0, 2400, 1);
    fly(s, m, 30);
    const a = heliPosition(s);
    stepHeli(s, m, DT, H);
    const b = heliPosition(s);
    expect(Math.hypot(b.x - a.x, b.z - a.z) / DT).toBeCloseTo(H.orbitSpeed, 0);
  });

  it('follows the monster when it moves', () => {
    const m = { x: 0, z: 0 };
    const s = newHeliState(m, 2, 2400, -1);
    fly(s, m, 30);
    m.x = 900;
    m.z = 600;
    fly(s, m, 15);
    expect(Math.abs(dist(s, m) - H.radius)).toBeLessThan(10);
  });

  it('circles in the direction it was given, and spawn order alternates it', () => {
    expect(orbitDir(0)).toBe(-orbitDir(1));
    expect(orbitDir(2)).toBe(orbitDir(0));
    const m = { x: 0, z: 0 };
    for (const dir of [1, -1] as const) {
      const s = newHeliState(m, 0, 2400, dir);
      fly(s, m, 30);
      const before = s.angle;
      fly(s, m, 1);
      expect(Math.sign(s.angle - before)).toBe(dir);
    }
  });

  it('banks into the turn and faces its direction of travel', () => {
    const m = { x: 0, z: 0 };
    const s = newHeliState(m, 0, 2400, 1);
    fly(s, m, 30);
    const a = heliPosition(s);
    stepHeli(s, m, DT, H);
    const b = heliPosition(s);
    expect(s.heading).toBeCloseTo(Math.atan2(b.x - a.x, b.z - a.z), 2);
    // Angle increasing about the monster is a turn toward -X (right in +Z-forward space): the +X side rolls up.
    expect(s.bank).toBeGreaterThan(0.1);
    expect(Math.abs(s.bank)).toBeLessThanOrEqual(H.bankMax + 1e-9);
  });
});

describe('heli volleys', () => {
  it('fires no rockets while approaching, the first volley ~2 s after reaching orbit, then every 4 s', () => {
    const m = { x: 0, z: 0 };
    const s = newHeliState(m, 0.4, 2400, 1);
    let reached = -1;
    const volleys = fly(s, m, 40, (t) => {
      if (reached < 0 && s.orbiting) reached = t;
    });
    expect(reached).toBeGreaterThan(0);
    expect(volleys.length).toBeGreaterThanOrEqual(5);
    expect(volleys[0]!.t - reached).toBeCloseTo(H.firstVolley, 1);
    for (let k = 1; k < volleys.length; k++) expect(volleys[k]!.t - volleys[k - 1]!.t).toBeCloseTo(H.volleyEvery, 1);
    for (const v of volleys) expect(v.rockets).toBe(2);
  });
});
