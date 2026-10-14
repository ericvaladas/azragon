import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { bipedFoot, bipedLanded } from './bipedGait';
import { rakeSwing } from './rake';
import { neckAim, stepNeck } from './neck';
import { tailSwing } from './tailSweep';
import { kaijuLeap, type KaijuLeapPose } from './leapPose';
import { SHAPES, at, between, merge, scaleRows, taper } from './kaijuParts';

const K = CONFIG.kaiju;
const C = K.colors;
const THIGH = 170;
const SHIN = 190;
const LIFT = 80;
const FOOT_X = 115;
/** Leap: how far (model units) the body sinks in its crouch, and how high the feet tuck up in the air. */
const LEAP_SINK = 150;
const LEAP_TUCK = 150;
const STANDING: KaijuLeapPose = { sink: 0, pitch: 0, tuck: 0, arms: 0, tail: 0 };
/** Walking tail wag: sideways swing at the tip (model units) and the phase lag per segment (rad). */
const TAIL_WAG = 230;
const TAIL_LAG = 0.45;
const NECK_BASE = new THREE.Vector3(0, 470, 110);
const TAIL_BASE: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 300, -90),
  new THREE.Vector3(0, 255, -220),
  new THREE.Vector3(0, 200, -350),
  new THREE.Vector3(0, 140, -470),
  new THREE.Vector3(0, 90, -580),
  new THREE.Vector3(0, 55, -680),
];
/** Back plates along the spine (body space): x, y, z, length along the spine, height, tilt (rad about X, - = raked back). */
const PLATES: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 579, 78, 55, 85, 0],
  [0, 582, 15, 65, 110, -0.3],
  [0, 550, -48, 70, 115, -0.6],
  [0, 490, -92, 62, 100, -0.85],
  [0, 420, -118, 52, 80, -1.0],
  [0, 372, -160, 42, 60, -1.1],
];
/** Launch vents on the back, beside the spine between the plates (body space): x, y, z. */
const VENTS: readonly (readonly [number, number, number])[] = [
  [52, 548, -8],
  [-52, 548, -8],
  [50, 478, -78],
  [-50, 478, -78],
];
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

type Leg = { side: 1 | -1; hip: THREE.Vector3; thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };
/** Tail plates: the glowing back plates carry on down the tail, one riding the top of each segment. */
const TAIL_SPIKE = 0.8;
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
  private tailSpikes: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private tintMats: THREE.MeshToonMaterial[];
  private plateMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  /** Current neck yaw relative to the body, eased toward the breath aim; and how far it still is from it. */
  private neckYaw = 0;
  private neckPitch = 0;
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
    const eye = toonMat(C.eye, { emissive: C.eye });
    this.plateMat = toonMat(C.plate, { emissive: C.plate });
    const skin = toonMat(0xffffff, { vertexColors: true });
    this.tintMats = [scale, dark, belly, skin];
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const cone = this.keep(faceted(new THREE.ConeGeometry(0.5, 1, 4)));
    const cyl = this.keep(faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)));
    /** One merged, vertex-coloured mesh of detail parts under `parent`. */
    const detail = (parent: THREE.Object3D, parts: THREE.BufferGeometry[]) => {
      const m = new THREE.Mesh(this.keep(merge(parts)), skin);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
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
    {
      // Dragon scales over the back, shoulders and flanks; banded plates down the belly.
      const parts: THREE.BufferGeometry[] = [];
      scaleRows(parts, [C.scaleLight, C.scaleDark], [0, 410, 30], [125, 150, 115], 0.35, 7, 12, [0.25, 2.2], [0.75, Math.PI * 2 - 0.75], 34);
      scaleRows(parts, [C.scaleLight, C.scaleDark], [0, 300, -40], [120, 105, 140], 0, 5, 12, [0.35, 2.0], [0.9, Math.PI * 2 - 0.9], 32);
      scaleRows(parts, C.scale, [0, 410, 30], [125, 150, 115], 0.35, 1, 6, [0.2, 0.3], [0, Math.PI * 2], 40);
      for (let i = 0; i < 7; i++) {
        const th = 0.95 + i * 0.22;
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
        const p = new THREE.Vector3(0, Math.cos(th) * 130, Math.sin(th) * 90).applyQuaternion(tilt).add(new THREE.Vector3(0, 375, 70));
        const w = Math.sin(th) * 150;
        at(parts, SHAPES.box, C.scaleDark, [p.x, p.y, p.z + 1], [w, 4, 10], [0.35 + th - Math.PI / 2, 0, 0]);
      }
      detail(this.body, parts);
    }

    // Neck → head → hinged jaw; `mouth` is where the breath leaves.
    this.neck.position.copy(NECK_BASE);
    add(this.neck, box, scale, [0, 35, 30], [72, 80, 100], -0.5);
    {
      const parts: THREE.BufferGeometry[] = [];
      scaleRows(parts, C.scaleLight, [0, 35, 30], [40, 48, 56], -0.5, 4, 8, [0.3, 1.7], [0.9, Math.PI * 2 - 0.9], 26);
      detail(this.neck, parts);
    }
    const head = new THREE.Object3D();
    head.position.set(0, 85, 75);
    this.neck.add(head);
    {
      // Skull and a long tapering snout, an angry brow over the eyes, nostrils, a row of upper teeth,
      // cheek spikes swept back and a short crest at the back of the skull.
      const parts: THREE.BufferGeometry[] = [];
      at(parts, taper([92, 76], [80, 64], 100), C.scale, [0, 4, 25], [1, 1, 1]);
      at(parts, taper([72, 54], [46, 36], 100), C.scale, [0, -8, 115], [1, 1, 1]);
      at(parts, taper([34, 10], [18, 8], 92), C.scaleDark, [0, 18, 112], [1, 1, 1], [0.1, 0, 0]);
      for (const sd of [1, -1]) {
        at(parts, SHAPES.box, C.scaleDark, [sd * 33, 31, 64], [30, 12, 44], [0.28, sd * 0.3, sd * -0.2]);
        at(parts, SHAPES.box, C.scaleDark, [sd * 13, 9, 162], [10, 7, 8]);
        at(parts, SHAPES.spike, C.scaleDark, [sd * 46, -16, -8], [12, 46, 12], [-Math.PI / 2 + 0.25, sd * 0.45, 0]);
        at(parts, SHAPES.spike, C.scaleDark, [sd * 24, 38, -12], [12, 34, 12], [-0.85, 0, sd * -0.35]);
        for (let z = 78; z <= 158; z += 13) at(parts, SHAPES.spike, C.claw, [sd * (31 - (z - 78) * 0.13), -32 + (z - 78) * 0.07, z], [7, 16, 7], [Math.PI, 0, 0]);
      }
      at(parts, SHAPES.spike, C.scaleDark, [0, 44, -4], [14, 44, 14], [-0.95, 0, 0]);
      scaleRows(parts, C.scaleDark, [0, 4, 25], [46, 38, 50], 0, 2, 7, [0.35, 0.95], [Math.PI * 0.55, Math.PI * 1.45], 20);
      detail(head, parts);
    }
    add(head, box, eye, [41, 19, 70], [12, 10, 18]);
    add(head, box, eye, [-41, 19, 70], [12, 10, 18]);
    this.jaw.position.set(0, -30, 40);
    head.add(this.jaw);
    {
      // Lower jaw: scaled sides over a pale underjaw, a row of lower teeth.
      const parts: THREE.BufferGeometry[] = [];
      at(parts, taper([64, 24], [40, 16], 120), C.scale, [0, -8, 62], [1, 1, 1]);
      at(parts, taper([52, 8], [30, 6], 112), C.belly, [0, -21, 60], [1, 1, 1]);
      for (const sd of [1, -1]) for (let z = 40; z <= 112; z += 14) at(parts, SHAPES.spike, C.claw, [sd * (24 - (z - 40) * 0.1), 10, z], [7, 15, 7]);
      detail(this.jaw, parts);
    }
    this.mouth.position.set(0, -20, 165);
    head.add(this.mouth);
    this.body.add(this.neck);

    // Short clawed arms, hanging forward-down from the shoulders.
    for (const side of [1, -1] as const) {
      // Upper arm hanging down and a little back from the shoulder, elbow bent so the forearm comes forward,
      // and a three-fingered hand with its claws curled down.
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 100, 440, 105);
      const parts: THREE.BufferGeometry[] = [];
      const elbow: [number, number, number] = [side * 16, -62, -10];
      const wrist: [number, number, number] = [side * 8, -80, 50];
      at(parts, SHAPES.blob, C.scale, [side * 4, -6, 0], [30, 30, 30]);
      between(parts, SHAPES.limb, C.scale, [0, 0, 0], elbow, 34, 34);
      at(parts, SHAPES.blob, C.scaleDark, elbow, [19, 19, 19]);
      between(parts, SHAPES.limb, C.scaleDark, elbow, wrist, 26, 26);
      at(parts, SHAPES.box, C.scaleDark, [wrist[0], wrist[1] - 4, wrist[2] + 10], [30, 14, 26], [0.5, 0, 0]);
      for (const dx of [-11, 0, 11]) {
        const knuckle: [number, number, number] = [wrist[0] + dx, wrist[1] - 10, wrist[2] + 24];
        const tip: [number, number, number] = [wrist[0] + dx * 1.1, wrist[1] - 30, wrist[2] + 34];
        between(parts, SHAPES.limb, C.scaleDark, knuckle, tip, 9, 9);
        at(parts, SHAPES.spike, C.claw, [tip[0], tip[1] - 8, tip[2] + 2], [8, 22, 8], [Math.PI - 0.35, 0, 0]);
      }
      scaleRows(parts, C.scaleLight, [side * 8, -32, -5], [19, 36, 19], 0.15, 3, 6, [0.5, 2.6], [0, Math.PI * 2], 13);
      detail(pivot, parts);
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
      this.tailSpikes.push(add(this.body, cone, this.plateMat, [0, 0, 0], [r * 0.4, r * 1.1, r * 0.8]));
    }

    // Legs (root space; placed by IK each frame).
    for (const side of [1, -1] as const) {
      // Built at true size, then scaled so the IK's stretch (width, bone length, depth) brings it back.
      const thighParts: THREE.BufferGeometry[] = [];
      at(thighParts, SHAPES.blob, C.scale, [0, 8, 4], [42, 96, 46]);
      scaleRows(thighParts, [C.scaleLight, C.scaleDark], [0, 8, 4], [42, 96, 46], 0, 6, 9, [0.45, 2.7], [0, Math.PI * 2], 22);
      const thighGeo = merge(thighParts).scale(1 / 70, 1 / THIGH, 1 / 75);
      const shinParts: THREE.BufferGeometry[] = [];
      at(shinParts, SHAPES.limb, C.scaleDark, [0, 0, 0], [50, SHIN, 50]);
      scaleRows(shinParts, C.scale, [0, 0, 0], [26, SHIN * 0.5, 26], 0, 6, 7, [0.4, 2.7], [0, Math.PI * 2], 16);
      at(shinParts, SHAPES.spike, C.scaleDark, [0, SHIN * 0.42, 22], [14, 30, 14], [0.9, 0, 0]);
      const shinGeo = merge(shinParts).scale(1 / 50, 1 / SHIN, 1 / 50);
      const footParts: THREE.BufferGeometry[] = [];
      at(footParts, SHAPES.box, C.scaleDark, [0, 0, -12], [74, 30, 86]);
      for (const dx of [-24, 0, 24]) {
        at(footParts, SHAPES.box, C.scaleDark, [dx, -3, 40], [20, 22, 34], [0.1, dx * 0.006, 0]);
        at(footParts, SHAPES.spike, C.claw, [dx * 1.05, -6, 64], [10, 24, 10], [Math.PI / 2 + 0.35, 0, 0]);
      }
      at(footParts, SHAPES.spike, C.claw, [0, -2, -60], [10, 20, 10], [-Math.PI / 2 - 0.3, 0, 0]);
      const limb = (geo: THREE.BufferGeometry, size: [number, number, number]) => {
        const m = new THREE.Mesh(this.keep(geo), skin);
        m.scale.set(...size);
        m.castShadow = true;
        m.receiveShadow = true;
        this.root.add(m);
        return m;
      };
      this.legs.push({
        side,
        hip: new THREE.Vector3(side * 70, 300, -30),
        thigh: limb(thighGeo, [70, 1, 75]),
        shin: limb(shinGeo, [50, 1, 50]),
        foot: limb(merge(footParts), [1, 1, 1]),
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
      arm.pivot.rotation.set(swing, 0, -arm.side * Math.max(0, -swing) * 0.5);
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
    this.neckYaw = stepNeck(this.neckYaw, wantYaw, N.turnRate, f.dt);
    this.neckPitch = stepNeck(this.neckPitch, wantPitch, N.turnRate, f.dt);
    if (f.lookAt) this.aimErr += Math.abs(wantYaw - this.neckYaw);

    let pitch = Math.sin(f.time * 0.9) * 0.05 + this.neckPitch;
    let turn = this.neckYaw;
    let reach = 0;
    let jaw = 0.06 + Math.max(0, Math.sin(f.time * 0.7)) * 0.05;
    if (f.roaring) {
      pitch = -0.55;
      jaw = 0.8;
    }
    jaw = Math.max(jaw, f.charge * 0.45);
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
        base.y + Math.sin(f.time * 1.7 + i) * 8 * k + Math.abs(lagged) * 18 * k * m + (f.roaring ? 40 * k : 0) + lp.tail * 110 * k,
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
    for (let i = 0; i < this.tailSegs.length; i++) {
      const a = this.tailPts[i]!;
      const b = this.tailPts[i + 1]!;
      placeSegment(this.tailSegs[i]!, a, b);
      // The spike rides the top of the segment, raked back along it.
      const spike = this.tailSpikes[i]!;
      const r = this.tailSegs[i]!.scale.x;
      spike.position.lerpVectors(a, b, 0.45);
      spike.position.y += r * TAIL_SPIKE;
      spike.rotation.set(-0.8, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI, 0, 'YXZ');
    }

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.plateMat.emissiveIntensity = f.flash ? 3 : 0.35 + 2.2 * (f.roaring ? 1 : f.charge);
    for (let i = 0; i < this.ventMats.length; i++) {
      this.ventFlash[i] = Math.max(0, this.ventFlash[i]! - f.dt * 5);
      this.ventMats[i]!.emissiveIntensity = f.flash ? 3 : 0.5 + 1.2 * f.charge + 3 * this.ventFlash[i]!;
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
