import { describe, it, expect } from 'vitest';
import { Abilities } from './abilities';
import { CONFIG } from '../config';

const A = CONFIG.abilities;

describe('Abilities', () => {
  it('unlocks leap at 1, dash at its level, roar at its level', () => {
    const a = new Abilities();
    expect(a.unlocked('leap', 1)).toBe(true);
    expect(a.unlocked('dash', A.dash.unlockLevel - 1)).toBe(false);
    expect(a.unlocked('dash', A.dash.unlockLevel)).toBe(true);
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

  it('aims leap or dash, one at a time; pressing the same button again cancels', () => {
    const a = new Abilities();
    const L = A.dash.unlockLevel;
    expect(a.toggleAim('leap', L)).toBe('leap');
    expect(a.toggleAim('dash', L)).toBe('dash');
    expect(a.aiming).toBe('dash');
    expect(a.toggleAim('dash', L)).toBeNull();
    expect(a.toggleAim('dash', 1)).toBeNull();
  });

  it('triggering the aimed ability ends aiming; aim needs the ability ready', () => {
    const a = new Abilities();
    a.toggleAim('leap', 1);
    a.trigger('leap', 1);
    expect(a.aiming).toBeNull();
    expect(a.toggleAim('leap', 1)).toBeNull();
  });

  it('cancelAim and reset clear state', () => {
    const a = new Abilities();
    a.toggleAim('leap', 1);
    a.cancelAim();
    expect(a.aiming).toBeNull();
    a.trigger('leap', 1);
    a.reset();
    expect(a.ready('leap', 1)).toBe(true);
  });

  it('views only list unlocked abilities, in button order', () => {
    const a = new Abilities();
    expect(a.view(1).map((v) => v.id)).toEqual(['leap']);
    expect(a.view(A.roar.unlockLevel).map((v) => v.id)).toEqual(['leap', 'dash', 'roar']);
  });
});
