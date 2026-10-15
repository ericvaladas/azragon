import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  NET_N, NET_SEGMENTS, blendGrid, carriedGrid, domeGrid, domeRadius, dropAltitude, dropOutcome, gridSegments, groundGrid,
  netCorners, netHalf, newGrid, newSquad, positionDone, slotOffset, squadGone, startLeave, stepSquad, type MonsterInfo,
} from './ospreyMath';

const O = CONFIG.osprey;
const DT = 0.05;
const at = (i: number, j: number) => i + j * (NET_N + 1);
const mon = (x = 0, z = 0): MonsterInfo => ({ x, z, height: 385, bodyRadius: 84 });

describe('squad flight', () => {
  it('spawns spawnDist from the monster at cruise altitude, tight, pods forward, heading at it', () => {
    const s = newSquad({ x: 100, z: -50 }, Math.PI / 2);
    expect(Math.hypot(s.x - 100, s.z + 50)).toBeCloseTo(O.spawnDist, 6);
    expect(s.y).toBe(O.cruiseAltitude);
    expect(s.half).toBe(O.tightHalf);
    expect(s.tilt).toBe(0);
    expect(s.phase).toBe('approach');
    expect(Math.sin(s.yaw)).toBeCloseTo((100 - s.x) / O.spawnDist, 6);
  });

  it('approach follows a moving monster and switches to positioning within arriveDist', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    let mx = 0;
    for (let t = 0; t < 30 && s.phase === 'approach'; t += DT) {
      mx += 60 * DT;
      stepSquad(s, DT, mon(mx, 0));
    }
    expect(s.phase).toBe('position');
    expect(Math.hypot(s.x - mx, s.z)).toBeLessThanOrEqual(O.arriveDist + O.cruiseSpeed * DT);
  });

  it('positions: sinks to the drop altitude, widens to the net, swivels the pods up, then is done', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (s.phase === 'approach') stepSquad(s, DT, mon());
    for (let t = 0; t < O.positionTime * O.settleFrac + DT; t += DT) stepSquad(s, DT, mon());
    expect(s.y).toBeCloseTo(dropAltitude(385), 0);
    expect(s.half).toBeCloseTo(netHalf(84), 0);
    expect(s.tilt).toBeCloseTo(Math.PI / 2, 3);
    expect(positionDone(s)).toBe(false);
    for (let t = 0; t < O.positionTime; t += DT) stepSquad(s, DT, mon());
    expect(positionDone(s)).toBe(true);
  });

  it('keeps its centre over a monster walking away while positioning', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (s.phase === 'approach') stepSquad(s, DT, mon());
    let mx = 0;
    for (let t = 0; t < O.positionTime; t += DT) {
      mx += 100 * DT;
      stepSquad(s, DT, mon(mx, 0));
    }
    expect(Math.hypot(s.x - mx, s.z)).toBeLessThan(20);
  });

  it('leaves: flies straight on, climbs back, closes up, tilts the pods forward, and is gone past exitDist', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (!positionDone(s)) stepSquad(s, DT, mon());
    const yaw = s.yaw;
    startLeave(s, { x: 0, z: 0 });
    expect(s.phase).toBe('leave');
    let t = 0;
    for (; t < 40 && !squadGone(s, { x: 0, z: 0 }); t += DT) stepSquad(s, DT, mon());
    expect(squadGone(s, { x: 0, z: 0 })).toBe(true);
    expect(s.yaw).toBe(yaw);
    expect(s.y).toBe(O.cruiseAltitude);
    expect(s.half).toBe(O.tightHalf);
    expect(s.tilt).toBe(0);
  });

  it('an exit started away from the monster turns straight away from it', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    stepSquad(s, DT, mon());
    startLeave(s, { x: 0, z: 0 });
    expect(Math.sin(s.yaw) * s.x + Math.cos(s.yaw) * s.z).toBeGreaterThan(0);
    const d0 = Math.hypot(s.x, s.z);
    stepSquad(s, 1, mon());
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(d0 + O.cruiseSpeed, 3);
  });

  it('releases with 3 or 4 alive and aborts with 2 or fewer', () => {
    expect([4, 3, 2, 1, 0].map(dropOutcome)).toEqual(['release', 'release', 'abort', 'abort', 'abort']);
  });
});

describe('formation and net', () => {
  it('puts the four slots at the corners of a square, slot 0 front-left (+x, +z) at yaw 0', () => {
    expect(slotOffset(0, 10, 0)).toEqual({ x: 10, z: 10 });
    expect(slotOffset(2, 10, 0)).toEqual({ x: -10, z: -10 });
    const r = slotOffset(1, 10, Math.PI / 2);
    // Yawed a quarter turn, front-right (-x, +z) swings to (+x, +z) in world space.
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.z).toBeCloseTo(10, 6);
  });

  it('hangs corners a cable below each Osprey; a lost corner droops between its neighbours', () => {
    const c = netCorners([{ x: 10, y: 500, z: 10 }, null, { x: -10, y: 500, z: -10 }, { x: 10, y: 500, z: -10 }], 10);
    expect(c[0]).toEqual({ x: 10, y: 500 - O.cable, z: 10 });
    expect(c[1]!.x).toBeCloseTo(0, 6);
    expect(c[1]!.z).toBeCloseTo(0, 6);
    expect(c[1]!.y).toBeCloseTo(500 - O.cable - 10 * O.droop, 6);
  });

  it('sizes the drop and the dome from the monster', () => {
    expect(dropAltitude(385)).toBe(385 + O.dropClearance);
    expect(netHalf(84)).toBeCloseTo(84 * O.netHalfMult, 6);
    expect(domeRadius(84, 180)).toBeCloseTo(84 * O.domeRadiusMult, 6);
    expect(domeRadius(90, 689)).toBeCloseTo(689 * O.domeWidthMult, 6);
  });

  it('carried grid spans the corners and sags in the middle', () => {
    const c = [{ x: 10, y: 100, z: 10 }, { x: -10, y: 100, z: 10 }, { x: -10, y: 100, z: -10 }, { x: 10, y: 100, z: -10 }];
    const g = newGrid();
    carriedGrid(c, 5, g);
    expect(g[at(0, 0)]).toEqual(c[0]);
    expect(g[at(NET_N, 0)]).toEqual(c[1]);
    expect(g[at(NET_N, NET_N)]).toEqual(c[2]);
    expect(g[at(0, NET_N)]).toEqual(c[3]);
    const mid = g[at(NET_N / 2, NET_N / 2)]!;
    expect(mid.y).toBeCloseTo(95, 6);
    expect(mid.x).toBeCloseTo(0, 6);
  });

  it('dome peaks over the centre at the given height and meets the ground at its rim', () => {
    const g = newGrid();
    domeGrid(50, 0, -20, 100, 300, g);
    const top = g[at(NET_N / 2, NET_N / 2)]!;
    expect(top).toEqual({ x: 50, y: 300, z: -20 });
    const corner = g[at(0, 0)]!;
    expect(corner.y).toBeCloseTo(0, 6);
    expect(Math.hypot(corner.x - 50, corner.z + 20)).toBeCloseTo(100, 6);
  });

  it('ground grid lies flat at groundY, a square of the given half-width', () => {
    const g = newGrid();
    groundGrid(0, 0, 20, 0, g);
    for (const p of g) expect(p.y).toBe(O.groundY);
    expect(g[at(0, 0)]).toEqual({ x: 20, y: O.groundY, z: 20 });
  });

  it('blends grids point by point and writes line segments for every row and column', () => {
    const a = newGrid();
    const b = newGrid();
    for (const p of b) p.y = 10;
    const out = newGrid();
    blendGrid(a, b, 0.25, out);
    expect(out[0]!.y).toBeCloseTo(2.5, 6);
    expect(NET_SEGMENTS).toBe(2 * NET_N * (NET_N + 1));
    const buf = new Float32Array(NET_SEGMENTS * 6);
    groundGrid(0, 0, 20, 0, out);
    gridSegments(out, buf);
    // First segment: row 0 from point (0,0) to (1,0).
    expect([buf[0], buf[1], buf[2]]).toEqual([out[0]!.x, out[0]!.y, out[0]!.z]);
    expect([buf[3], buf[4], buf[5]]).toEqual([out[1]!.x, out[1]!.y, out[1]!.z]);
  });
});
