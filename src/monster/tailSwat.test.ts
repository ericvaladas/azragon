import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SWAT_TIMES, swatTiming, swatWeight, tailSwatPoints } from './tailSwat';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const base = [V(0, 350, -380), V(0, 450, -440), V(0, 540, -330), V(0, 550, -190), V(0, 510, -90)];

describe('tailSwatPoints', () => {
  const target = V(500, 700, 300);
  it('keeps the rest pose at weight 0', () => {
    const pts = tailSwatPoints(base, target, 0);
    pts.forEach((p, i) => expect(p.distanceTo(base[i]!)).toBeCloseTo(0));
  });
  it('anchors the root and puts the tip on the target at weight 1', () => {
    const pts = tailSwatPoints(base, target, 1);
    expect(pts[0]!.distanceTo(base[0]!)).toBeCloseTo(0);
    expect(pts[pts.length - 1]!.distanceTo(target)).toBeCloseTo(0);
  });
  it('moves the tip progressively closer as the weight rises', () => {
    const d = (w: number) => { const pts = tailSwatPoints(base, target, w); return pts[pts.length - 1]!.distanceTo(target); };
    expect(d(0.5)).toBeLessThan(d(0));
    expect(d(0.9)).toBeLessThan(d(0.5));
  });
});

describe('swatWeight', () => {
  const T = SWAT_TIMES;
  it('cocks, strikes to full extension at the impact time, holds, then recovers to 0', () => {
    expect(swatWeight(0)).toBe(0);
    expect(swatWeight(T.windup + T.strike)).toBeCloseTo(1);
    expect(swatWeight(T.windup + T.strike + T.hold * 0.5)).toBeCloseTo(1);
    expect(swatWeight(T.total)).toBeCloseTo(0);
    expect(swatWeight(T.total + 1)).toBe(0);
  });
  it('the impact time is when the tip reaches the target', () => {
    expect(T.impact).toBeCloseTo(T.windup + T.strike);
  });
});

describe('swatTiming', () => {
  it('keeps the shared anti-air timeline (Tail Swat, Snap Bite, Tentacle Lash) as it was', () => {
    expect(SWAT_TIMES.windup).toBe(0.12);
    expect(SWAT_TIMES.impact).toBeCloseTo(0.22);
    expect(SWAT_TIMES.total).toBeCloseTo(0.52);
  });
  it('builds a timeline from its phases, and swatWeight follows whichever timeline it is given', () => {
    const T = swatTiming(0.2, 0.1, 0.1, 0.4);
    expect(T.impact).toBeCloseTo(0.3);
    expect(T.total).toBeCloseTo(0.8);
    expect(swatWeight(T.impact, T)).toBeCloseTo(1);
    expect(swatWeight(T.impact + 0.05, T)).toBeCloseTo(1);
    expect(swatWeight(0.1, T)).toBeLessThan(0);
    expect(swatWeight(T.total - 0.01, T)).toBeGreaterThan(0);
    expect(swatWeight(T.total, T)).toBe(0);
  });
});
