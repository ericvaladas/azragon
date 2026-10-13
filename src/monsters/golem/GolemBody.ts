import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { fistKind } from './fist';
import { SWING, limbPlanted, limbSwing } from './knuckleGait';

const G = CONFIG.golem;
const C = G.colors;
/** Model units (before CONFIG.monster.scale). The torso pivots here (just behind the hips). */
const PIVOT = new THREE.Vector3(0, 250, -60);
const UPPER = 250;
const FORE = 260;
const THIGH = 160;
const SHIN = 150;
const FIST_R = 85;
/** Torso-space shoulder and hip on the left (+X); the right mirrors x. */
const SHOULDER = new THREE.Vector3(200, 480, 80);
const HIP = new THREE.Vector3(120, 250, -110);
/** Root-space rest spots (left side) of a planted fist (its centre) and foot, and how high each lifts mid-swing. */
const FIST_AT = new THREE.Vector3(250, FIST_R, 230);
const FOOT_AT = new THREE.Vector3(150, 0, -130);
const FIST_LIFT = 130;
const FOOT_LIFT = 70;
/** Slam: where the fist rises (left side) before it drops. Backhand: where it cocks across the chest, and its sweep radius. */
const SLAM_RAISE = new THREE.Vector3(170, 620, 260);
const BACKHAND_COCK = new THREE.Vector3(-60, 280, 320);
const BACKHAND_R = 520;
const ARM_REACH = UPPER + FORE - 30;
/** Eruption: seconds for both fists to rise and slam. */
const NOVA_TIME = 0.6;
/** Back vents (torso space): Magma Lob, Ember Storm and Pyroclast leave from these in turn. */
const BACK_VENTS: readonly (readonly [number, number, number])[] = [
  [85, 690, -75],
  [-85, 690, -75],
  [0, 682, -185],
];
/** Shoulder vent (torso space, left side; mirrored): Vent Burst geysers rise from here. */
const SHOULDER_VENT = new THREE.Vector3(205, 665, 60);
/** Glowing magma seams between the plates (torso space): x, y, z, width, height, depth, roll (rad). */
const SEAMS: readonly (readonly [number, number, number, number, number, number, number])[] = [
  // Front: from the chest crack up to each shoulder, and a kinked crack down the front of each shoulder.
  [70, 438, 234, 100, 14, 30, 0.83],
  [112, 515, 175, 105, 14, 30, 1.3],
  [-70, 438, 234, 100, 14, 30, 2.32],
  [-112, 515, 175, 105, 14, 30, 1.84],
  [204, 540, 196, 87, 14, 30, -1.19],
  [208, 472, 200, 80, 14, 30, -1.87],
  [-204, 540, 196, 87, 14, 30, -1.95],
  [-208, 472, 200, 80, 14, 30, -1.27],
  // Back: a kinked spine crack, a crack down each side of the hump, a shallow V across the lower back.
  [11, 578, -252, 81, 14, 30, -1.24],
  [7, 508, -254, 93, 14, 30, -1.95],
  [110, 585, -226, 125, 14, 30, -0.79],
  [159, 500, -211, 104, 14, 30, -1.37],
  [-110, 585, -226, 125, 14, 30, -2.36],
  [-159, 500, -211, 104, 14, 30, -1.77],
  [-30, 378, -166, 73, 14, 30, -0.21],
  [30, 378, -166, 73, 14, 30, 0.21],
  // Flanks.
  [284, 500, -30, 40, 120, 14, 0],
  [-284, 500, -30, 40, 120, 14, 0],
];
const _rel = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _fist = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _raise = new THREE.Vector3();
const _end = new THREE.Vector3();
const _vent = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

/** v with x mirrored to side sx (+1 left, −1 right). */
function mirror(v: THREE.Vector3, sx: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * sx, v.y, v.z);
}

type Arm = { upper: THREE.Mesh; fore: THREE.Mesh; fist: THREE.Mesh };
type Leg = { thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };

/**
 * The Magma Golem: a hunched basalt hulk split by glowing magma seams, a molten core in its cracked chest,
 * a small sunk head, huge arms it knuckle-walks on and short thick legs. Back vents lob magma; shoulder vents
 * geyser at flyers. Faces +Z; +X is its left.
 */
export class GolemBody implements MonsterBody {
  readonly root = new THREE.Group();
  /** Pivots at PIVOT; `shell` (offset by −PIVOT) holds the torso parts in root-like coordinates. */
  private body = new THREE.Group();
  private shell = new THREE.Group();
  /** Named `limbArms`: `arms` is MonsterBody's optional tentacle hook (the 4b Kaiju collision). */
  private limbArms: Arm[] = [];
  private legs: Leg[] = [];
  private tintMats: THREE.MeshToonMaterial[];
  private seamMat: THREE.MeshToonMaterial;
  private coreMat: THREE.MeshToonMaterial;
  private eyeMat: THREE.MeshToonMaterial;
  private seams: THREE.InstancedMesh;
  private geyser: THREE.Mesh;
  private geos: THREE.BufferGeometry[] = [];
  private vents: THREE.Object3D[] = [];
  private ventMats: THREE.MeshToonMaterial[] = [];
  private ventFlash: number[] = [];
  private nextVent = 0;
  private novaT = -1;

  constructor() {
    const basalt = toonMat(C.basalt);
    const dark = toonMat(C.basaltDark);
    const rock = toonMat(C.rock);
    this.seamMat = toonMat(C.magma, { emissive: C.magma });
    this.coreMat = toonMat(C.core, { emissive: C.core });
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    this.tintMats = [basalt, dark, rock];
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const boulder = this.keep(faceted(new THREE.IcosahedronGeometry(1, 0)));
    const cone = this.keep(faceted(new THREE.ConeGeometry(0.5, 1, 5)));
    const cyl = this.keep(faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)));
    // Forearms widen toward the fist (placeSegment points +Y from elbow to fist).
    const fore = this.keep(faceted(new THREE.CylinderGeometry(0.6, 0.45, 1, 6)));
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0, rotZ = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.set(rotX, 0, rotZ);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const sh = this.shell;

    // Hips under a heavy hunched torso: a rock hump over the shoulders, a chest split by the core's crack.
    add(sh, blob, dark, [0, 250, -110], [150, 110, 140]);
    add(sh, blob, basalt, [0, 380, 20], [230, 180, 200], 0.3);
    add(sh, blob, basalt, [0, 520, -30], [280, 165, 240], 0.15);
    add(sh, blob, rock, [0, 590, -60], [200, 90, 180], 0.1);
    for (const sx of [1, -1]) {
      add(sh, box, dark, [sx * 88, 350, 205], [110, 180, 55], 0.35, -sx * 0.1);
      add(sh, blob, basalt, [sx * 200, 500, 70], [140, 125, 140]);
      add(sh, boulder, rock, [sx * 225, 570, 40], [80, 60, 80]);
      add(sh, cone, dark, [sx * 150, 655, -120], [60, 110, 60], -0.3, -sx * 0.3);
    }
    add(sh, blob, this.coreMat, [0, 345, 210], [62, 85, 32], 0.35);
    // A small head sunk between the shoulders: heavy brow, slit eyes, a jutting jaw.
    add(sh, box, basalt, [0, 470, 225], [120, 100, 120]);
    add(sh, box, dark, [0, 510, 280], [140, 32, 40]);
    add(sh, box, dark, [0, 425, 262], [104, 44, 96]);
    for (const sx of [1, -1]) add(sh, box, this.eyeMat, [sx * 32, 482, 288], [34, 12, 8]);

    // Magma seams: one instanced mesh.
    this.seams = new THREE.InstancedMesh(box, this.seamMat, SEAMS.length);
    SEAMS.forEach(([x, y, z, w, h, d, roll], i) => {
      _m.compose(_tmp.set(x, y, z), _q.setFromEuler(_e.set(0, 0, roll)), _s.set(w, h, d));
      this.seams.setMatrixAt(i, _m);
    });
    sh.add(this.seams);

    // Back vents: a dark chimney around a glowing throat; `mouth` is where shots leave.
    const collar = this.keep(faceted(new THREE.CylinderGeometry(1, 1.2, 1, 7)));
    const throat = this.keep(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
    for (const [x, y, z] of BACK_VENTS) {
      const vent = new THREE.Object3D();
      vent.position.set(x, y, z);
      vent.rotation.set(-0.35, 0, -Math.sign(x) * 0.3);
      add(vent, collar, dark, [0, 0, 0], [40, 70, 40]);
      const mat = toonMat(C.magma, { emissive: C.magma });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      add(vent, throat, mat, [0, 35.5, 0], [34, 1, 34]);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 55, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      sh.add(vent);
    }
    for (const sx of [1, -1]) {
      add(sh, collar, dark, [SHOULDER_VENT.x * sx, SHOULDER_VENT.y - 22, SHOULDER_VENT.z], [28, 44, 28]);
      add(sh, throat, this.seamMat, [SHOULDER_VENT.x * sx, SHOULDER_VENT.y + 0.5, SHOULDER_VENT.z], [22, 1, 22]);
    }

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame).
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({
        upper: add(this.root, box, basalt, [0, 0, 0], [110, 1, 115]),
        fore: add(this.root, fore, dark, [0, 0, 0], [110, 1, 110]),
        fist: add(this.root, boulder, rock, [0, 0, 0], [FIST_R * 1.35, FIST_R, FIST_R * 1.25]),
      });
      this.legs.push({
        thigh: add(this.root, box, basalt, [0, 0, 0], [90, 1, 95]),
        shin: add(this.root, cyl, dark, [0, 0, 0], [80, 1, 80]),
        foot: add(this.root, box, dark, [0, 0, 0], [100, 44, 130]),
      });
    }

    // Vent Burst geyser: a bright magma column, shown only while it strikes.
    this.geyser = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: C.magma }));
    this.geyser.visible = false;
    this.root.add(this.geyser);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** Eruption: both fists rise and slam the ground. */
  nova(): void {
    this.novaT = 0;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const m = f.motion;
    const S = G.stats.strideLength;
    // Half the distance a planted limb slides back during stance, so it stays still on the ground.
    const A = ((1 - SWING) * S) / 2;
    if (this.novaT >= 0) {
      this.novaT += f.dt;
      if (this.novaT >= NOVA_TIME) this.novaT = -1;
    }
    const nova = this.novaT >= 0 ? this.novaT / NOVA_TIME : -1;
    const slam = nova >= 0 ? Math.sin(Math.PI * nova) : 0;

    // The shoulders roll toward the planting fist; the body bobs twice a cycle and breathes when still.
    const roll = Math.sin(f.cycle * Math.PI * 2) * 0.07 * m;
    const bob = Math.cos(f.cycle * Math.PI * 4) * 10 * m + Math.sin(f.time * 1.1) * 6;
    this.body.position.set(PIVOT.x, PIVOT.y + bob - f.pose.dip - slam * 40 - f.pose.collapse * 230, PIVOT.z);
    this.body.rotation.set(
      f.pose.pitch + (f.roaring ? -0.55 : 0) + (f.dashing ? 0.25 : 0) + slam * 0.25 + f.pose.collapse * 0.4,
      0,
      roll - f.pose.collapse * 0.15,
    );
    this.root.updateMatrixWorld(true);
    _rel.multiplyMatrices(this.body.matrix, this.shell.matrix);

    // Arms: walk on the fists, or strike, slam (Eruption), pound the chest (Roar), reach down (Leap).
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 0 : 2;
      const arm = this.limbArms[side]!;
      const g = limbSwing(f.cycle, limb);
      _gait.set(FIST_AT.x * sx, FIST_AT.y + g.lift * FIST_LIFT * m, FIST_AT.z + g.stride * A * m);
      _fist.copy(_gait);
      const striking = f.melee !== null && f.melee.side === side;
      if (striking) this.strikePose(f.melee!.t, f.melee!.target, sx, _gait, _fist);
      if (nova >= 0) {
        mirror(SLAM_RAISE, sx, _raise);
        if (nova < 0.5) _fist.lerpVectors(_gait, _raise, nova / 0.5);
        else _fist.lerpVectors(_raise, _end.set(sx * 280, FIST_R, 320), Math.min(1, (nova - 0.5) / 0.15));
      }
      if (f.roaring) _fist.set(sx * 90, 430 + Math.sin(f.time * 14 + side * Math.PI) * 45, 250);
      if (f.airborne) _fist.set(sx * 230, -30, 260);
      mirror(SHOULDER, sx, _sh).applyMatrix4(_rel);
      _tmp.subVectors(_fist, _sh);
      if (_tmp.length() > ARM_REACH) _fist.copy(_sh).add(_tmp.setLength(ARM_REACH));
      _pole.copy(_sh).add(_tmp.set(sx * 260, -40, -260)); // elbows out and back
      solveTwoBone(_sh, _fist, UPPER, FORE, _pole, _elbow);
      placeSegment(arm.upper, _sh, _elbow);
      placeSegment(arm.fore, _elbow, _fist);
      arm.fist.position.copy(_fist);
      if (m > 0.3 && !striking && nova < 0 && limbPlanted(f.prevCycle, f.cycle, limb)) {
        onFootLand(_world.copy(_gait).setY(0).applyMatrix4(this.root.matrixWorld));
      }
    }

    // Legs: short and planted, knees forward.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 3 : 1;
      const leg = this.legs[side]!;
      const g = limbSwing(f.cycle, limb);
      _foot.set(FOOT_AT.x * sx, g.lift * FOOT_LIFT * m, FOOT_AT.z + g.stride * A * m);
      if (f.airborne) _foot.set(sx * 150, 60, -60);
      mirror(HIP, sx, _hip).applyMatrix4(_rel);
      _pole.copy(_hip).add(_tmp.set(sx * 30, 0, 300));
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeSegment(leg.thigh, _hip, _knee);
      placeSegment(leg.shin, _knee, _foot);
      leg.foot.position.set(_foot.x, _foot.y + 22, _foot.z + 25);
      if (m > 0.3 && limbPlanted(f.prevCycle, f.cycle, limb)) onFootLand(_world.copy(_foot).setY(0).applyMatrix4(this.root.matrixWorld));
    }

    // Vent Burst: a magma geyser from the shoulder vent on the flyer's side, reaching it at full weight.
    if (f.antiAir && f.antiAir.weight > 0) {
      this.root.worldToLocal(_aim.copy(f.antiAir.target));
      mirror(SHOULDER_VENT, _aim.x >= 0 ? 1 : -1, _vent).applyMatrix4(_rel);
      _tip.lerpVectors(_vent, _aim, Math.min(1, f.antiAir.weight));
      placeSegment(this.geyser, _vent, _tip);
      this.geyser.scale.x = this.geyser.scale.z = 34 + 16 * f.antiAir.weight;
      this.geyser.visible = true;
    } else this.geyser.visible = false;

    // Glow: seams, core and eyes pulse at rest and blaze with Molten Core heat.
    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    const pulse = 0.25 * Math.sin(f.time * 2.2);
    this.seamMat.emissiveIntensity = f.flash ? 3 : 0.9 + pulse + f.heat * 2.2 + (f.roaring ? 1.5 : 0);
    this.coreMat.emissiveIntensity = f.flash ? 3 : 1.2 + pulse + f.heat * 3;
    this.eyeMat.emissiveIntensity = 1 + f.heat * 2 + (f.roaring ? 2 : 0);
    for (let i = 0; i < this.ventMats.length; i++) {
      this.ventFlash[i] = Math.max(0, this.ventFlash[i]! - f.dt * 5);
      this.ventMats[i]!.emissiveIntensity = f.flash ? 3 : 0.8 + f.heat + 3 * this.ventFlash[i]!;
    }
  }

  /**
   * Molten Fist (root space). Slam: rise, then drop onto the target. Backhand: cock across the chest, then sweep
   * out along an arc around the body to the target's side. Both ease back to the gait position.
   */
  private strikePose(t: number, target: THREE.Vector3, sx: number, gait: THREE.Vector3, out: THREE.Vector3): void {
    const T = G.stats.meleeTiming;
    this.root.worldToLocal(_aim.copy(target));
    _aim.y = FIST_R;
    if (fistKind(Math.atan2(_aim.x, _aim.z), G.fist.frontHalf) === 'slam') {
      mirror(SLAM_RAISE, sx, _raise);
      if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
      else if (t < T.impact) {
        const u = (t - T.windup) / (T.impact - T.windup);
        out.lerpVectors(_raise, _aim, u * u);
      } else out.lerpVectors(_aim, gait, Math.min(1, (t - T.impact) / (T.end - T.impact)));
      return;
    }
    mirror(BACKHAND_COCK, sx, _raise);
    const a0 = Math.atan2(_raise.x, _raise.z);
    const r0 = Math.hypot(_raise.x, _raise.z);
    const a1 = sx * G.fist.backhandCenter;
    _end.set(Math.sin(a1) * BACKHAND_R, FIST_R + 30, Math.cos(a1) * BACKHAND_R);
    if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
    else if (t < T.impact) {
      const u = (t - T.windup) / (T.impact - T.windup);
      const a = a0 + (a1 - a0) * u;
      const r = r0 + (BACKHAND_R - r0) * u;
      out.set(Math.sin(a) * r, _raise.y + (_end.y - _raise.y) * u, Math.cos(a) * r);
    } else out.lerpVectors(_end, gait, Math.min(1, (t - T.impact) / (T.end - T.impact)));
  }

  /** Shots leave from the back vents in turn; the one used flares. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const i = this.nextVent++ % this.vents.length;
    this.ventFlash[i] = 1;
    const v = this.vents[i]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first back vent. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.vents[0]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.seams.dispose();
  }
}
