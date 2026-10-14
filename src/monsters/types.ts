import type * as THREE from 'three';
import type { ParticleKind } from '../systems/Particles';
import type { PoolSpec } from '../systems/Progression';
import type { TentacleArms } from './kraken/TentacleArms';
import type { SwatTiming } from '../monster/tailSwat';

/** Playable creatures (widened as each one is built). */
export type MonsterId = 'insect' | 'kaiju' | 'kraken' | 'golem';
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

/** `multi`: independent tentacle strikes (Kraken), driven by the body's `arms`. `fist`: Rending Claws (Wendigo) — a slam ahead or a backhand to the side, on the shared melee timeline. */
export type MeleeShape = { kind: 'point' } | { kind: 'arc'; halfAngle: number } | { kind: 'multi' } | { kind: 'fist' };

/** Colours the shared effect systems take on for this monster. */
export type FxTheme = {
  spike: number;
  glob: number;
  pool: number;
  /** Footprint/landing pool opacity (default 0.55). */
  poolOpacity?: number;
  /** Pools are drawn over the crater decal too (polygon offset). */
  poolLift?: boolean;
  nova: number;
  particle: ParticleKind;
  /** Particles shown where a defensive shot is stopped. */
  intercept: ParticleKind;
  /** What the storm passive fires: homing spikes (default) or soft homing wisps. */
  stormShot?: 'spike' | 'wisp';
  /** How the mortar passive strikes: lobbed globs (default) or a black-fire gaze (Evil Eye). */
  mortarGaze?: boolean;
  /** When set, a visible shard of this colour flies from the body to each shot the intercept passive stops. */
  shards?: number;
  /**
   * Intercepts show as ink: a blob squirts from the body's siphon to each stopped shot and bursts into a lingering
   * cloud, and a faint ink haze hangs around the body while shots are banked (Kraken's Ink Cloud).
   */
  inkJet?: boolean;
};

/** A Rending Claws strike's kind (Wendigo), decided once by the game as it starts; the body poses that one. */
export type StrikeKind = 'slam' | 'backhand';

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
  melee: { t: number; side: number; target: THREE.Vector3; kind?: StrikeKind } | null;
  /** Active leap: seconds since it started, its duration, and the fraction of it crouched before liftoff. */
  leap?: { t: number; duration: number; crouch: number } | null;
  /** Active anti-air strike: seconds since it started, reach weight (swatWeight curve) toward the world target. */
  antiAir: { t: number; weight: number; target: THREE.Vector3 } | null;
  roaring: boolean;
  airborne: boolean;
  dashing: boolean;
  /** Active Tail Sweep: seconds in, which side (+1 = left/+X), its timeline. */
  tailSweep: { t: number; side: number; timing: { windup: number; impact: number; end: number } } | null;
  /** World point the head should turn toward (breath aim), or null to face forward. */
  lookAt: THREE.Vector3 | null;
  /** Ranged charge 0..1 (Kaiju plates). */
  charge: number;
  /** Ravenous Hunger heat 0..1 (Wendigo); 0 for every other body. */
  heat: number;
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
  /** How far (rad) the head still is from facing the last `lookAt` point; 0 for bodies that aim with the whole body. */
  aimError(): number;
  /** World point the monster's own projectiles (storm, mortar, interceptors) launch from. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3;
  /** World point on the body's side facing `toward` that ink squirts from (Kraken siphon). Optional; launchOrigin when absent. */
  siphon?(toward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** Per-tentacle strike state (Kraken); absent for single-strike bodies. */
  readonly arms?: TentacleArms;
  /** The nova passive just fired (Wendigo: both clawed hands slam the ground). Optional. */
  nova?(): void;
  dispose(): void;
}

export type MonsterKind = PoolSpec & {
  id: MonsterId;
  name: string;
  blurb: string;
  /** Select-screen ratings, 1..5. */
  pips: { toughness: number; power: number; speed: number };
  moves: readonly { label: string }[];
  stats: MonsterStats;
  melee: MeleeShape;
  /** `gaze`: Dread Gaze (Wendigo): it looks at the target, which bursts into black fire; nothing travels. */
  ranged: 'spikes' | 'breath' | 'hurl' | 'gaze';
  /** `hands`: Shadow Hands (Wendigo), spectral arms rising from the ground under the flyer. */
  antiAir: 'tail' | 'bite' | 'lash' | 'hands';
  /** Fraction of a leap this kind spends crouched on the ground before liftoff (lands at the same moment); 0 when absent. */
  leapCrouch?: number;
  /** Dash speed multiplier: the same range, covered over CONFIG.abilities.dash.duration / dashSpeed; 1 when absent. */
  dashSpeed?: number;
  /** Spine Shield intercept-rate multiplier for this kind's version of it; 1 when absent. */
  interceptRate?: number;
  /** This kind's own anti-air timeline (impact, end); the shared SWAT_TIMES when absent. */
  swatTiming?: SwatTiming;
  /** Has the auto Tail Sweep melee (CONFIG.kaiju.tail). */
  tailSweep: boolean;
  fx: FxTheme;
  createBody(): MonsterBody;
};
