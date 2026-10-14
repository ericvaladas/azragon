import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { DISTRICTS, type DistrictId } from '../types';
import { coastDistance } from '../coast';
import { CORE_RADIUS, DON, FINANCIAL, PORT_DEPTH, TORONTO_ISLANDS, TORONTO_LAKE, WATERFRONT, YONGE_CORRIDOR, YONGE_DUNDAS, YONGE_NODES, blockInterior, districtAt, lotCentre } from './layout';
import { TORONTO } from './index';
import { AVENUE_WIDTH, PITCH, blockDistrict, isBay, isIsland, isRiver, isRiverBank, isWater, lineWidth, segmentAt } from '../../world/roads';
import { inBay } from '../../world/shore';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const centre = (i: number) => PITCH * (i + 0.5);

describe('Toronto layout', () => {
  it('runs Yonge Street (the x = 0 avenue) unbroken from behind the crash to the lake', () => {
    expect(lineWidth(0)).toBe(AVENUE_WIDTH);
    for (let j = -10; j < 11; j++) expect(segmentAt(TORONTO, 'z', 0, j), `Yonge at z ${PITCH * j}`).not.toBeNull();
  });

  it('puts Yonge-Dundas, the one neon block, just right (west) of Yonge ahead of the crash', () => {
    expect(YONGE_DUNDAS).toEqual({ x: -100, z: 900 });
    expect(districtAt(-100, 900)).toBe('neon');
    for (const [x, z] of [[100, 900], [-300, 900], [-100, 700], [-100, 1100]] as const) expect(districtAt(x, z)).not.toBe('neon');
    let neon = 0;
    for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) if (districtAt(centre(i), centre(j)) === 'neon') neon++;
    expect(neon).toBe(1);
  });

  it('centres the Financial District on (−300, 1500): that block and its four neighbours are high-rise', () => {
    expect(FINANCIAL).toEqual({ x: -300, z: 1500 });
    for (const [x, z] of [[-300, 1500], [-500, 1500], [-100, 1500], [-300, 1300], [-300, 1700]] as const) expect(districtAt(x, z), `${x},${z}`).toBe('highrise');
    for (const [x, z] of [[-500, 1300], [-100, 1700], [-700, 1500], [-300, 1900]] as const) expect(districtAt(x, z), `${x},${z}`).not.toBe('highrise');
  });

  it('lays the lake ahead (+Z): land up to z = 2200, open lake beyond, none behind the crash', () => {
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 10; j++) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(false);
      for (const j of [12, 16, 20, 40]) if (!isIsland(TORONTO, i, j)) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(true);
    }
  });

  it('keeps the islands offshore: a long east–west group of park cells with open lake all round, unwalkable', () => {
    const cells: [number, number][] = [];
    for (let i = -20; i <= 20; i++) for (let j = 0; j <= 30; j++) if (isIsland(TORONTO, i, j)) cells.push([i, j]);
    expect(cells.length).toBeGreaterThan(20);
    const c = TORONTO_ISLANDS.center;
    expect(isIsland(TORONTO, Math.floor(c.x / PITCH), Math.floor(c.z / PITCH))).toBe(true);
    const is = cells.map(([i]) => i), js = cells.map(([, j]) => j);
    expect(Math.max(...is) - Math.min(...is)).toBeGreaterThan(3 * (Math.max(...js) - Math.min(...js)));
    for (const [i, j] of cells) {
      expect(districtAt(centre(i), centre(j))).toBe('park');
      expect(inBay(TORONTO, centre(i), centre(j))).toBe(true);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        expect(isIsland(TORONTO, i + di, j + dj) || isBay(TORONTO, i + di, j + dj), `${i + di},${j + dj} beside the islands`).toBe(true);
      }
    }
  });

  it('runs the Don north–south at x = 1500 + 150·sin(z / 1100), connected through water into the lake', () => {
    expect(DON).toEqual({ axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 });
    for (let j = -40; j <= 10; j++) {
      const cols: number[] = [];
      for (let i = -10; i <= 20; i++) if (isRiver(TORONTO, i, j)) cols.push(i);
      expect(cols.length, `row ${j}`).toBeGreaterThan(0);
      for (const i of cols) expect(Math.abs(centre(i) - 1500)).toBeLessThan(150 + 130);
    }
    let start: [number, number] = [0, -40];
    for (let i = -10; i <= 20; i++) if (isRiver(TORONTO, i, -40)) { start = [i, -40]; break; }
    const seen = new Set<string>([start.join(',')]);
    const queue: [number, number][] = [start];
    let lake = false;
    while (queue.length && !lake) {
      const [i, j] = queue.shift()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n: [number, number] = [i + di, j + dj];
        if (seen.has(n.join(',')) || n[1] < -41 || n[1] > 30 || !isWater(TORONTO, n[0], n[1])) continue;
        seen.add(n.join(','));
        if (isBay(TORONTO, n[0], n[1])) lake = true;
        queue.push(n);
      }
    }
    expect(lake).toBe(true);
  });

  it('bridges the Don only where an avenue crosses it (z a multiple of 1000), and greens its banks', () => {
    let bridges = 0, banks = 0;
    for (let i = 0; i <= 14; i++) for (let j = -30; j <= 10; j++) {
      const over = isRiver(TORONTO, i, j - 1) && isRiver(TORONTO, i, j) && !isBay(TORONTO, i, j - 1) && !isBay(TORONTO, i, j);
      if (over) {
        const seg = segmentAt(TORONTO, 'x', i, j);
        if (mod(j, 5) === 0) {
          expect(seg?.bridge, `x ${i},${j}`).toBe(true);
          bridges++;
        } else expect(seg, `x ${i},${j}`).toBeNull();
      }
      if (isRiverBank(TORONTO, i, j)) {
        banks++;
        expect(blockDistrict(TORONTO, centre(i), centre(j))).toBe('park');
      }
    }
    expect(bridges).toBeGreaterThan(5);
    expect(banks).toBeGreaterThan(60);
  });

  it('lines the lakeshore with port (condos) from x = 0 to x = 1400 in the core, and all along beyond it', () => {
    for (let i = -10; i <= 12; i++) for (let j = 8; j <= 11; j++) {
      if (isWater(TORONTO, i, j) || isIsland(TORONTO, i, j)) continue;
      const x = centre(i), z = centre(j);
      const coast = coastDistance(TORONTO_LAKE, x, z);
      const want = coast >= 0 && coast <= PORT_DEPTH && x >= WATERFRONT.x0 && x <= WATERFRONT.x1;
      expect(districtAt(x, z) === 'port', `${x},${z}`).toBe(want);
    }
    expect(districtAt(6100, 2100)).toBe('port');
    expect(districtAt(-6100, 2100)).toBe('port');
  });

  it('fills behind and beside the crash with residential midtown, and never builds the crash site as park', () => {
    // Off the Yonge corridor (and in the crater, which the corridor skips) midtown is houses, some blocks parkettes.
    for (const [x, z] of [[-700, -1000], [-1500, 0], [900, -500], [-2000, -2000], [100, 100]] as const) expect(['residential', 'park'], `${x},${z}`).toContain(districtAt(x, z));
    expect(districtAt(100, 100)).toBe('residential');
    const W = CONFIG.world;
    for (let x = -1000; x <= 1000; x += 100) for (let z = -1000; z <= 1000; z += 100) {
      if (Math.hypot(x, z) < W.clearRadius + W.blockSize) expect(blockDistrict(TORONTO, x, z)).not.toBe('park');
    }
  });

  it('runs the Yonge tower corridor (|x| ≤ 300) from downtown (z 1000) north past the crash to z −6000: office and high-rise, the crater and Yonge-Dundas kept', () => {
    expect(YONGE_CORRIDOR).toEqual({ halfWidth: 300, z0: -6000, z1: 1000 });
    const crater = CONFIG.world.clearRadius + PITCH / 2;
    let checked = 0;
    for (let i = -2; i < 2; i++) for (let j = -30; j < 5; j++) {
      const x = centre(i), z = centre(j);
      const d = districtAt(x, z);
      if (Math.hypot(x, z) < crater) expect(d, `crater ${x},${z}`).toBe('residential');
      else if (x === YONGE_DUNDAS.x && z === YONGE_DUNDAS.z) expect(d).toBe('neon');
      else {
        expect(['office', 'highrise'], `${x},${z}`).toContain(d);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Beyond the core too, where noise would otherwise decide.
    for (const z of [-4500, -5100, -5500, -5900]) for (const x of [-300, -100, 100, 300]) expect(['office', 'highrise'], `${x},${z}`).toContain(districtAt(x, z));
  });

  it('raises three high-rise nodes on the corridor: Bloor-Yonge (z −1200), St. Clair (−2600) and Yonge-Eglinton (−4200, the largest)', () => {
    expect(YONGE_NODES.map((n) => n.name)).toEqual(['Bloor-Yonge', 'St. Clair', 'Yonge-Eglinton']);
    const blocks = YONGE_NODES.map((n) => {
      let count = 0, zs = 0;
      for (let i = -2; i < 2; i++) for (let j = -30; j < 5; j++) {
        const x = centre(i), z = centre(j);
        if (districtAt(x, z) !== 'highrise' || Math.abs(z - n.z) > 400) continue;
        count++;
        zs += z;
      }
      expect(Math.abs(zs / count - n.z), n.name).toBeLessThanOrEqual(150);
      const along = new Set<number>();
      for (let j = -30; j < 5; j++) if ([-2, -1, 0, 1].some((i) => districtAt(centre(i), centre(j)) === 'highrise' && Math.abs(centre(j) - n.z) <= 400)) along.add(j);
      expect(along.size, n.name).toBeGreaterThanOrEqual(2);
      expect(along.size, n.name).toBeLessThanOrEqual(3);
      return count;
    });
    expect(blocks[2]).toBeGreaterThan(Math.max(blocks[0]!, blocks[1]!));
    // Every other corridor block is office.
    let high = 0;
    for (let i = -2; i < 2; i++) for (let j = -30; j < 5; j++) if (districtAt(centre(i), centre(j)) === 'highrise') high++;
    expect(high).toBe(blocks[0]! + blocks[1]! + blocks[2]!);
  });

  it('forces nothing off the corridor: at x = ±1500 midtown stays houses and parkettes', () => {
    for (const x of [-1500, 1500]) for (let z = -3500; z <= 500; z += 200) expect(['residential', 'park'], `${x},${z}`).toContain(districtAt(x, z));
  });

  it('turns about one residential block in eight into a parkette, by a seeded hash, never in the crater', () => {
    let homes = 0, parkettes = 0;
    for (let i = -20; i < 20; i++) for (let j = -20; j < 11; j++) {
      const x = centre(i), z = centre(j);
      if (Math.hypot(x, z) > CORE_RADIUS || isWater(TORONTO, i, j) || isIsland(TORONTO, i, j)) continue;
      const d = districtAt(x, z);
      expect(districtAt(x, z)).toBe(d);
      if (d === 'residential') homes++;
      if (d === 'park') parkettes++;
      if (Math.hypot(x, z) < CONFIG.world.clearRadius + PITCH / 2) expect(d).not.toBe('park');
    }
    expect(homes).toBeGreaterThan(400);
    const share = parkettes / (homes + parkettes);
    expect(share).toBeGreaterThanOrEqual(0.08);
    expect(share).toBeLessThanOrEqual(0.17);
  });

  it('is deterministic', () => {
    for (const [x, z] of [[123, 456], [-9000, 12000], [40000, -3000]] as const) expect(districtAt(x, z)).toBe(districtAt(x, z));
  });

  it('beyond the core: mostly residential and office, with high-rise, park and port, and never neon', () => {
    const n: Record<DistrictId, number> = { highrise: 0, neon: 0, office: 0, residential: 0, park: 0, port: 0 };
    let total = 0;
    for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
      const x = -24000 + i * 400, z = -24000 + j * 400;
      if (Math.hypot(x, z) <= CORE_RADIUS) continue;
      const ci = Math.floor(x / PITCH), cj = Math.floor(z / PITCH);
      if (isWater(TORONTO, ci, cj) || isIsland(TORONTO, ci, cj)) continue;
      n[districtAt(x, z)]++;
      total++;
    }
    for (const d of DISTRICTS) if (d !== 'neon') expect(n[d], d).toBeGreaterThan(0);
    expect(n.neon).toBe(0);
    expect((n.residential + n.office) / total).toBeGreaterThan(0.6);
  });

  it('blockInterior and lotCentre match where generateChunk lays lots (avenue pavement included)', () => {
    expect(blockInterior(-1, 4)).toEqual({ x0: -182, x1: -36, z0: 818, z1: 964 });
    expect(blockInterior(-2, 7)).toEqual({ x0: -382, x1: -218, z0: 1418, z1: 1582 });
    expect(lotCentre(-2, 7, 2, 0, 0)).toEqual({ x: -341, z: 1459 });
    expect(lotCentre(-1, 4, 2, 1, 1)).toEqual({ x: -72.5, z: 927.5 });
  });
});
