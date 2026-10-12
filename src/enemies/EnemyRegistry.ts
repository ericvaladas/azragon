import type { Target } from '../combat';
import { SpawnDirector } from './SpawnDirector';
import { ENEMY_KINDS, type EnemyKind, type EnemySystem, type WorldContext } from './types';

/** Owns every enemy system plus the director; caches the live target list once per frame. */
export class EnemyRegistry {
  readonly director: SpawnDirector;
  private systems = new Map<EnemyKind, EnemySystem>();
  private cache: Target[] = [];
  private cacheValid = false;

  constructor(rng: () => number) {
    this.director = new SpawnDirector(rng);
  }

  add(s: EnemySystem): void {
    this.systems.set(s.kind, s);
  }

  get<T extends EnemySystem>(kind: EnemyKind): T {
    const s = this.systems.get(kind);
    if (!s) throw new Error(`No enemy system for ${kind}`);
    return s as T;
  }

  counts(): Record<EnemyKind, number> {
    const out = {} as Record<EnemyKind, number>;
    for (const k of ENEMY_KINDS) out[k] = this.systems.get(k)?.count() ?? 0;
    return out;
  }

  /** Spawns (when `spawning`), then updates every system. */
  update(dt: number, ctx: WorldContext, spawning: boolean): void {
    if (spawning) {
      for (const kind of this.director.update(dt, this.counts(), ctx.level)) this.systems.get(kind)?.spawn(ctx);
    }
    for (const s of this.systems.values()) s.update(dt, ctx);
    this.cacheValid = false;
  }

  /** Live targetable enemies; rebuilt at most once per update. */
  targets(): Target[] {
    if (!this.cacheValid) {
      this.cache = [];
      for (const s of this.systems.values()) for (const t of s.targets()) if (t.isAlive()) this.cache.push(t);
      this.cacheValid = true;
    }
    return this.cache;
  }

  clear(): void {
    for (const s of this.systems.values()) s.clear();
    this.director.reset();
    this.cacheValid = false;
  }
}
