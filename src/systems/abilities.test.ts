import { describe, it, expect } from 'vitest';
import { Abilities, armSlamCounts, autoStrikes, cameraFollowsWalk, dashDamage, ultimateBlocked, untouchable } from './abilities';
import { CONFIG } from '../config';

const A = CONFIG.abilities;

describe('Abilities', () => {
  it('cut takes seconds off each active cooldown, down to 0, and leaves the ultimate alone', () => {
    const a = new Abilities();
    a.setRank('dash', 1);
    a.setRank('ultimate', 1);
    a.trigger('leap');
    a.trigger('dash');
    a.cut(A.dash.cooldown * (A.rankCooldown[1] ?? 1) - 1);
    expect(a.ready('dash')).toBe(false);
    a.cut(1);
    expect(a.ready('dash')).toBe(true);
    a.cut(1e6);
    expect(a.ready('leap')).toBe(true);
    expect(a.ready('ultimate')).toBe(false);
    a.tick(0, CONFIG.ultimate.cooldown - 0.1);
    expect(a.ready('ultimate')).toBe(false);
  });

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

  it('a granted ultimate is ready at once', () => {
    const a = new Abilities();
    a.setRank('ultimate', 1);
    expect(a.ready('ultimate')).toBe(false);
    a.refill('ultimate');
    expect(a.ready('ultimate')).toBe(true);
    expect(a.trigger('ultimate')).toBe(true);
    expect(a.ready('ultimate')).toBe(false);
  });

  it('ultimate: owned only once ranked, starts on its full cooldown, recharges on plain time, ignoring the cooldown rate', () => {
    const a = new Abilities();
    expect(a.unlocked('ultimate')).toBe(false);
    a.setRank('ultimate', 1);
    expect(a.ready('ultimate')).toBe(false);
    a.tick(0, CONFIG.ultimate.cooldown);
    expect(a.ready('ultimate')).toBe(true);
    expect(a.trigger('ultimate')).toBe(true);
    a.tick(1000, CONFIG.ultimate.cooldown - 1);
    expect(a.ready('ultimate')).toBe(false);
    a.tick(0, 1.1);
    expect(a.ready('ultimate')).toBe(true);
  });

  it('views list the ultimate last', () => {
    const a = new Abilities();
    a.setRank('ultimate', 1);
    a.setRank('dash', 1);
    expect(a.view().map((v) => v.id)).toEqual(['leap', 'dash', 'ultimate']);
  });

  it('ultimate guards: free only while playing, alive and doing nothing that blocks it', () => {
    const ok = { playing: true, alive: true, airborne: false, dashing: false, snared: false, leveling: false, running: false };
    expect(ultimateBlocked(ok)).toBe(false);
    for (const k of ['airborne', 'dashing', 'snared', 'leveling', 'running'] as const) expect(ultimateBlocked({ ...ok, [k]: true })).toBe(true);
    for (const k of ['playing', 'alive'] as const) expect(ultimateBlocked({ ...ok, [k]: false })).toBe(true);
  });

  it('while an ultimate runs the monster is untouchable (no snare, no Laser Absorb spent), as under the bubble', () => {
    expect(untouchable(false, false)).toBe(false);
    expect(untouchable(true, false)).toBe(true);
    expect(untouchable(false, true)).toBe(true);
  });

  it("a tentacle slam does its damage unless an ultimate runs (Ink Storm's grab is only for show)", () => {
    expect(armSlamCounts(false)).toBe(true);
    expect(armSlamCounts(true)).toBe(false);
  });

  it("the body's automatic strikes (Tail Sweep, Snap Bite) hold off while an ultimate runs", () => {
    expect(autoStrikes(false)).toBe(true);
    expect(autoStrikes(true)).toBe(false);
  });

  it('walking swings the camera behind only when the player is not panning and no ultimate holds the camera', () => {
    expect(cameraFollowsWalk(false, false)).toBe(true);
    expect(cameraFollowsWalk(true, false)).toBe(false);
    expect(cameraFollowsWalk(false, true)).toBe(false);
  });
});

describe('dashDamage', () => {
  it('kills an ordinary target outright', () => {
    expect(dashDamage({}, false, new Set(), 500)).toBe(1e9);
  });

  it('hits a boss once per dash however many frames it overlaps', () => {
    const boss = {};
    const hit = new Set<object>();
    let total = 0;
    for (let i = 0; i < 60; i++) total += dashDamage(boss, true, hit, 500 * 2);
    expect(total).toBe(1000);
  });

  it('hits the boss again on a new dash', () => {
    const boss = {};
    const hit = new Set<object>();
    expect(dashDamage(boss, true, hit, 500)).toBe(500);
    hit.clear();
    expect(dashDamage(boss, true, hit, 500)).toBe(500);
  });
});
