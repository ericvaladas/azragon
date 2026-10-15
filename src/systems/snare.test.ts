import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { Snare } from './snare';

const S = CONFIG.snare;

/** Advances in 0.1 s steps; returns how many updates reported the end. */
function run(s: Snare, seconds: number): number {
  let ends = 0;
  for (let t = 0; t < seconds - 1e-9; t += 0.1) if (s.update(0.1)) ends++;
  return ends;
}

describe('Snare', () => {
  it('is inactive until started, with no slow and no mobility block', () => {
    const s = new Snare();
    expect(s.active).toBe(false);
    expect(s.speedMult).toBe(1);
    expect(s.blocksMobility).toBe(false);
    expect(s.update(1)).toBe(false);
  });

  it('slows and blocks mobility for its full duration, then reports the end once', () => {
    const s = new Snare();
    s.start(S.duration);
    expect(s.active).toBe(true);
    expect(s.speedMult).toBe(S.speedMult);
    expect(s.blocksMobility).toBe(true);
    expect(run(s, S.duration - 0.2)).toBe(0);
    expect(s.active).toBe(true);
    expect(run(s, 0.4)).toBe(1);
    expect(s.active).toBe(false);
    expect(s.speedMult).toBe(1);
    expect(run(s, 2)).toBe(0);
  });

  it('each attack takes perAttack off the remaining time', () => {
    const s = new Snare();
    s.start(S.duration);
    s.onAttack();
    s.onAttack();
    expect(run(s, S.duration - 2 * S.perAttack - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('never ends sooner than minDuration after it started, however many attacks', () => {
    const s = new Snare();
    s.start(S.duration);
    for (let i = 0; i < 20; i++) s.onAttack();
    expect(run(s, S.minDuration - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('attacks after minDuration end it on the next update, reported once', () => {
    const s = new Snare();
    s.start(S.duration);
    run(s, S.minDuration + 0.5);
    for (let i = 0; i < 20; i++) s.onAttack();
    expect(s.active).toBe(true);
    expect(s.update(0.01)).toBe(true);
    expect(s.update(0.01)).toBe(false);
    expect(s.active).toBe(false);
  });

  it('start resets rather than stacks', () => {
    const s = new Snare();
    s.start(S.duration);
    run(s, 4);
    s.start(S.duration);
    expect(run(s, S.duration - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('clear ends it silently', () => {
    const s = new Snare();
    s.start(S.duration);
    s.clear();
    expect(s.active).toBe(false);
    expect(s.update(0.1)).toBe(false);
  });

  it('ignores attacks while inactive', () => {
    const s = new Snare();
    s.onAttack();
    expect(s.active).toBe(false);
  });
});
