import type * as THREE from 'three';
import type { ParticleKind } from '../systems/Particles';
import type { PoolSpec } from '../systems/Progression';

/** Playable creatures (widened as each one is built). */
export type MonsterId = 'insect' | 'kaiju';
/** Everything the select carousel shows, including creatures still to come. */
export type RosterId = 'insect' | 'kaiju' | 'kraken' | 'golem';

export type MonsterStats = {
  maxHp: number;
  moveSpeed: number;
  turnRate: number;
  /** Multiplies all of this monster's damage (on top of upgrades). */
  damageMult: number;
  /** Gait stride, model units (before CONFIG.monster.scale). */
  strideLength: number;
  bodyRadius: number;
  footRadius: number;
  footDamage: number;
  meleeRange: number;
  /** Point melee: splash radius at the strike point (unused by arc melee). */
  meleeRadius: number;
  meleeDamage: number;
  meleeCooldown: number;
  /** Melee timeline, seconds after the strike starts: windup ends, impact lands, strike ends. */
  meleeTiming: { windup: number; impact: number; end: number };
  rangedRange: number;
  rangedDamage: number;
  rangedCooldown: number;
  /** Head height (model units) that anti-air reach and defensive shots are measured from. */
  headHeight: number;
  /** Standing bounding size in world metres; the intro cocoon is sized from it. */
  size: { width: number; length: number; height: number };
};

export type MeleeShape = { kind: 'point' } | { kind: 'arc'; halfAngle: number };

/** Colours the shared effect systems take on for this monster. */
export type FxTheme = { spike: number; glob: number; pool: number; nova: number; particle: ParticleKind };

/** One frame of pose input for a body; positions are world space. */
export type BodyFrame = {
  dt: number;
  time: number;
  cycle: number;
  prevCycle: number;
  /** 0..1, how engaged the gait is. */
  motion: number;
  pose: { dip: number; pitch: number; collapse: number };
  /** Active melee strike: seconds since start, which side (0 = left/+X, 1 = right), world target. */
  melee: { t: number; side: number; target: THREE.Vector3 } | null;
  /** Active anti-air strike: reach weight (tailSwat curve) toward the world target. */
  antiAir: { weight: number; target: THREE.Vector3 } | null;
  roaring: boolean;
  /** Ranged charge 0..1 (Kaiju plates). */
  charge: number;
  flash: boolean;
  glow: number;
};

export interface MonsterBody {
  /** Positioned, rotated and scaled by Monster; the body poses everything inside it. */
  readonly root: THREE.Group;
  /** Pose for this frame; call `onFootLand(worldPoint)` for every foot that touches down. */
  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void;
  /** World point ranged attacks leave from. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export type MonsterKind = PoolSpec & {
  id: MonsterId;
  name: string;
  blurb: string;
  /** Select-screen ratings, 1..5. */
  pips: { toughness: number; power: number; speed: number };
  moves: readonly { icon: string; label: string }[];
  stats: MonsterStats;
  melee: MeleeShape;
  ranged: 'spikes' | 'breath';
  antiAir: 'tail' | 'bite';
  fx: FxTheme;
  createBody(): MonsterBody;
};
