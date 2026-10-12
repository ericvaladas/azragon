import { describe, it, expect } from 'vitest';
import { healOnKill, regen } from './vitals';

describe('regen', () => {
  it('heals over time up to max', () => {
    expect(regen(500, 1000, 4, 1)).toBe(504);
    expect(regen(999, 1000, 4, 1)).toBe(1000);
  });
  it('never revives a monster at 0 HP (death must be observable after regen)', () => {
    expect(regen(0, 1000, 4, 0.016)).toBe(0);
    expect(regen(-5, 1000, 4, 0.016)).toBe(0);
  });
});

describe('healOnKill', () => {
  it('heals a living monster up to max', () => {
    expect(healOnKill(500, 1000, 6, true)).toBe(506);
    expect(healOnKill(998, 1000, 6, true)).toBe(1000);
  });
  it('never heals a dead monster (no HP shown while it collapses)', () => {
    expect(healOnKill(0, 1000, 6, false)).toBe(0);
  });
});
