import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BOLT_LIFE, LEADER, STROKE_FLICKER, boltBrightness, strokeHeat, boltPath, flashBrightness, strikeFlash, segmentBrightness } from './lightningMath';

describe('boltPath', () => {
  it('bolt path: exact ends, segments + 1 points, inner points within jitter of the straight line', () => {
    const from = new THREE.Vector3(0, 3000, 0);
    const to = new THREE.Vector3(200, 0, -100);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = boltPath(from, to, 8, 60, rand, []);
    expect(out.length).toBe(9);
    expect(out[0]!.equals(from)).toBe(true);
    expect(out[8]!.equals(to)).toBe(true);
    const line = new THREE.Line3(from, to);
    const closest = new THREE.Vector3();
    for (const p of out.slice(1, -1)) expect(line.closestPointToPoint(p, false, closest).distanceTo(p)).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('reuses the vectors already in `out`', () => {
    const out = [new THREE.Vector3()];
    const first = out[0];
    boltPath(new THREE.Vector3(), new THREE.Vector3(0, 10, 0), 3, 1, Math.random, out);
    expect(out[0]).toBe(first);
  });
});

describe('boltBrightness', () => {
  it('holds a full flash long enough to see (several frames), then fades out, flickering once, to nothing by its life', () => {
    expect(boltBrightness(0)).toBe(1);
    expect(boltBrightness(0.1)).toBe(1);
    expect(boltBrightness(0.2)).toBeLessThan(1);
    // The re-strike flicker: a moment brighter than just before it.
    expect(boltBrightness(STROKE_FLICKER)).toBeGreaterThan(boltBrightness(STROKE_FLICKER - 0.05));
    expect(boltBrightness(BOLT_LIFE - 0.1)).toBeLessThan(0.2);
    expect(boltBrightness(BOLT_LIFE - 0.1)).toBeGreaterThan(0);
    expect(boltBrightness(BOLT_LIFE)).toBe(0);
  });
});

describe('flashBrightness', () => {
  it('lights the scene fully on the strike and fades it smoothly, gone well under a second later', () => {
    expect(flashBrightness(0)).toBe(1);
    expect(flashBrightness(0.1)).toBeGreaterThan(flashBrightness(0.2));
    expect(flashBrightness(0.2)).toBeGreaterThan(0);
    expect(flashBrightness(0.6)).toBe(0);
  });
});

describe('segmentBrightness (a slow-motion strike)', () => {
  it('the stepped leader creeps down: faint where it has reached, dark below its tip', () => {
    const half = LEADER / 2;
    const above = segmentBrightness(half, 0.3, true);
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThan(0.5);
    expect(segmentBrightness(half, 0.8, true)).toBe(0);
    expect(segmentBrightness(half, 0.3, false)).toBeGreaterThan(0);
  });

  it('the return stroke: the main channel blazes, the branches fall dark soon after while the channel still glows', () => {
    expect(segmentBrightness(LEADER, 0.9, true)).toBe(1);
    expect(segmentBrightness(LEADER, 0.5, false)).toBeLessThan(1);
    expect(segmentBrightness(LEADER + 0.15, 0.5, false)).toBe(0);
    expect(segmentBrightness(LEADER + 0.15, 0.5, true)).toBeGreaterThan(0);
    expect(segmentBrightness(LEADER + BOLT_LIFE, 0.5, true)).toBe(0);
  });

  it('lights the scene only from the return stroke', () => {
    expect(strikeFlash(LEADER * 0.9)).toBe(0);
    expect(strikeFlash(LEADER)).toBe(1);
    expect(strikeFlash(LEADER + 0.2)).toBeLessThan(1);
  });
});

describe('the main channel appears with the stroke', () => {
  it('stays all but invisible during the leader (the branches carry it), then snaps to full at the stroke', () => {
    const during = segmentBrightness(LEADER / 2, 0.2, true);
    expect(during).toBeLessThan(0.1);
    expect(during).toBeLessThan(segmentBrightness(LEADER / 2, 0.2, false));
    expect(segmentBrightness(LEADER, 0.2, true)).toBe(1);
  });

  it('burns white-hot at the stroke and cools back to its colour as it fades', () => {
    expect(strokeHeat(LEADER * 0.5)).toBe(0);
    expect(strokeHeat(LEADER)).toBe(1);
    expect(strokeHeat(LEADER + 0.1)).toBe(1);
    expect(strokeHeat(LEADER + 0.2)).toBeLessThan(1);
    expect(strokeHeat(LEADER + 0.5)).toBe(0);
  });
});
