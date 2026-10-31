import * as THREE from 'three';
import { CONFIG } from '../../config';
import { InsectTitanModel } from '../../monster/InsectTitanModel';
import { didLand, footState } from '../../monster/gait';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import { strikeFootPose } from '../../monster/strike';
import type { BodyFrame, MonsterBody } from '../types';
import { kaijuLeap, type KaijuLeapPose } from '../kaiju/leapPose';

const FEMUR = 300;
const TIBIA = 400;
const LIFT = 110;
/** Leap: how far (model units) the body sinks in its crouch. */
const LEAP_SINK = 120;
const STANDING: KaijuLeapPose = { sink: 0, pitch: 0, tuck: 0, arms: 0, tail: 0 };
/** Fraction of the crouch at its end spent pushing back up, so the crouch is over the moment the feet leave the ground. */
const PUSH = 0.3;
const smooth = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

/**
 * The Kaiju's leap pose, except the crouch ends at liftoff (down, then pushed back up to standing as the feet
 * leave) and the legs never tuck: they keep their standing spread through the whole leap.
 */
function insectLeap(t: number, duration: number, crouch: number): KaijuLeapPose {
  const p = kaijuLeap(t, duration, crouch);
  const L0 = crouch * duration;
  if (t < L0) {
    const down = smooth(t / ((1 - PUSH) * L0));
    const up = 1 - smooth((t - (1 - PUSH) * L0) / (PUSH * L0));
    return { ...p, sink: down * up, pitch: 0.32 * down * up, tuck: 0 };
  }
  return { ...p, sink: Math.min(0, p.sink), pitch: Math.min(0, p.pitch), tuck: 0 };
}
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _target = new THREE.Vector3();
const _swat = new THREE.Vector3();
const _aimWant = new THREE.Vector3();
/** How fast (per s) the tail swings onto a ranged target and relaxes off it again, and how fast it follows a switch. */
const AIM_RATE = 5;
const AIM_FOLLOW = 8;
/** Foot offset (model units) for the cocked leg: high and pulled back. */
const _strikeLift = new THREE.Vector3(0, 420, -80);
/**
 * Spike Rain (an ultimate's roar, while carried): reared up the body tips back REAR_PITCH rad more (on top of the
 * Monster's lean) and lifts REAR_LIFT, standing on the back pair of legs; the front four become arms, beating in at
 * CHEST (body space) and swinging out to ARM_OUT from their hips, at BEAT_RATE rad/s of world time, alternating sides.
 */
const REAR_PITCH = 0.6;
/** How wide (rad) the mandibles open, reared up. */
const MOUTH_OPEN = 0.6;
const REAR_LIFT = 140;
const BEAT_RATE = 9;
const CHEST = new THREE.Vector3(0, 520, 260);
const ARM_OUT = new THREE.Vector3(260, 160, 220);
/** Which legs are arms when reared, and each one's beat phase: 0 with 3, 1 with 2. */
const ARM_PHASE = [0, Math.PI, Math.PI, 0];
const _chest = new THREE.Vector3();
const _out = new THREE.Vector3();

/** The Insect Titan: six IK legs on a tripod gait, a leg strike, a swatting tail with the stinger. */
export class InsectBody implements MonsterBody {
  private model = new InsectTitanModel();
  /** The tail's aim: how far on (0..1), and the point (body space) it is easing toward. */
  private aimW = 0;
  private aim = new THREE.Vector3();
  /** Each leg's foot as last posed (root space). */
  readonly feet: THREE.Vector3[] = Array.from({ length: 6 }, () => new THREE.Vector3());

  get root(): THREE.Group {
    return this.model.root;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const root = this.model.root;
    const body = this.model.body;
    // Mid-leap the feet stop stepping.
    const m = f.leap ? 0 : f.motion;
    const lp = f.leap ? insectLeap(f.leap.t, f.leap.duration, f.leap.crouch) : STANDING;
    const bob = Math.sin(f.cycle * Math.PI * 4) * 10 * m;
    const breathe = Math.sin(f.time * 1.6) * 5;
    const rear = f.carried ? f.roar : 0;
    body.position.y = bob + breathe - f.pose.dip - f.pose.collapse * 230 - lp.sink * LEAP_SINK + rear * REAR_LIFT;
    body.rotation.x = f.pose.pitch + lp.pitch * 0.6 - rear * REAR_PITCH;
    body.rotation.z = Math.sin(f.cycle * Math.PI * 2) * 0.03 * m;
    root.updateMatrixWorld(true);

    const strikeLeg = f.melee ? f.melee.side : -1;
    if (rear > 0) _chest.copy(CHEST).applyMatrix4(body.matrix);
    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(f.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = 1 + f.pose.collapse * 0.35;
      _foot.set(leg.restFoot.x * splay, fs.lift * LIFT * m, leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * m);
      if (i === strikeLeg && f.melee) {
        _target.copy(f.melee.target);
        root.worldToLocal(_target);
        _target.y = 0;
        _gait.copy(_foot);
        strikeFootPose(f.melee.t, CONFIG.monster.meleeWindup, _gait, _strikeLift, _target, _foot);
      }
      if (rear > 0 && i < 4) {
        // An arm: swinging between out at its side and in at the chest, alternating, lifted off the ground as it rears.
        const beat = 0.5 + 0.5 * Math.sin(f.time * BEAT_RATE + ARM_PHASE[i]!);
        _out.set(leg.side * ARM_OUT.x, ARM_OUT.y, leg.hipLocal.z + ARM_OUT.z).applyMatrix4(body.matrix);
        _foot.lerp(_out.lerp(_chest, beat), rear);
      }
      this.feet[i]!.copy(_foot);
      _pole.copy(_hip).add(_knee.set(leg.side * 120, 700, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (m > 0.3 && i !== strikeLeg && didLand(f.prevCycle, f.cycle, i)) {
        onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    // Reared up (Spike Rain), the mandibles open wide to spray.
    const twitch = Math.max(f.roaring ? 0.55 : 0.18 + Math.sin(f.time * 7) * 0.08, rear * MOUTH_OPEN);
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    // Ranged aim: the tail eases onto the target (and off again when there is none), following it as it switches.
    if (f.lookAt) {
      body.worldToLocal(_aimWant.copy(f.lookAt));
      if (this.aimW <= 0) this.aim.copy(_aimWant);
      else this.aim.lerp(_aimWant, 1 - Math.exp(-AIM_FOLLOW * f.dt));
    }
    this.aimW = THREE.MathUtils.clamp(this.aimW + (f.lookAt ? 1 : -1) * AIM_RATE * f.dt, 0, 1);
    const aimW = this.aimW * this.aimW * (3 - 2 * this.aimW);
    const swat = f.antiAir ? body.worldToLocal(_swat.copy(f.antiAir.target)) : null;
    this.model.updateTail(f.time, swat, f.antiAir?.weight ?? 0, aimW > 0 ? this.aim : null, aimW);

    for (const m of this.model.materials) {
      if (f.flash) m.emissive.setHex(0xffffff);
      else m.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
  }

  /** Between the mandibles: where Spike Rain's volley sprays from. */
  sprayFrom(out: THREE.Vector3): THREE.Vector3 {
    this.model.mandibles[0]!.getWorldPosition(out);
    return out.add(this.model.mandibles[1]!.getWorldPosition(_world)).multiplyScalar(0.5);
  }

  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.model.stingerTip.getWorldPosition(out);
  }

  /** Stinger spikes, storm, and mortar all leave from the stinger tip. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.model.stingerTip.getWorldPosition(out);
  }

  /** The Insect aims with its whole body. */
  aimError(): number {
    return 0;
  }

  dispose(): void {
    this.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
