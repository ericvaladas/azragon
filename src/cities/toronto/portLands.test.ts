import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { TORONTO } from '.';
import { CHERRY_BEACH, PORT_LANDS, SHIP_CHANNEL, districtAt } from './layout';
import { inCellRect, isBay, isWater, planRoadPath, PITCH } from '../../world/roads';
import { chunksInRadius, generateChunk } from '../../world/chunks';
import { shoreStep } from '../../world/shore';

const centre = (c: number) => (c + 0.5) * PITCH;
const inPortLands = (i: number, j: number) => PORT_LANDS.some((r) => inCellRect(r, i, j));

describe('the Port Lands', () => {
  it('are land in their stepped outline, lake just outside it', () => {
    for (let i = 8; i <= 23; i++) for (let j = 11; j <= 16; j++) if (!inCellRect(SHIP_CHANNEL, i, j)) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(false);
    for (let i = 9; i <= 17; i++) expect(isBay(TORONTO, i, 19), `${i},19`).toBe(false);
    expect(isBay(TORONTO, 21, 17)).toBe(true);
    expect(isBay(TORONTO, 18, 18)).toBe(true);
    expect(isBay(TORONTO, 8, 18)).toBe(true);
    expect(isBay(TORONTO, 10, 20)).toBe(true);
    expect(isBay(TORONTO, 24, 12)).toBe(true);
  });

  it('are cut by the Ship Channel, open to the harbour at its west end', () => {
    for (let i = SHIP_CHANNEL.ci0; i <= SHIP_CHANNEL.ci1; i++) expect(isWater(TORONTO, i, 14), `${i},14`).toBe(true);
    expect(isBay(TORONTO, SHIP_CHANNEL.ci0 - 1, 14)).toBe(true);
    expect(isBay(TORONTO, SHIP_CHANNEL.ci1 + 1, 14)).toBe(false);
  });

  it('leave the Eastern Gap open between Ward\'s tip and their west edge', () => {
    expect(isBay(TORONTO, 7, 17)).toBe(true);
    expect(isBay(TORONTO, 7, 18)).toBe(true);
  });

  it('are industrial, with Cherry Beach a park; Harbourfront is waterfront condos; Exhibition Place is park', () => {
    expect(districtAt(centre(14), centre(12))).toBe('industrial');
    expect(districtAt(centre(20), centre(16))).toBe('industrial');
    for (let i = CHERRY_BEACH.ci0; i <= CHERRY_BEACH.ci1; i++) expect(districtAt(centre(i), centre(19))).toBe('park');
    for (let i = -9; i <= -1; i++) expect(districtAt(centre(i), centre(10)), `${i},10`).toBe('port');
    for (let i = -18; i <= -13; i++) for (const j of [9, 10]) expect(districtAt(centre(i), centre(j)), `${i},${j}`).toBe('park');
  });

  it('keeps downtown\'s districts north of the shore row', () => {
    expect(districtAt(centre(-3), centre(8))).toBe('office');
    expect(districtAt(centre(3), centre(9))).not.toBe('industrial');
  });

  it('gives Cherry Beach sand pads (no grass pads) and trees only in their inland half', () => {
    let sand = 0;
    for (const c of chunksInRadius(centre(10), centre(19), 600)) {
      const ch = generateChunk(TORONTO, CONFIG.world.seed, c.cx, c.cz);
      for (const b of ch.beaches) {
        const bi = Math.floor(b.x / PITCH);
        const bj = Math.floor(b.z / PITCH);
        expect(inCellRect(CHERRY_BEACH, bi, bj)).toBe(true);
        sand++;
      }
      for (const p of ch.parks) expect(inCellRect(CHERRY_BEACH, Math.floor(p.x / PITCH), Math.floor(p.z / PITCH))).toBe(false);
      for (const t of ch.trees) if (inCellRect(CHERRY_BEACH, Math.floor(t.x / PITCH), Math.floor(t.z / PITCH))) expect(t.z).toBeLessThanOrEqual(centre(19) + 1);
    }
    expect(sand).toBe(CHERRY_BEACH.ci1 - CHERRY_BEACH.ci0 + 1);
    expect(TORONTO.colors.beach).toBeDefined();
  });

  it('a road route reaches the Port Lands from downtown', () => {
    const path = planRoadPath(TORONTO, { x: 0, z: 1500 }, { x: 3000, z: 2500 });
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1]!;
    expect(inPortLands(Math.floor(end.x / PITCH), Math.floor(end.z / PITCH))).toBe(true);
  });

  it('the monster can\'t walk into the Ship Channel', () => {
    const step = shoreStep(TORONTO, { x: 3100, z: 2700 }, { x: 3100, z: 2900 }, 60);
    expect(step.pos.z).toBeLessThan(2800);
  });
});
