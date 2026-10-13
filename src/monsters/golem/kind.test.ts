import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { GOLEM } from './kind';
import { KAIJU } from '../kaiju/kind';

describe('GOLEM kind', () => {
  it('uses its config stats: the toughest, hardest-hitting and slowest monster', () => {
    expect(GOLEM.stats).toEqual(CONFIG.golem.stats);
    expect(GOLEM.stats.maxHp).toBeGreaterThan(KAIJU.stats.maxHp);
    expect(GOLEM.stats.damageMult).toBeGreaterThan(KAIJU.stats.damageMult);
    expect(GOLEM.stats.moveSpeed).toBeLessThan(CONFIG.kraken.stats.moveSpeed);
    expect(GOLEM.pips).toEqual({ toughness: 5, power: 4, speed: 2 });
    expect(GOLEM.name).toBe('Magma Golem');
  });
  it('punches, lobs magma and vents at flyers', () => {
    expect(GOLEM.melee).toEqual({ kind: 'fist' });
    expect(GOLEM.ranged).toBe('lob');
    expect(GOLEM.antiAir).toBe('geyser');
    expect(GOLEM.tailSweep).toBe(false);
    expect(GOLEM.moves.map((m) => m.label)).toEqual(['Molten Fist', 'Magma Lob', 'Vent Burst']);
  });
  it('has its own named signatures with Molten Core — never Brood Swarm, Meltdown or Sucker Grip', () => {
    for (const id of ['brood', 'meltdown', 'grip'] as const) expect(GOLEM.signatures).not.toContain(id);
    expect(GOLEM.signatures).toContain('core');
    for (const id of GOLEM.signatures) expect(GOLEM.abilityText[id]?.title).toBeTruthy();
    expect(GOLEM.abilityText.core?.title).toBe('Molten Core');
    expect(GOLEM.abilityText.acid?.title).toBe('Lava Footprints');
    expect(GOLEM.abilityText.spines?.title).toBe('Vent Flak');
    expect(GOLEM.upgradeText.multiShot?.title).toBe('Twin Vents');
    expect(GOLEM.fx.particle).toBe('magma');
    expect(GOLEM.fx.intercept).toBe('magma');
  });
});
