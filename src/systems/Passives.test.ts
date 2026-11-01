import { describe, it, expect } from 'vitest';
import { Passives } from './Passives';
import type { AbilityId } from './Progression';
import { CONFIG } from '../config';

const P = CONFIG.passives;
const ranks = (r: Partial<Record<AbilityId, number>>) => () => ({ dash: 0, roar: 0, storm: 0, chitin: 0, overload: 0, spines: 0, swat: 0, nova: 0, mortar: 0, bubble: 0, reflect: 0, core: 0, ...r });

describe('Passives', () => {
  it('has no effect at rank 0', () => {
    const p = new Passives(ranks({}));
    expect(p.tryOverload()).toBe(false);
    expect(p.deflectChance()).toBe(0);
    expect(p.update(100)).toEqual({ storm: 0, nova: 0, mortar: 0, intercepts: 0 });
  });

  it('scales simple passives by rank', () => {
    const p = new Passives(ranks({ chitin: 3 }));
    expect(p.deflectChance()).toBeCloseTo(0.45);
  });

  it('runs interval timers faster at a higher cooldown rate (Haste When Hurt)', () => {
    const p = new Passives(ranks({ storm: 1 }));
    expect(p.update(P.storm.interval / 2 + 0.01, 1, 2).storm).toBe(P.storm.spikes);
  });

  it('fires Spike Storm on its interval with rank-scaled spike counts', () => {
    const p = new Passives(ranks({ storm: 2 }));
    const interval = P.storm.interval - P.storm.intervalStep;
    expect(p.update(interval - 0.1).storm).toBe(0);
    expect(p.update(0.2).storm).toBe(P.storm.spikes + P.storm.extraSpikes);
    expect(p.update(interval - 0.3).storm).toBe(0);
  });

  it('reset restarts timers', () => {
    const p = new Passives(ranks({ storm: 1 }));
    p.update(P.storm.interval - 0.5);
    p.reset();
    expect(p.update(1).storm).toBe(0);
  });

  it('has no anti-air until it is picked, then improves it per rank', () => {
    expect(new Passives(ranks({})).swat()).toBeNull();
    const r1 = new Passives(ranks({ swat: 1 })).swat();
    expect(r1).toEqual({ cooldown: P.swat.cooldown[1], range: P.swat.range[1], damage: P.swat.damage[1], targets: 1 });
    const r3 = new Passives(ranks({ swat: 3 })).swat();
    expect(r3!.cooldown).toBeLessThan(r1!.cooldown);
    expect(r3!.targets).toBe(P.swat.targets[3]);
  });

  it("a built-in tail swat (the Insect) works from the start at rank-1 strength, whatever Anti-Air's rank", () => {
    const r1 = { cooldown: P.swat.cooldown[1], range: P.swat.range[1], damage: P.swat.damage[1], targets: P.swat.targets[1] };
    expect(new Passives(ranks({})).swat(true)).toEqual(r1);
    expect(new Passives(ranks({ swat: 3 })).swat(true)).toEqual(r1);
  });

  it("Anti-Air spikes: none until picked; then the tail may shoot aircraft, harder and faster per rank", () => {
    expect(new Passives(ranks({})).antiAirSpikes()).toBeNull();
    const r1 = new Passives(ranks({ swat: 1 })).antiAirSpikes()!;
    expect(r1).toEqual({ damageMult: 1, cooldownMult: 1 });
    const r3 = new Passives(ranks({ swat: 3 })).antiAirSpikes()!;
    expect(r3.damageMult).toBeGreaterThan(r1.damageMult);
    expect(r3.cooldownMult).toBeLessThan(r1.cooldownMult);
  });

  it('fires Venom Nova on its rank interval with rank radius and damage', () => {
    const p = new Passives(ranks({ nova: 2 }));
    expect(p.update(P.nova.interval[2]! - 0.1).nova).toBe(0);
    expect(p.update(0.2).nova).toBe(1);
    expect(p.nova()).toEqual({ radius: P.nova.radius[2], damage: P.nova.damage[2] });
  });

  it('fires Acid Mortar volleys with rank glob counts', () => {
    const p = new Passives(ranks({ mortar: 3 }));
    expect(p.update(P.mortar.interval[3]! + 0.01).mortar).toBe(P.mortar.globs[3]);
  });

  it('accumulates Spine Shield intercepts at the rank rate', () => {
    const p = new Passives(ranks({ spines: 1 }));
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const n = p.update(0.02).intercepts;
      total += n;
      p.spendIntercepts(n);
    }
    expect(total).toBe(Math.floor(2 * P.spines.rate[1]!));
    expect(p.spineRadius()).toBe(P.spines.radius[1]);
  });

  it('scales the intercept rate for a kind (Kraken Ink Cloud fires far less often), still firing at rank 1', () => {
    const p = new Passives(ranks({ spines: 1 }));
    const k = 1 / 3;
    let shots = 0;
    for (let i = 0; i < 1500; i++) {
      const n = p.update(0.02, k).intercepts;
      shots += n;
      p.spendIntercepts(n);
    }
    // 30 s at a third of rank 1's rate.
    expect(shots).toBeGreaterThanOrEqual(Math.floor(30 * P.spines.rate[1]! * k) - 1);
    expect(shots).toBeLessThanOrEqual(Math.ceil(30 * P.spines.rate[1]! * k));
    // A slowed rate still banks a whole shot.
    expect(p.update(10, k).intercepts).toBe(1);
  });
  it('banks at most one second of intercepts while nothing needs shooting down', () => {
    const p = new Passives(ranks({ spines: 3 }));
    expect(p.update(10).intercepts).toBe(Math.floor(P.spines.rate[3]!));
  });

  it('Reflect Shield only triggers when taken, ready, and something is about to hit', () => {
    expect(new Passives(ranks({})).tryReflect(true)).toBe(false);
    const p = new Passives(ranks({ reflect: 1 }));
    expect(p.tryReflect(false)).toBe(false);
    expect(p.tryReflect(true)).toBe(true);
    expect(p.reflectActive()).toBe(true);
    expect(p.tryReflect(true)).toBe(false);
  });

  it('Reflect Shield lasts its rank duration, then waits out its cooldown', () => {
    const p = new Passives(ranks({ reflect: 1 }));
    p.tryReflect(true);
    p.update(P.reflect.duration[1]! + 0.01);
    expect(p.reflectActive()).toBe(false);
    expect(p.tryReflect(true)).toBe(false);
    p.update(P.reflect.cooldown[1]!);
    expect(p.tryReflect(true)).toBe(true);
  });

  it('Shield Bubble goes up only when taken, and lasts its rank duration', () => {
    const none = new Passives(ranks({}));
    none.startBubble();
    expect(none.bubbleActive()).toBe(false);
    const p = new Passives(ranks({ bubble: 2 }));
    p.startBubble();
    expect(p.bubbleActive()).toBe(true);
    p.update(P.bubble.duration[2]! + 0.01);
    expect(p.bubbleActive()).toBe(false);
  });

  it('Overload absorbs one beam hit, then waits out its rank cooldown', () => {
    const p = new Passives(ranks({ overload: 1 }));
    expect(p.tryOverload()).toBe(true);
    expect(p.tryOverload()).toBe(false);
    p.update(P.overload.cooldown[1]! - 0.1);
    expect(p.tryOverload()).toBe(false);
    p.update(0.2);
    expect(p.tryOverload()).toBe(true);
  });
});

describe('core', () => {
  it('Haste When Hurt: off at rank 0, then a growing cooldown haste per rank', () => {
    expect(new Passives(ranks({})).core()).toBeNull();
    const c1 = new Passives(ranks({ core: 1 })).core()!;
    const c3 = new Passives(ranks({ core: 3 })).core()!;
    expect(c1).toEqual({ haste: P.core.haste[1] });
    expect(c3.haste).toBeGreaterThan(c1.haste);
  });
});
