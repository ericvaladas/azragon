import { CONFIG } from '../config';

export type ActiveId = 'leap' | 'dash' | 'roar' | 'bubble' | 'ultimate';
/** Abilities that need a ground point picked before they fire (Dash fires straight ahead instead). */
export type AimId = 'leap';
/** `label`: the button's name when it isn't the ability's own (a monster's ultimate). */
export type AbilityView = { id: ActiveId; ready: boolean; cdFrac: number; aiming: boolean; label?: string };

/** Button order, left to right. */
const IDS: readonly ActiveId[] = ['leap', 'dash', 'roar', 'bubble', 'ultimate'];

/** What keeps the ultimate from going off right now. */
export type UltimateState = { playing: boolean; alive: boolean; airborne: boolean; dashing: boolean; snared: boolean; leveling: boolean; running: boolean };

/** The ultimate is blocked unless playing and alive, and not airborne, dashing, snared, in the level-up moment or already running. */
export function ultimateBlocked(s: UltimateState): boolean {
  return !s.playing || !s.alive || s.airborne || s.dashing || s.snared || s.leveling || s.running;
}

/**
 * Active abilities: Leap is owned from the start; Dash, Roar and Shield Bubble are owned once picked at a level-up
 * (rank ≥ 1), and higher ranks shorten their cooldown; the ultimate is owned (rank 1) by a monster that has one, on
 * its own long cooldown. Also tracks Leap's aim mode.
 */
export class Abilities {
  aiming: AimId | null = null;
  private cd: Record<ActiveId, number> = Abilities.freshCooldowns();
  private rank: Record<ActiveId, number> = { leap: 1, dash: 0, roar: 0, bubble: 0, ultimate: 0 };

  /** A new run's cooldowns: all clear but the ultimate's, which is full unless CONFIG.ultimate.startReady. */
  private static freshCooldowns(): Record<ActiveId, number> {
    return { leap: 0, dash: 0, roar: 0, bubble: 0, ultimate: CONFIG.ultimate.startReady ? 0 : CONFIG.ultimate.cooldown };
  }

  setRank(id: ActiveId, rank: number): void {
    this.rank[id] = rank;
    if (rank <= 0 && this.aiming === id) this.aiming = null;
  }

  unlocked(id: ActiveId): boolean {
    return this.rank[id] > 0;
  }

  ready(id: ActiveId): boolean {
    return this.unlocked(id) && this.cd[id] <= 0;
  }

  /** Seconds from firing to ready again. Shield Bubble's counts from when it goes up: its rank's duration plus cooldown. */
  private cooldown(id: ActiveId): number {
    if (id === 'ultimate') return CONFIG.ultimate.cooldown;
    if (id === 'bubble') {
      const B = CONFIG.passives.bubble;
      return B.duration[this.rank.bubble]! + B.cooldown[this.rank.bubble]!;
    }
    return CONFIG.abilities[id].cooldown * (CONFIG.abilities.rankCooldown[this.rank[id]] ?? 1);
  }

  /** Cooldowns recover by `cdDt` (sped up by Haste When Hurt); the ultimate's by plain game time `dt`. */
  tick(cdDt: number, dt: number = cdDt): void {
    for (const id of IDS) this.cd[id] = Math.max(0, this.cd[id] - (id === 'ultimate' ? dt : cdDt));
  }

  /** Button/key for an aimed ability: aim it when ready (replacing any other aim), or cancel if already aiming it. */
  toggleAim(id: AimId): AimId | null {
    this.aiming = this.aiming === id ? null : this.ready(id) ? id : null;
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = null;
  }

  /** Start the ability's cooldown; false (no-op) if not ready. Firing the aimed ability ends aiming. */
  trigger(id: ActiveId): boolean {
    if (!this.ready(id)) return false;
    this.cd[id] = this.cooldown(id);
    // Firing any ability ends a pending Leap aim.
    this.aiming = null;
    return true;
  }

  /** Owned abilities only, in button order. */
  view(): AbilityView[] {
    return IDS.filter((id) => this.unlocked(id)).map((id) => ({
      id,
      ready: this.ready(id),
      cdFrac: this.cd[id] / this.cooldown(id),
      aiming: this.aiming === id,
    }));
  }

  /** New run: cooldowns cleared, only Leap owned. */
  reset(): void {
    this.cd = Abilities.freshCooldowns();
    this.rank = { leap: 1, dash: 0, roar: 0, bubble: 0, ultimate: 0 };
    this.aiming = null;
  }
}

/** Nothing can touch the monster: under the Shield Bubble or while an ultimate runs (no damage, no snare, no Laser Absorb spent). */
export function untouchable(bubble: boolean, ultimateRunning: boolean): boolean {
  return bubble || ultimateRunning;
}

/** The body's automatic strikes (Tail Sweep, Snap Bite) go off, except while an ultimate holds the monster. */
export function autoStrikes(ultimateRunning: boolean): boolean {
  return !ultimateRunning;
}

/** A tentacle slam lands its damage, except while an ultimate runs (Ink Storm's grab is only for show). */
export function armSlamCounts(ultimateRunning: boolean): boolean {
  return !ultimateRunning;
}

/** Walking swings the camera behind the monster unless the player is panning it or an ultimate holds it. */
export function cameraFollowsWalk(pointerHeld: boolean, ultimateRunning: boolean): boolean {
  return !pointerHeld && !ultimateRunning;
}
