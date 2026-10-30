import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BOLT_LIFE, LEADER, boltBrightness, boltLife, strokeHeat, strokeTimes, boltPath, flashBrightness, strikeFlash, segmentBrightness } from './lightningMath';

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
  it('holds a full flash long enough to see (several frames), then fades steadily to nothing by its life', () => {
    expect(boltBrightness(0)).toBe(1);
    expect(boltBrightness(0.1)).toBe(1);
    expect(boltBrightness(0.2)).toBeLessThan(1);
    // No built-in flicker any more (re-strikes are real strokes): it only ever fades after the hold.
    for (let t = 0.13; t < BOLT_LIFE; t += 0.01) expect(boltBrightness(t + 0.01)).toBeLessThanOrEqual(boltBrightness(t));
    expect(boltBrightness(BOLT_LIFE - 0.1)).toBeGreaterThan(0);
    expect(boltBrightness(BOLT_LIFE)).toBe(0);
  });
});

describe('re-strikes', () => {
  it('a bolt strokes at the end of its leader and then re-strikes once or twice, each a short gap after the last', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) {
      const s = strokeTimes(rand, []);
      expect(s[0]).toBe(LEADER);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < s.length; i++) {
        expect(s[i]! - s[i - 1]!).toBeGreaterThanOrEqual(0.18 - 1e-9);
        expect(s[i]! - s[i - 1]!).toBeLessThanOrEqual(0.35 + 1e-9);
      }
    }
  });

  it('a re-strike blazes the same main channel back to full and white-hot, and flashes the scene again; the branches stay dark', () => {
    const s = [LEADER, LEADER + 0.3];
    const faded = segmentBrightness(LEADER + 0.28, 0.5, true, s);
    expect(faded).toBeLessThan(1);
    expect(segmentBrightness(LEADER + 0.3, 0.5, true, s)).toBe(1);
    expect(strokeHeat(LEADER + 0.3, s)).toBe(1);
    expect(strikeFlash(LEADER + 0.3, s)).toBe(1);
    expect(strikeFlash(LEADER + 0.28, s)).toBeLessThan(1);
    expect(segmentBrightness(LEADER + 0.3, 0.5, false, s)).toBe(0);
    // Gone only a whole stroke after the last one.
    expect(segmentBrightness(LEADER + 0.3 + BOLT_LIFE - 0.05, 0.5, true, s)).toBeGreaterThan(0);
    expect(boltLife(s)).toBeCloseTo(LEADER + 0.3 + BOLT_LIFE, 9);
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
  it('the stepped leader crawlers creep down: faint where they have reached, dark below their tip', () => {
    const half = LEADER / 2;
    const above = segmentBrightness(half, 0.3, false);
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThan(0.5);
    expect(segmentBrightness(half, 0.8, false)).toBe(0);
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
  it('is invisible during the leader (only the branch crawlers show), then appears at full brightness at once', () => {
    for (const t of [0, LEADER / 3, LEADER * 0.99]) for (const d of [0.1, 0.5, 0.95]) expect(segmentBrightness(t, d, true)).toBe(0);
    expect(segmentBrightness(LEADER / 2, 0.2, false)).toBeGreaterThan(0);
    for (const d of [0.1, 0.5, 0.95]) expect(segmentBrightness(LEADER, d, true)).toBe(1);
  });

  it('burns white-hot at the stroke and cools back to its colour as it fades', () => {
    expect(strokeHeat(LEADER * 0.5)).toBe(0);
    expect(strokeHeat(LEADER)).toBe(1);
    expect(strokeHeat(LEADER + 0.1)).toBe(1);
    expect(strokeHeat(LEADER + 0.2)).toBeLessThan(1);
    expect(strokeHeat(LEADER + 0.5)).toBe(0);
  });
});
