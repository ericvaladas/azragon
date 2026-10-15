import { describe, it, expect } from 'vitest';
import { showPauseButton } from './PauseButton';

describe('showPauseButton', () => {
  it('shows on touch screens wherever ESC opens the menu: in play, over the level-up cards, on the select screen', () => {
    for (const s of ['playing', 'levelup', 'select'] as const) expect(showPauseButton(s, true), s).toBe(true);
  });
  it('hides on the title, intro, game over, while dying or loading, and while the menu is already open', () => {
    for (const s of ['title', 'intro', 'gameover', 'dying', 'loading', 'paused'] as const) expect(showPauseButton(s, true), s).toBe(false);
  });
  it('never shows with a mouse (desktop has the ESC key)', () => {
    for (const s of ['playing', 'levelup', 'select'] as const) expect(showPauseButton(s, false), s).toBe(false);
  });
});
