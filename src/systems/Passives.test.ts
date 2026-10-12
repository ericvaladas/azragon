import { describe, it, expect } from 'vitest';
import { Passives } from './Passives';
import type { AbilityId } from './Progression';
import { CONFIG } from '../config';

const P = CONFIG.passives;
const ranks = (r: Partial<Record<AbilityId, number>>) => () => ({ acid: 0, storm: 0, chitin: 0, frenzy: 0, brood: 0, thrash: 0, spines: 0, swat: 0, nova: 0, mortar: 0, bubble: 0, reflect: 0, ...r });

describe('Passives', () => {
  it('has no effect at rank 0', () => {
    const p = new Passives(ranks({}));
    expect(p.tetherMult()).toBe(1);
    expect(p.thrashDamage()).toBe(0);
    expect(p.deflectChance()).toBe(0);
    expect(p.frenzyHeal()).toBe(0);
    expect(p.acidPool()).toBeNull();
    expect(p.update(100)).toEqual({ storm: 0, brood: 0, nova: 0, mortar: 0, intercepts: 0 });
  });

  it('scales simple passives by rank', () => {
    const p = new Passives(ranks({ chitin: 3, frenzy: 2, thrash: 2, acid: 3 }));
    expect(p.deflectChance()).toBeCloseTo(0.45);
    expect(p.frenzyHeal()).toBe(12);
    expect(p.tetherMult()).toBe(P.thrash.tetherMult[2]);
    expect(p.thrashDamage()).toBe(P.thrash.damage);
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
});
