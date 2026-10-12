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

export type AbilityId = 'acid' | 'storm' | 'chitin' | 'frenzy' | 'brood' | 'thrash' | 'spines' | 'swat' | 'nova' | 'mortar' | 'bubble' | 'reflect';
export const MAX_RANK = 3;
const ROMAN = ['', 'I', 'II', 'III'];

export const ABILITIES: Record<AbilityId, { title: string; icon: string; desc(rank: number): string }> = {
  acid: { title: 'Acid Footprints', icon: '🧪', desc: (r) => (r === 1 ? 'Steps leave burning acid' : 'Bigger, longer-lasting acid') },
  storm: { title: 'Spike Storm', icon: '🌩️', desc: (r) => (r === 1 ? 'Homing spike barrage every 6s' : '+3 spikes, fires faster') },
  chitin: { title: 'Chitin Deflection', icon: '🪲', desc: () => '+15% chance to deflect hits' },
  frenzy: { title: 'Feeding Frenzy', icon: '🩸', desc: () => '+6 HP per kill' },
  brood: { title: 'Brood Swarm', icon: '🐝', desc: (r) => (r === 1 ? 'Drones hunt aircraft every 10s' : '+2 drones') },
  spines: { title: 'Spine Shield', icon: '🦔', desc: (r) => (r === 1 ? 'Auto-shoot incoming shells and missiles' : 'Faster, wider spine defense') },
  swat: { title: 'Tail Swat+', icon: '🦂', desc: () => 'Tail swats flyers faster, harder, more at once' },
  nova: { title: 'Venom Nova', icon: '☢️', desc: (r) => (r === 1 ? 'Acid shockwave pulse every 7s' : 'Bigger, stronger, more frequent pulses') },
  mortar: { title: 'Acid Mortar', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs acid at artillery, SAMs, trucks' : 'More globs, bigger splash') },
  bubble: { title: 'Shield Bubble', icon: '🫧', desc: (r) => (r === 1 ? 'Auto: 3s invincibility when hit is coming' : 'Longer bubble, shorter cooldown') },
  reflect: { title: 'Reflect Shield', icon: '🔮', desc: (r) => (r === 1 ? 'Auto: bounce projectiles back at enemies' : 'Longer reflect, shorter cooldown') },
  thrash: { title: 'Thrash', icon: '🌀', desc: (r) => (r === 1 ? 'Tethers break 2x faster' : 'Tethers break even faster') },
};

const emptyRanks = (): Record<AbilityId, number> => ({ acid: 0, storm: 0, chitin: 0, frenzy: 0, brood: 0, thrash: 0, spines: 0, swat: 0, nova: 0, mortar: 0, bubble: 0, reflect: 0 });

export function expToNext(level: number): number {
  return Math.round(CONFIG.progression.expBase * Math.pow(level, CONFIG.progression.expExponent));
}

export class Progression {
  level = 1;
  exp = 0;
  stats: Stats = { ...BASE_STATS };
  pendingLevels = 0;
  ranks = emptyRanks();
  private picks = 0;
  /** Increments with every offer; a pick must name the offer it was made against. */
  offerSeq = 0;

  constructor(private rng: () => number) {}

  reset(): void {
    this.level = 1;
    this.exp = 0;
    this.stats = { ...BASE_STATS };
    this.pendingLevels = 0;
    this.ranks = emptyRanks();
    this.picks = 0;
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
      const abilities = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => this.ranks[id] < MAX_RANK);
      const pool: string[] = [...(Object.keys(UPGRADES) as UpgradeId[]), ...abilities];
      const ids = shuffle(pool, this.rng).slice(0, CONFIG.progression.offerCount);
      const early = this.picks < CONFIG.passives.earlyAbilityPicks;
      if (early && abilities.length > 0 && !ids.some((id) => id in ABILITIES)) {
        const choices = abilities.filter((a) => !ids.includes(a));
        ids[ids.length - 1] = choices[Math.floor(this.rng() * choices.length)]!;
      }
      return ids.map((id) => {
        if (id in ABILITIES) {
          const a = ABILITIES[id as AbilityId];
          const next = this.ranks[id as AbilityId] + 1;
          return { id, title: `${a.title} ${ROMAN[next]}`, desc: a.desc(next), icon: a.icon };
        }
        const u = UPGRADES[id as UpgradeId];
        return { id, title: u.title, desc: u.desc, icon: u.icon };
      });
    }

    /** Applies an upgrade or ranks up an ability if a level is pending and `seq` (when given) is current. */
    choose(id: string, seq?: number): boolean {
      if (this.pendingLevels <= 0) return false;
      if (seq !== undefined && seq !== this.offerSeq) return false;
      if (id in ABILITIES) {
        const a = id as AbilityId;
        if (this.ranks[a] >= MAX_RANK) return false;
        this.ranks[a]++;
      } else if (id in UPGRADES) {
        this.stats = UPGRADES[id as UpgradeId].apply(this.stats);
      } else {
        return false;
      }
      this.pendingLevels--;
      this.picks++;
      return true;
    }
}
