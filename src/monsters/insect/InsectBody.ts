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
/** Leap: how far (model units) the body sinks in its crouch, and how high and far in the feet tuck in the air. */
const LEAP_SINK = 120;
const LEAP_TUCK = 180;
const LEAP_GATHER = 0.35;
const STANDING: KaijuLeapPose = { sink: 0, pitch: 0, tuck: 0, arms: 0, tail: 0 };
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

/** The Insect Titan: six IK legs on a tripod gait, a leg strike, a swatting tail with the stinger. */
export class InsectBody implements MonsterBody {
  private model = new InsectTitanModel();
  /** The tail's aim: how far on (0..1), and the point (body space) it is easing toward. */
  private aimW = 0;
  private aim = new THREE.Vector3();

  get root(): THREE.Group {
    return this.model.root;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const root = this.model.root;
    const body = this.model.body;
    // Mid-leap the feet stop stepping: planted through the crouch, gathered up under the body in the air.
    const m = f.leap ? 0 : f.motion;
    const lp = f.leap ? kaijuLeap(f.leap.t, f.leap.duration, f.leap.crouch) : STANDING;
    const bob = Math.sin(f.cycle * Math.PI * 4) * 10 * m;
    const breathe = Math.sin(f.time * 1.6) * 5;
    body.position.y = bob + breathe - f.pose.dip - f.pose.collapse * 230 - lp.sink * LEAP_SINK;
    body.rotation.x = f.pose.pitch + lp.pitch * 0.6;
    body.rotation.z = Math.sin(f.cycle * Math.PI * 2) * 0.03 * m;
    root.updateMatrixWorld(true);

    const strikeLeg = f.melee ? f.melee.side : -1;
    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(f.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = (1 + f.pose.collapse * 0.35) * (1 - LEAP_GATHER * lp.tuck);
      _foot.set(leg.restFoot.x * splay, fs.lift * LIFT * m + lp.tuck * LEAP_TUCK, (leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * m) * (1 - LEAP_GATHER * lp.tuck));
      if (i === strikeLeg && f.melee) {
        _target.copy(f.melee.target);
        root.worldToLocal(_target);
        _target.y = 0;
        _gait.copy(_foot);
        strikeFootPose(f.melee.t, CONFIG.monster.meleeWindup, _gait, _strikeLift, _target, _foot);
      }
      _pole.copy(_hip).add(_knee.set(leg.side * 120, 700, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (m > 0.3 && i !== strikeLeg && didLand(f.prevCycle, f.cycle, i)) {
        onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = f.roaring ? 0.55 : 0.18 + Math.sin(f.time * 7) * 0.08;
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
