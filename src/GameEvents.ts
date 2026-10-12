import type { TargetKind } from './combat';
import type { AbilityView } from './systems/abilities';

export type ThreatArrow = { x: number; y: number; angle: number; kind: TargetKind };

export type GameState = 'loading' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';

export type HudSnapshot = {
  hp: number;
  maxHp: number;
  exp: number;
  expToNext: number;
  level: number;
  timeSec: number;
  tethered: boolean;
};

export type UpgradeOffer = { id: string; title: string; desc: string; icon: string };

export type RunStats = { timeSec: number; kills: number; buildings: number; level: number };

export type GameEventMap = {
  stateChange: GameState;
  hud: HudSnapshot;
  expGain: number;
  levelUpOffer: { seq: number; offers: UpgradeOffer[] };
  gameOver: RunStats;
  threats: ThreatArrow[];
  abilities: AbilityView[];
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
