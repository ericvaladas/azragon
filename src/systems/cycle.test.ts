import { describe, it, expect } from 'vitest';
import { Cycle, devArmyTime, type CycleEvent } from './cycle';

const DT = 0.1;

/** Steps the cycle for `seconds` and returns every event fired. */
function run(c: Cycle, seconds: number): CycleEvent[] {
  const out: CycleEvent[] = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) out.push(...c.update(DT));
  return out;
}

describe('Cycle', () => {
  it('stays in army for armyTime, then retreats', () => {
    const c = new Cycle();
    expect(run(c, 179.9)).toEqual([]);
    expect(c.phase).toBe('army');
    expect(run(c, 0.2)).toEqual(['retreat']);
    expect(c.phase).toBe('retreat');
    expect(c.spawning).toBe(false);
    expect(c.retreating).toBe(true);
  });

  it('first break: cutscene at cutsceneDelay, dismiss at retreatTimeout, no boss without the meteor before graceTime', () => {
    const c = new Cycle();
    run(c, 180);
    expect(run(c, 2.8)).toEqual([]);
    expect(run(c, 0.3)).toEqual(['cutscene']);
    expect(run(c, 8.7)).toEqual([]);
    expect(run(c, 0.3)).toEqual(['dismiss']);
    run(c, 48);
    expect(c.phase).toBe('retreat');
  });

  it('first break: boss bossDelay after collection', () => {
    const c = new Cycle();
    run(c, 180);
    run(c, 6);
    c.meteorLanded();
    run(c, 3);
    c.meteorCollected();
    const early = run(c, 2.8);
    expect(early).not.toContain('boss');
    expect(c.phase).toBe('retreat');
    expect(run(c, 0.3)).toContain('boss');
    expect(c.phase).toBe('boss');
  });

  it('first break: boss graceTime after landing if never collected', () => {
    const c = new Cycle();
    run(c, 180);
    run(c, 6);
    c.meteorLanded();
    expect(run(c, 24.8)).not.toContain('boss');
    expect(run(c, 0.3)).toContain('boss');
    expect(c.phase).toBe('boss');
  });

  it('later breaks: boss at breakTime, no cutscene', () => {
    const c = new Cycle(10);
    run(c, 10);
    c.meteorCollected();
    run(c, 3.1);
    expect(c.phase).toBe('boss');
    c.bossDefeated();
    run(c, 0.2);
    run(c, 10);
    expect(c.cycles).toBe(1);
    const evs = run(c, 10.2);
    expect(evs).toEqual(['retreat']);
    const second = run(c, 19.6);
    expect(second).not.toContain('boss');
    const rest = run(c, 0.5);
    expect(rest).toEqual(['boss']);
    expect([...second, ...rest]).not.toContain('cutscene');
  });

  it('boss → recover → army, army clock restarts', () => {
    const c = new Cycle(10);
    run(c, 10);
    c.meteorLanded();
    run(c, 26);
    expect(c.phase).toBe('boss');
    expect(run(c, 5)).toEqual([]);
    c.bossDefeated();
    expect(c.update(DT)).toEqual(['recover']);
    expect(c.phase).toBe('recover');
    expect(run(c, 9.8)).toEqual([]);
    expect(run(c, 0.3)).toEqual(['army']);
    expect(c.phase).toBe('army');
    expect(c.cycles).toBe(1);
    expect(run(c, 9.8)).toEqual([]);
    expect(run(c, 0.3)).toEqual(['retreat']);
  });

  it('reset returns to army at 0 with no cycles', () => {
    const c = new Cycle(10);
    run(c, 10);
    c.meteorLanded();
    run(c, 26);
    expect(c.phase).toBe('boss');
    c.reset();
    expect(c.phase).toBe('army');
    expect(c.cycles).toBe(0);
    run(c, 10);
    expect(run(c, 3.1)).toContain('cutscene');
  });

  it('constructor armyTime overrides', () => {
    const c = new Cycle(10);
    expect(run(c, 9.8)).toEqual([]);
    expect(run(c, 0.3)).toEqual(['retreat']);
  });
});

describe('devArmyTime', () => {
  it('parses ?army=', () => {
    expect(devArmyTime('?army=15')).toBe(15);
    expect(devArmyTime('?city=x&army=4.5')).toBe(4.5);
    expect(devArmyTime('')).toBeNull();
    expect(devArmyTime('?army=0')).toBeNull();
    expect(devArmyTime('?army=x')).toBeNull();
  });

  it('escorts spawn only in the boss phase, and units fall back after it', () => {
    const c = new Cycle(1);
    while (c.phase !== 'retreat') c.update(0.1);
    expect(c.escorting).toBe(false);
    c.meteorLanded();
    c.meteorCollected();
    while ((c.phase as string) !== 'boss') c.update(0.1);
    expect(c.escorting).toBe(true);
    expect(c.retreating).toBe(false);
    expect(c.spawning).toBe(false);
    c.bossDefeated();
    c.update(0.1);
    expect(c.phase).toBe('recover');
    expect(c.escorting).toBe(false);
    expect(c.retreating).toBe(true);
  });
});
