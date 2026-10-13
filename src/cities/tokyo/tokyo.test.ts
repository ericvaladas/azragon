import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { CRATER_RADIUS } from '../../world/City';
import { DISTRICTS } from '../types';
import { TOKYO } from './index';
import { SHIBUYA_CROSSING, TMG_SITE } from './layout';
import { TMG, tmgGeometry } from './tmg';

const W = CONFIG.world;
const INNER = W.blockSize - W.roadWidth;
const blockOf = (v: number) => Math.floor(v / W.blockSize);

describe('TOKYO', () => {
  it('has rules for every district; parks build nothing', () => {
    for (const d of DISTRICTS) expect(TOKYO.districts[d]).toBeDefined();
    expect(TOKYO.districts.park.lots).toBe(0);
    expect(TOKYO.districts.highrise.height[0]).toBeGreaterThanOrEqual(150);
    expect(TOKYO.districts.highrise.height[1]).toBeLessThanOrEqual(260);
    expect(TOKYO.districts.residential.height[1]).toBeLessThanOrEqual(25);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const threats = [CONFIG.palette.chevron, 0xff3b2f];
    const a = new THREE.Color();
    const b = new THREE.Color();
    for (const s of TOKYO.signColors) for (const t of threats) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('places the Metropolitan Government Building at its site, inside one block', () => {
    const tmg = TOKYO.landmarks.find((l) => l.id === 'tmg')!;
    expect(tmg).toMatchObject({ x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h });
    expect(blockOf(tmg.x - tmg.w / 2)).toBe(blockOf(tmg.x + tmg.w / 2));
    expect(blockOf(tmg.z - tmg.d / 2)).toBe(blockOf(tmg.z + tmg.d / 2));
    expect(tmg.w).toBeLessThanOrEqual(INNER);
    expect(tmg.d).toBeLessThanOrEqual(INNER);
  });

  it('builds the twin-towered landmark mesh to its size, base at y = 0, vertex-coloured', () => {
    const g = tmgGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(TMG.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(TMG.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(TMG.d + 2);
    expect(g.getAttribute('color')).toBeDefined();
  });

  it('puts four Shibuya corner buildings around the crossing, each inside one block, all beyond the topple radius, with screens', () => {
    expect(TOKYO.specialLots).toHaveLength(4);
    for (const b of TOKYO.specialLots) {
      expect(Math.abs(b.x - SHIBUYA_CROSSING.x)).toBeLessThan(W.blockSize / 2);
      expect(Math.abs(b.z - SHIBUYA_CROSSING.z)).toBeLessThan(W.blockSize / 2);
      expect(blockOf(b.x - b.w / 2)).toBe(blockOf(b.x + b.w / 2));
      expect(blockOf(b.z - b.d / 2)).toBe(blockOf(b.z + b.d / 2));
      expect(Math.hypot(b.x, b.z) - Math.max(b.w, b.d) / 2).toBeGreaterThanOrEqual(2 * CRATER_RADIUS);
    }
    expect(TOKYO.specialLots.filter((b) => b.signs.some((s) => s.kind === 'screen')).length).toBeGreaterThanOrEqual(3);
  });

  it('draws the scramble markings over the crossing', () => {
    expect(TOKYO.overlays).toContainEqual(expect.objectContaining({ id: 'scramble', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z }));
  });
});
