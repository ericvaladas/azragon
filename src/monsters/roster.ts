import { INSECT } from './insect/kind';
import { KAIJU } from './kaiju/kind';
import { KRAKEN } from './kraken/kind';
import { GOLEM } from './golem/kind';
import type { MonsterId, MonsterKind, RosterId } from './types';

export const KINDS: Record<MonsterId, MonsterKind> = { insect: INSECT, kaiju: KAIJU, kraken: KRAKEN, golem: GOLEM };

export const ROSTER_ORDER: readonly RosterId[] = ['insect', 'kaiju', 'kraken', 'golem'];

/** Creatures shown in the carousel but not playable yet. */
const COMING_SOON: Partial<Record<RosterId, { name: string; blurb: string }>> = {};

const SILHOUETTE: Record<RosterId, string> = { insect: '🦂', kaiju: '🦖', kraken: '🐙', golem: '🌋' };

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
  return ROSTER_ORDER.map((id: RosterId) => {
    const k = isMonsterId(id) ? KINDS[id] : undefined;
    if (k) return { id, name: k.name, blurb: k.blurb, available: true, pips: k.pips, moves: k.moves, silhouette: SILHOUETTE[id] };
    const s = COMING_SOON[id]!;
    return { id, name: s.name, blurb: s.blurb, available: false, pips: null, moves: [], silhouette: SILHOUETTE[id] };
  });
}
