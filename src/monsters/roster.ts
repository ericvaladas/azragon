import { INSECT } from './insect/kind';
import type { MonsterId, MonsterKind, RosterId } from './types';

export const KINDS: Record<MonsterId, MonsterKind> = { insect: INSECT };

export const ROSTER_ORDER: readonly RosterId[] = ['insect', 'kaiju', 'kraken', 'golem'];

/** Creatures shown in the carousel but not playable yet. */
const COMING_SOON: Partial<Record<RosterId, { name: string; blurb: string }>> = {
  kaiju: { name: 'Reptile Kaiju', blurb: 'Walking extinction. Armoured, unstoppable, breathes plasma.' },
  kraken: { name: 'Kraken', blurb: 'Hauls itself through the streets on a hundred grasping arms.' },
  golem: { name: 'Stone Golem', blurb: 'A mountain that learned to walk. Slow, crushing, nearly unbreakable.' },
};

const SILHOUETTE: Record<RosterId, string> = { insect: '🦂', kaiju: '🦖', kraken: '🐙', golem: '🗿' };

export type RosterEntry = {
  id: RosterId;
  name: string;
  blurb: string;
  available: boolean;
  pips: MonsterKind['pips'] | null;
  moves: MonsterKind['moves'];
  silhouette: string;
};

export function isMonsterId(x: string): x is MonsterId {
  return Object.prototype.hasOwnProperty.call(KINDS, x);
}

export function rosterEntries(): RosterEntry[] {
  return ROSTER_ORDER.map((id) => {
    if (isMonsterId(id)) {
      const k = KINDS[id];
      return { id, name: k.name, blurb: k.blurb, available: true, pips: k.pips, moves: k.moves, silhouette: SILHOUETTE[id] };
    }
    const s = COMING_SOON[id]!;
    return { id, name: s.name, blurb: s.blurb, available: false, pips: null, moves: [], silhouette: SILHOUETTE[id] };
  });
}
