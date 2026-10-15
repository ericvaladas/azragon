import type * as THREE from 'three';
import type { DamageSource, OnDestroyed, Target } from '../combat';
import type { Particles } from '../systems/Particles';
import type { Vec2 } from '../util/math';

export type EnemyKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'artillery' | 'truck' | 'laser' | 'heli' | 'napalm';
export const ENEMY_KINDS: readonly EnemyKind[] = ['tank', 'jet', 'blimp', 'sam', 'artillery', 'truck', 'laser', 'heli', 'napalm'];

export type Difficulty = { hpMult: number; dmgMult: number };

/** Everything an enemy system may read or call during spawn/update. Rebuilt by GameScene each frame. */
export interface WorldContext {
  readonly monster: { readonly position: THREE.Vector3; readonly alive: boolean; readonly airborne: boolean };
  readonly difficulty: Difficulty;
  /** Player level: drives unlocks, spawn rate, difficulty, and salvo sizes. */
  readonly level: number;
  readonly rng: () => number;
  /** True where nothing may be placed (inside a landmark's footprint, or on river water). Optional: absent means nowhere is blocked. */
  blocked?(x: number, z: number): boolean;
  readonly particles: Particles;
  /**
   * The road network: nearest road point, nearest road point off every bridge deck (for things that sit on the
   * ground), and a waypoint route over existing segments (excluding `from`).
   */
  readonly roads: { nearest(p: Vec2): Vec2; nearestLand(p: Vec2): Vec2; path(from: Vec2, to: Vec2): Vec2[] };
  /** `attacker` is the enemy dealing the hit, when there is one (Overload fires beams back at it). */
  damageMonster(amount: number, source: DamageSource, attacker?: Target): void;
  damageBuildings(p: Vec2, r: number, amount: number): void;
  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  /** Spray where something hits the ground; does nothing unless the point is water. */
  splash(p: THREE.Vector3, size?: number): void;
  shake(amount: number): void;
  readonly onDestroyed: OnDestroyed;
}

export interface EnemySystem {
  readonly kind: EnemyKind;
  spawn(ctx: WorldContext): void;
  update(dt: number, ctx: WorldContext): void;
  /** Live, targetable entities (may include missiles for SAM silos). */
  targets(): readonly Target[];
  /** Concurrent count for spawn caps. */
  count(): number;
  clear(): void;
}
