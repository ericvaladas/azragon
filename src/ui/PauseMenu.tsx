/** The Escape menu: the game is frozen behind it. */
export function PauseMenu({ musicOn, onResume, onToggleMusic, onExit }: { musicOn: boolean; onResume: () => void; onToggleMusic: () => void; onExit: () => void }) {
  return (
    <div className="overlay pause-menu">
      <div className="overlay-title">Paused</div>
      <button className="btn-primary" onClick={onResume}>Resume</button>
      <button className="btn-secondary" aria-pressed={musicOn} onClick={onToggleMusic}>Music: {musicOn ? 'On' : 'Off'}</button>
      <button className="btn-secondary" onClick={onExit}>Exit Game</button>
    </div>
  );
}
