import type { ThreatArrow } from '../GameEvents';

const ICON: Partial<Record<ThreatArrow['kind'], string>> = { blimp: '🎈', sam: '🚀', artillery: '💣', truck: '🔫' };

export function EdgeArrows({ arrows }: { arrows: ThreatArrow[] }) {
  return (
    <div className="edge-arrows">
      {arrows.map((a, i) => (
        <div key={i} className="edge-arrow" style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>
          <div className="edge-arrow-head" style={{ transform: `rotate(${a.angle}rad)` }} />
          <span className="edge-arrow-icon">{ICON[a.kind] ?? '!'}</span>
        </div>
      ))}
    </div>
  );
}
