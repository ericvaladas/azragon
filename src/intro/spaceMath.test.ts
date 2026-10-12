import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';
import { earthDistance, heatAt, heatColor, starDirections } from './spaceMath';
import { mulberry32 } from '../util/rng';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;

describe('earthDistance', () => {
  it('rushes in from far away and reaches the atmosphere at the cut', () => {
    expect(earthDistance(0)).toBeCloseTo(SP.earthStart);
    expect(earthDistance(CUT_TIME)).toBeCloseTo(SP.earthEnd);
    expect(earthDistance(CUT_TIME + 3)).toBeCloseTo(SP.earthEnd);
    const early = earthDistance(0) - earthDistance(1);
    const late = earthDistance(CUT_TIME - 1) - earthDistance(CUT_TIME);
    expect(late).toBeGreaterThan(early);
  });
});

describe('heat', () => {
  it('is cold in space and white-hot by the cut', () => {
    expect(heatAt(S.reentry - 0.1)).toBe(0);
    expect(heatAt((S.reentry + S.clouds) / 2)).toBeCloseTo(0.5);
    expect(heatAt(S.clouds)).toBe(1);
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
