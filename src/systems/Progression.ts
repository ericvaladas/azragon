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

export const UPGRADES: Record<UpgradeId, { title: string; desc: string; apply(s: Stats): Stats }> = {
  damage: { title: 'Damage', desc: '+20% damage', apply: (s) => ({ ...s, damageMult: s.damageMult * 1.2 }) },
  attackSpeed: { title: 'Attack Speed', desc: 'Attacks 15% faster', apply: (s) => ({ ...s, cooldownMult: s.cooldownMult * 0.85 }) },
  vitality: { title: 'Max HP', desc: '+20% max HP, heal 30%', apply: (s) => ({ ...s, maxHpMult: s.maxHpMult * 1.2 }) },
  regen: { title: 'HP Regen', desc: '+6 HP per second', apply: (s) => ({ ...s, regenBonus: s.regenBonus + 6 }) },
  stompRadius: { title: 'Attack Radius', desc: '+20% stomp radius', apply: (s) => ({ ...s, stompRadiusMult: s.stompRadiusMult * 1.2 }) },
  multiShot: { title: 'Multi-Shot', desc: '+1 spike per shot', apply: (s) => ({ ...s, extraSpikes: s.extraSpikes + 1 }) },
  moveSpeed: { title: 'Move Speed', desc: '+15% move speed', apply: (s) => ({ ...s, moveSpeedMult: s.moveSpeedMult * 1.15 }) },
};

export type AbilityId = 'dash' | 'roar' | 'storm' | 'chitin' | 'overload' | 'spines' | 'swat' | 'nova' | 'mortar' | 'bubble' | 'reflect' | 'core';
export const MAX_RANK = 3;
const ROMAN = ['', 'I', 'II', 'III'];

/** What a monster's level-up pool offers beyond the shared abilities, and its display names. */
export type PoolSpec = {
  signatures: readonly AbilityId[];
  abilityText: Partial<Record<AbilityId, { title?: string; desc(rank: number): string }>>;
  upgradeText: Partial<Record<UpgradeId, { title?: string; desc?: string }>>;
};

/** Offered to every monster. */
export const SHARED_ABILITIES: readonly AbilityId[] = ['dash', 'roar', 'bubble', 'reflect', 'overload', 'core'];

/** Until a monster is set: the Insect Titan's pool (its signatures, default names). */
const DEFAULT_POOL: PoolSpec = {
  signatures: ['storm', 'chitin', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {},
  upgradeText: {},
};

export const ABILITIES: Record<AbilityId, { title: string; desc(rank: number): string }> = {
  dash: { title: 'Dash', desc: (r) => (r === 1 ? 'Button: charge and flatten a path (E)' : 'Dash recharges faster') },
  roar: { title: 'Roar', desc: (r) => (r === 1 ? 'Button: shockwave, downs flyers (R)' : 'Roar recharges faster') },
  storm: { title: 'Homing Barrage', desc: (r) => (r === 1 ? 'Homing spike barrage every 8s' : '+2 spikes, fires faster') },
  chitin: { title: 'Deflect', desc: () => '+15% chance to deflect hits' },
  spines: { title: 'Missile Defense', desc: (r) => (r === 1 ? 'Auto-shoot incoming shells and missiles' : 'Faster, wider spine defense') },
  swat: { title: 'Anti-Air', desc: (r) => (r === 1 ? 'Tail swats nearby flyers' : 'Swats faster, harder, more at once') },
  nova: { title: 'Area Pulse', desc: (r) => (r === 1 ? 'Acid shockwave pulse every 7s' : 'Bigger, stronger, more frequent pulses') },
  mortar: { title: 'Auto Mortar', desc: (r) => (r === 1 ? 'Lobs acid at artillery, SAMs, trucks' : 'More globs, bigger splash') },
  bubble: { title: 'Shield Bubble', desc: (r) => (r === 1 ? 'Button: 3s invincibility (T)' : 'Longer bubble, recharges faster') },
  core: { title: 'Haste When Hurt', desc: (r) => (r === 1 ? 'Faster cooldowns when hurt' : 'Even faster cooldowns when hurt') },
  reflect: { title: 'Reflect Shield', desc: (r) => (r === 1 ? 'Auto: bounce projectiles back at enemies' : 'Longer reflect, shorter cooldown') },
  overload: { title: 'Laser Absorb', desc: (r) => (r === 1 ? 'Absorb a laser to cut your cooldowns' : 'Cuts more, recharges faster') },
};

const emptyRanks = (): Record<AbilityId, number> => ({ dash: 0, roar: 0, storm: 0, chitin: 0, overload: 0, spines: 0, swat: 0, nova: 0, mortar: 0, bubble: 0, reflect: 0, core: 0 });

export function expToNext(level: number): number {
  const P = CONFIG.progression;
  const early = level <= P.earlyLevels ? P.earlyMult : 1;
  return Math.round(P.expBase * Math.pow(level, P.expExponent) * early);
}

export class Progression {
  level = 1;
  exp = 0;
  stats: Stats = { ...BASE_STATS };
  pendingLevels = 0;
  ranks = emptyRanks();
  private picks = 0;
  private pool: PoolSpec = DEFAULT_POOL;
  /** Increments with every offer; a pick must name the offer it was made against. */
  offerSeq = 0;

  constructor(private rng: () => number) {}

  /** The monster whose signatures and display names the level-up offers use. */
  setPool(pool: PoolSpec): void {
    this.pool = pool;
  }

  /** Abilities this monster can take, in ABILITIES order (so offers stay deterministic per seed). */
  private poolAbilities(): AbilityId[] {
    return (Object.keys(ABILITIES) as AbilityId[]).filter((id) => SHARED_ABILITIES.includes(id) || this.pool.signatures.includes(id));
  }

  reset(): void {
    this.level = 1;
    this.exp = 0;
    this.stats = { ...BASE_STATS };
    this.pendingLevels = 0;
    this.ranks = emptyRanks();
    this.picks = 0;
  }

  /** The level the next pending choice is for (levels gained together are chosen for in order). */
  get choosingLevel(): number {
    return this.level - this.pendingLevels + 1;
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

    /** A random `offerCount` choices, or with `all`, every available choice (upgrades, then abilities, in definition order). */
    offer(all = false): UpgradeOffer[] {
      this.offerSeq++;
      const abilities = this.poolAbilities().filter((id) => this.ranks[id] < MAX_RANK);
      const pool: string[] = [...(Object.keys(UPGRADES) as UpgradeId[]), ...abilities];
      const ids = all ? pool : shuffle(pool, this.rng).slice(0, CONFIG.progression.offerCount);
      const early = this.picks < CONFIG.passives.earlyAbilityPicks;
      if (!all && early && abilities.length > 0 && !ids.some((id) => id in ABILITIES)) {
        const choices = abilities.filter((a) => !ids.includes(a));
        ids[ids.length - 1] = choices[Math.floor(this.rng() * choices.length)]!;
      }
      return ids.map((id) => {
        if (id in ABILITIES) {
          const base = ABILITIES[id as AbilityId];
          const a = this.pool.abilityText[id as AbilityId];
          const next = this.ranks[id as AbilityId] + 1;
          return { id, title: `${a?.title ?? base.title} ${ROMAN[next]}`, desc: (a ?? base).desc(next) };
        }
        const u = UPGRADES[id as UpgradeId];
        const t = this.pool.upgradeText[id as UpgradeId];
        return { id, title: t?.title ?? u.title, desc: t?.desc ?? u.desc };
      });
    }

    /** Applies an upgrade or ranks up an ability if a level is pending and `seq` (when given) is current. */
    choose(id: string, seq?: number): boolean {
      if (this.pendingLevels <= 0) return false;
      if (seq !== undefined && seq !== this.offerSeq) return false;
      if (id in ABILITIES) {
        const a = id as AbilityId;
        if (!this.poolAbilities().includes(a)) return false;
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
