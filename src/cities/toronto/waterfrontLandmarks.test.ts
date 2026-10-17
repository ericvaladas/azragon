import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TORONTO } from '.';
import { BMO_FIELD_SITE, HEARN_SITE, PRINCES_GATES_SITE, blockInterior } from './layout';
import { isWater, PITCH } from '../../world/roads';

const ids = ['hearn', 'bmo-field', 'princes-gates'] as const;
const lm = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;

describe('waterfront landmarks', () => {
  it('lists the Hearn, BMO Field and the Princes\' Gates on Toronto, at their sites', () => {
    expect(lm('hearn')).toMatchObject(HEARN_SITE);
    expect(lm('bmo-field')).toMatchObject(BMO_FIELD_SITE);
    expect(lm('princes-gates')).toMatchObject(PRINCES_GATES_SITE);
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

  it('builds each to its stated size, vertex-coloured, standing on the ground', () => {
    for (const id of ids) {
      const l = lm(id);
      const g = l.build();
      expect(g.getAttribute('color'), id).toBeDefined();
      const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      expect(b.min.y, id).toBeCloseTo(0, 0);
      expect(b.max.y, id).toBeCloseTo(l.h, -1);
      expect(b.max.x - b.min.x, id).toBeLessThanOrEqual(l.w + 1);
      expect(b.max.z - b.min.z, id).toBeLessThanOrEqual(l.d + 1);
    }
  });

  it('makes the Hearn\'s chimney the skyline\'s second-tallest structure after the CN Tower', () => {
    const heights = [...TORONTO.landmarks].sort((a, b) => b.h - a.h).map((l) => l.id);
    expect(heights[0]).toBe('cn-tower');
    expect(heights[1]).toBe('hearn');
    expect(lm('hearn').h).toBeGreaterThan(200);
  });
});
