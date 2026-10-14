import type { UpgradeOffer } from '../GameEvents';

export function LevelUpCards({ level, offers, all, onPick }: { level: number; offers: UpgradeOffer[]; all: boolean; onPick: (id: string) => void }) {
  return (
    <div className="overlay levelup">
      <div className="overlay-title">Level {level}</div>
      <div className={all ? 'cards cards-all' : 'cards'}>
        {offers.map((o, i) => (
          <button key={o.id} className="card" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }} onClick={() => onPick(o.id)}>
            <span className="card-title">{o.title}</span>
            <span className="card-desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
