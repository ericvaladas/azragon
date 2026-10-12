import { describe, it, expect } from 'vitest';
import { SpawnDirector, type SpawnKind } from './SpawnDirector';
import { CONFIG } from '../config';

const D = CONFIG.director;
const always0 = () => 0; // rng that would always choose a jet when allowed

function run(dir: SpawnDirector, seconds: number, alive = { tanks: 0, jets: 0 }): SpawnKind[] {
  const out: SpawnKind[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...dir.update(0.05, alive));
  return out;
}

describe('SpawnDirector', () => {
  it('sends only tanks before jets unlock', () => {
    const spawns = run(new SpawnDirector(always0), D.jetUnlockTime - 1);
    expect(spawns.length).toBeGreaterThan(0);
    expect(spawns).not.toContain('jet');
  });

  it('sends jets after they unlock', () => {
    const dir = new SpawnDirector(always0);
    run(dir, D.jetUnlockTime);
    expect(run(dir, 30)).toContain('jet');
  });

  it('respects caps on concurrent enemies', () => {
    const dir = new SpawnDirector(always0);
    expect(run(dir, 120, { tanks: D.maxTanks, jets: D.maxJets })).toEqual([]);
  });

  it('escalates over time', () => {
    const dir = new SpawnDirector(() => 0.99);
    const early = run(dir, 60).length;
    run(dir, 240);
    const late = run(dir, 60).length;
    expect(late).toBeGreaterThan(early * 2);
  });

  it('never bursts more than the budget cap in one update', () => {
    const dir = new SpawnDirector(() => 0.99);
    dir.update(10000, { tanks: 0, jets: 0 });
    expect(dir.update(10000, { tanks: 0, jets: 0 }).length).toBeLessThanOrEqual(D.budgetCap);
  });

  it('reset restarts the clock', () => {
    const dir = new SpawnDirector(always0);
    run(dir, 100);
    dir.reset();
    expect(dir.elapsed).toBe(0);
    expect(run(dir, 5)).not.toContain('jet');
  });
});
