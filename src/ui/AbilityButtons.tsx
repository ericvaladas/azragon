import type { AbilityView, ActiveId } from '../systems/abilities';

const META: Record<ActiveId, { key: string; label: string }> = {
  leap: { key: 'SPACE', label: 'Leap' },
  dash: { key: 'E', label: 'Dash' },
  roar: { key: 'R', label: 'Roar' },
  bubble: { key: 'T', label: 'Shield' },
  ultimate: { key: 'Q', label: 'ULT' },
};

/** The sparks circling a just-granted ultimate. */
const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

function AbilityButton({ v, onPress }: { v: AbilityView; onPress: (id: ActiveId) => void }) {
  const m = META[v.id];
  const cls = ['ability-btn', v.id === 'ultimate' ? 'ultimate' : '', v.ready ? 'ready' : '', v.aiming ? 'aiming' : '', v.fresh ? 'fresh' : ''].join(' ');
  const label = m.label;
  return (
    <button className={cls} onPointerDown={(e) => { e.stopPropagation(); onPress(v.id); }} aria-label={label}>
      {v.fresh && (
        <span className="ult-fresh" aria-hidden="true">
          <span className="ult-fresh-ring" />
          <span className="ult-fresh-sparks">{SPARKS.map((n) => <i key={n} style={{ transform: `rotate(${n * 45}deg) translateY(-50px)` }} />)}</span>
        </span>
      )}
      <span className="ability-label">{label}</span>
      {v.cdFrac > 0 && <span className="ability-cd" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${v.cdFrac * 360}deg, transparent 0)` }} />}
      <span className="ability-key">{m.key}</span>
    </button>
  );
}

/** One round button per unlocked active ability; new buttons appear as they unlock. The ultimate sits above the row. */
export function AbilityButtons({ views, onPress }: { views: AbilityView[]; onPress: (id: ActiveId) => void }) {
  const ultimate = views.find((v) => v.id === 'ultimate');
  return (
    <div className="ability-bar">
      {ultimate && <AbilityButton v={ultimate} onPress={onPress} />}
      <div className="ability-row">
        {views.filter((v) => v.id !== 'ultimate').map((v) => <AbilityButton key={v.id} v={v} onPress={onPress} />)}
      </div>
    </div>
  );
}
