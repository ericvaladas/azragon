import { describe, it, expect } from 'vitest';
import { flowNext } from './menuFlow';

describe('flowNext', () => {
  it('walks title → select → intro → playing, and game over → intro or select', () => {
    expect(flowNext('title', 'start')).toBe('select');
    expect(flowNext('select', 'play')).toBe('intro');
    expect(flowNext('intro', 'introDone')).toBe('playing');
    expect(flowNext('gameover', 'playAgain')).toBe('intro');
    expect(flowNext('gameover', 'changeMonster')).toBe('select');
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
