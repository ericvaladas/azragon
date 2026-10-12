import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';
import { earthDistance, heatAt, heatColor, podAltitude, starDirections } from './spaceMath';
import { mulberry32 } from '../util/rng';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;

describe('earthDistance', () => {
  it('closes in from far away, reaches the atmosphere at entry, then dives slowly until the cut', () => {
    expect(earthDistance(0)).toBeCloseTo(SP.earthStart);
    expect(earthDistance(SP.entryTime)).toBeCloseTo(SP.earthEntry);
    expect(earthDistance(CUT_TIME)).toBeCloseTo(SP.earthEnd);
    expect(earthDistance(CUT_TIME + 3)).toBeCloseTo(SP.earthEnd);
    for (let t = 0.1; t <= CUT_TIME; t += 0.1) expect(earthDistance(t)).toBeLessThan(earthDistance(t - 0.1));
  });
});

describe('heat', () => {
  const thickness = SP.earthRadius * (SP.atmosphere - 1);
  it('only starts burning once the pod is inside the atmosphere', () => {
    expect(podAltitude(SP.entryTime - 0.05)).toBeGreaterThan(thickness);
    expect(heatAt(SP.entryTime - 0.05)).toBe(0);
    expect(heatAt(S.reentry + 0.1)).toBe(0);
    expect(heatAt(SP.entryTime + 0.3)).toBeGreaterThan(0);
  });
  it('is white-hot by the cut, deep in the atmosphere but still above the ground', () => {
    expect(heatAt(CUT_TIME)).toBe(1);
    expect(podAltitude(CUT_TIME)).toBeGreaterThan(0);
    expect(podAltitude(CUT_TIME)).toBeLessThan(thickness);
  });
  it('maps heat to black, then fire orange, then white', () => {
    const c = new THREE.Color();
    expect(heatColor(0, c).getHex()).toBe(0x000000);
    expect(heatColor(0.5, c).getHex()).toBe(new THREE.Color(CONFIG.palette.fire).getHex());
    expect(heatColor(1, c).getHex()).toBe(0xffffff);
  });
});

describe('starDirections', () => {
  it('gives n deterministic unit vectors', () => {
    const a = starDirections(50, mulberry32(1));
    expect(a).toHaveLength(50);
    for (const v of a) expect(v.length()).toBeCloseTo(1);
    expect(starDirections(50, mulberry32(1))).toEqual(a);
  });
});
