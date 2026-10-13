import { describe, it, expect } from 'vitest';
import { Passives } from './Passives';
import type { AbilityId } from './Progression';
import { CONFIG } from '../config';

const P = CONFIG.passives;
const ranks = (r: Partial<Record<AbilityId, number>>) => () => ({ dash: 0, roar: 0, acid: 0, storm: 0, chitin: 0, frenzy: 0, brood: 0, overload: 0, spines: 0, swat: 0, nova: 0, mortar: 0, bubble: 0, reflect: 0, meltdown: 0, grip: 0, core: 0, ...r });

describe('Passives', () => {
  it('has no effect at rank 0', () => {
    const p = new Passives(ranks({}));
    expect(p.tryOverload()).toBe(false);
    expect(p.deflectChance()).toBe(0);
    expect(p.frenzyHeal()).toBe(0);
    expect(p.acidPool()).toBeNull();
    expect(p.update(100)).toEqual({ storm: 0, brood: 0, nova: 0, mortar: 0, intercepts: 0 });
  });

  it('scales simple passives by rank', () => {
    const p = new Passives(ranks({ chitin: 3, frenzy: 2, acid: 3 }));
    expect(p.deflectChance()).toBeCloseTo(0.45);
    expect(p.frenzyHeal()).toBe(12);
    expect(p.acidPool()).toEqual({ radius: P.acid.radius * (1 + 2 * P.acid.radiusPerRank), life: P.acid.life + 2 * P.acid.lifePerRank });
  });

  it('fires Spike Storm on its interval with rank-scaled spike counts', () => {
    const p = new Passives(ranks({ storm: 2 }));
    const interval = P.storm.interval - P.storm.intervalStep;
    expect(p.update(interval - 0.1).storm).toBe(0);
    expect(p.update(0.2).storm).toBe(P.storm.spikes + P.storm.extraSpikes);
    expect(p.update(interval - 0.3).storm).toBe(0);
  });

  it('releases Brood Swarm drones on its interval', () => {
    const p = new Passives(ranks({ brood: 1 }));
    expect(p.update(P.brood.interval + 0.01).brood).toBe(P.brood.drones);
  });

  it('reset restarts timers', () => {
    const p = new Passives(ranks({ storm: 1 }));
    p.update(P.storm.interval - 0.5);
    p.reset();
    expect(p.update(1).storm).toBe(0);
  });

  it('gives the base-kit Tail Swat at rank 0 and improves it per rank', () => {
    const base = new Passives(ranks({}));
    expect(base.swat()).toEqual({ cooldown: P.swat.cooldown[0], range: P.swat.range[0], damage: P.swat.damage[0], targets: 1 });
    const r3 = new Passives(ranks({ swat: 3 }));
    expect(r3.swat().cooldown).toBeLessThan(P.swat.cooldown[0]!);
    expect(r3.swat().targets).toBe(P.swat.targets[3]);
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

  it('banks at most one second of intercepts while nothing needs shooting down', () => {
    const p = new Passives(ranks({ spines: 3 }));
    expect(p.update(10).intercepts).toBe(Math.floor(P.spines.rate[3]!));
  });

  it('auto-shields only trigger when taken, ready, and something is about to hit', () => {
    expect(new Passives(ranks({})).tryShields(true)).toEqual({ bubble: false, reflect: false });
    const p = new Passives(ranks({ bubble: 1, reflect: 1 }));
    expect(p.tryShields(false)).toEqual({ bubble: false, reflect: false });
    expect(p.tryShields(true)).toEqual({ bubble: true, reflect: true });
    expect(p.bubbleActive()).toBe(true);
    expect(p.reflectActive()).toBe(true);
    expect(p.tryShields(true)).toEqual({ bubble: false, reflect: false });
  });

  it('shields last their rank duration, then wait out their cooldown', () => {
    const p = new Passives(ranks({ bubble: 1 }));
    p.tryShields(true);
    p.update(P.bubble.duration[1]! + 0.01);
    expect(p.bubbleActive()).toBe(false);
    expect(p.tryShields(true).bubble).toBe(false);
    p.update(P.bubble.cooldown[1]!);
    expect(p.tryShields(true).bubble).toBe(true);
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

describe('meltdown', () => {
  it('kicks in below the rank\'s HP threshold only', () => {
    const r1 = new Passives(ranks({ meltdown: 1 }));
    expect(r1.meltdown(0.29)).toEqual({ active: true, damage: CONFIG.passives.meltdown.damageMult, cooldown: CONFIG.passives.meltdown.cooldownMult });
    expect(r1.meltdown(0.31).active).toBe(false);
    expect(r1.meltdown(0).active).toBe(false);
    expect(new Passives(ranks({})).meltdown(0.1)).toEqual({ active: false, damage: 1, cooldown: 1 });
    expect(new Passives(ranks({ meltdown: 3 })).meltdown(0.45).active).toBe(true);
  });
});

describe('grip', () => {
  it('Sucker Grip: off at rank 0, then a growing radius and damage per rank', () => {
    expect(new Passives(ranks({})).grip()).toBeNull();
    const g1 = new Passives(ranks({ grip: 1 })).grip()!;
    const g3 = new Passives(ranks({ grip: 3 })).grip()!;
    expect(g1).toEqual({ radius: CONFIG.passives.grip.radius[1], damage: CONFIG.passives.grip.damage[1] });
    expect(g3.radius).toBeGreaterThan(g1.radius);
    expect(g3.damage).toBeGreaterThan(g1.damage);
  });
});

describe('core', () => {
  it('Ravenous Hunger: off at rank 0, then a growing damage bonus, aura radius and wither per rank', () => {
    expect(new Passives(ranks({})).core()).toBeNull();
    const c1 = new Passives(ranks({ core: 1 })).core()!;
    const c3 = new Passives(ranks({ core: 3 })).core()!;
    expect(c1).toEqual({ bonus: P.core.bonus[1], radius: P.core.radius[1], dps: P.core.dps[1] });
    expect(c3.bonus).toBeGreaterThan(c1.bonus);
    expect(c3.radius).toBeGreaterThan(c1.radius);
    expect(c3.dps).toBeGreaterThan(c1.dps);
  });
});
