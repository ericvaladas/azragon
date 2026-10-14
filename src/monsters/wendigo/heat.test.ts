import { describe, it, expect } from 'vitest';
import { auraOn, coolHeat, coreDamageMult, heatAfterHit } from './heat';

describe('Ravenous Hunger heat', () => {
  it('heats in proportion to the hit\'s share of max HP, capped at 1', () => {
    expect(heatAfterHit(0, 100, 1000, 4)).toBeCloseTo(0.4);
    expect(heatAfterHit(0.8, 100, 1000, 4)).toBe(1);
    expect(heatAfterHit(0.2, -50, 1000, 4)).toBeCloseTo(0.2);
  });

  it('cools over time and never drops below 0', () => {
    expect(coolHeat(0.5, 1, 0.12)).toBeCloseTo(0.38);
    expect(coolHeat(0.05, 1, 0.12)).toBe(0);
  });

  it('adds damage with heat and burns only from the threshold up', () => {
    expect(coreDamageMult(0, 0.3)).toBe(1);
    expect(coreDamageMult(1, 0.3)).toBeCloseTo(1.3);
    expect(coreDamageMult(0.5, 0.6)).toBeCloseTo(1.3);
    expect(auraOn(0.49, 0.5)).toBe(false);
    expect(auraOn(0.5, 0.5)).toBe(true);
  });
});
