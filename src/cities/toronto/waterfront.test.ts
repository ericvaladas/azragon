import { describe, it, expect } from 'vitest';
import { TORONTO } from '.';
import { coastDistance } from '../coast';
import { ISLANDS, ONTARIO_PLACE_EAST, ONTARIO_PLACE_WEST, SPIT_ARM, SPIT_CAUSEWAY, SPIT_LOBES, TORONTO_LANDFORMS } from './waterfront';
import { allocateTrees, inPolygon, onDetail, onGrass, onLand, prepareLandform } from '../../world/landforms';
import { isWater, PITCH } from '../../world/roads';
import { MAX_LANDFORM_TREES } from '../../world/LandformRenderer';

const all = TORONTO_LANDFORMS.map(prepareLandform);
const prep = (s: typeof ISLANDS) => all[TORONTO_LANDFORMS.indexOf(s)]!;

describe('Toronto waterfront landforms', () => {
  it('lists the islands and the spit (causeway, lobes, arm) on Toronto', () => {
    expect(TORONTO.landforms).toBe(TORONTO_LANDFORMS);
    expect(TORONTO_LANDFORMS).toEqual([ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM, ONTARIO_PLACE_WEST, ONTARIO_PLACE_EAST]);
  });

  it('puts the islands about 2.5 km offshore and the spit tip about 4 km out', () => {
    const iz = prep(ISLANDS).outline.map((p) => p.z);
    expect(Math.max(...iz)).toBeGreaterThan(4700);
    expect(Math.max(...iz)).toBeLessThan(4950);
    const sz = prep(SPIT_LOBES).outline.map((p) => p.z);
    expect(Math.max(...sz)).toBeGreaterThan(6300);
  });

  it('keeps every landform out in the lake; the causeway leaves the Port Lands\' southeast corner', () => {
    for (const s of [ISLANDS, SPIT_LOBES, SPIT_ARM, ONTARIO_PLACE_WEST, ONTARIO_PLACE_EAST]) {
      for (const p of prep(s).outline) expect(coastDistance(TORONTO.bay!, p.x, p.z), `${s.name} ${p.x},${p.z}`).toBeLessThan(0);
    }
    // The causeway now leaves the Port Lands' southeast corner, out in the lake.
    for (const p of prep(SPIT_CAUSEWAY).outline) expect(coastDistance(TORONTO.bay!, p.x, p.z)).toBeLessThan(0);
    expect(Math.min(...prep(SPIT_CAUSEWAY).outline.map((p) => p.z))).toBeGreaterThan(3400);
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
          d.kind === 'tower' || d.kind === 'dome'
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
    expect(d.filter((x) => x.kind === 'dome')).toHaveLength(1);
    expect(d.filter((x) => x.kind === 'box' && x.water)).toHaveLength(8);
    expect(ISLANDS.details.filter((x) => x.kind === 'box' && x.w === 10 && x.d === 8)).toHaveLength(25);
  });

  it('lays every landform over water blocks, never over the mainland', () => {
    for (const p of all) {
      for (const q of p.outline) expect(isWater(TORONTO, Math.floor(q.x / PITCH), Math.floor(q.z / PITCH)), `${p.spec.name} ${q.x},${q.z}`).toBe(true);
    }
  });

  it("spreads the tree budget over every landform: the islands' south shore and cottages, the lobes and the causeway all get trees", () => {
    const trees = allocateTrees(all, 911, MAX_LANDFORM_TREES);
    expect(trees.flat().length).toBeLessThanOrEqual(MAX_LANDFORM_TREES);
    TORONTO_LANDFORMS.forEach((s, i) => {
      if (s.treeEvery > 0) expect(trees[i]!.length, s.name).toBeGreaterThan(0);
    });
    const island = trees[TORONTO_LANDFORMS.indexOf(ISLANDS)]!;
    expect(island.filter((t) => t.z > 4300).length).toBeGreaterThan(40);
    expect(island.filter((t) => t.x > 600 && t.z > 3950).length).toBeGreaterThan(10);
    expect(trees[TORONTO_LANDFORMS.indexOf(SPIT_LOBES)]!.length).toBeGreaterThan(100);
  });

  it("keeps trees off the airport's ground", () => {
    const island = allocateTrees(all, 911, MAX_LANDFORM_TREES)[TORONTO_LANDFORMS.indexOf(ISLANDS)]!;
    for (const t of island) expect(t.x < -1350 && t.z < 3050, `${t.x},${t.z}`).toBe(false);
  });
});

