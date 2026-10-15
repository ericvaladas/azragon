import { describe, it, expect } from 'vitest';
import { Progression, expToNext, UPGRADES, BASE_STATS } from './Progression';
import { ABILITIES, MAX_RANK, SHARED_ABILITIES, type AbilityId, type PoolSpec } from './Progression';

import { mulberry32 } from '../util/rng';

describe('expToNext', () => {
  it('follows expBase * level^expExponent, rounded, with the first three levels 25% steeper (25, 73, 137, then 171, ...)', () => {
    expect([1, 2, 3, 4].map(expToNext)).toEqual([25, 73, 137, 171]);
    for (let l = 1; l < 15; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
  });
});

describe('Progression', () => {
  it('carries leftover EXP and queues one offer per level gained', () => {
    const p = new Progression(mulberry32(1));
    const gained = p.addExp(expToNext(1) + expToNext(2) + 5);
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.exp).toBe(5);
    expect(p.pendingLevels).toBe(2);
  });

  it('offers 3 distinct upgrades from the pool', () => {
    const p = new Progression(mulberry32(2));
    const ids = p.offer().map((o) => o.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect([...Object.keys(UPGRADES), ...Object.keys(ABILITIES)]).toContain(id);
  });

  it('applies and stacks choices, consuming pending levels', () => {
    const p = new Progression(mulberry32(3));
    p.addExp(expToNext(1) + expToNext(2));
    expect(p.choose('damage')).toBe(true);
    expect(p.choose('damage')).toBe(true);
    expect(p.stats.damageMult).toBeCloseTo(1.44);
    expect(p.pendingLevels).toBe(0);
  });

  it('ignores choices with no pending level or unknown ids (double-tap safe)', () => {
    const p = new Progression(mulberry32(4));
    expect(p.choose('damage')).toBe(false);
    p.addExp(expToNext(1));
    expect(p.choose('nope')).toBe(false);
    expect(p.pendingLevels).toBe(1);
  });

  it('reset returns to level 1 with base stats', () => {
    const p = new Progression(mulberry32(5));
    p.addExp(500);
    p.choose('regen');
    p.reset();
    expect(p.level).toBe(1);
    expect(p.exp).toBe(0);
    expect(p.pendingLevels).toBe(0);
    expect(p.stats).toEqual(BASE_STATS);
  });

  it('rejects a pick made against a superseded offer (double-tap safe across levels)', () => {
    const p = new Progression(mulberry32(6));
    p.addExp(expToNext(1) + expToNext(2));
    const first = p.offer();
    const firstSeq = p.offerSeq;
    expect(p.choose(first[0]!.id, firstSeq)).toBe(true);
    p.offer();
    expect(p.choose(first[1]!.id, firstSeq)).toBe(false);
    expect(p.pendingLevels).toBe(1);
    expect(p.choose(first[1]!.id, p.offerSeq)).toBe(true);
  });
});


describe('Progression abilities', () => {
  const isAbility = (id: string) => id in ABILITIES;

  it('ranks abilities up on choose and shows the next rank on the card', () => {
    const p = new Progression(mulberry32(7));
    p.addExp(expToNext(1));
    expect(p.choose('acid')).toBe(true);
    expect(p.ranks.acid).toBe(1);
    p.addExp(expToNext(2));
    for (let i = 0; i < 50; i++) {
      const offer = p.offer().find((o) => o.id === 'acid');
      if (offer) {
        expect(offer.title).toBe(`${ABILITIES.acid.title} II`);
        return;
      }
    }
    throw new Error('acid never offered');
  });

  it('never offers an ability at max rank', () => {
    const p = new Progression(mulberry32(8));
    for (let i = 0; i < MAX_RANK; i++) {
      p.addExp(expToNext(p.level));
      p.choose('storm');
    }
    expect(p.ranks.storm).toBe(MAX_RANK);
    p.addExp(expToNext(p.level));
    for (let i = 0; i < 200; i++) expect(p.offer().map((o) => o.id)).not.toContain('storm');
    expect(p.choose('storm')).toBe(false);
  });

  it('includes at least one ability in each of the first three offers', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = new Progression(mulberry32(seed));
      for (let pick = 0; pick < 3; pick++) {
        p.addExp(expToNext(p.level));
        const offers = p.offer();
        expect(offers.some((o) => isAbility(o.id))).toBe(true);
        p.choose(offers.find((o) => !isAbility(o.id))?.id ?? offers[0]!.id, p.offerSeq);
      }
    }
  });

  it('always offers three distinct ids, even with every ability maxed', () => {
    const p = new Progression(mulberry32(9));
    for (const id of Object.keys(ABILITIES) as AbilityId[]) p.ranks[id] = MAX_RANK;
    p.addExp(expToNext(1));
    for (let i = 0; i < 100; i++) {
      const ids = p.offer().map((o) => o.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids.some(isAbility)).toBe(false);
    }
  });

  it('reset clears ranks', () => {
    const p = new Progression(mulberry32(10));
    p.addExp(expToNext(1));
    p.choose('frenzy');
    p.reset();
    expect(p.ranks.frenzy).toBe(0);
  });
});

describe('Progression pools', () => {
  const pool: PoolSpec = {
    signatures: ['acid', 'nova'],
    abilityText: { acid: { title: 'Radiant Wake', desc: () => 'glow' } },
    upgradeText: { vitality: { title: 'Ironscale Hide' } },
  };

  it('offers only the shared abilities, the pool\'s signatures, and stat upgrades', () => {
    const p = new Progression(mulberry32(11));
    p.setPool(pool);
    const allowed = new Set<string>([...SHARED_ABILITIES, 'acid', 'nova', 'damage', 'attackSpeed', 'vitality', 'regen', 'stompRadius', 'multiShot', 'moveSpeed']);
    for (let i = 0; i < 300; i++) for (const o of p.offer()) expect(allowed.has(o.id)).toBe(true);
  });

  it('uses the pool\'s display names', () => {
    const p = new Progression(mulberry32(12));
    p.setPool(pool);
    const seen = new Map<string, string>();
    for (let i = 0; i < 300; i++) for (const o of p.offer()) seen.set(o.id, o.title);
    expect(seen.get('acid')).toBe('Radiant Wake I');
    expect(seen.get('vitality')).toBe('Ironscale Hide');
    expect(seen.get('nova')).toBe('Area Pulse I');
  });

  it('refuses to rank up a signature outside the pool', () => {
    const p = new Progression(mulberry32(13));
    p.setPool(pool);
    p.addExp(1e6);
    expect(p.choose('brood')).toBe(false);
    expect(p.choose('acid')).toBe(true);
  });
});

describe('Progression.offer(all)', () => {
  it('lists every upgrade and every pool ability below max rank, in a fixed order', () => {
    const p = new Progression(mulberry32(3));
    const ids = p.offer(true).map((o) => o.id);
    const pool = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => id !== 'meltdown' && id !== 'grip' && id !== 'core');
    expect(ids).toEqual([...Object.keys(UPGRADES), ...pool]);
    expect(p.offer(true).map((o) => o.id)).toEqual(ids);
  });

  it('drops maxed abilities and still accepts a pick against the offer', () => {
    const p = new Progression(mulberry32(4));
    p.addExp(1e9);
    for (let i = 0; i < MAX_RANK; i++) expect(p.choose('dash', p.offerSeq)).toBe(true);
    const offers = p.offer(true);
    expect(offers.map((o) => o.id)).not.toContain('dash');
    expect(p.choose('storm', p.offerSeq)).toBe(true);
  });
});

describe('Damage When Hurt ability', () => {
  it('exists with a title, and the Insect\'s default pool never offers it', () => {
    expect(ABILITIES.core.title).toBe('Damage When Hurt');
    const p = new Progression(mulberry32(5));
    expect(p.offer(true).map((o) => o.id)).not.toContain('core');
  });
});

describe('Progression.choosingLevel', () => {
  it('is the level each pending choice is for: the first of several levels gained at once comes first', () => {
    const p = new Progression(mulberry32(3));
    p.addExp(expToNext(1) + expToNext(2));
    expect(p.level).toBe(3);
    expect(p.choosingLevel).toBe(2);
    p.choose('damage');
    expect(p.choosingLevel).toBe(3);
  });
});
