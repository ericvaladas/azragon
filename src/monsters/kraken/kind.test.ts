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
    expect(KRAKEN.moves.map((m) => m.label)).toEqual(['Tentacle Slam', 'Hurl']);
  });
  it('has its own signatures (shared plain names, its own descriptions) — never the Insect\'s Brood Swarm or the Kaiju\'s Meltdown', () => {
    expect(KRAKEN.signatures).not.toContain('brood');
    expect(KRAKEN.signatures).not.toContain('meltdown');
    for (const id of KRAKEN.signatures) expect(KRAKEN.abilityText[id]?.title).toBeUndefined();
    expect(KRAKEN.signatures).toContain('grip');
    expect(KRAKEN.upgradeText.multiShot?.desc).toBe('+1 hurled chunk per throw');
    expect(KRAKEN.fx.particle).toBe('ink');
    expect(KRAKEN.fx.intercept).toBe('ink');
  });
});
