import { describe, it, expect } from 'vitest';
import { arcTargets, beamEnd, groundBeamEnd, inArc, linePoints, lineTargets, segDist } from './sweep';

const t = (x: number, z: number, radius = 10, airborne = false, alive = true) => ({ position: { x, z }, radius, airborne, isAlive: () => alive });

describe('arcTargets', () => {
  const from = { x: 0, z: 0 };
  it('hits ground targets in front within range and angle', () => {
    const ahead = t(0, 300);
    const side = t(300, 0);
    const behind = t(0, -300);
    const far = t(0, 600);
    const flyer = t(0, 200, 10, true);
    const dead = t(0, 200, 10, false, false);
    expect(arcTargets(from, 0, 420, 0.9, [ahead, side, behind, far, flyer, dead])).toEqual([ahead]);
  });
  it('counts a wide target whose edge reaches into the arc, and anything overlapping the monster', () => {
    const wide = t(Math.sin(0.85) * 300, Math.cos(0.85) * 300, 80);
    expect(arcTargets(from, 0, 420, 0.7, [wide])).toHaveLength(1);
    expect(arcTargets(from, 0, 420, 0.7, [t(5, -5, 40)])).toHaveLength(1);
  });
  it('turns with the monster\'s yaw', () => {
    expect(arcTargets(from, Math.PI / 2, 420, 0.5, [t(300, 0), t(0, 300)]).map((x) => x.position.x)).toEqual([300]);
  });
});

describe('lineTargets', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 1000 };
  it('hits everything touching the widened segment, flyers included, nothing past the ends', () => {
    const near = t(30, 500, 20);
    const off = t(100, 500, 20);
    const past = t(0, 1100, 20);
    const behind = t(0, -100, 20);
    const flyer = t(0, 800, 10, true);
    expect(lineTargets(a, b, 20, [near, off, past, behind, flyer])).toEqual([near, flyer]);
  });
});

describe('linePoints', () => {
  it('samples evenly from a to b inclusive', () => {
    const pts = linePoints({ x: 0, z: 0 }, { x: 0, z: 100 }, 30);
    expect(pts.map((p) => p.z)).toEqual([0, 25, 50, 75, 100]);
    expect(linePoints({ x: 5, z: 5 }, { x: 5, z: 5 }, 30)).toHaveLength(2);
  });
});

describe('beamEnd', () => {
  const jaws = { x: 0, y: 300, z: 0 };
  it('stops where the beam meets the ground', () => {
    expect(beamEnd(jaws, { x: 0, y: 0, z: 600 }, 1300)).toEqual({ x: 0, y: 0, z: 600 });
  });
  it('runs on to full range through a target that does not bring it down', () => {
    const e = beamEnd(jaws, { x: 0, y: 300, z: 600 }, 1300);
    expect(e.z).toBeCloseTo(1300);
    expect(e.y).toBeCloseTo(300);
  });
  it('never reaches farther than range horizontally, even aimed upward', () => {
    const e = beamEnd(jaws, { x: 300, y: 500, z: 400 }, 1300);
    expect(Math.hypot(e.x, e.z)).toBeCloseTo(1300);
  });
  it('fires straight down when the aim is directly below', () => {
    expect(beamEnd(jaws, { x: 0, y: 0, z: 0 }, 1300)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('segDist', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 100, z: 0 };
  it('measures to the nearest point on the segment', () => {
    expect(segDist({ x: 50, z: 30 }, a, b)).toBeCloseTo(30);
    expect(segDist({ x: -40, z: 30 }, a, b)).toBeCloseTo(50);
    expect(segDist({ x: 130, z: -40 }, a, b)).toBeCloseTo(50);
    expect(segDist({ x: 3, z: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe('inArc', () => {
  const from = { x: 0, z: 0 };
  it('is true only inside the forward cone and range', () => {
    expect(inArc(from, 0, 500, 0.5, { x: 0, z: 300 })).toBe(true);
    expect(inArc(from, 0, 500, 0.5, { x: 300, z: 0 })).toBe(false);
    expect(inArc(from, 0, 500, 0.5, { x: 0, z: -300 })).toBe(false);
    expect(inArc(from, 0, 500, 0.5, { x: 0, z: 600 })).toBe(false);
    expect(inArc(from, 0, Infinity, 0.5, { x: 0, z: 600 })).toBe(true);
    expect(inArc(from, Math.PI / 2, 500, 0.5, { x: 300, z: 0 })).toBe(true);
  });
});

describe('groundBeamEnd', () => {
  it('ends `range` from the origin along the jaws->aim ray', () => {
    const jaws = { x: 0, z: 210 };
    const origin = { x: 0, z: 0 };
    const e = groundBeamEnd(jaws, { x: 0, z: 1 }, origin, 1300);
    expect(e.x).toBeCloseTo(0);
    expect(e.z).toBeCloseTo(1300);
    const back = groundBeamEnd(jaws, { x: 0, z: -1 }, origin, 1300);
    expect(back.z).toBeCloseTo(-1300);
    const side = groundBeamEnd(jaws, { x: 1, z: 0 }, origin, 1300);
    expect(Math.hypot(side.x - origin.x, side.z - origin.z)).toBeCloseTo(1300);
  });
});
