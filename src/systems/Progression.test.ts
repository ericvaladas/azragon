import { describe, it, expect } from 'vitest';
import { Progression, expToNext, UPGRADES, BASE_STATS } from './Progression';
import { mulberry32 } from '../util/rng';

describe('expToNext', () => {
  it('follows expBase * level^expExponent, rounded', () => {
    expect(expToNext(1)).toBe(40);
    expect(expToNext(2)).toBe(102);
    expect(expToNext(5)).toBeGreaterThan(expToNext(4));
  });
});

describe('Progression', () => {
  it('carries leftover EXP and queues one offer per level gained', () => {
    const p = new Progression(mulberry32(1));
    const gained = p.addExp(40 + 102 + 5);
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.exp).toBe(5);
    expect(p.pendingLevels).toBe(2);
  });

  it('offers 3 distinct upgrades from the pool', () => {
    const p = new Progression(mulberry32(2));
    const ids = p.offer().map((o) => o.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(Object.keys(UPGRADES)).toContain(id);
  });

  it('applies and stacks choices, consuming pending levels', () => {
    const p = new Progression(mulberry32(3));
    p.addExp(40 + 102);
    expect(p.choose('damage')).toBe(true);
    expect(p.choose('damage')).toBe(true);
    expect(p.stats.damageMult).toBeCloseTo(1.44);
    expect(p.pendingLevels).toBe(0);
  });

  it('ignores choices with no pending level or unknown ids (double-tap safe)', () => {
    const p = new Progression(mulberry32(4));
    expect(p.choose('damage')).toBe(false);
    p.addExp(40);
    expect(p.choose('nope')).toBe(false);
    expect(p.pendingLevels).toBe(1);
  });

  it('reset returns to level 1 with base stats', () => {
    const p = new Progression(mulberry32(5));
    p.addExp(500);
    p.choose('regen');
    p.reset();
    expect(p.level).toBe(1);
    expect(p.exp).toBe(0);
    expect(p.pendingLevels).toBe(0);
    expect(p.stats).toEqual(BASE_STATS);
  });

  it('rejects a pick made against a superseded offer (double-tap safe across levels)', () => {
    const p = new Progression(mulberry32(6));
    p.addExp(40 + 102);
    const first = p.offer();
    const firstSeq = p.offerSeq;
    expect(p.choose(first[0]!.id, firstSeq)).toBe(true);
    p.offer();
    expect(p.choose(first[1]!.id, firstSeq)).toBe(false);
    expect(p.pendingLevels).toBe(1);
    expect(p.choose(first[1]!.id, p.offerSeq)).toBe(true);
  });
});
