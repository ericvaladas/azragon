import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { TORONTO } from '.';
import { AREAS, areaAt, districtAt } from './layout';
import { COTTAGE_RULES, MAIN_STREET_RULES, MIDRISE_RULES, OLD_TOWN_RULES, POCKET_RULES, VICTORIAN_RULES } from './districts';
import { blockDistrict, isWater, PITCH } from '../../world/roads';
import { generateChunk } from '../../world/chunks';

const centre = (c: number) => (c + 0.5) * PITCH;
const NEW = [
  ['St. Lawrence / Old Town', 'office', OLD_TOWN_RULES],
  ['Entertainment District', 'highrise', undefined],
  ['The Annex', 'residential', VICTORIAN_RULES],
  ['Trinity Bellwoods', 'park', undefined],
  ['Little Italy', 'neon', MAIN_STREET_RULES],
  ['Cabbagetown', 'residential', COTTAGE_RULES],
  ['Regent Park', 'highrise', MIDRISE_RULES],
  ['Riverside', 'neon', undefined],
  ['Leslieville', 'neon', MAIN_STREET_RULES],
  ['Greektown', 'neon', MAIN_STREET_RULES],
] as const;
const area = (name: string) => {
  const a = AREAS.find((x) => x.name === name);
  if (!a || !('ci0' in a)) throw new Error(name);
  return a;
};
const blocks = (name: string) => {
  const a = area(name);
  const out: [number, number][] = [];
  for (let i = a.ci0; i <= a.ci1; i++) for (let j = a.cj0; j <= a.cj1; j++) if (!isWater(TORONTO, i, j)) out.push([i, j]);
  return out;
};

describe('Toronto districts', () => {
  it('gives each new area its district on every land block, and each new block belongs to its own area', () => {
    for (const [name, district] of NEW) {
      expect(blocks(name).length, name).toBeGreaterThan(0);
      for (const [i, j] of blocks(name)) {
        expect(areaAt(centre(i), centre(j))?.name, `${name} ${i},${j}`).toBe(name);
        expect(districtAt(centre(i), centre(j)), `${name} ${i},${j}`).toBe(district);
      }
    }
  });

  it('applies area rules only inside their areas', () => {
    for (const [name, , rules] of NEW) {
      if (!rules && name !== 'Riverside') continue;
      for (const [i, j] of blocks(name)) expect(TORONTO.blockRules!(centre(i), centre(j)), `${name} ${i},${j}`).toBe(area(name).rules);
    }
    // Just west of the Annex: midtown again (no area rules; a pocket at most).
    const r = TORONTO.blockRules!(centre(-14), centre(-9));
    expect(r === undefined || r === POCKET_RULES).toBe(true);
    expect(area('Riverside').rules!.signs).toBeLessThan(MAIN_STREET_RULES.signs);
  });

  it('builds each ruled area within its height range and palette', () => {
    for (const [name, , rules] of NEW) {
      const ar = area(name);
      const r = ar.rules ?? rules;
      if (!r) continue;
      const palette = ar.colors ?? r.colors;
      const seen = new Set<string>();
      let n = 0;
      for (const [i, j] of blocks(name)) {
        const key = `${Math.floor(i / 4)},${Math.floor(j / 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const b of generateChunk(TORONTO, CONFIG.world.seed, Math.floor(i / 4), Math.floor(j / 4)).buildings) {
          const bi = Math.floor(b.x / PITCH);
          const bj = Math.floor(b.z / PITCH);
          if (b.keep || areaAt(centre(bi), centre(bj))?.name !== name) continue;
          n++;
          expect(b.h, name).toBeGreaterThanOrEqual(r.height[0] - 1e-6);
          expect(b.h, name).toBeLessThanOrEqual(r.height[1] + 1e-6);
          expect(palette, name).toContain(b.color);
        }
      }
      expect(n, name).toBeGreaterThan(0);
    }
  });

  it('keeps the main streets built up after the chunk cap: at least 5 shops and 45% of each block covered', () => {
    for (const name of ['Little Italy', 'Riverside', 'Leslieville', 'Greektown']) {
      const per = new Map<string, { n: number; area: number }>();
      const seen = new Set<string>();
      for (const [i, j] of blocks(name)) {
        const key = `${Math.floor(i / 4)},${Math.floor(j / 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const b of generateChunk(TORONTO, CONFIG.world.seed, Math.floor(i / 4), Math.floor(j / 4)).buildings) {
          const k = `${Math.floor(b.x / PITCH)},${Math.floor(b.z / PITCH)}`;
          const p = per.get(k) ?? { n: 0, area: 0 };
          p.n++;
          p.area += b.w * b.d;
          per.set(k, p);
        }
      }
      for (const [i, j] of blocks(name)) {
        if (blockDistrict(TORONTO, centre(i), centre(j)) !== 'neon') continue; // a Don bank park
        const p = per.get(`${i},${j}`) ?? { n: 0, area: 0 };
        expect(p.n, `${name} ${i},${j}`).toBeGreaterThanOrEqual(5);
        expect(p.area / (164 * 164), `${name} ${i},${j}`).toBeGreaterThanOrEqual(0.45);
      }
    }
  });
});
