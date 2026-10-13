import * as THREE from 'three';
import { CONFIG } from '../../config';
import { InsectTitanModel } from '../../monster/InsectTitanModel';
import { didLand, footState } from '../../monster/gait';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import { strikeFootPose } from '../../monster/strike';
import type { BodyFrame, MonsterBody } from '../types';

const FEMUR = 300;
const TIBIA = 400;
const LIFT = 110;
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _target = new THREE.Vector3();
const _swat = new THREE.Vector3();
/** Foot offset (model units) for the cocked leg: high and pulled back. */
const _strikeLift = new THREE.Vector3(0, 420, -80);

/** The Insect Titan: six IK legs on a tripod gait, a leg strike, a swatting tail with the stinger. */
export class InsectBody implements MonsterBody {
  private model = new InsectTitanModel();

  get root(): THREE.Group {
    return this.model.root;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const root = this.model.root;
    const body = this.model.body;
    const bob = Math.sin(f.cycle * Math.PI * 4) * 10 * f.motion;
    const breathe = Math.sin(f.time * 1.6) * 5;
    body.position.y = bob + breathe - f.pose.dip - f.pose.collapse * 230;
    body.rotation.x = f.pose.pitch;
    body.rotation.z = Math.sin(f.cycle * Math.PI * 2) * 0.03 * f.motion;
    root.updateMatrixWorld(true);

    const strikeLeg = f.melee ? f.melee.side : -1;
    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(f.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = 1 + f.pose.collapse * 0.35;
      _foot.set(leg.restFoot.x * splay, fs.lift * LIFT * f.motion, leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * f.motion);
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
      if (f.motion > 0.3 && i !== strikeLeg && didLand(f.prevCycle, f.cycle, i)) {
        onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = f.roaring ? 0.55 : 0.18 + Math.sin(f.time * 7) * 0.08;
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    if (f.antiAir) this.model.updateTail(f.time, body.worldToLocal(_swat.copy(f.antiAir.target)), f.antiAir.weight);
    else this.model.updateTail(f.time);

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
