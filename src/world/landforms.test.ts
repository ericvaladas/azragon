import { describe, it, expect } from 'vitest';
import type { LandformSpec, Pt } from '../cities/types';
import { ellipse, inPolygon, insetOutline, onGrass, onLand, prepareLandform, ribbon, scatterTrees, smoothOutline, treeSpot } from './landforms';

const SQUARE: Pt[] = [{ x: -500, z: -500 }, { x: 500, z: -500 }, { x: 500, z: 500 }, { x: -500, z: 500 }];
const spec = (over: Partial<LandformSpec> = {}): LandformSpec => ({ name: 't', outline: SQUARE, sharp: true, holes: [], beach: 40, treeEvery: 2000, details: [], ...over });

describe('landform shapes', () => {
  it('smoothing passes through every corner and stays close to the outline', () => {
    const tri: Pt[] = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 800 }];
    const s = smoothOutline(tri, 8);
    for (const p of tri) expect(s.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-6)).toBe(true);
    for (const q of s) {
      expect(q.x).toBeGreaterThan(-250);
      expect(q.x).toBeLessThan(1250);
      expect(q.z).toBeGreaterThan(-250);
      expect(q.z).toBeLessThan(1050);
    }
  });

  it('carries per-corner beach widths along the curve', () => {
    const s = smoothOutline([{ x: 0, z: 0, beach: 10 }, { x: 100, z: 0, beach: 30 }, { x: 0, z: 100 }], 4, 20);
    expect(s[0]!.beach).toBe(10);
    expect(s[2]!.beach).toBeCloseTo(20, 6);
    expect(s[4]!.beach).toBe(30);
    expect(s[8]!.beach).toBe(20);
  });

  it('inset moves each edge inward by about the distance, never outside', () => {
    const inner = insetOutline(SQUARE.map((p) => ({ ...p, beach: 40 })), 40);
    for (const p of inner) {
      expect(Math.abs(p.x)).toBeCloseTo(460, 0);
      expect(Math.abs(p.z)).toBeCloseTo(460, 0);
    }
    // The same either way round.
    const rev = insetOutline([...SQUARE].reverse().map((p) => ({ ...p, beach: 40 })), 40);
    for (const p of rev) expect(inPolygon(SQUARE, p.x, p.z)).toBe(true);
  });

  it('inset keeps a thin ribbon\'s grass inside it', () => {
    const r = ribbon([{ x: 0, z: 0 }, { x: 300, z: 400 }, { x: 600, z: 400 }], 50);
    const inner = insetOutline(r.map((p) => ({ ...p, beach: 10 })), 10);
    for (const p of inner) expect(inPolygon(r, p.x, p.z)).toBe(true);
    // Its centre line is still grass.
    const p = prepareLandform(spec({ outline: r, beach: 10 }));
    expect(onGrass(p, 150, 200)).toBe(true);
  });

  it('ribbon follows its path at the given width, with rounded ends', () => {
    const r = ribbon([{ x: 0, z: 0 }, { x: 1000, z: 0 }], 100);
    expect(inPolygon(r, 500, 49)).toBe(true);
    expect(inPolygon(r, 500, 51)).toBe(false);
    expect(inPolygon(r, -49, 0)).toBe(true);
    expect(inPolygon(r, -45, 45)).toBe(false);
  });

  it('ellipse is a closed outline of the given radii and turn', () => {
    const e = ellipse(100, 200, 300, 100, 90);
    expect(inPolygon(e, 100, 200 + 290)).toBe(true);
    expect(inPolygon(e, 100 + 290, 200)).toBe(false);
  });

  it('land is inside the outline and outside every hole; grass is land beyond the beach', () => {
    const p = prepareLandform(spec({ holes: [ellipse(0, 0, 100, 100, 0)] }));
    expect(onLand(p, 300, 300)).toBe(true);
    expect(onLand(p, 0, 0)).toBe(false);
    expect(onLand(p, 600, 0)).toBe(false);
    expect(onLand(p, 480, 0)).toBe(true);
    expect(onGrass(p, 480, 0)).toBe(false);
    expect(onGrass(p, 300, 300)).toBe(true);
  });

  it('trees grow only on grass and off details, the same for the same seed, about one per treeEvery m², capped', () => {
    const box = { kind: 'box' as const, x: 200, z: 200, w: 200, d: 200, h: 5, yaw: 0, color: 0 };
    const p = prepareLandform(spec({ details: [box] }));
    const a = scatterTrees(p, 7, 10000);
    expect(a).toEqual(scatterTrees(p, 7, 10000));
    for (const t of a) {
      expect(onGrass(p, t.x, t.z)).toBe(true);
      expect(treeSpot(p, t.x, t.z)).toBe(true);
    }
    const grass = 920 * 920 - 200 * 200;
    expect(a.length).toBeGreaterThan((grass / 2000) * 0.6);
    expect(a.length).toBeLessThan((grass / 2000) * 1.4);
    expect(scatterTrees(p, 7, 10)).toHaveLength(10);
    expect(scatterTrees(prepareLandform(spec({ treeEvery: 0 })), 7, 100)).toEqual([]);
  });
});
