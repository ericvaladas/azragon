import { describe, it, expect } from 'vitest';
import { TORONTO } from '.';
import { coastDistance } from '../coast';
import { ISLANDS, SPIT_ARM, SPIT_CAUSEWAY, SPIT_LOBES, TORONTO_LANDFORMS } from './waterfront';
import { inPolygon, onDetail, onGrass, onLand, prepareLandform } from '../../world/landforms';

const all = TORONTO_LANDFORMS.map(prepareLandform);
const prep = (s: typeof ISLANDS) => all[TORONTO_LANDFORMS.indexOf(s)]!;

describe('Toronto waterfront landforms', () => {
  it('lists the islands and the spit (causeway, lobes, arm) on Toronto', () => {
    expect(TORONTO.landforms).toBe(TORONTO_LANDFORMS);
    expect(TORONTO_LANDFORMS).toEqual([ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM]);
  });

  it('puts the islands about 2.5 km offshore and the spit tip about 4 km out', () => {
    const iz = prep(ISLANDS).outline.map((p) => p.z);
    expect(Math.max(...iz)).toBeGreaterThan(4700);
    expect(Math.max(...iz)).toBeLessThan(4950);
    const sz = prep(SPIT_LOBES).outline.map((p) => p.z);
    expect(Math.max(...sz)).toBeGreaterThan(6300);
  });

  it('keeps the islands, lobes and arm out in the lake; the causeway reaches the shore at Leslie St', () => {
    for (const s of [ISLANDS, SPIT_LOBES, SPIT_ARM]) {
      for (const p of prep(s).outline) expect(coastDistance(TORONTO.bay!, p.x, p.z), `${s.name} ${p.x},${p.z}`).toBeLessThan(0);
    }
    const cz = prep(SPIT_CAUSEWAY).outline.map((p) => p.z);
    expect(Math.min(...cz)).toBeLessThanOrEqual(2200);
  });

  it('keeps the islands clear of the spit', () => {
    const islands = prep(ISLANDS);
    for (const s of [SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM]) {
      for (const p of prep(s).outline) expect(onLand(islands, p.x, p.z), `${s.name} ${p.x},${p.z}`).toBe(false);
    }
  });

  it('keeps every hole inside its landform', () => {
    for (const p of all) {
      for (const h of p.holes) for (const q of h) expect(inPolygon(p.outline, q.x, q.z), `${p.spec.name} hole ${q.x},${q.z}`).toBe(true);
    }
  });

  it('stands every detail on grass, except piers and docks', () => {
    for (const p of all) {
      for (const d of p.details) {
        if (d.kind === 'box' && d.water) continue;
        const corners =
          d.kind === 'tower'
            ? [{ x: d.x + d.r, z: d.z }, { x: d.x - d.r, z: d.z }, { x: d.x, z: d.z + d.r }, { x: d.x, z: d.z - d.r }]
            : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
                const lx = (sx! * d.w) / 2;
                const lz = (sz! * d.d) / 2;
                return { x: d.x + lx * Math.cos(d.yaw) + lz * Math.sin(d.yaw), z: d.z - lx * Math.sin(d.yaw) + lz * Math.cos(d.yaw) };
              });
        for (const c of corners) expect(onGrass(p, c.x, c.z), `${p.spec.name} ${d.kind} at ${d.x},${d.z}`).toBe(true);
        expect(onDetail(d, d.x, d.z)).toBe(true);
      }
    }
  });

  it('has the airport, two lighthouses, a pier, a ferry dock and 25 cottages', () => {
    const d = all.flatMap((p) => p.details);
    expect(d.filter((x) => x.kind === 'tower')).toHaveLength(2);
    expect(d.filter((x) => x.kind === 'box' && x.water)).toHaveLength(2);
    expect(ISLANDS.details.filter((x) => x.kind === 'box' && x.w === 10 && x.d === 8)).toHaveLength(25);
  });
});
