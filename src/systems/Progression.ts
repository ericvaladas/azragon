import { CONFIG } from '../config';
import type { UpgradeOffer } from '../GameEvents';
import { shuffle } from '../util/rng';

export type UpgradeId = 'damage' | 'attackSpeed' | 'vitality' | 'regen' | 'stompRadius' | 'multiShot' | 'moveSpeed';

export type Stats = {
  damageMult: number;
  cooldownMult: number;
  maxHpMult: number;
  regenBonus: number;
  stompRadiusMult: number;
  extraSpikes: number;
  moveSpeedMult: number;
};

export const BASE_STATS: Stats = {
  damageMult: 1,
  cooldownMult: 1,
  maxHpMult: 1,
  regenBonus: 0,
  stompRadiusMult: 1,
  extraSpikes: 0,
  moveSpeedMult: 1,
};

export const UPGRADES: Record<UpgradeId, { title: string; desc: string; icon: string; apply(s: Stats): Stats }> = {
  damage: { title: 'Acid Venom', desc: '+20% damage', icon: '🗡️', apply: (s) => ({ ...s, damageMult: s.damageMult * 1.2 }) },
  attackSpeed: { title: 'Frenzy', desc: 'Attacks 15% faster', icon: '⚡', apply: (s) => ({ ...s, cooldownMult: s.cooldownMult * 0.85 }) },
  vitality: { title: 'Thick Carapace', desc: '+20% max HP, heal 30%', icon: '🛡️', apply: (s) => ({ ...s, maxHpMult: s.maxHpMult * 1.2 }) },
  regen: { title: 'Mutagen', desc: '+3 HP per second', icon: '🧬', apply: (s) => ({ ...s, regenBonus: s.regenBonus + 3 }) },
  stompRadius: { title: 'Quake Stomp', desc: '+20% stomp radius', icon: '💥', apply: (s) => ({ ...s, stompRadiusMult: s.stompRadiusMult * 1.2 }) },
  multiShot: { title: 'Barbed Volley', desc: '+1 spike per shot', icon: '🎯', apply: (s) => ({ ...s, extraSpikes: s.extraSpikes + 1 }) },
  moveSpeed: { title: 'Long Strides', desc: '+15% move speed', icon: '🦿', apply: (s) => ({ ...s, moveSpeedMult: s.moveSpeedMult * 1.15 }) },
};

export function expToNext(level: number): number {
  return Math.round(CONFIG.progression.expBase * Math.pow(level, CONFIG.progression.expExponent));
}

export class Progression {
  level = 1;
  exp = 0;
  stats: Stats = { ...BASE_STATS };
  pendingLevels = 0;
  /** Increments with every offer; a pick must name the offer it was made against. */
  offerSeq = 0;

  constructor(private rng: () => number) {}

  reset(): void {
    this.level = 1;
    this.exp = 0;
    this.stats = { ...BASE_STATS };
    this.pendingLevels = 0;
  }

  /** Adds EXP, levelling as many times as it covers. Returns levels gained (each needs a choice). */
  addExp(n: number): number {
    this.exp += n;
    let gained = 0;
    while (this.exp >= expToNext(this.level)) {
      this.exp -= expToNext(this.level);
      this.level++;
      gained++;
    }
    this.pendingLevels += gained;
    return gained;
  }

  offer(): UpgradeOffer[] {
    this.offerSeq++;
    const ids = shuffle(Object.keys(UPGRADES) as UpgradeId[], this.rng).slice(0, CONFIG.progression.offerCount);
    return ids.map((id) => ({ id, title: UPGRADES[id].title, desc: UPGRADES[id].desc, icon: UPGRADES[id].icon }));
  }

  /** Applies an upgrade if a level is pending and `seq` (when given) is the current offer. Returns false (no-op) otherwise. */
  choose(id: string, seq?: number): boolean {
    if (this.pendingLevels <= 0 || !(id in UPGRADES)) return false;
    if (seq !== undefined && seq !== this.offerSeq) return false;
    this.stats = UPGRADES[id as UpgradeId].apply(this.stats);
    this.pendingLevels--;
    return true;
  }
}
