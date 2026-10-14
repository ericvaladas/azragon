import type { HudSnapshot } from '../GameEvents';

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Hud({ hud, expPop }: { hud: HudSnapshot; expPop: { amount: number; key: number } | null }) {
  const hpPct = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
  const expPct = Math.max(0, Math.min(1, hud.exp / hud.expToNext));
  return (
    <>
      <div className="hud-top">
        <div className="hud-level">LV {hud.level}</div>
        <div className="hud-bars">
          <div className={`bar bar-hp${hpPct < 0.3 ? ' low' : ''}`}>
            <div className="bar-fill" style={{ transform: `scaleX(${hpPct})` }} />
            <span className="bar-label">{hud.hp} / {hud.maxHp}</span>
          </div>
          <div className={`bar bar-exp${hud.levelingUp ? ' full' : ''}`}>
            <div className="bar-fill" style={{ transform: `scaleX(${expPct})` }} />
          </div>
          {expPop && (
            <div key={expPop.key} className="exp-pop">
              +{expPop.amount} EXP
            </div>
          )}
        </div>
        <div className="hud-time">{fmtTime(hud.timeSec)}</div>
      </div>
    </>
  );
}
