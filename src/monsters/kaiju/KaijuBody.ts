import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { bipedFoot, bipedLanded } from './bipedGait';
import { rakeSwing } from './rake';
import { neckAim, stepNeck } from './neck';
import { tailSwing } from './tailSweep';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { kaijuLeap, type KaijuLeapPose } from './leapPose';

const K = CONFIG.kaiju;
const C = K.colors;
const THIGH = 170;
const SHIN = 190;
const LIFT = 80;
const FOOT_X = 115;
/** The arms hang this much (rad) lower at the shoulder than they were modelled, so they don't jut out. */
const ARM_DROP = 0.35;
/** How big the head is (skull, jaw, teeth, eyes and brows together). */
const HEAD_SCALE = 1.25;
/** Leap: how far (model units) the body sinks in its crouch, and how high the feet tuck up in the air. */
const LEAP_SINK = 150;
const LEAP_TUCK = 150;
const STANDING: KaijuLeapPose = { sink: 0, pitch: 0, tuck: 0, arms: 0, tail: 0 };
/** Walking tail wag: sideways swing at the tip (model units) and the phase lag per segment (rad). */
const TAIL_WAG = 230;
const TAIL_LAG = 0.45;
/** Neck pivot, set high on the shoulders so the neck's top line carries straight on from the top of the back. */
const NECK_BASE = new THREE.Vector3(0, 500, 88);
/** Centre of the neck's top end (neck space): the neck leans well forward, rising gently into the head that sits on it. */
const NECK_TIP = new THREE.Vector3(0, 40, 50);
const TAIL_BASE: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 300, -90),
  new THREE.Vector3(0, 255, -220),
  new THREE.Vector3(0, 200, -350),
  new THREE.Vector3(0, 140, -470),
  new THREE.Vector3(0, 90, -580),
  new THREE.Vector3(0, 55, -680),
];
/** Plasma Lance: a full blaze adds BLAZE to the plates' and vents' glow and opens the jaws to BLAZE_JAW. The roar tilts the head to ROAR_PITCH (rad, up). */
const BLAZE = 4;
const BLAZE_JAW = 0.6;
const ROAR_PITCH = -0.55;
/** The roar opens the jaws to ROAR_JAW (rad); it builds and fades at ROAR_RATE (of a full roar, per second of world time). */
const ROAR_JAW = 0.8;
const ROAR_RATE = 2.5;
/** Back plates along the spine (body space): x, y, z, length along the spine, height, tilt (rad about X, - = raked back). */
const PLATES: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 579, 78, 55, 85, 0],
  [0, 582, 15, 65, 110, -0.3],
  [0, 550, -48, 70, 115, -0.6],
  [0, 490, -92, 62, 100, -0.85],
  [0, 420, -118, 52, 80, -1.0],
  [0, 372, -160, 42, 60, -1.1],
];
/** Launch vents on the back, beside the spine between the plates (body space): x, y, z — sunk into the torso's surface. */
const VENTS: readonly (readonly [number, number, number])[] = [
  [42, 523, -1],
  [-42, 523, -1],
  [40, 464, -56],
  [-40, 464, -56],
];
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

/**
 * The head (head space): a hull over points on two ovals, a rounded cranium flowing into a narrower snout, so it
 * comes out a smoothly faceted egg with a muzzle.
 */
/** Points on an oval (centre `c`, radii `r`), for a smoothly faceted hull. */
function oval(pts: THREE.Vector3[], c: THREE.Vector3, r: THREE.Vector3): void {
  for (let i = 0; i <= 6; i++) {
    const th = (i / 6) * Math.PI;
    const n = i === 0 || i === 6 ? 1 : 10;
    for (let j = 0; j < n; j++) {
      const ph = (j / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(th) * Math.sin(ph) * r.x, Math.cos(th) * r.y, Math.sin(th) * Math.cos(ph) * r.z).add(c));
    }
  }
}

function headPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  oval(pts, new THREE.Vector3(0, 2, 25), new THREE.Vector3(46, 36, 58));
  oval(pts, new THREE.Vector3(0, -8, 96), new THREE.Vector3(32, 23, 40));
  return pts;
}

/**
 * The neck (neck space, origin at its pivot): a rounded taper from a thick base centred on the pivot — so however
 * the head turns, the base turns in place, buried in the torso, and never pulls away from it — up into the head.
 */
function neckPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  oval(pts, new THREE.Vector3(0, 0, 4), new THREE.Vector3(44, 44, 46));
  oval(pts, NECK_TIP, new THREE.Vector3(32, 32, 34));
  return pts;
}

/**
 * The lower jaw (jaw space, origin at its hinge): a slim rounded oval tucked under the snout, running back into a
 * knob centred on the hinge and tucked up inside the skull — so when the jaw drops open it turns about the knob
 * and stays joined to the head.
 */
function jawPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  oval(pts, new THREE.Vector3(0, -4, 54), new THREE.Vector3(22, 9, 36));
  oval(pts, new THREE.Vector3(0, 2, 2), new THREE.Vector3(24, 16, 16));
  return pts;
}

type Leg = { side: 1 | -1; hip: THREE.Vector3; thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };
type Arm = { side: 1 | -1; pivot: THREE.Object3D };

/**
 * The Reptile Kaiju: upright on two IK legs with forward knees, a leaning torso, short raking arms,
 * a neck that lunges to bite, glowing back plates, and a heavy counter-swinging tail. Faces +Z; +X is its left.
 */
export class KaijuBody implements MonsterBody {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: Leg[] = [];
  private shortArms: Arm[] = [];
  private neck = new THREE.Object3D();
  private jaw = new THREE.Object3D();
  private mouth = new THREE.Object3D();
  private tailSegs: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private tintMats: THREE.MeshToonMaterial[];
  private plateMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  /** Current neck yaw relative to the body, eased toward the breath aim; and how far it still is from it. */
  private neckYaw = 0;
  private neckPitch = 0;
  /** How far into its roar the Kaiju is 0..1 (it builds and fades gradually). */
  private roar = 0;
  private aimErr = 0;
  /** Back vents projectiles launch from; each flares briefly when used. */
  private vents: THREE.Object3D[] = [];
  private ventMats: THREE.MeshToonMaterial[] = [];
  private ventFlash: number[] = [];
  private nextVent = 0;

  constructor() {
    const scale = toonMat(C.scale);
    const dark = toonMat(C.scaleDark);
    const belly = toonMat(C.belly);
    const claw = toonMat(C.claw);
    const eye = toonMat(C.eye, { emissive: C.eye });
    this.plateMat = toonMat(C.plate, { emissive: C.plate });
    this.tintMats = [scale, dark, belly];
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const cone = this.keep(faceted(new THREE.ConeGeometry(0.5, 1, 4)));
    const cyl = this.keep(faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)));
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.x = rotX;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Pelvis and a forward-leaning torso with a lighter belly.
    add(this.body, blob, scale, [0, 300, -40], [120, 105, 140]);
    add(this.body, blob, scale, [0, 410, 30], [125, 150, 115], 0.35);
    add(this.body, blob, belly, [0, 375, 70], [95, 130, 90], 0.35);

    // Neck → head → hinged jaw; `mouth` is where the breath leaves.
    this.neck.position.copy(NECK_BASE);
    add(this.neck, this.keep(faceted(new ConvexGeometry(neckPoints()))), scale, [0, 0, 0], [1, 1, 1]);
    const head = new THREE.Object3D();
    head.position.set(0, NECK_TIP.y + 9, NECK_TIP.z + 11);
    head.scale.setScalar(HEAD_SCALE);
    this.neck.add(head);
    add(head, this.keep(faceted(new ConvexGeometry(headPoints()))), scale, [0, 0, 0], [1, 1, 1]);
    // Eyes: glowing rectangles set into the sides of the skull.
    add(head, box, eye, [30, 15, 56], [16, 10, 16]);
    add(head, box, eye, [-30, 15, 56], [16, 10, 16]);
    this.jaw.position.set(0, -30, 40);
    head.add(this.jaw);
    add(this.jaw, this.keep(faceted(new ConvexGeometry(jawPoints()))), belly, [0, 0, 0], [1, 1, 1]);
    for (const x of [-11, 0, 11]) add(this.jaw, cone, claw, [x, 8, 78], [8, 15, 8]);
    this.mouth.position.set(0, -20, 140);
    head.add(this.mouth);
    this.body.add(this.neck);

    // Short clawed arms, hanging forward-down from the shoulders.
    for (const side of [1, -1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 100, 440, 105);
      add(pivot, box, dark, [0, -30, 35], [30, 30, 90], 0.7);
      add(pivot, box, scale, [0, -80, 85], [26, 26, 80], 1.2);
      for (const dx of [-10, 0, 10]) add(pivot, cone, claw, [dx, -112, 118], [9, 34, 9], 2.0);
      this.body.add(pivot);
      this.shortArms.push({ side, pivot });
    }

    // Glowing back plates, raked back.
    for (const [x, y, z, w, h, tilt] of PLATES) add(this.body, cone, this.plateMat, [x, y, z], [w * 0.45, h, w], tilt);

    // Launch vents: a dark collar around a glowing throat, angled up and back off the spine.
    const collar = this.keep(faceted(new THREE.CylinderGeometry(1, 1.15, 1, 8)));
    const throat = this.keep(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2));
    for (const [x, y, z] of VENTS) {
      const vent = new THREE.Object3D();
      vent.position.set(x, y, z);
      vent.rotation.set(-0.55, 0, -Math.sign(x) * 0.5);
      add(vent, collar, dark, [0, 0, 0], [26, 22, 26]);
      const mat = toonMat(C.plate, { emissive: C.plate });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      add(vent, throat, mat, [0, 11.5, 0], [19, 1, 19]);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 30, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      this.body.add(vent);
    }

    // Tail chain.
    for (let i = 0; i < TAIL_BASE.length - 1; i++) {
      const r = 95 - i * 15;
      this.tailSegs.push(add(this.body, cyl, i % 2 ? dark : scale, [0, 0, 0], [r, 1, r]));
    }

    // Legs (root space; placed by IK each frame).
    for (const side of [1, -1] as const) {
      this.legs.push({
        side,
        hip: new THREE.Vector3(side * 70, 300, -30),
        thigh: add(this.root, box, scale, [0, 0, 0], [70, 1, 75]),
        shin: add(this.root, cyl, dark, [0, 0, 0], [50, 1, 50]),
        foot: add(this.root, box, dark, [0, 0, 0], [70, 30, 110]),
      });
    }
    this.root.add(this.body);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    // Mid-leap the feet stop stepping: planted through the crouch, tucked up in the air.
    const m = f.leap ? 0 : f.motion;
    const lp = f.leap ? kaijuLeap(f.leap.t, f.leap.duration, f.leap.crouch) : STANDING;
    // Weight shifts over the planted foot once per stride; the tail swings the other way.
    // Leg 0 (+X) swings while sin(2π·cycle) > 0, so the weight sits toward −X (over leg 1) then, and vice versa.
    const shift = -Math.sin(f.cycle * Math.PI * 2);
    const body = this.body;
    body.position.set(shift * 16 * m, (1 - Math.abs(shift)) * 10 * m + Math.sin(f.time * 1.3) * 6 - f.pose.dip - f.pose.collapse * 230 - lp.sink * LEAP_SINK, 0);
    body.rotation.set(f.pose.pitch + f.pose.collapse * 0.5 + lp.pitch, 0, -shift * 0.05 * m - f.pose.collapse * 0.3);
    this.root.updateMatrixWorld(true);

    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const fs = bipedFoot(f.cycle, i);
      _hip.copy(leg.hip).applyMatrix4(body.matrix);
      _foot.set(leg.side * FOOT_X * (1 + f.pose.collapse * 0.5), fs.lift * LIFT * m + lp.tuck * LEAP_TUCK, fs.stride * (K.stats.strideLength / 2) * m + lp.tuck * 40);
      _pole.copy(_hip).add(_tmp.set(leg.side * 20, 0, 300)); // knees bend forward
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeSegment(leg.thigh, _hip, _knee);
      placeSegment(leg.shin, _knee, _foot);
      leg.foot.position.set(_foot.x, _foot.y + 15, _foot.z + 30);
      if (m > 0.3 && bipedLanded(f.prevCycle, f.cycle, i)) onFootLand(_world.copy(_foot).applyMatrix4(this.root.matrixWorld));
    }

    for (let i = 0; i < 2; i++) {
      const arm = this.shortArms[i]!;
      let swing = Math.sin(f.time * 1.3 + i) * 0.06 - shift * arm.side * 0.12 * m;
      swing += lp.arms;
      if (f.melee && f.melee.side === i) swing = rakeSwing(f.melee.t, K.stats.meleeTiming);
      // While slashing forward (negative swing) the arm also sweeps across the body.
      arm.pivot.rotation.set(swing + ARM_DROP, 0, -arm.side * Math.max(0, -swing) * 0.5);
    }

    // Aim the head (not the body) at the breath target, at the neck's own turn speed.
    const N = K.neck;
    let wantYaw = 0;
    let wantPitch = 0;
    this.aimErr = 0;
    if (f.lookAt) {
      body.worldToLocal(_tmp.copy(f.lookAt)).sub(NECK_BASE);
      const aim = neckAim(_tmp.x, _tmp.z, N.limit);
      wantYaw = aim.yaw;
      wantPitch = Math.max(-0.4, Math.min(0.8, -Math.atan2(_tmp.y, Math.hypot(_tmp.x, _tmp.z))));
      this.aimErr = aim.error;
    }
    // The roar builds and fades gradually (in slow motion, slowly): head, jaws, tail and plates together.
    this.roar = stepNeck(this.roar, f.roaring ? 1 : 0, ROAR_RATE, f.dt);
    if (this.roar > 0) wantPitch = Math.min(wantPitch, ROAR_PITCH * this.roar);
    // Carried by an ultimate, the neck turns faster: Plasma Lance's sweep runs on real time, faster than the neck
    // normally turns in slowed world time. The roar keeps the normal pace, so in slow motion it plays slowly.
    const rate = f.carried && !f.roaring ? N.carriedTurnRate : N.turnRate;
    this.neckYaw = stepNeck(this.neckYaw, wantYaw, rate, f.dt);
    this.neckPitch = stepNeck(this.neckPitch, wantPitch, rate, f.dt);
    if (f.lookAt) this.aimErr += Math.abs(wantYaw - this.neckYaw);

    let pitch = Math.sin(f.time * 0.9) * 0.05 + this.neckPitch;
    let turn = this.neckYaw;
    let reach = 0;
    let jaw = 0.06 + Math.max(0, Math.sin(f.time * 0.7)) * 0.05;
    jaw = Math.max(jaw, ROAR_JAW * this.roar);
    // Open while it blazes (Plasma Lance), so the jaws don't shut between the roar and the beam.
    jaw = Math.max(jaw, f.charge * 0.45, f.blaze * BLAZE_JAW);
    if (f.antiAir) {
      // Snap Bite: the neck turns and stretches toward the flyer, jaws wide.
      const w = Math.max(0, f.antiAir.weight);
      body.worldToLocal(_tmp.copy(f.antiAir.target)).sub(NECK_BASE);
      turn = THREE.MathUtils.lerp(turn, Math.max(-0.9, Math.min(0.9, Math.atan2(_tmp.x, _tmp.z))), w);
      const up = Math.atan2(_tmp.y, Math.hypot(_tmp.x, _tmp.z));
      pitch = THREE.MathUtils.lerp(pitch, -Math.max(-0.4, Math.min(1.0, up)), w);
      reach = 80 * w;
      jaw = Math.max(jaw, 0.7 * w);
    }
    this.neck.rotation.set(pitch, turn, 0, 'YXZ');
    this.neck.position.set(NECK_BASE.x, NECK_BASE.y, NECK_BASE.z + reach);
    this.jaw.rotation.x = jaw;

    const n = this.tailPts.length;
    for (let i = 1; i < n; i++) {
      const base = TAIL_BASE[i]!;
      const k = i / (n - 1);
      // Walking counter-balance: the tail swings opposite the body's weight shift, each segment a little
      // behind the one before so the wag ripples out to the tip like a whip.
      const lagged = -Math.sin(f.cycle * Math.PI * 2 - i * TAIL_LAG);
      const wag = -lagged * TAIL_WAG * Math.pow(k, 1.2) * m;
      this.tailPts[i]!.set(
        base.x + Math.sin(f.time * 1.1 - i * 0.6) * 30 * k + wag,
        base.y + Math.sin(f.time * 1.7 + i) * 8 * k + Math.abs(lagged) * 18 * k * m + 40 * k * this.roar + lp.tail * 110 * k,
        base.z + Math.abs(wag) * 0.25,
      );
    }
    if (f.tailSweep) {
      // Tail Sweep: cock away, then whip the tail across and down onto the target's side.
      const w = tailSwing(f.tailSweep.t, f.tailSweep.timing);
      const side = f.tailSweep.side;
      for (let i = 1; i < n; i++) {
        const k = i / (n - 1);
        const p = this.tailPts[i]!;
        p.x += side * w * 430 * Math.pow(k, 1.3);
        p.z += Math.abs(w) * 170 * k * k;
        p.y = THREE.MathUtils.lerp(p.y, 25, Math.max(0, w) * k);
      }
    }
    for (let i = 0; i < this.tailSegs.length; i++) placeSegment(this.tailSegs[i]!, this.tailPts[i]!, this.tailPts[i + 1]!);

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.plateMat.emissiveIntensity = f.flash ? 3 : 0.35 + 2.2 * Math.max(this.roar, f.charge) + BLAZE * f.blaze;
    for (let i = 0; i < this.ventMats.length; i++) {
      this.ventFlash[i] = Math.max(0, this.ventFlash[i]! - f.dt * 5);
      this.ventMats[i]!.emissiveIntensity = f.flash ? 3 : 0.5 + 1.2 * f.charge + 3 * this.ventFlash[i]! + BLAZE * f.blaze;
    }
  }

  /** Projectiles leave from the back vents in turn; the one used flares. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const i = this.nextVent++ % this.vents.length;
    this.ventFlash[i] = 1;
    const v = this.vents[i]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  aimError(): number {
    return this.aimErr;
  }

  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mouth.updateWorldMatrix(true, false);
    return this.mouth.getWorldPosition(out);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
  }
}
