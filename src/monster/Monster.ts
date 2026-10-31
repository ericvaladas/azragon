import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDelta, dist2, yawTo, type Vec2 } from '../util/math';
import { addSilhouette } from '../render/silhouette';
import { leapPeak, leapPosition } from './leap';
import { SWAT_TIMES, swatWeight, type SwatTiming } from './tailSwat';
import type { BodyFrame, MonsterBody, MonsterKind, MonsterStats, StrikeKind } from '../monsters/types';

type MeleeTiming = MonsterStats['meleeTiming'];

/** How far (rad) a roar leans the body back at its height. */
const ROAR_LEAN = 0.45;
const FACE_BEFORE_WALK = 1.0; // radians of yaw error allowed while walking

/** Feet that touch down while the monster is held do nothing. */
const noLanding = (): void => {};

/**
 * The player's monster: the logic every creature shares (movement, HP, cooldowns, attack timelines,
 * Leap/Dash/Roar poses). The creature itself — model, gait, stats — comes from its MonsterKind.
 */
export class Monster {
  readonly position = new THREE.Vector3();
  kind: MonsterKind;
  body: MonsterBody;
  yaw = 0;
  hp: number;
  maxHp: number;
  alive = true;
  crouch = false;
  /** Gold level-up glow, 0..1; the hit flash takes priority. */
  glow = 0;
  /** Ranged charge 0..1, shown by bodies that telegraph it (Kaiju plates). */
  charge = 0;
  /** Haste When Hurt heat 0..1, written by GameScene. */
  heat = 0;
  /** How many times as fast the melee and ranged cooldowns recover (Haste When Hurt), written by GameScene. */
  cooldownRate = 1;
  /** World point the head should turn toward (Kaiju breath), or null. */
  lookAt: THREE.Vector3 | null = null;
  /** Extra body pose offsets driven by attacks, abilities, the intro, and death. */
  readonly pose = { dip: 0, pitch: 0, collapse: 0 };
  onLeapLand: (p: THREE.Vector3) => void = () => {};
  /** Called each time a ranged attack spends the ranged cooldown (it really went off). */
  onRangedSpent: () => void = () => {};
  onFootLand: (p: THREE.Vector3) => void = () => {};
  onMeleeImpact: (p: THREE.Vector3) => void = () => {};
  /** Fires once per anti-air strike, when the tail tip or jaws reach the target. */
  onSwatImpact: () => void = () => {};
  /** Fires once per Tail Sweep, when the tail lands. */
  onTailImpact: () => void = () => {};

  private cycle = 0;
  private lastCycle = 0;
  private motion = 0;
  private flashT = 0;
  /** Shared by every material of the body: how black it is drawn (see setSilhouette). */
  private silhouette = { value: 0 };
  private leapT = -1;
  /** Held at this height by an ultimate (null when free). */
  private heldY: number | null = null;
  private braceW = 0;
  private blazeW = 0;
  private roarW = 0;
  private dashT = -1;
  private dashDuration = 1;
  private dashFrom = { x: 0, z: 0 };
  private dashTo = { x: 0, z: 0 };
  private leapFrom = { x: 0, z: 0 };
  private leapTo = { x: 0, z: 0 };
  /** This leap's height: lower for a shorter jump. */
  private leapHeight = 0;
  private roarT = -1;
  private roarD: number = CONFIG.abilities.roar.duration;
  private swatT = -1;
  private swatTarget: THREE.Vector3 | null = null;
  private swatHit = false;
  private tailT = -1;
  private tailSide = 1;
  private tailHit = false;
  private tailTiming = { windup: 0, impact: 0, end: 0 };
  private tailFrame = { t: 0, side: 1, timing: this.tailTiming };
  private meleeCd = 0;
  private rangedCd = 0;
  private meleeT = -1;
  /** The running strike's timeline. */
  private meleeTiming: MeleeTiming = { windup: 0, impact: 0, end: 0 };
  private impactDone = false;
  private meleeSide = 0;
  private strikePoint = new THREE.Vector3();
  private frame: BodyFrame = {
    dt: 0, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: this.pose,
    melee: null, antiAir: null, roaring: false, roarDuration: CONFIG.abilities.roar.duration, airborne: false, carried: false, brace: 0, blaze: 0, roar: 0, dashing: false, tailSweep: null, lookAt: null, charge: 0, heat: 0, flash: false, glow: 0,
  };
  private meleeFrame: { t: number; side: number; target: THREE.Vector3; kind?: StrikeKind } = { t: 0, side: 0, target: this.strikePoint };
  /** The running strike's kind, when its starter decided one (the Wendigo's slam or backhand). */
  private meleeKind: StrikeKind | undefined = undefined;
  private antiAirFrame = { t: 0, weight: 0, target: new THREE.Vector3() };
  private leapFrame = { t: 0, duration: 0, crouch: 0 };

  constructor(
    private scene: THREE.Scene,
    kind: MonsterKind,
  ) {
    this.kind = kind;
    this.hp = this.maxHp = kind.stats.maxHp;
    this.body = this.mount(kind);
  }

  private mount(kind: MonsterKind): MonsterBody {
    const b = kind.createBody();
    addSilhouette(b.root, this.silhouette);
    b.root.scale.setScalar(CONFIG.monster.scale);
    this.scene.add(b.root);
    return b;
  }

  /** Draw the whole body darkened toward a solid black silhouette: 0 = normal, 1 = black (the intro reveal). */
  setSilhouette(k: number): void {
    this.silhouette.value = k;
  }

  /** Become another creature (select screen): new body and stats, fresh state, same visibility. */
  setKind(kind: MonsterKind): void {
    if (kind === this.kind) return;
    const visible = this.visible;
    this.scene.remove(this.body.root);
    this.body.dispose();
    this.kind = kind;
    this.body = this.mount(kind);
    this.visible = visible;
    this.reset();
  }

  get visible(): boolean {
    return this.body.root.visible;
  }

  set visible(v: boolean) {
    this.body.root.visible = v;
  }

  /** How far (rad) the head is from facing `lookAt` (as of the last animate). */
  aimError(): number {
    return this.body.aimError();
  }

  /** World point the monster's own projectiles launch from (stinger tip, back vents, the Wendigo's flanks). */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.body.launchOrigin(out);
  }

  /** World point ink squirts from toward `toward` (the Kraken's siphon); the launch origin for other bodies. */
  siphonOrigin(toward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return this.body.siphon ? this.body.siphon(toward, out) : this.body.launchOrigin(out);
  }

  /** World point ranged attacks leave from (stinger tip, jaws). */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.body.rangedOrigin(out);
  }

  /** Off the ground: leaping, once past any crouch before liftoff. */
  get airborne(): boolean {
    if (this.heldY !== null) return this.heldY > 0;
    return this.leapT >= (this.kind.leapCrouch ?? 0) * CONFIG.abilities.leap.duration;
  }

  /** Where the current leap lands; null when not leaping. */
  get leapTarget(): Vec2 | null {
    return this.leapT >= 0 ? this.leapTo : null;
  }

  /** Leaping, roaring, dashing or held: the brain must not move or attack. */
  get busy(): boolean {
    return this.leapT >= 0 || this.roarT >= 0 || this.dashT >= 0 || this.heldY !== null;
  }

  /**
   * An ultimate holds the monster at `height` (m) above where it stands: busy, airborne while above the ground, its
   * feet never landing, its body bracing against the ground by `brace`, its glow blazing by `blaze`, and roaring
   * (leaning back) by `roar` (0..1 each);
   * `null` sets it down on the ground and back to normal control.
   */
  hold(height: number | null, brace = 0, blaze = 0, roar = 0): void {
    this.braceW = brace;
    this.blazeW = blaze;
    this.roarW = roar;
    if (height === null && this.heldY !== null) {
      this.position.y = 0;
      this.pose.dip = 60;
    }
    this.heldY = height;
    if (height !== null) this.position.y = height;
  }

  /** Stops a dash where the monster stands; the body settles out of the charge pose normally. */
  endDash(): void {
    this.dashT = -1;
  }

  get dashing(): boolean {
    return this.dashT >= 0;
  }

  get tailSweeping(): boolean {
    return this.tailT >= 0;
  }

  /** Tail Sweep toward `side` (+1 left, -1 right) on its own timeline; it never stops walking. */
  startTailSweep(side: number, timing: { windup: number; impact: number; end: number }): void {
    this.tailT = 0;
    this.tailSide = side;
    this.tailHit = false;
    Object.assign(this.tailTiming, timing);
  }

  /** This kind's anti-air timeline. */
  private get swatTimes(): SwatTiming {
    return this.kind.swatTiming ?? SWAT_TIMES;
  }

  get swatting(): boolean {
    return this.swatT >= 0;
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.hp = this.maxHp = this.kind.stats.maxHp;
    this.alive = true;
    this.cycle = this.lastCycle = 0;
    this.motion = 0;
    this.pose.dip = this.pose.pitch = this.pose.collapse = 0;
    this.meleeCd = this.rangedCd = 0;
    this.meleeT = -1;
    this.leapT = -1;
    this.heldY = null;
    this.roarT = -1;
    this.swatT = -1;
    this.swatTarget = null;
    this.tailT = -1;
    this.dashT = -1;
    this.crouch = false;
    this.charge = 0;
    this.heat = 0;
    this.cooldownRate = 1;
    this.lookAt = null;
  }

  /**
   * Dash: charge in a straight line along the ground to `to`, at CONFIG.abilities.dash.speedMult × the walk speed
   * (× `speedMult`, the Move Speed upgrades).
   */
  startDash(to: Vec2, speedMult = 1): void {
    this.dashFrom = { x: this.position.x, z: this.position.z };
    this.dashTo = { x: to.x, z: to.z };
    const speed = this.kind.stats.moveSpeed * CONFIG.abilities.dash.speedMult * speedMult;
    this.dashDuration = Math.max(1e-3, Math.hypot(to.x - this.dashFrom.x, to.z - this.dashFrom.z) / speed);
    this.dashT = 0;
    this.yaw = yawTo(this.dashFrom, this.dashTo);
    this.meleeT = -1;
  }

  startLeap(to: Vec2): void {
    this.leapFrom = { x: this.position.x, z: this.position.z };
    this.leapTo = { x: to.x, z: to.z };
    const L = CONFIG.abilities.leap;
    this.leapHeight = leapPeak(Math.hypot(to.x - this.leapFrom.x, to.z - this.leapFrom.z), L.range, L.peak, L.minPeak);
    this.leapT = 0;
    this.yaw = yawTo(this.leapFrom, this.leapTo);
    this.meleeT = -1;
  }

  /** Anti-air strike (Tail Swat / Snap Bite) at `target`, a live world position followed as it moves. */
  startSwat(target: THREE.Vector3): void {
    this.swatT = 0;
    this.swatTarget = target;
    this.swatHit = false;
  }

  /** Roar for `duration` world seconds (the howl pose and `busy` last that long). */
  startRoar(duration: number = CONFIG.abilities.roar.duration): void {
    this.roarD = duration;
    this.roarT = 0;
    this.meleeT = -1;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Rotate toward p at the capped turn rate. Returns remaining |yaw error|. */
  faceToward(p: Vec2, dt: number): number {
    const target = yawTo({ x: this.position.x, z: this.position.z }, p);
    const err = angleDelta(this.yaw, target);
    const step = Math.sign(err) * Math.min(Math.abs(err), this.kind.stats.turnRate * dt);
    this.yaw += step;
    this.cycle += (Math.abs(step) * 160) / this.kind.stats.strideLength;
    this.motion = Math.max(this.motion, Math.min(1, Math.abs(step) * 40));
    return Math.abs(err - step);
  }

  /** Turn, then walk toward goal. Returns true on arrival. */
  moveToward(goal: Vec2, dt: number, speedMult: number): boolean {
    const here = { x: this.position.x, z: this.position.z };
    const d = dist2(here, goal);
    if (d <= CONFIG.monster.arriveRadius) return true;
    const err = this.faceToward(goal, dt);
    if (err < FACE_BEFORE_WALK) {
      const step = Math.min(d, this.kind.stats.moveSpeed * speedMult * dt * (1 - err / FACE_BEFORE_WALK));
      this.position.x += Math.sin(this.yaw) * step;
      this.position.z += Math.cos(this.yaw) * step;
      this.cycle += step / (this.kind.stats.strideLength * CONFIG.monster.scale);
      this.motion = 1;
    }
    return false;
  }

  /**
   * Direct (WASD) walking for `dt` s: turn at the turn rate (+1 left, −1 right), and walk along the facing at the
   * walk speed × `speedMult` (+1 forward) or back up at CONFIG.monster.reverseSpeed of it (−1), the gait playing
   * backward.
   */
  drive(throttle: number, turn: number, dt: number, speedMult: number): void {
    const s = this.kind.stats;
    const dyaw = turn * s.turnRate * dt;
    this.yaw += dyaw;
    const step = throttle * s.moveSpeed * speedMult * dt * (throttle < 0 ? CONFIG.monster.reverseSpeed : 1);
    this.position.x += Math.sin(this.yaw) * step;
    this.position.z += Math.cos(this.yaw) * step;
    if (step !== 0) {
      this.cycle += step / (s.strideLength * CONFIG.monster.scale);
      this.motion = 1;
    } else if (dyaw !== 0) {
      // Turning on the spot shuffles the feet, as faceToward does.
      this.cycle += (Math.abs(dyaw) * 160) / s.strideLength;
      this.motion = Math.max(this.motion, Math.min(1, Math.abs(dyaw) * 40));
    }
  }

  flash(): void {
    this.flashT = 0.12;
  }

  meleeReady(): boolean {
    return this.alive && this.meleeCd <= 0 && this.meleeT < 0;
  }

  rangedReady(): boolean {
    return this.alive && this.rangedCd <= 0;
  }

  /**
   * Melee strike on `side` (0 = left/+X, 1 = right) at `point` (world XZ, already clamped to reach), on the kind's
   * meleeTiming unless the strike brings its own `timing` (the Wendigo's backhand). `kind` (the Wendigo's slam or
   * backhand, decided by the game) is passed on to the body, so the pose is the strike the damage uses. `height` (m)
   * raises the strike point off the ground, toward a low flyer.
   */
  startMelee(cooldownMult: number, side: number, point: Vec2, timing?: MeleeTiming, kind?: StrikeKind, height = 0): void {
    this.meleeKind = kind;
    this.meleeTiming = timing ?? this.kind.stats.meleeTiming;
    this.meleeCd = this.kind.stats.meleeCooldown * cooldownMult;
    this.meleeT = 0;
    this.impactDone = false;
    this.meleeSide = side;
    this.strikePoint.set(point.x, height, point.z);
  }

  consumeRanged(cooldownMult: number): void {
    this.rangedCd = this.kind.stats.rangedCooldown * cooldownMult;
    this.onRangedSpent();
  }

  /** Place the body and pose it. Call once per frame after movement. */
  animate(dt: number, time: number): void {
    const f = this.frame;
    f.prevCycle = this.lastCycle;
    this.lastCycle = this.cycle;
    this.motion = Math.max(0, this.motion - dt * 2);
    if (this.flashT > 0) this.flashT -= dt;
    const root = this.body.root;
    root.position.copy(this.position);
    root.rotation.y = this.yaw;
    f.dt = dt;
    f.time = time;
    f.cycle = this.cycle;
    f.motion = this.motion;
    if (this.meleeT >= 0) {
      this.meleeFrame.t = this.meleeT;
      this.meleeFrame.side = this.meleeSide;
      this.meleeFrame.kind = this.meleeKind;
      f.melee = this.meleeFrame;
    } else f.melee = null;
    if (this.swatT >= 0 && this.swatTarget) {
      this.antiAirFrame.t = this.swatT;
      this.antiAirFrame.weight = swatWeight(this.swatT, this.swatTimes);
      this.antiAirFrame.target.copy(this.swatTarget);
      f.antiAir = this.antiAirFrame;
    } else f.antiAir = null;
    if (this.leapT >= 0) {
      this.leapFrame.t = this.leapT;
      this.leapFrame.duration = CONFIG.abilities.leap.duration;
      this.leapFrame.crouch = this.kind.leapCrouch ?? 0;
      f.leap = this.leapFrame;
    } else f.leap = null;
    f.roaring = this.roarT >= 0;
    f.roarDuration = this.roarD;
    f.airborne = this.airborne;
    f.carried = this.heldY !== null;
    f.brace = this.heldY !== null ? this.braceW : 0;
    f.blaze = this.heldY !== null ? this.blazeW : 0;
    f.roar = this.heldY !== null ? this.roarW : 0;
    f.dashing = this.dashing;
    if (this.tailT >= 0) {
      this.tailFrame.t = this.tailT;
      this.tailFrame.side = this.tailSide;
      f.tailSweep = this.tailFrame;
    } else f.tailSweep = null;
    f.lookAt = this.lookAt;
    f.charge = this.charge;
    f.heat = this.heat;
    f.flash = this.flashT > 0;
    f.glow = this.glow;
    this.body.animate(f, this.heldY === null ? this.onFootLand : noLanding);
  }

  /** Cooldowns, the melee timeline, and leap/dash/roar/anti-air timing. */
  tick(dt: number): void {
    const L = CONFIG.abilities.leap;
    if (this.heldY !== null) this.position.y = this.heldY;
    // An ultimate's roar leans the body back by its own amount.
    const heldRoar = this.heldY !== null && this.roarW > 0;
    if (heldRoar) this.pose.pitch = -ROAR_LEAN * this.roarW;
    if (this.leapT >= 0) {
      this.leapT += dt;
      const c = this.kind.leapCrouch ?? 0;
      const p = leapPosition(this.leapFrom, this.leapTo, this.leapT, L.duration, this.leapHeight, c);
      this.position.set(p.x, p.y, p.z);
      const k = Math.max(0, this.leapT - c * L.duration) / (L.duration * (1 - c));
      this.pose.pitch = 0.25 * Math.sin(Math.PI * Math.min(1, k)) - 0.1;
      if (this.leapT >= L.duration) {
        this.leapT = -1;
        this.position.y = 0;
        this.pose.dip = 60;
        this.onLeapLand(this.position.clone());
      }
    }
    if (this.dashT >= 0) {
      const duration = this.dashDuration;
      this.dashT += dt;
      const p = leapPosition(this.dashFrom, this.dashTo, this.dashT, duration, 0);
      const step = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      this.position.set(p.x, 0, p.z);
      this.cycle += step / (this.kind.stats.strideLength * CONFIG.monster.scale);
      this.motion = 1;
      this.pose.pitch = 0.18;
      if (this.dashT >= duration) this.dashT = -1;
    }
    if (this.swatT >= 0) {
      this.swatT += dt;
      if (!this.swatHit && this.swatT >= this.swatTimes.impact) {
        this.swatHit = true;
        this.onSwatImpact();
      }
      if (this.swatT >= this.swatTimes.total) {
        this.swatT = -1;
        this.swatTarget = null;
      }
    }
    if (this.tailT >= 0) {
      this.tailT += dt;
      if (!this.tailHit && this.tailT >= this.tailTiming.impact) {
        this.tailHit = true;
        this.onTailImpact();
      }
      if (this.tailT >= this.tailTiming.end) this.tailT = -1;
    }
    if (this.roarT >= 0) {
      this.roarT += dt;
      const k = this.roarT / this.roarD;
      this.pose.pitch = -ROAR_LEAN * Math.sin(Math.PI * Math.min(1, k));
      if (k >= 1) this.roarT = -1;
    }
    this.meleeCd = Math.max(0, this.meleeCd - dt * this.cooldownRate);
    this.rangedCd = Math.max(0, this.rangedCd - dt * this.cooldownRate);
    if (this.meleeT < 0) {
      if (this.leapT < 0 && this.roarT < 0 && !heldRoar) this.pose.pitch *= Math.exp(-10 * dt);
      this.pose.dip += ((this.crouch ? 35 : 0) - this.pose.dip) * (1 - Math.exp(-10 * dt));
      return;
    }
    this.meleeT += dt;
    const T = this.meleeTiming;
    if (this.meleeT < T.windup) {
      // Rear back slightly while the strike cocks.
      this.pose.pitch = -0.12 * (this.meleeT / T.windup);
    } else if (this.meleeT >= T.impact && !this.impactDone) {
      this.impactDone = true;
      this.pose.pitch = 0.1;
      this.pose.dip = 25;
      this.onMeleeImpact(this.strikePoint.clone());
    }
    if (this.meleeT > T.end) this.meleeT = -1;
  }
}
