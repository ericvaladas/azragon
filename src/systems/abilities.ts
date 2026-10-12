import { CONFIG } from '../config';

export type ActiveId = 'leap' | 'dash' | 'roar';
/** Abilities that need a ground point picked before they fire (Dash fires straight ahead instead). */
export type AimId = 'leap';
export type AbilityView = { id: ActiveId; ready: boolean; cdFrac: number; aiming: boolean };

/** Button order, left to right. */
const IDS: readonly ActiveId[] = ['leap', 'dash', 'roar'];

/**
 * Active abilities: Leap is owned from the start; Dash and Roar are owned once picked at a level-up
 * (rank ≥ 1), and higher ranks shorten their cooldown. Also tracks Leap's aim mode.
 */
export class Abilities {
  aiming: AimId | null = null;
  private cd: Record<ActiveId, number> = { leap: 0, dash: 0, roar: 0 };
  private rank: Record<ActiveId, number> = { leap: 1, dash: 0, roar: 0 };

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

  private cooldown(id: ActiveId): number {
    return CONFIG.abilities[id].cooldown * (CONFIG.abilities.rankCooldown[this.rank[id]] ?? 1);
  }

  tick(dt: number): void {
    for (const id of IDS) this.cd[id] = Math.max(0, this.cd[id] - dt);
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
    this.cd = { leap: 0, dash: 0, roar: 0 };
    this.rank = { leap: 1, dash: 0, roar: 0 };
    this.aiming = null;
  }
}
