import type { UpgradeOffer } from '../GameEvents';

/** `highlight`: the card picked out from the keyboard (A/D or ←/→, then Space/Enter; 1–9 take a card at once), -1 for none. */
export function LevelUpCards({ level, offers, all, highlight, onPick }: { level: number; offers: UpgradeOffer[]; all: boolean; highlight: number; onPick: (id: string) => void }) {
  return (
    <div className="overlay levelup">
      <div className="overlay-title">Level {level}</div>
      <div className={all ? 'cards cards-all' : 'cards'}>
        {offers.map((o, i) => (
          <button key={o.id} className={i === highlight ? 'card card-highlight' : 'card'} style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }} onClick={() => onPick(o.id)}>
            <span className="card-title">{o.title}</span>
            <span className="card-desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
