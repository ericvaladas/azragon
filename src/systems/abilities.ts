import { CONFIG } from '../config';

export type ActiveId = 'leap' | 'dash' | 'roar';
/** Abilities that need a ground point picked before they fire. */
export type AimId = 'leap' | 'dash';
export type AbilityView = { id: ActiveId; ready: boolean; cdFrac: number; aiming: boolean };

/** Button order, left to right. */
const IDS: readonly ActiveId[] = ['leap', 'dash', 'roar'];

/** Cooldowns, level unlocks, and the aim mode for Leap/Dash. */
export class Abilities {
  aiming: AimId | null = null;
  private cd: Record<ActiveId, number> = { leap: 0, dash: 0, roar: 0 };

  unlocked(id: ActiveId, level: number): boolean {
    return level >= CONFIG.abilities[id].unlockLevel;
  }

  ready(id: ActiveId, level: number): boolean {
    return this.unlocked(id, level) && this.cd[id] <= 0;
  }

  tick(dt: number): void {
    for (const id of IDS) this.cd[id] = Math.max(0, this.cd[id] - dt);
  }

  /** Button/key for an aimed ability: aim it when ready (replacing any other aim), or cancel if already aiming it. */
  toggleAim(id: AimId, level: number): AimId | null {
    this.aiming = this.aiming === id ? null : this.ready(id, level) ? id : null;
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = null;
  }

  /** Start the ability's cooldown; false (no-op) if not ready. Firing the aimed ability ends aiming. */
  trigger(id: ActiveId, level: number): boolean {
    if (!this.ready(id, level)) return false;
    this.cd[id] = CONFIG.abilities[id].cooldown;
    if (this.aiming === id) this.aiming = null;
    return true;
  }

  /** Unlocked abilities only, in button order. */
  view(level: number): AbilityView[] {
    return IDS.filter((id) => this.unlocked(id, level)).map((id) => ({
      id,
      ready: this.ready(id, level),
      cdFrac: this.cd[id] / CONFIG.abilities[id].cooldown,
      aiming: this.aiming === id,
    }));
  }

  reset(): void {
    this.cd = { leap: 0, dash: 0, roar: 0 };
    this.aiming = null;
  }
}
