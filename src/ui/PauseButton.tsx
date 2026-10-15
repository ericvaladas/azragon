import type { GameState } from '../GameEvents';

/** Touch screens have no ESC key: show the pause button wherever ESC would open the menu. */
export function showPauseButton(state: GameState, touch: boolean): boolean {
  return touch && (state === 'playing' || state === 'levelup' || state === 'select');
}

/** Bottom-left round button that opens the ESC menu on phones. */
export function PauseButton({ onPress, onSelect }: { onPress: () => void; onSelect: boolean }) {
  return (
    <button className={onSelect ? 'pause-btn on-select' : 'pause-btn'} aria-label="Pause" onPointerDown={(e) => e.stopPropagation()} onClick={onPress}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    </button>
  );
}
