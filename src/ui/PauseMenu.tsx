import type { CSSProperties } from 'react';

/** The Escape menu: the game is frozen behind it. */
export function PauseMenu({ musicOn, volume, onResume, onToggleMusic, onVolume, onExit }: {
  musicOn: boolean;
  volume: number;
  onResume: () => void;
  onToggleMusic: () => void;
  onVolume: (v: number) => void;
  onExit: () => void;
}) {
  const pct = Math.round(volume * 100);
  return (
    <div className="overlay pause-menu">
      <div className="overlay-title">Paused</div>
      <button className="btn-primary" onClick={onResume}>Resume</button>
      <button className="btn-secondary" aria-pressed={musicOn} onClick={onToggleMusic}>Music: {musicOn ? 'On' : 'Off'}</button>
      <label className={`volume-row${musicOn ? '' : ' is-off'}`}>
        <span className="volume-label">Volume</span>
        <input
          className="volume-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          onChange={(e) => onVolume(Number(e.currentTarget.value) / 100)}
        />
        <span className="volume-value">{pct}</span>
      </label>
      <button className="btn-secondary" onClick={onExit}>Exit Game</button>
    </div>
  );
}
