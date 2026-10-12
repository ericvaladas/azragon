import { CONFIG } from '../config';

export type ActiveId = 'leap' | 'roar';
export type AbilityView = { id: ActiveId; unlocked: boolean; ready: boolean; cdFrac: number; aiming: boolean; unlockLevel: number };

const IDS: readonly ActiveId[] = ['leap', 'roar'];

/** Cooldowns, level unlocks, and Leap's aim mode for the two active abilities. */
export class Abilities {
  aiming = false;
  private cd: Record<ActiveId, number> = { leap: 0, roar: 0 };

  unlocked(id: ActiveId, level: number): boolean {
    return level >= CONFIG.abilities[id].unlockLevel;
  }

  ready(id: ActiveId, level: number): boolean {
    return this.unlocked(id, level) && this.cd[id] <= 0;
  }

  tick(dt: number): void {
    for (const id of IDS) this.cd[id] = Math.max(0, this.cd[id] - dt);
  }

  /** Leap button / Space: enter aim when ready, or leave it. Returns the new aiming state. */
  toggleAim(level: number): boolean {
    this.aiming = this.aiming ? false : this.ready('leap', level);
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = false;
  }

  /** Start the ability's cooldown; false (no-op) if not ready. */
  trigger(id: ActiveId, level: number): boolean {
    if (!this.ready(id, level)) return false;
    this.cd[id] = CONFIG.abilities[id].cooldown;
    if (id === 'leap') this.aiming = false;
    return true;
  }

  view(level: number): AbilityView[] {
    return IDS.map((id) => ({
      id,
      unlocked: this.unlocked(id, level),
      ready: this.ready(id, level),
      cdFrac: this.cd[id] / CONFIG.abilities[id].cooldown,
      aiming: id === 'leap' && this.aiming,
      unlockLevel: CONFIG.abilities[id].unlockLevel,
    }));
  }

  reset(): void {
    this.cd = { leap: 0, roar: 0 };
    this.aiming = false;
  }
}
