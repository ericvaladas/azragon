import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDelta, dist2, yawTo, type Vec2 } from '../util/math';
import { InsectTitanModel } from './InsectTitanModel';
import { didLand, footState } from './gait';
import { solveTwoBone, placeSegment } from './ik';
import { leapPosition } from './leap';
import { STRIKE_TIMES, strikeFootPose } from './strike';

const FEMUR = 300;
const TIBIA = 400;
const LIFT = 110;
const FACE_BEFORE_WALK = 1.0; // radians of yaw error allowed while walking
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _target = new THREE.Vector3();
/** Foot offset (model units) for the cocked leg: high and pulled back. */
const _strikeLift = new THREE.Vector3(0, 420, -80);
const { strike: STRIKE, recover: RECOVER } = STRIKE_TIMES;

export class Monster {
  readonly model = new InsectTitanModel();
  readonly position: THREE.Vector3;
  yaw = 0;
  hp: number = CONFIG.monster.maxHp;
  maxHp: number = CONFIG.monster.maxHp;
  alive = true;
  onLeapLand: (p: THREE.Vector3) => void = () => {};
  crouch = false;
  private leapT = -1;
  private leapFrom = { x: 0, z: 0 };
  private leapTo = { x: 0, z: 0 };
  private roarT = -1;

  get airborne(): boolean {
    return this.leapT >= 0;
  }

  /** Leaping or roaring: the brain must not move or attack. */
  get busy(): boolean {
    return this.leapT >= 0 || this.roarT >= 0;
  }

  startLeap(to: Vec2): void {
    this.leapFrom = { x: this.position.x, z: this.position.z };
    this.leapTo = { x: to.x, z: to.z };
    this.leapT = 0;
    this.yaw = yawTo(this.leapFrom, this.leapTo);
    this.meleeT = -1;
  }

  startRoar(): void {
    this.roarT = 0;
    this.meleeT = -1;
  }
  /** Clamp applied to each walking step (grapple tethers). */
  constrain: ((from: Vec2, to: Vec2) => Vec2) | null = null;
  onFootLand: (p: THREE.Vector3) => void = () => {};

  private cycle = 0;
  private motion = 0; // 0..1 how much the gait is engaged
  private flashT = 0;
  /** Extra body pose offsets driven by attacks (Task 7) and death. */
  readonly pose = { dip: 0, pitch: 0, collapse: 0 };

  constructor(scene: THREE.Scene) {
    this.position = this.model.root.position;
    this.model.root.scale.setScalar(CONFIG.monster.scale);
    scene.add(this.model.root);
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.hp = this.maxHp = CONFIG.monster.maxHp;
    this.alive = true;
    this.cycle = 0;
    this.pose.dip = this.pose.pitch = this.pose.collapse = 0;
    this.meleeCd = 0;
    this.spikeCd = 0;
    this.meleeT = -1;
    this.strikeLeg = -1;
    this.leapT = -1;
    this.roarT = -1;
    this.crouch = false;
    this.position.y = 0;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Rotate toward p at the capped turn rate. Returns remaining |yaw error|. */
  faceToward(p: Vec2, dt: number): number {
    const target = yawTo({ x: this.position.x, z: this.position.z }, p);
    const err = angleDelta(this.yaw, target);
    const step = Math.sign(err) * Math.min(Math.abs(err), CONFIG.monster.turnRate * dt);
    this.yaw += step;
    this.cycle += (Math.abs(step) * 160) / CONFIG.monster.strideLength;
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
      const step = Math.min(d, CONFIG.monster.moveSpeed * speedMult * dt * (1 - err / FACE_BEFORE_WALK));
      let nx = this.position.x + Math.sin(this.yaw) * step;
      let nz = this.position.z + Math.cos(this.yaw) * step;
      if (this.constrain) {
        const c = this.constrain({ x: this.position.x, z: this.position.z }, { x: nx, z: nz });
        nx = c.x;
        nz = c.z;
      }
      const moved = Math.hypot(nx - this.position.x, nz - this.position.z);
      this.position.x = nx;
      this.position.z = nz;
      this.cycle += moved / (CONFIG.monster.strideLength * CONFIG.monster.scale);
      this.motion = 1;
    }
    return false;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  /** Pose body, legs, mandibles, tail. Call once per frame after movement. */
  animate(dt: number, time: number): void {
    const prevCycle = this.lastCycle;
    this.lastCycle = this.cycle;
    this.motion = Math.max(0, this.motion - dt * 2);

    const root = this.model.root;
    root.rotation.y = this.yaw;
    const body = this.model.body;
    const bob = Math.sin(this.cycle * Math.PI * 4) * 10 * this.motion;
    const breathe = Math.sin(time * 1.6) * 5;
    body.position.y = bob + breathe - this.pose.dip - this.pose.collapse * 230;
    body.rotation.x = this.pose.pitch;
    body.rotation.z = Math.sin(this.cycle * Math.PI * 2) * 0.03 * this.motion;
    root.updateMatrixWorld(true);

    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(this.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = 1 + this.pose.collapse * 0.35;
      _foot.set(
        leg.restFoot.x * splay,
        fs.lift * LIFT * this.motion,
        leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * this.motion,
      );
      if (i === this.strikeLeg && this.meleeT >= 0) this.strikeFoot(_foot);
      _pole.copy(_hip).add(_knee.set(leg.side * 120, 700, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (this.motion > 0.3 && i !== this.strikeLeg && didLand(prevCycle, this.cycle, i)) {
        this.onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = this.roarT >= 0 ? 0.55 : 0.18 + Math.sin(time * 7) * 0.08;
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    this.model.updateTail(time);

    if (this.flashT > 0) this.flashT -= dt;
    const e = this.flashT > 0 ? 0xffffff : 0x000000;
    for (const m of this.model.materials) m.emissive.setHex(e);
  }

  private lastCycle = 0;

  onMeleeImpact: (p: THREE.Vector3) => void = () => {};
  private meleeCd = 0;
  private spikeCd = 0;
  private meleeT = -1; // -1 = not attacking; else time since start
  private impactDone = false;
  private strikeLeg = -1;
  private strikePoint = new THREE.Vector3();

  meleeReady(): boolean {
    return this.alive && this.meleeCd <= 0 && this.meleeT < 0;
  }

  spikeReady(): boolean {
    return this.alive && this.spikeCd <= 0;
  }

  /** Leg strike: `leg` (a front leg index) spears down onto `point` (world XZ, already clamped to reach). */
  startMelee(cooldownMult: number, leg: number, point: Vec2): void {
    this.meleeCd = CONFIG.monster.meleeCooldown * cooldownMult;
    this.meleeT = 0;
    this.impactDone = false;
    this.strikeLeg = leg;
    this.strikePoint.set(point.x, 0, point.z);
  }

  /**
   * Strike timeline (s after start, w = windup): raise the foot high and back until w, spear onto the
   * target by w + STRIKE, hold until w + HOLD, then ease back to the gait pose by w + RECOVER.
   */
  private strikeFoot(foot: THREE.Vector3): void {
    _target.copy(this.strikePoint);
    this.model.root.worldToLocal(_target);
    _target.y = 0;
    _gait.copy(foot);
    strikeFootPose(this.meleeT, CONFIG.monster.meleeWindup, _gait, _strikeLift, _target, foot);
  }

  consumeSpike(cooldownMult: number): void {
    this.spikeCd = CONFIG.monster.spikeCooldown * cooldownMult;
  }

  /** Cooldowns, the leg-strike timing, and leap/roar poses. */
  tick(dt: number): void {
    const L = CONFIG.abilities.leap;
    if (this.leapT >= 0) {
      this.leapT += dt;
      const p = leapPosition(this.leapFrom, this.leapTo, this.leapT, L.duration, L.peak);
      this.position.set(p.x, p.y, p.z);
      this.pose.pitch = 0.25 * Math.sin(Math.PI * Math.min(1, this.leapT / L.duration)) - 0.1;
      if (this.leapT >= L.duration) {
        this.leapT = -1;
        this.position.y = 0;
        this.pose.dip = 60;
        this.onLeapLand(this.position.clone());
      }
    }
    if (this.roarT >= 0) {
      this.roarT += dt;
      const k = this.roarT / CONFIG.abilities.roar.duration;
      this.pose.pitch = -0.45 * Math.sin(Math.PI * Math.min(1, k));
      if (k >= 1) this.roarT = -1;
    }
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.spikeCd = Math.max(0, this.spikeCd - dt);
    if (this.meleeT < 0) {
      if (this.leapT < 0 && this.roarT < 0) this.pose.pitch *= Math.exp(-10 * dt);
      this.pose.dip += ((this.crouch ? 35 : 0) - this.pose.dip) * (1 - Math.exp(-10 * dt));
      return;
    }
    this.meleeT += dt;
    const w = CONFIG.monster.meleeWindup;
    if (this.meleeT < w) {
      // Rear back slightly while the leg cocks.
      const k = this.meleeT / w;
      this.pose.pitch = -0.12 * k;
    } else if (this.meleeT >= w + STRIKE && !this.impactDone) {
      this.impactDone = true;
      this.pose.pitch = 0.1;
      this.pose.dip = 25;
      this.onMeleeImpact(this.strikePoint.clone());
    }
    if (this.meleeT > w + RECOVER) {
      this.meleeT = -1;
      this.strikeLeg = -1;
    }
  }
}
