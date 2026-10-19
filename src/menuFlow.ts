import type { GameState } from './GameEvents';

export type FlowEvent = 'start' | 'play' | 'introDone' | 'playAgain' | 'changeMonster' | 'exit';

/**
 * Keyboard highlight on the level-up cards after a left (−1) or right (+1) press, among `n` cards, -1 meaning none:
 * from none, right highlights the first and left the last; otherwise it moves, stopping at either end.
 */
export function stepCard(sel: number, delta: number, n: number): number {
  if (n <= 0) return -1;
  if (sel < 0) return delta > 0 ? 0 : n - 1;
  return Math.min(n - 1, Math.max(0, sel + delta));
}

/** Menu and run flow: the state an event leads to, or null when it does not apply in `state`. */
export function flowNext(state: GameState, ev: FlowEvent): GameState | null {
  switch (ev) {
    case 'start':
      return state === 'title' ? 'select' : null;
    case 'play':
      return state === 'select' ? 'intro' : null;
    case 'introDone':
      return state === 'intro' ? 'playing' : null;
    case 'playAgain':
      return state === 'gameover' ? 'intro' : null;
    case 'changeMonster':
      return state === 'gameover' ? 'select' : null;
    case 'exit':
      return state === 'paused' ? 'title' : null;
  }
}
