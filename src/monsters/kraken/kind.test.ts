import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { KRAKEN } from './kind';

describe('KRAKEN kind', () => {
  it('uses its config stats and the many-armed kit', () => {
    expect(KRAKEN.stats).toEqual(CONFIG.kraken.stats);
    expect(KRAKEN.pips).toEqual({ toughness: 3, power: 4, speed: 3 });
    expect(KRAKEN.melee).toEqual({ kind: 'multi' });
    expect(KRAKEN.ranged).toBe('hurl');
    expect(KRAKEN.antiAir).toBe('lash');
    expect(KRAKEN.tailSweep).toBe(false);
    expect(KRAKEN.moves.map((m) => m.label)).toEqual(['Tentacle Slam', 'Hurl', 'Tentacle Lash']);
  });
  it('has its own named signatures — never the Insect\'s Brood Swarm or the Kaiju\'s Meltdown', () => {
    expect(KRAKEN.signatures).not.toContain('brood');
    expect(KRAKEN.signatures).not.toContain('meltdown');
    for (const id of KRAKEN.signatures) expect(KRAKEN.abilityText[id]?.title).toBeTruthy();
    expect(KRAKEN.signatures).toContain('grip');
    expect(KRAKEN.abilityText.grip?.title).toBe('Sucker Grip');
    expect(KRAKEN.abilityText.spines?.title).toBe('Ink Cloud');
    expect(KRAKEN.upgradeText.multiShot?.title).toBe('More Arms');
    expect(KRAKEN.fx.particle).toBe('ink');
    expect(KRAKEN.fx.intercept).toBe('ink');
  });
});
