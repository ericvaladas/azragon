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
 * Spike Rain (an ultimate's roar, while carried): a spider's threat display. The body stands DISPLAY_LIFT taller with
 * its front tilted up DISPLAY_TILT rad, on the back pair of legs, its tail held straight out behind and down to the
 * ground as a counterweight; the front pair is raised high and wide (RAISED, body
 * space, x to the leg's side, z from its hip) and the second pair held out lower (SPREAD). The raised legs wave slowly
 * (WAVE m at WAVE_RATE rad/s of world time) with a fine quiver (QUIVER m at QUIVER_RATE); the mandibles open MOUTH_OPEN rad to shoot.
 */
const DISPLAY_LIFT = 110;
const DISPLAY_TILT = 0.52;
/** The braced tail's tip rests this high (m) on the ground behind; it never points down steeper than TAIL_MAX_DROP (rad). */
const TAIL_REST = 15;
const TAIL_MAX_DROP = 1.1;
const RAISED = new THREE.Vector3(420, 760, 260);
const SPREAD = new THREE.Vector3(520, 420, 120);
const WAVE = 45;
const WAVE_RATE = 2.5;
const QUIVER = 6;
const QUIVER_RATE = 23;
const MOUTH_OPEN = 0.6;
const _raised = new THREE.Vector3();
const _tailRoot = new THREE.Vector3();
const _tailDir = new THREE.Vector3();
const _unbody = new THREE.Quaternion();

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
    // Spike Rain's threat display (an ultimate's roar while held): standing up, legs raised, mandibles open.
    const rear = f.carried ? f.roar : 0;
    body.position.y = bob + breathe - f.pose.dip - f.pose.collapse * 230 - lp.sink * LEAP_SINK + rear * DISPLAY_LIFT;
    body.rotation.x = f.pose.pitch + lp.pitch * 0.6 - rear * DISPLAY_TILT;
    body.rotation.z = Math.sin(f.cycle * Math.PI * 2) * 0.03 * m;
    root.updateMatrixWorld(true);

    const strikeLeg = f.melee ? f.melee.side : -1;
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
        // Raised in display: the front pair high and wide, the second out to the sides; waving slowly, quivering.
        const pose = i < 2 ? RAISED : SPREAD;
        const wave = Math.sin(f.time * WAVE_RATE + i * 1.7) * WAVE;
        const quiver = Math.sin(f.time * QUIVER_RATE + i * 2.3) * QUIVER;
        _raised.set(leg.side * (pose.x + wave * 0.5), pose.y + wave + quiver, leg.hipLocal.z + pose.z + quiver).applyMatrix4(body.matrix);
        _foot.lerp(_raised, rear);
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

    // Held for Spike Rain, the mandibles open wide to shoot.
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
    // Braced: the tail straight out behind and down so its tip rests on the ground, balancing the raised front.
    let brace: THREE.Vector3 | null = null;
    if (rear > 0) {
      _tailRoot.copy(this.model.tailRoot).applyMatrix4(body.matrix);
      const L = this.model.tailLength;
      const drop = Math.min(Math.asin(Math.min(1, Math.max(0, (_tailRoot.y - TAIL_REST) / L))), TAIL_MAX_DROP);
      brace = _tailDir.set(0, -Math.sin(drop), -Math.cos(drop)).applyQuaternion(_unbody.copy(body.quaternion).invert());
    }
    this.model.updateTail(f.time, swat, f.antiAir?.weight ?? 0, aimW > 0 ? this.aim : null, aimW, brace, rear);

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
