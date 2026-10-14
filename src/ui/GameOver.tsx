import type { RunStats } from '../GameEvents';

export function GameOver({ stats, onRestart, onChangeMonster }: { stats: RunStats; onRestart: () => void; onChangeMonster: () => void }) {
  const t = `${Math.floor(stats.timeSec / 60)}:${String(stats.timeSec % 60).padStart(2, '0')}`;
  return (
    <div className="overlay gameover">
      <div className="overlay-title">Game Over</div>
      <div className="stats">
        <div><span>Survived</span><b>{t}</b></div>
        <div><span>Kills</span><b>{stats.kills}</b></div>
        <div><span>Buildings</span><b>{stats.buildings}</b></div>
        <div><span>Level</span><b>{stats.level}</b></div>
      </div>
      <button className="btn-primary" onClick={onRestart}>Play Again</button>
      <button className="btn-secondary" onClick={onChangeMonster}>Change Monster</button>
    </div>
  );
}
