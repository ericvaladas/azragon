import { describe, it, expect } from 'vitest';
import { SpawnDirector } from './SpawnDirector';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const zero = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

function run(dir: SpawnDirector, seconds: number, level: number, alive = zero()): EnemyKind[] {
  const out: EnemyKind[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...dir.update(0.05, alive, level));
  return out;
}

describe('SpawnDirector', () => {
  it('sends only tanks, helicopters and Gustavs at level 1, however long the run lasts', () => {
    const s = run(new SpawnDirector(mulberry32(1)), 300, 1);
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s)).toEqual(new Set(['tank', 'heli', 'gustav']));
  });

  it('sends every kind once the player reaches the last unlock level', () => {
    const top = Math.max(...ENEMY_KINDS.map((k) => CONFIG.spawns[k].unlockLevel));
    expect(new Set(run(new SpawnDirector(mulberry32(2)), 120, top))).toEqual(new Set(ENEMY_KINDS));
  });

  it('never exceeds per-kind caps', () => {
    const alive = zero();
    for (const k of ENEMY_KINDS) alive[k] = CONFIG.spawns[k].cap;
    expect(run(new SpawnDirector(mulberry32(3)), 120, 20, alive)).toEqual([]);
  });

  it('spends budget faster at higher levels', () => {
    // Higher levels unlock pricier enemies, so compare budget spent rather than head count.
    const spent = (kinds: EnemyKind[]) => kinds.reduce((sum, k) => sum + CONFIG.spawns[k].cost, 0);
    const low = spent(run(new SpawnDirector(mulberry32(4)), 60, 1));
    const high = spent(run(new SpawnDirector(mulberry32(4)), 60, 8));
    const expected = (CONFIG.director.baseRate + 7 * CONFIG.director.rateGrowthPerLevel) / CONFIG.director.baseRate;
    expect(high / low).toBeGreaterThan(expected * 0.8);
  });

  it('never bursts more than the budget cap in one update', () => {
    const dir = new SpawnDirector(mulberry32(5));
    dir.update(10000, zero(), 10);
    expect(dir.update(10000, zero(), 10).length).toBeLessThanOrEqual(CONFIG.director.budgetCap);
  });

  it('a refunded spawn gives its cost back, so more spawns follow', () => {
    const plain = new SpawnDirector(mulberry32(5));
    const refunded = new SpawnDirector(mulberry32(5));
    let a = 0;
    let b = 0;
    for (let t = 0; t < 30; t += 0.1) {
      a += plain.update(0.1, zero(), 3).length;
      for (const k of refunded.update(0.1, zero(), 3)) {
        b++;
        refunded.refund(k);
      }
    }
    expect(b).toBeGreaterThan(a * 1.5);
  });

  it('reset clears the clock and budget', () => {
    const dir = new SpawnDirector(mulberry32(6));
    run(dir, 30, 5);
    dir.reset();
    expect(dir.elapsed).toBe(0);
    expect(new Set(run(dir, 5, 1))).toEqual(new Set(['tank']));
  });
});
