import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TOKYO } from '../cities/tokyo';
import type { CityStyle } from '../cities/types';
import { isBay, isRiver, isWater, lineWidth, PITCH } from '../world/roads';
import { SEA_WALL_SIZE } from '../world/chunks';
import { PRESETS } from './Particles';
import { Splasher, SPLASH_PER_FRAME } from './splash';

const stub = () => {
  const out = { emitted: 0, rings: 0 };
  return {
    out,
    fx: {
      emit: (_k: string, _at: THREE.Vector3, n: number) => void (out.emitted += n),
      ring: (_k: string, _c: THREE.Vector3, _r: number, n: number) => void (out.rings += n),
    },
  };
};
const water = new THREE.Vector3(0, 0, 1300);
const land = new THREE.Vector3(0, 0, 0);

describe('splash preset', () => {
  it('is white, short-lived, thrown upward and pulled back down, shrinking 18 -> 6', () => {
    const s = PRESETS.splash;
    expect(s.color).toBe(0xf4f8fb);
    expect(s.life).toBeCloseTo(0.9);
    expect(s.up).toBeGreaterThan(200);
    expect(s.gravity).toBeGreaterThan(0);
    expect([s.size0, s.size1]).toEqual([18, 6]);
  });
});

describe('Splasher', () => {
  it('fixtures: the water point is water and the land point is land', () => {
    expect(isWater(TOKYO, Math.floor(water.x / PITCH), Math.floor(water.z / PITCH))).toBe(true);
    expect(isWater(TOKYO, 0, 0)).toBe(false);
  });
  it('emits spray and a ring over water, nothing over land', () => {
    const { out, fx } = stub();
    const sp = new Splasher(() => TOKYO, fx);
    expect(sp.at(land)).toBe(false);
    expect(out).toEqual({ emitted: 0, rings: 0 });
    expect(sp.at(water)).toBe(true);
    expect(out.emitted).toBeGreaterThan(0);
    expect(out.rings).toBeGreaterThan(0);
  });
  it('never emits more than the per-frame budget over 100 calls, and gets it back next frame', () => {
    const { out, fx } = stub();
    const sp = new Splasher(() => TOKYO, fx);
    for (let i = 0; i < 100; i++) sp.at(water, 3);
    expect(out.emitted + out.rings).toBeLessThanOrEqual(SPLASH_PER_FRAME);
    expect(out.emitted + out.rings).toBe(SPLASH_PER_FRAME);
    sp.newFrame();
    const before = out.emitted + out.rings;
    sp.at(water);
    expect(out.emitted + out.rings).toBeGreaterThan(before);
  });
  it('splashes a footprint only when it touches water, at a water point', () => {
    const { out, fx } = stub();
    const sp = new Splasher(() => TOKYO, fx);
    expect(sp.footprint(0, 0, 40)).toBe(false);
    expect(out.emitted).toBe(0);
    expect(sp.footprint(0, 1300 - 150, 40)).toBe(false);
    expect(sp.footprint(0, 1300 - 90, 100)).toBe(true);
    expect(out.emitted).toBeGreaterThan(0);
  });
  it('ignores the coast road and sea wall: nothing within half the edge line\'s width plus the wall of a land edge', () => {
    // Cell (0, 6) is bay and (0, 5) land: the shore edge is the line z = 1200.
    expect(isWater(TOKYO, 0, 5)).toBe(false);
    const margin = lineWidth(6) / 2 + SEA_WALL_SIZE.thick;
    const { out, fx } = stub();
    const sp = new Splasher(() => TOKYO, fx);
    expect(sp.at(new THREE.Vector3(100, 0, 1200 + margin - 2))).toBe(false);
    expect(out.emitted).toBe(0);
    expect(sp.at(new THREE.Vector3(100, 0, 1200 + margin + 2))).toBe(true);
  });
  it('ignores a river bank\'s road the same way, on either bank', () => {
    let checked = 0;
    for (let ci = -20; ci < 20 && checked < 4; ci++) {
      for (let cj = -20; cj < 20; cj++) {
        if (!isRiver(TOKYO, ci, cj) || isBay(TOKYO, ci, cj)) continue;
        for (const [dj, edge] of [[-1, cj], [1, cj + 1]] as const) {
          if (isWater(TOKYO, ci, cj + dj)) continue;
          const margin = lineWidth(edge) / 2 + SEA_WALL_SIZE.thick;
          const x = PITCH * ci + PITCH / 2;
          const sp = new Splasher(() => TOKYO, stub().fx);
          expect(sp.at(new THREE.Vector3(x, 0, PITCH * edge - dj * (margin - 2)))).toBe(false);
          expect(sp.at(new THREE.Vector3(x, 0, PITCH * edge - dj * (margin + 2)))).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('Splasher on a north–south river', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130 }, bay: undefined, island: undefined };
  it('splashes mid-channel, and not on the bank road along the x line at its west edge', () => {
    let ci = 0;
    while (!(isRiver(NS, ci, 0) && !isRiver(NS, ci - 1, 0))) ci++;
    const { out, fx } = stub();
    const sp = new Splasher(() => NS, fx);
    expect(sp.at(new THREE.Vector3(PITCH * (ci + 0.5), 0, PITCH * 0.5))).toBe(true);
    expect(out.emitted).toBeGreaterThan(0);
    sp.newFrame();
    const margin = lineWidth(ci) / 2 + SEA_WALL_SIZE.thick;
    expect(sp.at(new THREE.Vector3(PITCH * ci + margin - 2, 0, PITCH * 0.5))).toBe(false);
    expect(sp.at(new THREE.Vector3(PITCH * ci + margin + 2, 0, PITCH * 0.5))).toBe(true);
  });
});
