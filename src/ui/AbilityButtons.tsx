import type { AbilityView, ActiveId } from '../systems/abilities';

const META: Record<ActiveId, { key: string; label: string }> = {
  leap: { key: 'SPACE', label: 'Leap' },
  dash: { key: 'E', label: 'Dash' },
  roar: { key: 'R', label: 'Roar' },
  bubble: { key: 'T', label: 'Shield' },
};

/** One round button per unlocked active ability; new buttons appear as they unlock. */
export function AbilityButtons({ views, onPress }: { views: AbilityView[]; onPress: (id: ActiveId) => void }) {
  return (
    <div className="ability-bar">
      {views.map((v) => {
        const m = META[v.id];
        const cls = ['ability-btn', v.ready ? 'ready' : '', v.aiming ? 'aiming' : ''].join(' ');
        return (
          <button key={v.id} className={cls} onPointerDown={(e) => { e.stopPropagation(); onPress(v.id); }} aria-label={m.label}>
            <span className="ability-label">{m.label}</span>
            {v.cdFrac > 0 && <span className="ability-cd" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${v.cdFrac * 360}deg, transparent 0)` }} />}
            <span className="ability-key">{m.key}</span>
          </button>
        );
      })}
    </div>
  );
}
