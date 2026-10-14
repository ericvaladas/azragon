import { describe, it, expect } from 'vitest';
import { FACADE, FACADE_COUNT } from '../cities/types';
import { SCRAMBLE } from '../cities/tokyo/shibuya';
import * as THREE from 'three';
import { FACADE_TILE, WINDOW_CHROMA, isWindowTexel, patchFacadeShader, patchRoadShader, scrambleArms, scrambleStripes } from './pixelTextures';

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
    expect(FACADE_COUNT).toBe(5);
    expect(FACADE.container).toBe(4);
    expect(sh.fragmentShader).toContain('/ 5.0');
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
  });
});

describe('scrambleArms', () => {
  it('reads the arm widths off the lattice lines through the crossing node (Shibuya: 36 m street, 56 m avenue)', () => {
    expect(scrambleArms(SCRAMBLE)).toEqual({ ns: 36, ew: 56 });
  });
});

describe('scrambleStripes', () => {
  const n = 64;
  const size = 120;
  const arms = { ns: 36, ew: 56 };
  const rects = scrambleStripes(n, size, arms);
  const m = n / 2;
  /** Pixel edge to metres from the crossing's centre. */
  const metres = (px: number) => ((px - m) * size) / n;
  // Stripes crossing the north-south street run along z (1 px wide); those crossing the east-west avenue run along x.
  const street = rects.filter((r) => r.w === 1 && r.h > 1);
  const avenue = rects.filter((r) => r.h === 1 && r.w > 1);
  const diag = rects.filter((r) => r.w === 1 && r.h === 1);
  const square = Math.max(arms.ns, arms.ew) / 2;

  it('uses whole pixels and stays inside the texture', () => {
    for (const r of rects) {
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(n);
      expect(r.y + r.h).toBeLessThanOrEqual(n);
    }
  });

  it('has a zebra on both sides of each arm plus both diagonals', () => {
    expect(street.some((r) => r.y < m)).toBe(true);
    expect(street.some((r) => r.y > m)).toBe(true);
    expect(avenue.some((r) => r.x < m)).toBe(true);
    expect(avenue.some((r) => r.x > m)).toBe(true);
    expect(diag.some((r) => r.x === r.y)).toBe(true);
    expect(diag.some((r) => r.x + r.y === n)).toBe(true);
  });

  it('spans the 36 m street with its own zebra, outside the 56 m intersection square', () => {
    const xs = street.flatMap((r) => [metres(r.x), metres(r.x + r.w)]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-arms.ns / 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(arms.ns / 2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(arms.ns * 0.8);
    for (const r of street) expect(Math.min(Math.abs(metres(r.y)), Math.abs(metres(r.y + r.h)))).toBeGreaterThanOrEqual(square);
  });

  it('spans the 56 m avenue with its own zebra, outside the intersection square', () => {
    const zs = avenue.flatMap((r) => [metres(r.y), metres(r.y + r.h)]);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-arms.ew / 2);
    expect(Math.max(...zs)).toBeLessThanOrEqual(arms.ew / 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(arms.ew * 0.8);
    for (const r of avenue) expect(Math.min(Math.abs(metres(r.x)), Math.abs(metres(r.x + r.w)))).toBeGreaterThanOrEqual(square);
  });

  it('is symmetric about the crossing centre', () => {
    const key = (r: { x: number; y: number; w: number; h: number }) => `${r.x},${r.y},${r.w},${r.h}`;
    const all = new Set(rects.map(key));
    for (const r of [...street, ...avenue]) expect(all.has(key({ x: n - r.x - r.w, y: n - r.y - r.h, w: r.w, h: r.h }))).toBe(true);
  });

  it('keeps both diagonal bands inside the intersection square', () => {
    for (const r of diag) {
      expect(Math.abs(metres(r.x))).toBeLessThanOrEqual(square);
      expect(Math.abs(metres(r.x + 1))).toBeLessThanOrEqual(square);
      expect(Math.abs(metres(r.y))).toBeLessThanOrEqual(square);
      expect(Math.abs(metres(r.y + 1))).toBeLessThanOrEqual(square);
    }
  });
});

describe('patchRoadShader', () => {
  it('reads per-segment crosswalk switches and samples plain asphalt over a switched-off end', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchRoadShader(sh);
    expect(sh.vertexShader).toContain('attribute vec2 aPlainEnds;');
    expect(sh.fragmentShader).toContain('vPlainEnds');
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
  });
});

describe('window glow', () => {
  it('adds the lit-window colour to window texels through a shared uniform', () => {
    const glow = { value: new THREE.Color(1, 0.8, 0.4) };
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh, glow);
    expect(sh.uniforms['uWindowGlow']).toBe(glow);
    expect(sh.fragmentShader).toContain('uniform vec3 uWindowGlow;');
    expect(sh.fragmentShader).toContain(`step(${WINDOW_CHROMA.toFixed(3)}, facadeTexel.b - facadeTexel.r)`);
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance += uWindowGlow');
    expect(sh.fragmentShader).toContain('diffuseColor *= facadeTexel;');
  });

  it('without a glow uniform patches exactly as before (no glow code)', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh);
    expect(sh.fragmentShader).not.toContain('uWindowGlow');
  });

  it('counts only the bluish window inks of the facade atlas as windows', () => {
    for (const ink of [0x7f93ab, 0x8a9aae, 0x8796aa]) expect(isWindowTexel(ink), ink.toString(16)).toBe(true);
    for (const ink of [0xc9d4dc, 0xe8eef2, 0x5d6a74, 0xffffff, 0xb8b0a4, 0xd9d3c8, 0xf2efe9, 0xffe9a8, 0xf4f4f4, 0xb4b4b4, 0x5a5a5a]) {
      expect(isWindowTexel(ink), ink.toString(16)).toBe(false);
    }
  });
});
