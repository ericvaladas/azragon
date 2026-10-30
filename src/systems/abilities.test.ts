import { describe, it, expect } from 'vitest';
import { Abilities } from './abilities';
import { CONFIG } from '../config';

const A = CONFIG.abilities;

describe('Abilities', () => {
  it('starts with only Leap; Dash and Roar come from level-up picks', () => {
    const a = new Abilities();
    expect(a.unlocked('leap')).toBe(true);
    expect(a.unlocked('dash')).toBe(false);
    expect(a.unlocked('roar')).toBe(false);
    expect(a.trigger('roar')).toBe(false);
    a.setRank('roar', 1);
    expect(a.unlocked('roar')).toBe(true);
    expect(a.trigger('roar')).toBe(true);
  });

  it('starts cooldowns on trigger and becomes ready again after them', () => {
    const a = new Abilities();
    expect(a.trigger('leap')).toBe(true);
    expect(a.ready('leap')).toBe(false);
    expect(a.trigger('leap')).toBe(false);
    a.tick(A.leap.cooldown / 2);
    expect(a.view().find((v) => v.id === 'leap')!.cdFrac).toBeCloseTo(0.5);
    a.tick(A.leap.cooldown / 2 + 0.01);
    expect(a.ready('leap')).toBe(true);
  });

  it('higher ranks shorten the cooldown', () => {
    const a = new Abilities();
    a.setRank('dash', 1);
    a.trigger('dash');
    a.tick(A.dash.cooldown * A.rankCooldown[3]! + 0.01);
    expect(a.ready('dash')).toBe(false);
    a.reset();
    a.setRank('dash', 3);
    a.trigger('dash');
    a.tick(A.dash.cooldown * A.rankCooldown[3]! + 0.01);
    expect(a.ready('dash')).toBe(true);
  });

  it('only Leap aims; pressing Leap again cancels', () => {
    const a = new Abilities();
    expect(a.toggleAim('leap')).toBe('leap');
    expect(a.toggleAim('leap')).toBeNull();
  });

  it('firing Dash cancels a pending Leap aim', () => {
    const a = new Abilities();
    a.setRank('dash', 1);
    a.toggleAim('leap');
    expect(a.trigger('dash')).toBe(true);
    expect(a.aiming).toBeNull();
  });

  it('triggering the aimed ability ends aiming; aim needs the ability ready', () => {
    const a = new Abilities();
    a.toggleAim('leap');
    a.trigger('leap');
    expect(a.aiming).toBeNull();
    expect(a.toggleAim('leap')).toBeNull();
  });

  it('reset clears cooldowns, aim, and Dash/Roar ownership', () => {
    const a = new Abilities();
    a.setRank('roar', 2);
    a.trigger('leap');
    a.toggleAim('leap');
    a.reset();
    expect(a.ready('leap')).toBe(true);
    expect(a.aiming).toBeNull();
    expect(a.unlocked('roar')).toBe(false);
  });

  it('views list owned abilities only, in button order', () => {
    const a = new Abilities();
    expect(a.view().map((v) => v.id)).toEqual(['leap']);
    a.setRank('roar', 1);
    a.setRank('dash', 1);
    expect(a.view().map((v) => v.id)).toEqual(['leap', 'dash', 'roar']);
    a.setRank('bubble', 1);
    expect(a.view().map((v) => v.id)).toEqual(['leap', 'dash', 'roar', 'bubble']);
  });

  it('Shield Bubble recharges over its rank duration plus cooldown, counted from when it goes up', () => {
    const B = CONFIG.passives.bubble;
    const a = new Abilities();
    expect(a.trigger('bubble')).toBe(false);
    a.setRank('bubble', 1);
    expect(a.trigger('bubble')).toBe(true);
    a.tick(B.duration[1]! + B.cooldown[1]! - 0.1);
    expect(a.ready('bubble')).toBe(false);
    a.tick(0.2);
    expect(a.ready('bubble')).toBe(true);
  });
});
