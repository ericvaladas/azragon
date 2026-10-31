import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { KAIJU } from './kind';
import { INSECT } from '../insect/kind';

describe('KAIJU kind', () => {
  it('is tougher and harder-hitting than the Insect, but turns slower', () => {
    expect(KAIJU.stats).toEqual(CONFIG.kaiju.stats);
    expect(KAIJU.stats.maxHp).toBeGreaterThan(INSECT.stats.maxHp);
    expect(KAIJU.stats.damageMult).toBeGreaterThan(INSECT.stats.damageMult);
    expect(KAIJU.stats.turnRate).toBeLessThan(INSECT.stats.turnRate);
    expect(KAIJU.pips).toEqual({ toughness: 4, power: 4, speed: 3 });
  });
  it('sweeps its tail; the Insect does not', () => {
    expect(KAIJU.tailSweep).toBe(true);
    expect(INSECT.tailSweep).toBe(false);
    expect(KAIJU.moves.map((m) => m.label)).toContain('Tail Sweep');
  });
  it('rakes, breathes, and bites', () => {
    expect(KAIJU.melee).toEqual({ kind: 'arc', halfAngle: CONFIG.kaiju.rakeHalfAngle });
    expect(KAIJU.ranged).toBe('breath');
    expect(KAIJU.antiAir).toBe('bite');
  });
  it("the Kaiju's ultimate is Plasma Lance", () => {
    expect(KAIJU.ultimate).toEqual({ id: 'plasmaLance', label: 'Plasma Lance' });
  });
  it('has its own descriptions for the signatures under the shared plain names', () => {
    for (const id of KAIJU.signatures) expect(KAIJU.abilityText[id]?.title).toBeUndefined();
    expect(KAIJU.upgradeText.multiShot?.desc).toBe('Breath fires +1 extra beam');
  });
});
