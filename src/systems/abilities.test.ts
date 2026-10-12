import { describe, it, expect } from 'vitest';
import { Abilities } from './abilities';
import { CONFIG } from '../config';

const A = CONFIG.abilities;

describe('Abilities', () => {
  it('unlocks leap from level 1 and roar at its unlock level', () => {
    const a = new Abilities();
    expect(a.unlocked('leap', 1)).toBe(true);
    expect(a.unlocked('roar', A.roar.unlockLevel - 1)).toBe(false);
    expect(a.unlocked('roar', A.roar.unlockLevel)).toBe(true);
    expect(a.trigger('roar', 1)).toBe(false);
  });

  it('starts cooldowns on trigger and becomes ready again after them', () => {
    const a = new Abilities();
    expect(a.trigger('leap', 1)).toBe(true);
    expect(a.ready('leap', 1)).toBe(false);
    expect(a.trigger('leap', 1)).toBe(false);
    a.tick(A.leap.cooldown / 2);
    expect(a.view(1).find((v) => v.id === 'leap')!.cdFrac).toBeCloseTo(0.5);
    a.tick(A.leap.cooldown / 2 + 0.01);
    expect(a.ready('leap', 1)).toBe(true);
  });

  it('toggles leap aim only when leap is ready; triggering leap ends aiming', () => {
    const a = new Abilities();
    expect(a.toggleAim(1)).toBe(true);
    expect(a.aiming).toBe(true);
    expect(a.toggleAim(1)).toBe(false);
    a.toggleAim(1);
    a.trigger('leap', 1);
    expect(a.aiming).toBe(false);
    expect(a.toggleAim(1)).toBe(false);
  });

  it('cancelAim and reset clear state', () => {
    const a = new Abilities();
    a.toggleAim(1);
    a.cancelAim();
    expect(a.aiming).toBe(false);
    a.trigger('leap', 1);
    a.reset();
    expect(a.ready('leap', 1)).toBe(true);
  });
});
