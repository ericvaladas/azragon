import { describe, it, expect } from 'vitest';
import { SpawnDirector } from './SpawnDirector';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const zero = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

function run(dir: SpawnDirector, seconds: number, alive = zero()): EnemyKind[] {
  const out: EnemyKind[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...dir.update(0.05, alive));
  return out;
}

describe('SpawnDirector', () => {
  it('sends only tanks in the first 20 s', () => {
    const s = run(new SpawnDirector(mulberry32(1)), 19);
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s)).toEqual(new Set(['tank']));
  });

  it('has sent every kind by minute 5 (counts kept at zero)', () => {
    expect(new Set(run(new SpawnDirector(mulberry32(2)), 330))).toEqual(new Set(ENEMY_KINDS));
  });

  it('never exceeds per-kind caps', () => {
    const alive = zero();
    for (const k of ENEMY_KINDS) alive[k] = CONFIG.spawns[k].cap;
    expect(run(new SpawnDirector(mulberry32(3)), 400, alive)).toEqual([]);
  });

  it('escalates over time', () => {
    const dir = new SpawnDirector(mulberry32(4));
    const early = run(dir, 60).length;
    run(dir, 240);
    expect(run(dir, 60).length).toBeGreaterThan(early * 1.5);
  });

  it('never bursts more than the budget cap in one update', () => {
    const dir = new SpawnDirector(mulberry32(5));
    dir.update(10000, zero());
    expect(dir.update(10000, zero()).length).toBeLessThanOrEqual(CONFIG.director.budgetCap);
  });

  it('reset restarts the clock', () => {
    const dir = new SpawnDirector(mulberry32(6));
    run(dir, 300);
    dir.reset();
    expect(dir.elapsed).toBe(0);
    expect(new Set(run(dir, 5))).toEqual(new Set(['tank']));
  });
});
