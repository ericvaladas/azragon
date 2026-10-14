import type { ThreatArrow } from '../GameEvents';

export function EdgeArrows({ arrows }: { arrows: ThreatArrow[] }) {
  return (
    <div className="edge-arrows">
      {arrows.map((a, i) => (
        <div key={i} className="edge-arrow" style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>
          <div className="edge-arrow-head" style={{ transform: `rotate(${a.angle}rad)` }} />
        </div>
      ))}
    </div>
  );
}
