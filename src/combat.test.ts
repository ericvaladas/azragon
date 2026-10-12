import { describe, it, expect } from 'vitest';
import { resolveHit } from './combat';

const base = { dmgMult: 1.5, deflectChance: 0.3, airborne: false };

describe('resolveHit', () => {
  it('scales damage by the difficulty multiplier', () => {
    expect(resolveHit(10, 'laser', base, 0.99)).toEqual({ damage: 15, deflected: false });
  });
  it('lets area attacks (laser, artillery) miss an airborne monster, but not projectiles', () => {
    const air = { ...base, airborne: true };
    expect(resolveHit(10, 'laser', air, 0.99).damage).toBe(0);
    expect(resolveHit(10, 'artillery', air, 0.99).damage).toBe(0);
    expect(resolveHit(10, 'shell', air, 0.99).damage).toBe(15);
  });
  it('deflects projectiles and blimp blasts when the roll is under the chance; never lasers', () => {
    expect(resolveHit(10, 'rocket', base, 0.29)).toEqual({ damage: 0, deflected: true });
    expect(resolveHit(10, 'blimp', base, 0.29).deflected).toBe(true);
    expect(resolveHit(10, 'rocket', base, 0.3).deflected).toBe(false);
    expect(resolveHit(10, 'laser', base, 0).deflected).toBe(false);
    expect(resolveHit(10, 'artillery', base, 0).deflected).toBe(false);
  });
  it('deals nothing while invulnerable (Shield Bubble), from any source', () => {
    for (const src of ['shell', 'rocket', 'missile', 'blimp', 'artillery', 'laser'] as const) {
      expect(resolveHit(10, src, { ...base, invulnerable: true }, 0.99)).toEqual({ damage: 0, deflected: false });
    }
  });
});
