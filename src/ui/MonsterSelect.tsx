import { useRef } from 'react';
import type { RosterEntry } from '../monsters/roster';

type Props = { entries: RosterEntry[]; index: number; onStep(delta: number): void; onPlay(): void };

/** Carousel over the 3D diorama: pick by look alone — arrows or swipe to browse, PLAY. */
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
      <button className="select-arrow select-prev" aria-label="Previous monster" onClick={() => onStep(-1)}>‹</button>
      <button className="select-arrow select-next" aria-label="Next monster" onClick={() => onStep(1)}>›</button>
      {!e.available && <div className="select-silhouette">{e.silhouette}</div>}
      <div className="select-footer">
        <div className="select-dots">
          {entries.map((x, i) => (
            <span key={x.id} className={i === index ? 'on' : ''} />
          ))}
        </div>
        <button className="btn-primary select-play" aria-label={`Play as ${e.name}`} disabled={!e.available} onClick={onPlay}>
          Play
        </button>
      </div>
    </div>
  );
}
