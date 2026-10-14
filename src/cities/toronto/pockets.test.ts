import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { TORONTO } from './index';
import { TOKYO } from '../tokyo';
import { POCKET_RULES } from './districts';
import { AREAS, CORE_RADIUS, POCKET_GRID, districtAt, pocketAt } from './layout';
import { generateChunk } from '../../world/chunks';
import { PITCH, isIsland, isRiverBank, isWater } from '../../world/roads';

const centre = (i: number) => PITCH * (i + 0.5);
const blockOf = (v: number) => Math.floor(v / PITCH);

/** The four residential areas the owner marked on the overhead dive view, in world metres. */
const BOXES = {
  A: { x0: 2300, x1: 3800, z0: 800, z1: 1800 },
  B: { x0: 2300, x1: 3800, z0: -2200, z1: 0 },
  C: { x0: -4200, x1: -3000, z0: 900, z1: 1800 },
  D: { x0: -3600, x1: -2000, z0: -2000, z1: -200 },
} as const;
type Box = { x0: number; x1: number; z0: number; z1: number };
/** Pocket blocks whose centre lies in the box. */
const pocketsIn = (b: Box) => {
  const out: [number, number][] = [];
  for (let i = blockOf(b.x0); i <= blockOf(b.x1); i++) for (let j = blockOf(b.z0); j <= blockOf(b.z1); j++) {
    const x = centre(i), z = centre(j);
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pocketAt(x, z)) out.push([i, j]);
  }
  return out;
};

describe('Toronto tower pockets', () => {
  it.each(Object.entries(BOXES))('raises at least one pocket in box %s', (_name, box) => {
    expect(pocketsIn(box).length).toBeGreaterThanOrEqual(1);
  });

  it('builds pocket blocks as high-rise condos 80–200 m in pale colours, the whole block alike', () => {
    expect(POCKET_RULES.height).toEqual([80, 200]);
    for (const box of Object.values(BOXES)) for (const [i, j] of pocketsIn(box)) {
      expect(districtAt(centre(i), centre(j))).toBe('highrise');
      expect(pocketAt(centre(i) - 99, centre(j) + 99)).toBe(true);
      expect(TORONTO.blockRules?.(centre(i), centre(j))).toBe(POCKET_RULES);
    }
    expect(TORONTO.blockRules?.(0, -4200)).toBeUndefined();
    expect(TOKYO.blockRules).toBeUndefined();
  });

  it('puts pocket towers in the generated chunks: 80–200 m, pocket colours', () => {
    const [i, j] = pocketsIn(BOXES.A)[0]!;
    const c = generateChunk(TORONTO, 1337, Math.floor(i / 4), Math.floor(j / 4));
    const towers = c.buildings.filter((b) => blockOf(b.x) === i && blockOf(b.z) === j);
    expect(towers.length).toBeGreaterThanOrEqual(1);
    for (const b of towers) {
      expect(b.h).toBeGreaterThanOrEqual(80);
      expect(b.h).toBeLessThanOrEqual(200);
      expect(POCKET_RULES.colors).toContain(b.color);
    }
  });

  it('never puts a pocket in the crater, on the Don banks, in a park or area, on a landmark or special-lot block, the islands or water', () => {
    const W = CONFIG.world;
    const specials = new Set(TORONTO.specialLots.map((s) => `${blockOf(s.x)},${blockOf(s.z)}`));
    const landmarks = new Set(TORONTO.landmarks.map((l) => `${blockOf(l.x)},${blockOf(l.z)}`));
    let pockets = 0;
    for (let i = -40; i < 40; i++) for (let j = -40; j < 16; j++) {
      const x = centre(i), z = centre(j);
      if (!pocketAt(x, z)) continue;
      pockets++;
      // Nothing of the block within clearRadius + half a block of the crash.
      const nx = Math.max(Math.abs(x) - PITCH / 2, 0), nz = Math.max(Math.abs(z) - PITCH / 2, 0);
      expect(Math.hypot(nx, nz), `${i},${j}`).toBeGreaterThanOrEqual(W.clearRadius + PITCH / 2);
      expect(isRiverBank(TORONTO, i, j), `${i},${j}`).toBe(false);
      expect(isWater(TORONTO, i, j), `${i},${j}`).toBe(false);
      expect(isIsland(TORONTO, i, j), `${i},${j}`).toBe(false);
      expect(specials.has(`${i},${j}`), `${i},${j}`).toBe(false);
      expect(landmarks.has(`${i},${j}`), `${i},${j}`).toBe(false);
      expect(AREAS.some((a) => 'ci0' in a ? i >= a.ci0 && i <= a.ci1 && j >= a.cj0 && j <= a.cj1 : ((x - a.x) / a.rx) ** 2 + ((z - a.z) / a.rz) ** 2 <= 1), `${i},${j}`).toBe(false);
      expect(TORONTO.districtAt(x, z)).toBe('highrise');
    }
    expect(pockets).toBeGreaterThan(20);
  });

  it('clusters 1–3 blocks per pocket with green gaps between pockets (no two pockets touch)', () => {
    const seen = new Set<string>();
    for (let i = -40; i < 40; i++) for (let j = -40; j < 16; j++) {
      if (!pocketAt(centre(i), centre(j)) || seen.has(`${i},${j}`)) continue;
      // Flood the 8-connected cluster.
      const stack: [number, number][] = [[i, j]];
      const cluster: [number, number][] = [];
      seen.add(`${i},${j}`);
      while (stack.length && cluster.length < 20) {
        const [a, b] = stack.pop()!;
        cluster.push([a, b]);
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const k = `${a + da},${b + db}`;
          if (!seen.has(k) && pocketAt(centre(a + da), centre(b + db))) {
            seen.add(k);
            stack.push([a + da, b + db]);
          }
        }
      }
      expect(cluster.length, `${i},${j}`).toBeLessThanOrEqual(3);
    }
  });

  it('is deterministic and about one pocket per 1.5 km² of residential land: a sane share of residential blocks', () => {
    expect(POCKET_GRID * PITCH).toBeGreaterThanOrEqual(1100);
    expect(POCKET_GRID * PITCH).toBeLessThanOrEqual(1300);
    let homes = 0, pockets = 0;
    for (let i = -30; i < 30; i++) for (let j = -30; j < 11; j++) {
      const x = centre(i), z = centre(j);
      expect(pocketAt(x, z)).toBe(pocketAt(x, z));
      const d = districtAt(x, z);
      if (d === 'residential') homes++;
      if (pocketAt(x, z)) pockets++;
    }
    const share = pockets / (homes + pockets);
    expect(share).toBeGreaterThanOrEqual(0.03);
    expect(share).toBeLessThanOrEqual(0.12);
    // Inside and beyond the core.
    let beyond = 0;
    for (let i = -60; i < 60; i++) for (let j = -60; j < 11; j++) if (Math.hypot(centre(i), centre(j)) > CORE_RADIUS + 500 && pocketAt(centre(i), centre(j))) beyond++;
    expect(beyond).toBeGreaterThan(10);
  });
});
