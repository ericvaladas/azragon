import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TORONTO } from '.';
import { GOODERHAM_SITE, ROY_THOMSON_HALL_SITE, ST_LAWRENCE_MARKET_SITE, blockInterior } from './layout';
import { isWater, PITCH } from '../../world/roads';

const ids = ['st-lawrence-market', 'gooderham', 'roy-thomson-hall'] as const;
const lm = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;

describe('district landmarks', () => {
  it('lists St. Lawrence Market, the Gooderham Building and Roy Thomson Hall at their sites', () => {
    expect(lm('st-lawrence-market')).toMatchObject(ST_LAWRENCE_MARKET_SITE);
    expect(lm('gooderham')).toMatchObject(GOODERHAM_SITE);
    expect(lm('roy-thomson-hall')).toMatchObject(ROY_THOMSON_HALL_SITE);
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
    }
  });
});
