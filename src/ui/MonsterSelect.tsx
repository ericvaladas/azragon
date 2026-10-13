import { useRef } from 'react';
import type { RosterEntry } from '../monsters/roster';

type Props = { entries: RosterEntry[]; index: number; onStep(delta: number): void; onPlay(): void };

function Pips({ label, n }: { label: string; n: number }) {
  return (
    <div className="pip-row">
      <span>{label}</span>
      <div className="pips">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < n ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/** Carousel over the 3D diorama: arrows or swipe to browse, stats and moves, PLAY. */
export function MonsterSelect({ entries, index, onStep, onPlay }: Props) {
  const e = entries[index]!;
  const swipeX = useRef<number | null>(null);
  return (
    <div
      className="select-screen"
      onPointerDown={(ev) => {
        swipeX.current = ev.clientX;
      }}
      onPointerUp={(ev) => {
        const x0 = swipeX.current;
        swipeX.current = null;
        if (x0 === null) return;
        const dx = ev.clientX - x0;
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1);
      }}
    >
      <div className="select-header">
        <button className="select-arrow" aria-label="Previous monster" onClick={() => onStep(-1)}>‹</button>
        <div className="select-name" key={e.id}>{e.name}</div>
        <button className="select-arrow" aria-label="Next monster" onClick={() => onStep(1)}>›</button>
      </div>
      {!e.available && <div className="select-silhouette">{e.silhouette}</div>}
      <div className="select-panel" key={`panel-${e.id}`}>
        <div className="select-blurb">{e.blurb}</div>
        {e.available && e.pips ? (
          <>
            <Pips label="Toughness" n={e.pips.toughness} />
            <Pips label="Power" n={e.pips.power} />
            <Pips label="Speed" n={e.pips.speed} />
            <div className="select-moves">
              {e.moves.map((m) => (
                <span key={m.label}>
                  <b>{m.icon}</b> {m.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="select-soon">Coming soon</div>
        )}
        <button className="btn-primary select-play" disabled={!e.available} onClick={onPlay}>
          Play
        </button>
      </div>
      <div className="select-dots">
        {entries.map((x, i) => (
          <span key={x.id} className={i === index ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
