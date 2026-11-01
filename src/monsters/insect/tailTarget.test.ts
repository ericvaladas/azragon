import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { inTailReach, TailTargeting, tailWant } from './tailTarget';

const M = CONFIG.monster;
const O = { x: 0, z: 0 };
const at = (bearing: number, r = 500) => ({ x: Math.sin(bearing) * r, z: Math.cos(bearing) * r });
const target = (alive = true): Target & { kill(): void } => {
  let a = alive;
  return { isAlive: () => a, kill: () => (a = false) } as unknown as Target & { kill(): void };
};

describe('inTailReach', () => {
  it('the tail reaches all round except a cone straight behind the Insect', () => {
    expect(inTailReach(O, 0, at(0))).toBe(true);
    expect(inTailReach(O, 0, at(1.5))).toBe(true);
    expect(inTailReach(O, 0, at(-1.5))).toBe(true);
    expect(inTailReach(O, 0, at(Math.PI))).toBe(false);
    expect(inTailReach(O, 0, at(Math.PI - M.spikeBlindHalf + 0.05))).toBe(false);
    expect(inTailReach(O, 0, at(Math.PI - M.spikeBlindHalf - 0.05))).toBe(true);
    expect(M.spikeBlindHalf).toBeGreaterThanOrEqual(0.7);
  });

  it('measures from the facing, wrapping round', () => {
    expect(inTailReach(O, 3.0, at(3.0))).toBe(true);
    expect(inTailReach(O, 3.0, at(3.0 - Math.PI))).toBe(false);
  });
});

describe('TailTargeting', () => {
  it('takes its first target at once', () => {
    const t = new TailTargeting();
    const a = target();
    expect(t.update(a, 1 / 60)).toBe(a);
  });

  it('keeps its target while it is still wanted', () => {
    const t = new TailTargeting();
    const a = target();
    t.update(a, 1 / 60);
    for (let i = 0; i < 100; i++) expect(t.update(a, 1 / 60)).toBe(a);
  });

  it('switching targets: lets go, waits spikeRetarget, then takes the next', () => {
    const t = new TailTargeting();
    const a = target();
    const b = target();
    t.update(a, 1 / 60);
    let time = 0;
    let got: Target | null = null;
    while (got !== b && time < 5) {
      got = t.update(b, 1 / 60);
      time += 1 / 60;
      if (got !== b) expect(got).toBeNull();
    }
    expect(got).toBe(b);
    expect(time).toBeGreaterThanOrEqual(M.spikeRetarget - 1e-9);
    expect(time).toBeLessThan(M.spikeRetarget + 2 / 60);
  });

  it('a target that dies is let go at once, and the next waits spikeRetarget', () => {
    const t = new TailTargeting();
    const a = target();
    const b = target();
    t.update(a, 1 / 60);
    a.kill();
    expect(t.update(b, 1 / 60)).toBeNull();
    let time = 1 / 60;
    while (t.update(b, 1 / 60) !== b) time += 1 / 60;
    expect(time).toBeGreaterThanOrEqual(M.spikeRetarget - 1 / 60);
  });

  it('with nothing wanted it lets go; reset clears the wait', () => {
    const t = new TailTargeting();
    const a = target();
    t.update(a, 1 / 60);
    expect(t.update(null, 1 / 60)).toBeNull();
    t.reset();
    expect(t.update(a, 1 / 60)).toBe(a);
  });
});

describe('tailWant', () => {
  const valid = (t: Target) => t.isAlive();
  it('stays on its current target while it is still valid, even when another is nearer', () => {
    const cur = target();
    const near = target();
    expect(tailWant(cur, null, near, valid)).toBe(cur);
  });

  it('takes the nearest once the current is no longer valid', () => {
    const cur = target(false);
    const near = target();
    expect(tailWant(cur, null, near, valid)).toBe(near);
    expect(tailWant(null, null, near, valid)).toBe(near);
  });

  it('an ordered target comes first', () => {
    const cur = target();
    const ordered = target();
    expect(tailWant(cur, ordered, target(), valid)).toBe(ordered);
  });
});
