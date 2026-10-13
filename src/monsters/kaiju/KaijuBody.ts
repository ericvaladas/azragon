import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { bipedFoot, bipedLanded } from './bipedGait';
import { rakeSwing } from './rake';

const K = CONFIG.kaiju;
const C = K.colors;
const THIGH = 170;
const SHIN = 190;
const LIFT = 80;
const FOOT_X = 115;
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
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

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
  private arms: Arm[] = [];
  private neck = new THREE.Object3D();
  private jaw = new THREE.Object3D();
  private mouth = new THREE.Object3D();
  private tailSegs: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private tintMats: THREE.MeshToonMaterial[];
  private plateMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];

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
    add(this.neck, box, scale, [0, 35, 30], [72, 80, 100], -0.5);
    const head = new THREE.Object3D();
    head.position.set(0, 85, 75);
    this.neck.add(head);
    add(head, box, scale, [0, 0, 30], [90, 70, 110]);
    add(head, box, dark, [0, -8, 110], [64, 46, 90]);
    add(head, box, eye, [38, 22, 80], [16, 10, 16]);
    add(head, box, eye, [-38, 22, 80], [16, 10, 16]);
    this.jaw.position.set(0, -30, 40);
    head.add(this.jaw);
    add(this.jaw, box, belly, [0, -8, 60], [58, 18, 110]);
    for (const x of [-20, 0, 20]) add(this.jaw, cone, claw, [x, 6, 105], [10, 18, 10]);
    this.mouth.position.set(0, -20, 165);
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
      this.arms.push({ side, pivot });
    }

    // Glowing back plates, raked back.
    for (const [x, y, z, w, h, tilt] of PLATES) add(this.body, cone, this.plateMat, [x, y, z], [w * 0.45, h, w], tilt);

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
    const m = f.motion;
    // Weight shifts over the planted foot once per stride; the tail swings the other way.
    // Leg 0 (+X) swings while sin(2π·cycle) > 0, so the weight sits toward −X (over leg 1) then, and vice versa.
    const shift = -Math.sin(f.cycle * Math.PI * 2);
    const body = this.body;
    body.position.set(shift * 16 * m, (1 - Math.abs(shift)) * 10 * m + Math.sin(f.time * 1.3) * 6 - f.pose.dip - f.pose.collapse * 230, 0);
    body.rotation.set(f.pose.pitch + f.pose.collapse * 0.5, 0, -shift * 0.05 * m - f.pose.collapse * 0.3);
    this.root.updateMatrixWorld(true);

    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const fs = bipedFoot(f.cycle, i);
      _hip.copy(leg.hip).applyMatrix4(body.matrix);
      _foot.set(leg.side * FOOT_X * (1 + f.pose.collapse * 0.5), fs.lift * LIFT * m, fs.stride * (K.stats.strideLength / 2) * m);
      _pole.copy(_hip).add(_tmp.set(leg.side * 20, 0, 300)); // knees bend forward
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeSegment(leg.thigh, _hip, _knee);
      placeSegment(leg.shin, _knee, _foot);
      leg.foot.position.set(_foot.x, _foot.y + 15, _foot.z + 30);
      if (m > 0.3 && bipedLanded(f.prevCycle, f.cycle, i)) onFootLand(_world.copy(_foot).applyMatrix4(this.root.matrixWorld));
    }

    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      let swing = Math.sin(f.time * 1.3 + i) * 0.06 - shift * arm.side * 0.12 * m;
      if (f.melee && f.melee.side === i) swing = rakeSwing(f.melee.t, K.stats.meleeTiming);
      // While slashing forward (negative swing) the arm also sweeps across the body.
      arm.pivot.rotation.set(swing, 0, -arm.side * Math.max(0, -swing) * 0.5);
    }

    let pitch = Math.sin(f.time * 0.9) * 0.05;
    let turn = 0;
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
      turn = Math.max(-0.9, Math.min(0.9, Math.atan2(_tmp.x, _tmp.z))) * w;
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
      this.tailPts[i]!.set(
        base.x + (Math.sin(f.time * 1.1 - i * 0.6) * 30 - shift * 70 * m) * k,
        base.y + Math.sin(f.time * 1.7 + i) * 8 * k + (f.roaring ? 40 * k : 0),
        base.z,
      );
    }
    for (let i = 0; i < this.tailSegs.length; i++) placeSegment(this.tailSegs[i]!, this.tailPts[i]!, this.tailPts[i + 1]!);

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.plateMat.emissiveIntensity = f.flash ? 3 : 0.35 + 2.2 * (f.roaring ? 1 : f.charge);
  }

  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mouth.updateWorldMatrix(true, false);
    return this.mouth.getWorldPosition(out);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
  }
}
