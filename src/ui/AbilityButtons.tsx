import type { AbilityView, ActiveId } from '../systems/abilities';

const META: Record<ActiveId, { icon: string; key: string; label: string }> = {
  leap: { icon: '⤴', key: 'SPACE', label: 'Leap' },
  roar: { icon: '📣', key: 'R', label: 'Roar' },
};

export function AbilityButtons({ views, onPress }: { views: AbilityView[]; onPress: (id: ActiveId) => void }) {
  return (
    <div className="ability-bar">
      {views.map((v) => {
        const m = META[v.id];
        const cls = ['ability-btn', v.ready ? 'ready' : '', v.aiming ? 'aiming' : '', v.unlocked ? '' : 'locked'].join(' ');
        return (
          <button key={v.id} className={cls} onPointerDown={(e) => { e.stopPropagation(); onPress(v.id); }} aria-label={m.label}>
            <span className="ability-icon">{v.unlocked ? m.icon : '🔒'}</span>
            {!v.unlocked && <span className="ability-lock">LV {v.unlockLevel}</span>}
            {v.unlocked && v.cdFrac > 0 && <span className="ability-cd" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${v.cdFrac * 360}deg, transparent 0)` }} />}
            <span className="ability-key">{m.key}</span>
          </button>
        );
      })}
    </div>
  );
}
