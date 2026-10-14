/** The Escape menu: the run is frozen behind it. */
export function PauseMenu({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  return (
    <div className="overlay pause-menu">
      <div className="overlay-title">Paused</div>
      <button className="btn-primary" onClick={onResume}>Resume</button>
      <button className="btn-secondary" onClick={onExit}>Exit Game</button>
    </div>
  );
}
