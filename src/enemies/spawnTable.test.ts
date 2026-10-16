import { describe, it, expect } from 'vitest';
import { difficulty, openKinds, pickKind } from './spawnTable';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const none = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

describe('difficulty', () => {
  it('is 1x at level 1 and grows linearly per level', () => {
    expect(difficulty(1)).toEqual({ hpMult: 1, dmgMult: 1 });
    const d = difficulty(9);
    expect(d.hpMult).toBeCloseTo(1 + 8 * CONFIG.difficulty.hpPerLevel);
    expect(d.dmgMult).toBeCloseTo(1 + 8 * CONFIG.difficulty.dmgPerLevel);
  });
});

describe('openKinds', () => {
  it('follows the unlock levels', () => {
    expect(openKinds(1, none())).toEqual(['tank', 'heli', 'gustav']);
    expect(openKinds(2, none())).toEqual(['tank', 'jet', 'heli', 'gustav']);
    expect(openKinds(2, none())).not.toContain('blimp');
    expect(openKinds(3, none())).toContain('blimp');
    expect(openKinds(4, none())).not.toContain('sam');
    expect(openKinds(4, none())).not.toContain('artillery');
    expect(openKinds(5, none())).toContain('artillery');
    expect(openKinds(5, none())).not.toContain('sam');
    expect(openKinds(6, none())).toContain('sam');
    expect(openKinds(6, none())).not.toContain('osprey');
    expect(openKinds(7, none())).toContain('osprey');
    expect(openKinds(7, none())).not.toContain('truck');
    expect(openKinds(8, none())).toContain('truck');
    expect(openKinds(9, none())).not.toContain('laser');
    expect(openKinds(10, none())).toEqual([...ENEMY_KINDS]);
  });
  it('unlocks helicopters at level 1', () => {
    expect(openKinds(1, none())).toContain('heli');
  });
  it('closes helicopters at their cap of 4', () => {
    expect(CONFIG.spawns.heli.cap).toBe(4);
    const alive = none();
    alive.heli = 3;
    expect(openKinds(5, alive)).toContain('heli');
    alive.heli = 4;
    expect(openKinds(5, alive)).not.toContain('heli');
  });
  it('unlocks napalm bombers at level 4 and closes them at their cap of 2', () => {
    expect(openKinds(3, none())).not.toContain('napalm');
    expect(openKinds(4, none())).toContain('napalm');
    expect(CONFIG.spawns.napalm.cap).toBe(2);
    expect(CONFIG.spawns.napalm.weight).toBeLessThan(CONFIG.spawns.jet.weight);
    const alive = none();
    alive.napalm = 1;
    expect(openKinds(6, alive)).toContain('napalm');
    alive.napalm = 2;
    expect(openKinds(6, alive)).not.toContain('napalm');
  });
  it('unlocks Osprey squads at level 7, one at a time', () => {
    expect(CONFIG.spawns.osprey.cap).toBe(1);
    const alive = none();
    alive.osprey = 1;
    expect(openKinds(7, alive)).not.toContain('osprey');
  });
  it('opens the Schwerer Gustav at level 1, two at a time', () => {
    expect(CONFIG.spawns.gustav.cap).toBe(2);
    const alive = none();
    alive.gustav = 2;
    expect(openKinds(1, alive)).not.toContain('gustav');
  });
  it('excludes kinds at their cap', () => {
    const alive = none();
    alive.laser = CONFIG.spawns.laser.cap;
    alive.tank = CONFIG.spawns.tank.cap;
    const open = openKinds(20, alive);
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
      if (pickKind(['tank', 'jet'], rng) === 'tank') tanks++;
      else jets++;
    }
    const expected = CONFIG.spawns.tank.weight / CONFIG.spawns.jet.weight;
    expect(tanks / jets).toBeGreaterThan(expected * 0.85);
    expect(tanks / jets).toBeLessThan(expected * 1.15);
  });
});
