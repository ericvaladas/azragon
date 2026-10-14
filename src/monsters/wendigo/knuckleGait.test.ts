import { describe, it, expect } from 'vitest';
import { LIMBS, SWING, limbPlanted, limbSwing } from './knuckleGait';

describe('knuckle-walk gait', () => {
  it('has four limbs in planting order: left fist, right foot, right fist, left foot', () => {
    expect(LIMBS.map((l) => `${l.kind}${l.side}`)).toEqual(['fist0', 'foot1', 'fist1', 'foot0']);
  });

  it('plants every limb exactly once per cycle, a quarter cycle apart, in LIMBS order', () => {
    const plants: { i: number; c: number }[] = [];
    const N = 2000;
    for (let k = 0; k < N; k++) {
      const prev = 0.0005 + k / N;
      const cur = 0.0005 + (k + 1) / N;
      for (let i = 0; i < 4; i++) if (limbPlanted(prev, cur, i)) plants.push({ i, c: cur });
    }
    expect(plants.map((p) => p.i).sort()).toEqual([0, 1, 2, 3]);
    const start = plants.findIndex((p) => p.i === 0);
    const cyclic = [...plants.slice(start), ...plants.slice(0, start)].map((p) => p.i);
    expect(cyclic).toEqual([0, 1, 2, 3]);
    const at = (i: number) => plants.find((p) => p.i === i)!.c;
    expect(((at(1) - at(0) + 1) % 1)).toBeCloseTo(0.25, 2);
  });

  it('never reports a plant when the cycle did not advance', () => {
    expect(limbPlanted(0.39, 0.39, 0)).toBe(false);
    expect(limbPlanted(0.41, 0.39, 0)).toBe(false);
  });

  it('lifts only while swinging, landing at the front of its stride', () => {
    expect(limbSwing(SWING / 2, 0).lift).toBeCloseTo(1);
    expect(limbSwing(SWING - 1e-6, 0).stride).toBeCloseTo(1, 4);
    expect(limbSwing(SWING + 0.1, 0).lift).toBe(0);
    expect(limbSwing(0, 0).stride).toBeCloseTo(-1);
  });

  it('keeps a planted limb still in the world: stride × half-span + cycle × stride length is constant in stance', () => {
    const S = 340;
    const A = ((1 - SWING) * S) / 2;
    const world = (c: number) => limbSwing(c, 0).stride * A + c * S;
    expect(world(0.5)).toBeCloseTo(world(0.9), 6);
  });
});
