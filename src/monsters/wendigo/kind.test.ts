import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { WENDIGO } from './kind';
import { KAIJU } from '../kaiju/kind';

describe('WENDIGO kind (the Wendigo)', () => {
  it('uses its config stats: the toughest, hardest-hitting and slowest monster', () => {
    expect(WENDIGO.stats).toEqual(CONFIG.wendigo.stats);
    expect(WENDIGO.stats.maxHp).toBeGreaterThan(KAIJU.stats.maxHp);
    expect(WENDIGO.stats.damageMult).toBeGreaterThan(KAIJU.stats.damageMult);
    expect(WENDIGO.stats.moveSpeed).toBeLessThan(CONFIG.kraken.stats.moveSpeed);
    expect(WENDIGO.pips).toEqual({ toughness: 5, power: 4, speed: 2 });
    expect(WENDIGO.name).toBe('Wendigo');
  });
  it('claws, burns ground targets with its gaze and drags flyers down with shadow hands', () => {
    expect(WENDIGO.melee).toEqual({ kind: 'fist' });
    expect(WENDIGO.ranged).toBe('gaze');
    expect(WENDIGO.antiAir).toBe('hands');
    expect(WENDIGO.tailSweep).toBe(false);
    expect(WENDIGO.moves.map((m) => m.label)).toEqual(['Rending Claws', 'Dread Gaze']);
  });
  it('has the shared signatures under the plain names, with its own descriptions', () => {
    for (const id of WENDIGO.signatures) expect(WENDIGO.abilityText[id]?.title).toBeUndefined();
    expect(WENDIGO.abilityText.mortar?.desc(1)).toMatch(/black fire/);
    expect(WENDIGO.fx.particle).toBe('rot');
    expect(WENDIGO.fx.intercept).toBe('bone');
  });
  it('never mentions magma, lava, vents, embers or any fire but black fire in any text the player reads', () => {
    const texts = [
      WENDIGO.name,
      WENDIGO.blurb,
      ...WENDIGO.moves.map((m) => m.label),
      ...Object.values(WENDIGO.abilityText).flatMap((a) => [a.title ?? '', a.desc(1), a.desc(2)]),
      ...Object.values(WENDIGO.upgradeText).flatMap((u) => [u.title ?? '', u.desc ?? '']),
    ];
    for (const t of texts) expect(t).not.toMatch(/magma|lava|(?<!black )fire|vent|ember|molten|heat|burn/i);
  });

  it('swings its backhand on its own slower, heavier timeline; slams keep the kind\'s', () => {
    const S = CONFIG.wendigo.stats.meleeTiming;
    const B = CONFIG.wendigo.fist.backhandTiming;
    expect(B.windup).toBeGreaterThan(S.windup);
    expect(B.impact - B.windup).toBeGreaterThan(S.impact - S.windup);
    expect(B.end - B.impact).toBeGreaterThan(S.end - S.impact);
  });
});

