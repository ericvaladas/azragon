import { describe, it, expect } from 'vitest';
import { bossExp } from './cycle';
import { Progression, expToNext } from './Progression';
import { mulberry32 } from '../util/rng';

describe('bossExp', () => {
  it('bossExp tops the bar up to exactly one level', () => {
    const p = new Progression(mulberry32(1));
    p.level = 4;
    p.exp = 10;
    expect(p.addExp(bossExp(4, 10))).toBe(1);
    expect(p.level).toBe(5);
    expect(p.exp).toBe(0);
  });

  it('bossExp is at least 1', () => {
    expect(bossExp(4, expToNext(4))).toBe(1);
    expect(bossExp(4, expToNext(4) + 50)).toBe(1);
  });
});
