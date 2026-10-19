import { describe, it, expect } from 'vitest';
import { flowNext, stepCard } from './menuFlow';

describe('flowNext', () => {
  it('walks title → select → intro → playing, and game over → intro or select', () => {
    expect(flowNext('title', 'start')).toBe('select');
    expect(flowNext('select', 'play')).toBe('intro');
    expect(flowNext('intro', 'introDone')).toBe('playing');
    expect(flowNext('gameover', 'playAgain')).toBe('intro');
    expect(flowNext('gameover', 'changeMonster')).toBe('select');
  });
  it('leaves a paused run for the title screen (Exit Game), and only from the pause menu', () => {
    expect(flowNext('paused', 'exit')).toBe('title');
    expect(flowNext('playing', 'exit')).toBeNull();
    expect(flowNext('gameover', 'exit')).toBeNull();
    expect(flowNext('title', 'exit')).toBeNull();
  });
  it('rejects events from any other state', () => {
    expect(flowNext('select', 'start')).toBeNull();
    expect(flowNext('title', 'play')).toBeNull();
    expect(flowNext('playing', 'play')).toBeNull();
    expect(flowNext('playing', 'playAgain')).toBeNull();
    expect(flowNext('dying', 'changeMonster')).toBeNull();
    expect(flowNext('paused', 'start')).toBeNull();
    expect(flowNext('levelup', 'introDone')).toBeNull();
  });
});

describe('stepCard', () => {
  it('from no highlight, right picks the first card and left the last', () => {
    expect(stepCard(-1, 1, 3)).toBe(0);
    expect(stepCard(-1, -1, 3)).toBe(2);
  });
  it('moves one card at a time and stops at the ends', () => {
    expect(stepCard(0, 1, 3)).toBe(1);
    expect(stepCard(2, 1, 3)).toBe(2);
    expect(stepCard(0, -1, 3)).toBe(0);
  });
  it('has nothing to highlight without cards', () => {
    expect(stepCard(-1, 1, 0)).toBe(-1);
  });
});
