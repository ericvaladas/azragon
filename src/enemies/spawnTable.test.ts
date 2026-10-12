import { describe, it, expect } from 'vitest';
import { difficulty, openKinds, pickKind } from './spawnTable';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const none = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

describe('difficulty', () => {
  it('starts at 1x and grows linearly per minute', () => {
    expect(difficulty(0)).toEqual({ hpMult: 1, dmgMult: 1 });
    const d = difficulty(240);
    expect(d.hpMult).toBeCloseTo(1 + 4 * CONFIG.difficulty.hpPerMin);
    expect(d.dmgMult).toBeCloseTo(1 + 4 * CONFIG.difficulty.dmgPerMin);
  });
});

describe('openKinds', () => {
  it('follows the unlock timeline', () => {
    expect(openKinds(0, none())).toEqual(['tank']);
    expect(openKinds(19.9, none())).toEqual(['tank']);
    expect(openKinds(20, none())).toEqual(['tank', 'jet']);
    expect(openKinds(45, none())).toContain('blimp');
    expect(openKinds(90, none())).toContain('sam');
    expect(openKinds(150, none())).toContain('artillery');
    expect(openKinds(210, none())).toContain('truck');
    expect(openKinds(270, none())).toEqual([...ENEMY_KINDS]);
  });
  it('excludes kinds at their cap', () => {
    const alive = none();
    alive.laser = CONFIG.spawns.laser.cap;
    alive.tank = CONFIG.spawns.tank.cap;
    const open = openKinds(300, alive);
    expect(open).not.toContain('laser');
    expect(open).not.toContain('tank');
  });
});

describe('pickKind', () => {
  it('returns null for no options and respects weights', () => {
    expect(pickKind([], Math.random)).toBeNull();
    const rng = mulberry32(5);
    let tanks = 0;
    let jets = 0;
    for (let i = 0; i < 10000; i++) {
      const k = pickKind(['tank', 'jet'], rng);
      if (k === 'tank') tanks++;
      else jets++;
    }
    const expected = CONFIG.spawns.tank.weight / CONFIG.spawns.jet.weight;
    expect(tanks / jets).toBeGreaterThan(expected * 0.85);
    expect(tanks / jets).toBeLessThan(expected * 1.15);
  });
});
