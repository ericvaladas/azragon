import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';
import { ENTRY_TIME, earthCenter, heatAt, heatColor, podAltitude, spaceCamera, starDirections } from './spaceMath';
import { mulberry32 } from '../util/rng';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;

describe('approach', () => {
  it('closes from far out to just above the surface at the cut', () => {
    expect(podAltitude(0)).toBeCloseTo(SP.gapStart);
    expect(podAltitude(CUT_TIME)).toBeCloseTo(SP.gapEnd);
    expect(podAltitude(CUT_TIME + 3)).toBeCloseTo(SP.gapEnd);
  });
  it('never slows down: the altitude shrinks by the same fraction every moment, before and after entry', () => {
    const rate = (t: number) => Math.log(podAltitude(t - 0.05) / podAltitude(t + 0.05)) / 0.1;
    const r0 = rate(0.5);
    expect(r0).toBeGreaterThan(0.5);
    for (let t = 0.5; t < CUT_TIME - 0.1; t += 0.25) expect(rate(t)).toBeCloseTo(r0, 5);
    expect(rate(ENTRY_TIME)).toBeCloseTo(r0, 5);
  });
  it('places Earth so its surface is exactly that far below the pod', () => {
    const c = new THREE.Vector3();
    for (const t of [0, 2, ENTRY_TIME, CUT_TIME]) expect(earthCenter(t, c).length() - SP.earthRadius).toBeCloseTo(podAltitude(t), 3);
  });
});

describe('spaceCamera', () => {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const c = new THREE.Vector3();
  const gap = (t: number, aspect = 1.6) => {
    spaceCamera(aspect, pos, look);
    return pos.distanceTo(earthCenter(t, c)) - SP.earthRadius;
  };
  it('holds the same offset from the pod the whole way down (no zoom as it starts to burn)', () => {
    for (const aspect of [1.6, 0.46]) {
      spaceCamera(aspect, pos, look);
      const first = pos.clone();
      for (let t = 0; t <= CUT_TIME; t += 0.1) {
        spaceCamera(aspect, pos, look);
        expect(pos.distanceTo(first)).toBeLessThan(1e-9);
      }
    }
  });
  it('still closes on the surface right up to the cut', () => {
    for (let t = 0.5; t <= CUT_TIME - 0.1; t += 0.1) expect(gap(t + 0.1)).toBeLessThan(gap(t));
  });
  it('stays above the surface and behind the pod', () => {
    for (let t = 0; t <= CUT_TIME; t += 0.25) {
      expect(gap(t)).toBeGreaterThan(0);
      expect(pos.z).toBeLessThan(0);
    }
  });
});

describe('heat', () => {
  const thickness = SP.earthRadius * (SP.atmosphere - 1);
  it('starts burning exactly when the pod enters the atmosphere', () => {
    expect(podAltitude(ENTRY_TIME)).toBeCloseTo(thickness);
    expect(ENTRY_TIME).toBeGreaterThan(S.reentry);
    expect(ENTRY_TIME).toBeLessThan(CUT_TIME - 0.8);
    expect(heatAt(ENTRY_TIME - 0.01)).toBe(0);
    expect(heatAt(ENTRY_TIME + 0.2)).toBeGreaterThan(0);
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
