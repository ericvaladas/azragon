import type { GameState } from './GameEvents';

export type FlowEvent = 'start' | 'play' | 'introDone' | 'playAgain' | 'changeMonster' | 'exit';

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
