import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { GOLEM } from './kind';
import { KAIJU } from '../kaiju/kind';

describe('GOLEM kind (the Wendigo)', () => {
  it('uses its config stats: the toughest, hardest-hitting and slowest monster', () => {
    expect(GOLEM.stats).toEqual(CONFIG.golem.stats);
    expect(GOLEM.stats.maxHp).toBeGreaterThan(KAIJU.stats.maxHp);
    expect(GOLEM.stats.damageMult).toBeGreaterThan(KAIJU.stats.damageMult);
    expect(GOLEM.stats.moveSpeed).toBeLessThan(CONFIG.kraken.stats.moveSpeed);
    expect(GOLEM.pips).toEqual({ toughness: 5, power: 4, speed: 2 });
    expect(GOLEM.name).toBe('Wendigo');
  });
  it('claws, burns ground targets with its gaze and drags flyers down with shadow hands', () => {
    expect(GOLEM.melee).toEqual({ kind: 'fist' });
    expect(GOLEM.ranged).toBe('gaze');
    expect(GOLEM.antiAir).toBe('hands');
    expect(GOLEM.tailSweep).toBe(false);
    expect(GOLEM.moves.map((m) => m.label)).toEqual(['Rending Claws', 'Dread Gaze', 'Shadow Hands']);
  });
  it('has its own named signatures with Ravenous Hunger — never Brood Swarm, Meltdown or Sucker Grip', () => {
    for (const id of ['brood', 'meltdown', 'grip'] as const) expect(GOLEM.signatures).not.toContain(id);
    expect(GOLEM.signatures).toContain('core');
    for (const id of GOLEM.signatures) expect(GOLEM.abilityText[id]?.title).toBeTruthy();
    expect(GOLEM.abilityText.core?.title).toBe('Ravenous Hunger');
    expect(GOLEM.abilityText.acid?.title).toBe('Blighted Tracks');
    expect(GOLEM.abilityText.spines?.title).toBe('Bone Ward');
    expect(GOLEM.abilityText.swat?.title).toBe('Shadow Hands+');
    expect(GOLEM.upgradeText.multiShot?.title).toBe('Twin Curse');
    expect(GOLEM.abilityText.mortar?.title).toBe('Evil Eye');
    expect(GOLEM.fx.particle).toBe('rot');
    expect(GOLEM.fx.intercept).toBe('bone');
  });
  it('never mentions magma, lava, vents, embers or any fire but black fire in any text the player reads', () => {
    const texts = [
      GOLEM.name,
      GOLEM.blurb,
      ...GOLEM.moves.map((m) => m.label),
      ...Object.values(GOLEM.abilityText).flatMap((a) => [a.title, a.desc(1), a.desc(2)]),
      ...Object.values(GOLEM.upgradeText).flatMap((u) => [u.title, u.desc ?? '']),
    ];
    for (const t of texts) expect(t).not.toMatch(/magma|lava|(?<!black )fire|vent|ember|molten|heat|burn/i);
  });

  it('swings its backhand on its own slower, heavier timeline; slams keep the kind\'s', () => {
    const S = CONFIG.golem.stats.meleeTiming;
    const B = CONFIG.golem.fist.backhandTiming;
    expect(S).toEqual({ windup: 0.3, impact: 0.45, end: 0.85 });
    // Old backhand (the shared timeline): coil 0.30, sweep 0.15, follow-through and settle 0.40, 0.85 in all.
    expect(B.windup / S.windup).toBeGreaterThanOrEqual(1.15);
    expect((B.impact - B.windup) / (S.impact - S.windup)).toBeGreaterThanOrEqual(1.35);
    expect((B.impact - B.windup) / (S.impact - S.windup)).toBeLessThanOrEqual(1.45);
    expect((B.end - B.impact) / (S.end - S.impact)).toBeGreaterThanOrEqual(1.35);
    expect(B.end / S.end).toBeGreaterThanOrEqual(1.33);
    expect(B.end / S.end).toBeLessThanOrEqual(1.42);
    expect(B.impact - S.impact).toBeLessThanOrEqual(0.13);
  });
});

