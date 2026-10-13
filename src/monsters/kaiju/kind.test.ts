import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { KAIJU } from './kind';
import { INSECT } from '../insect/kind';

describe('KAIJU kind', () => {
  it('is tougher and harder-hitting but slower than the Insect', () => {
    expect(KAIJU.stats).toEqual(CONFIG.kaiju.stats);
    expect(KAIJU.stats.maxHp).toBeGreaterThan(INSECT.stats.maxHp);
    expect(KAIJU.stats.damageMult).toBeGreaterThan(INSECT.stats.damageMult);
    expect(KAIJU.stats.moveSpeed).toBeLessThan(INSECT.stats.moveSpeed);
    expect(KAIJU.stats.turnRate).toBeLessThan(INSECT.stats.turnRate);
    expect(KAIJU.pips).toEqual({ toughness: 4, power: 4, speed: 2 });
  });
  it('rakes, breathes, and bites', () => {
    expect(KAIJU.melee).toEqual({ kind: 'arc', halfAngle: CONFIG.kaiju.rakeHalfAngle });
    expect(KAIJU.ranged).toBe('breath');
    expect(KAIJU.antiAir).toBe('bite');
  });
  it('has its own signatures and names; never the Insect-only Brood Swarm', () => {
    expect(KAIJU.signatures).not.toContain('brood');
    expect(KAIJU.signatures).toContain('meltdown');
    for (const id of KAIJU.signatures) expect(KAIJU.abilityText[id]?.title).toBeTruthy();
    expect(KAIJU.abilityText.acid?.title).toBe('Radiant Wake');
    expect(KAIJU.upgradeText.vitality?.title).toBe('Ironscale Hide');
    expect(KAIJU.upgradeText.multiShot?.title).toBe('Wide Sweep');
  });
});
