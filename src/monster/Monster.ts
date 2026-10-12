import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDelta, dist2, yawTo, type Vec2 } from '../util/math';
import { InsectTitanModel } from './InsectTitanModel';
import { didLand, footState } from './gait';
import { solveTwoBone, placeSegment } from './ik';

const FEMUR = 300;
const TIBIA = 400;
const LIFT = 110;
const FACE_BEFORE_WALK = 1.0; // radians of yaw error allowed while walking
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();

export class Monster {
  readonly model = new InsectTitanModel();
  readonly position: THREE.Vector3;
  yaw = 0;
  hp: number = CONFIG.monster.maxHp;
  maxHp: number = CONFIG.monster.maxHp;
  alive = true;
  onFootLand: (p: THREE.Vector3) => void = () => {};

  private cycle = 0;
  private motion = 0; // 0..1 how much the gait is engaged
  private flashT = 0;
  /** Extra body pose offsets driven by attacks (Task 7) and death. */
  readonly pose = { dip: 0, pitch: 0, collapse: 0 };

  constructor(scene: THREE.Scene) {
    this.position = this.model.root.position;
    scene.add(this.model.root);
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.hp = this.maxHp = CONFIG.monster.maxHp;
    this.alive = true;
    this.cycle = 0;
    this.pose.dip = this.pose.pitch = this.pose.collapse = 0;
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
      this.position.x += Math.sin(this.yaw) * step;
      this.position.z += Math.cos(this.yaw) * step;
      this.cycle += step / CONFIG.monster.strideLength;
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
      _pole.copy(_hip).add(_knee.set(leg.side * 120, 700, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (this.motion > 0.3 && didLand(prevCycle, this.cycle, i)) {
        this.onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = 0.18 + Math.sin(time * 7) * 0.08;
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    this.model.updateTail(time);

    if (this.flashT > 0) this.flashT -= dt;
    const e = this.flashT > 0 ? 0xffffff : 0x000000;
    for (const m of this.model.materials) m.emissive.setHex(e);
  }

  private lastCycle = 0;
}
