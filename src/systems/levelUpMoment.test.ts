import { describe, it, expect } from 'vitest';
import { LevelUpMoment } from './levelUpMoment';
import { CONFIG } from '../config';

const L = CONFIG.levelUp;

describe('LevelUpMoment', () => {
  it('is idle at normal speed until started', () => {
    const m = new LevelUpMoment();
    expect(m.active).toBe(false);
    expect(m.timeScale()).toBe(1);
    expect(m.update(1)).toBe(false);
  });

  it('runs in slow motion for momentTime of real time, then reports done once', () => {
    const m = new LevelUpMoment();
    m.start();
    expect(m.active).toBe(true);
    expect(m.timeScale()).toBe(L.timeScale);
    expect(m.update(L.momentTime * 0.5)).toBe(false);
    expect(m.update(L.momentTime * 0.6)).toBe(true);
    expect(m.active).toBe(false);
    expect(m.timeScale()).toBe(1);
    expect(m.update(1)).toBe(false);
  });

  it('ignores a second start while running (one moment per burst of levels)', () => {
    const m = new LevelUpMoment();
    m.start();
    m.update(L.momentTime * 0.8);
    m.start();
    expect(m.update(L.momentTime * 0.3)).toBe(true);
  });

  it('reset cancels a running moment', () => {
    const m = new LevelUpMoment();
    m.start();
    m.reset();
    expect(m.active).toBe(false);
    expect(m.update(5)).toBe(false);
  });
});
