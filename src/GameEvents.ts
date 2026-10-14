import type { TargetKind } from './combat';
import type { AbilityView } from './systems/abilities';
import type { RosterEntry } from './monsters/roster';

export type ThreatArrow = { x: number; y: number; angle: number; kind: TargetKind };

export type GameState = 'loading' | 'title' | 'select' | 'intro' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';

export type HudSnapshot = {
  hp: number;
  maxHp: number;
  exp: number;
  expToNext: number;
  level: number;
  timeSec: number;
  /** True during the level-up moment (EXP bar shown full, banner visible). */
  levelingUp: boolean;
};

export type UpgradeOffer = { id: string; title: string; desc: string };

export type RunStats = { timeSec: number; kills: number; buildings: number; level: number };

export type GameEventMap = {
  stateChange: GameState;
  hud: HudSnapshot;
  expGain: number;
  /** `all`: every available choice is listed (Konami-code levels), not the usual few. */
  levelUpOffer: { seq: number; level: number; offers: UpgradeOffer[]; all: boolean };
  gameOver: RunStats;
  threats: ThreatArrow[];
  abilities: AbilityView[];
  roster: { entries: RosterEntry[]; index: number };
  /** Whether the intro's skip hint shows: on when the intro starts, off once a skip has jumped to the reveal. */
  skipHint: boolean;
};

type Handler<T> = (data: T) => void;

export class GameEventEmitter {
  private listeners = new Map<keyof GameEventMap, Set<Handler<any>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof GameEventMap>(event: K, data: GameEventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
