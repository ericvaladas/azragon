import { describe, it, expect } from 'vitest';
import { coolHeat, coreCooldownRate, heatAfterHit } from './heat';

describe('Haste When Hurt heat', () => {
  it('heats in proportion to the hit\'s share of max HP, capped at 1', () => {
    expect(heatAfterHit(0, 100, 1000, 4)).toBeCloseTo(0.4);
    expect(heatAfterHit(0.8, 100, 1000, 4)).toBe(1);
    expect(heatAfterHit(0.2, -50, 1000, 4)).toBeCloseTo(0.2);
  });

  it('cools over time and never drops below 0', () => {
    expect(coolHeat(0.5, 1, 0.12)).toBeCloseTo(0.38);
    expect(coolHeat(0.05, 1, 0.12)).toBe(0);
  });

  it('speeds cooldowns with heat', () => {
    expect(coreCooldownRate(0, 0.5)).toBe(1);
    expect(coreCooldownRate(1, 0.5)).toBeCloseTo(1.5);
    expect(coreCooldownRate(0.5, 1)).toBeCloseTo(1.5);
  });
});
