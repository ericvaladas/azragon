import { describe, it, expect } from 'vitest';
import { FACADE_COUNT } from '../cities/types';
import { CONFIG } from '../config';
import { FACADE_TILE, patchFacadeShader, scrambleStripes } from './pixelTextures';

const VERT = 'x\n#include <common>\ny\n#include <uv_vertex>\nz';
const FRAG = 'x\n#include <common>\ny\n#include <map_fragment>\nz';

describe('patchFacadeShader', () => {
  it('reads the per-building facade cell and tiles it by the building size (one cell per FACADE_TILE metres)', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh);
    expect(sh.vertexShader).toContain('attribute float aFacade;');
    expect(sh.vertexShader).toContain('instanceMatrix');
    expect(sh.vertexShader).toContain(`/ ${FACADE_TILE.h.toFixed(1)}`);
    expect(sh.fragmentShader).toContain('fract(vFacadeUv.x)');
    expect(sh.fragmentShader).toContain(`/ ${FACADE_COUNT.toFixed(1)}`);
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
  });
});

describe('scrambleStripes', () => {
  const n = 64;
  const rects = scrambleStripes(n, CONFIG.world.roadWidth, 120);

  it('uses whole pixels and stays inside the texture', () => {
    for (const r of rects) {
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(n);
      expect(r.y + r.h).toBeLessThanOrEqual(n);
    }
  });

  it('has crossings on all four sides plus the diagonals', () => {
    const m = n / 2;
    expect(rects.some((r) => r.h === 3 && r.y < m)).toBe(true);
    expect(rects.some((r) => r.h === 3 && r.y > m)).toBe(true);
    expect(rects.some((r) => r.w === 3 && r.x < m)).toBe(true);
    expect(rects.some((r) => r.w === 3 && r.x > m)).toBe(true);
    expect(rects.some((r) => r.w === 1 && r.h === 1 && r.x === r.y)).toBe(true);
    expect(rects.some((r) => r.w === 1 && r.h === 1 && r.x + r.y === n)).toBe(true);
  });
});
