import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS, FACADE } from '../types';
import { TORONTO } from './index';
import { chunksInRadius, generateChunk } from '../../world/chunks';

describe('TORONTO', () => {
  it('has rules for every district at the spec heights; parks build nothing; the port is condos, not a container yard', () => {
    const D = TORONTO.districts;
    for (const d of DISTRICTS) expect(D[d]).toBeDefined();
    expect(D.park.lots).toBe(0);
    expect(D.highrise.height).toEqual([200, 300]);
    expect(D.neon.height).toEqual([40, 90]);
    expect(D.office.height).toEqual([40, 100]);
    expect(D.residential.height).toEqual([10, 22]);
    expect(D.residential.trees).toBe(6);
    expect(D.residential.lots).toBe(4);
    expect(D.port.height).toEqual([80, 160]);
    expect(D.port.yard).toBeUndefined();
  });

  it('keeps billboards rare: chance 0.02 or less in every district', () => {
    for (const d of DISTRICTS) expect(TORONTO.districts[d].billboard, d).toBeLessThanOrEqual(0.02);
  });

  it('removes fewer streets than Tokyo: residential 15%, office 15%, high-rise 10%, parks 40%', () => {
    expect(TORONTO.roadRemoval).toMatchObject({ residential: 0.15, office: 0.15, highrise: 0.1, park: 0.4 });
  });

  it('is a warm evening: dusky sky, peach fog at Tokyo\'s distances, low western sun, warm window glow', () => {
    expect(TORONTO.atmosphere).toEqual({
      skyZenith: 0x4b4a8c, skyHorizon: 0xf2a46b, fog: 0xe9a985,
      hemiSky: 0xffc59a, hemiGround: 0x4a3550, hemiIntensity: 0.8,
      sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 },
      windowGlow: { color: 0xffc46b, strength: 0.45 },
    });
  });

  it('letters its signs in Latin, has no cranes, and paints a greener lake', () => {
    expect(TORONTO.glyphs).toBe('latin');
    expect(TORONTO.cranes).toBe(false);
    expect(TORONTO.colors.water).not.toBe(0x3f8fc9);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const a = new THREE.Color(), b = new THREE.Color();
    for (const s of TORONTO.signColors) for (const t of [CONFIG.palette.chevron, 0xff3b2f]) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('generates no container cranes and no container facades along the lakeshore', () => {
    let built = 0;
    for (const r of chunksInRadius(0, 2100, 3000)) {
      const c = generateChunk(TORONTO, 1337, r.cx, r.cz);
      expect(c.cranes).toEqual([]);
      for (const b of c.buildings) expect(b.facade).not.toBe(FACADE.container);
      built += c.buildings.length;
    }
    expect(built).toBeGreaterThan(100);
  });

  it('generates the same chunk from the same inputs', () => {
    expect(generateChunk(TORONTO, 1337, -1, 2)).toEqual(generateChunk(TORONTO, 1337, -1, 2));
  });
});
