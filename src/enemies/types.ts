import type * as THREE from 'three';
import type { DamageSource, OnDestroyed, Target } from '../combat';
import type { Particles } from '../systems/Particles';
import type { Vec2 } from '../util/math';
import type { OpenSite } from '../world/City';

export type EnemyKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'artillery' | 'truck' | 'laser' | 'heli' | 'napalm' | 'osprey' | 'gustav';
export const ENEMY_KINDS: readonly EnemyKind[] = ['tank', 'jet', 'blimp', 'sam', 'artillery', 'truck', 'laser', 'heli', 'napalm', 'osprey', 'gustav'];

export type Difficulty = { hpMult: number; dmgMult: number };

/** Everything an enemy system may read or call during spawn/update. Rebuilt by GameScene each frame. */
export interface WorldContext {
  /**
   * The monster: where it is and which way it faces, whether it is alive or mid-leap, its body radius, standing
   * width and height (world m), where a leap in progress will land (null when not leaping), and its top surface:
   * the height above its position at a point (lx, lz) in its own frame (+X left, +Z forward), 0 off its body.
   */
  readonly monster: {
    readonly position: THREE.Vector3;
    readonly yaw: number;
    readonly surface: (lx: number, lz: number) => number;
    readonly alive: boolean;
    readonly airborne: boolean;
    readonly bodyRadius: number;
    readonly width: number;
    readonly height: number;
    readonly leapTo: Vec2 | null;
  };
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
  /**
   * Direction (unit, on the ground) from the monster to place a new enemy: anywhere around it, or ahead of it while it
   * runs away (CONFIG.runaway), so the army appears in its path.
   */
  spawnDir(): Vec2;
  /** Open ground (rubble lots, park and plaza pads) between rMin and rMax m from the monster. */
  openGround(rMin: number, rMax: number): readonly OpenSite[];
  /** Snares the monster for `duration` s (an Osprey net); while it is mid-leap, the snare starts when it lands. */
  snareMonster(duration: number): void;
  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  /** The Schwerer Gustav's huge shell: always hits, trails smoke. */
  fireGustavShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  /** Spray where something hits the ground; does nothing unless the point is water. */
  splash(p: THREE.Vector3, size?: number): void;
  shake(amount: number): void;
  readonly onDestroyed: OnDestroyed;
}

export interface EnemySystem {
  readonly kind: EnemyKind;
  /** Spawns one; false when there was nowhere to put it (the director then refunds its cost). */
  spawn(ctx: WorldContext): boolean | void;
  update(dt: number, ctx: WorldContext): void;
  /** Live, targetable entities (may include missiles for SAM silos). */
  targets(): readonly Target[];
  /** Concurrent count for spawn caps. */
  count(): number;
  clear(): void;
}
