import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TORONTO } from '.';
import { GOODERHAM_SITE, ROM_SITE, ROY_THOMSON_HALL_SITE, ST_LAWRENCE_MARKET_SITE, VARSITY_STADIUM_SITE, blockInterior } from './layout';
import { isWater, PITCH } from '../../world/roads';

const ids = ['st-lawrence-market', 'gooderham', 'roy-thomson-hall', 'rom', 'varsity-stadium'] as const;
const lm = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;

describe('district landmarks', () => {
  it('lists St. Lawrence Market, the Gooderham Building and Roy Thomson Hall at their sites', () => {
    expect(lm('st-lawrence-market')).toMatchObject(ST_LAWRENCE_MARKET_SITE);
    expect(lm('gooderham')).toMatchObject(GOODERHAM_SITE);
    expect(lm('roy-thomson-hall')).toMatchObject(ROY_THOMSON_HALL_SITE);
    expect(lm('rom')).toMatchObject(ROM_SITE);
    expect(lm('varsity-stadium')).toMatchObject(VARSITY_STADIUM_SITE);
  });

  it('stands each inside its block\'s interior, on land', () => {
    for (const id of ids) {
      const l = lm(id);
      const ci = Math.floor(l.x / PITCH);
      const cj = Math.floor(l.z / PITCH);
      expect(isWater(TORONTO, ci, cj), id).toBe(false);
      const r = blockInterior(ci, cj);
      expect(l.x - l.w / 2, id).toBeGreaterThanOrEqual(r.x0 - 1);
      expect(l.x + l.w / 2, id).toBeLessThanOrEqual(r.x1 + 1);
      expect(l.z - l.d / 2, id).toBeGreaterThanOrEqual(r.z0 - 1);
      expect(l.z + l.d / 2, id).toBeLessThanOrEqual(r.z1 + 1);
    }
  });

  it('builds each to its stated size, vertex-coloured, on the ground', () => {
    for (const id of ids) {
      const l = lm(id);
      const g = l.build();
      expect(g.getAttribute('color'), id).toBeDefined();
      const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      expect(b.min.y, id).toBeCloseTo(0, 0);
      expect(b.max.y, id).toBeCloseTo(l.h, 0);
      expect(b.max.x - b.min.x, id).toBeLessThanOrEqual(l.w + 1);
      expect(b.max.z - b.min.z, id).toBeLessThanOrEqual(l.d + 1);
      // Its hitbox (w × d about the site) holds no strip of empty air.
      expect(b.max.x - b.min.x, id).toBeGreaterThanOrEqual(l.w - 1);
      expect(b.max.z - b.min.z, id).toBeGreaterThanOrEqual(l.d - 1);
      expect(Math.abs(b.max.x + b.min.x) / 2, id).toBeLessThan(1);
      expect(Math.abs(b.max.z + b.min.z) / 2, id).toBeLessThan(1);
    }
  });

  it('keeps the market roof behind its stone east end, so the two never share a face', () => {
    const g = lm('st-lawrence-market').build();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    // The roof's brown (0x5a3a30) never reaches x 70, the stone end's face.
    const roof = new THREE.Color(0x5a3a30);
    for (let k = 0; k < pos.count; k++) {
      const c = new THREE.Color(col.getX(k), col.getY(k), col.getZ(k));
      if (Math.abs(c.r - roof.r) + Math.abs(c.g - roof.g) + Math.abs(c.b - roof.b) < 0.05) expect(pos.getX(k)).toBeLessThan(69);
    }
  });

  it('puts the ROM and Varsity Stadium side by side on the south side of Bloor (z −1200), the ROM to the east', () => {
    for (const s of [ROM_SITE, VARSITY_STADIUM_SITE]) {
      expect(s.z).toBeGreaterThan(-1200);
      expect(s.z).toBeLessThan(-1000);
    }
    expect(Math.floor(ROM_SITE.x / PITCH) - Math.floor(VARSITY_STADIUM_SITE.x / PITCH)).toBe(1);
  });

  it("leans the ROM's Crystal north out over Bloor: its tallest point stands in the model's north (−z) half", () => {
    const pos = lm('rom').build().getAttribute('position') as THREE.BufferAttribute;
    let top = 0;
    let topZ = 0;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) > top) { top = pos.getY(k); topZ = pos.getZ(k); }
    expect(topZ).toBeLessThan(0);
  });
});
