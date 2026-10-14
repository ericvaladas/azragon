import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { placeSegment } from './ik';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { tailSwatPoints } from './tailSwat';

export type LegRig = {
  side: 1 | -1;
  hipLocal: THREE.Vector3; // in body space
  restFoot: THREE.Vector3; // in root space
  femur: THREE.Mesh;
  tibia: THREE.Mesh;
  knee: THREE.Mesh;
};

const LEG_Z = [90, 90, 0, 0, -90, -90];
const FOOT_Z = [270, 270, 20, 20, -250, -250];
type P3 = readonly [number, number, number];
/**
 * The head as a hull over these points (body space, one side; mirrored in X): a broad, flat-topped crown at the
 * back, sharp temple and brow corners, cheeks raked in to a pointed jaw, and a keel down the face.
 */
const HEAD_POINTS: readonly P3[] = [
  // Back of the head.
  [0, 342, 98], [34, 340, 98], [54, 312, 100], [56, 280, 100], [44, 250, 100], [0, 240, 100],
  // Crown and temples (widest).
  [0, 352, 132], [36, 348, 134], [62, 318, 146], [60, 284, 150], [48, 252, 150], [22, 238, 148], [0, 236, 146],
  // Brow corners, eye sockets and cheeks.
  [0, 344, 172], [30, 340, 176], [46, 326, 184], [54, 300, 180], [46, 266, 186], [28, 246, 186],
  // Face: a keel down the middle, narrowing.
  [0, 326, 204], [20, 316, 206], [28, 290, 208], [22, 262, 210], [0, 252, 210],
  // The pointed jaw.
  [12, 296, 226], [10, 272, 226], [0, 306, 222], [0, 266, 228],
];

/**
 * The pronotum: a rounded dome over the thorax, rising to the same height as before and overhanging the thorax's
 * edges a little. Points on the upper half of an ellipsoid (body space), so the hull comes out smoothly faceted.
 */
function pronotumPoints(): THREE.Vector3[] {
  const c = new THREE.Vector3(0, 340, 0);
  const r = new THREE.Vector3(86, 126, 116);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const th = (i / 5) * (Math.PI / 2);
    const n = i === 0 ? 1 : 12;
    for (let j = 0; j < n; j++) {
      const ph = (j / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(th) * Math.sin(ph) * r.x, Math.cos(th) * r.y, Math.sin(th) * Math.cos(ph) * r.z).add(c));
    }
  }
  return pts;
}

/** Abdomen (body space): centre, radii, tilt about X — the elytra are built over its upper surface. */
const ABDOMEN = { c: new THREE.Vector3(0, 330, -210), r: new THREE.Vector3(130, 105, 190), tilt: -0.25 };

/**
 * One elytron (`side` +1 = +X): a hardened wing case over the abdomen's top, from the centre line (where it meets the other) out
 * past its shoulder, front to rear; its outer edge flares out a little. A hull over points on a slightly
 * larger copy of the abdomen, so it hugs the body.
 */
function elytronPoints(side: 1 | -1): THREE.Vector3[] {
  const { c, r, tilt } = ABDOMEN;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const u = 0.8 - i * 0.33;
    for (let j = 0; j <= 4; j++) {
      const v = j * 0.305;
      const grow = j === 4 ? 1.12 : 1.07;
      pts.push(new THREE.Vector3(side * Math.sin(v) * r.x * grow, Math.cos(v) * Math.cos(u) * r.y * grow, Math.cos(v) * Math.sin(u) * r.z * 1.04).applyQuaternion(q).add(c));
    }
  }
  return pts;
}

const TAIL_BASE: THREE.Vector3[] = [
  new THREE.Vector3(0, 350, -380),
  new THREE.Vector3(0, 450, -440),
  new THREE.Vector3(0, 540, -330),
  new THREE.Vector3(0, 550, -190),
  new THREE.Vector3(0, 510, -90),
];

/** Built from primitives. Faces +Z, Y-up; +X is the monster's left. ~550 tall at the stinger. */
export class InsectTitanModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly legs: LegRig[] = [];
  readonly mandibles: THREE.Object3D[] = [];
  readonly stingerTip = new THREE.Object3D();
  readonly materials: THREE.MeshToonMaterial[];
  private tailSegs: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private stinger: THREE.Mesh;

  constructor() {
    const p = CONFIG.palette;
    const shell = toonMat(p.carapace);
    const shellDark = toonMat(p.carapaceDark);
    const joint = toonMat(p.joint);
    const glow = toonMat(p.stinger, { emissive: p.stinger });
    const eye = toonMat(p.eye, { emissive: p.eye });
    this.materials = [shell, shellDark, joint];

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const box = faceted(new THREE.BoxGeometry(1, 1, 1));
    const blob = faceted(new THREE.IcosahedronGeometry(1, 1));

    add(this.body, box, shell, [0, 300, 0], [150, 110, 200]);
    const mirror = (pts: readonly P3[]) => pts.flatMap(([x, y, z]) => (x === 0 ? [new THREE.Vector3(x, y, z)] : [new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z)]));
    add(this.body, faceted(new ConvexGeometry(pronotumPoints())), shellDark, [0, 0, 0]);
    const abdomen = add(this.body, blob, shell, ABDOMEN.c.toArray(), ABDOMEN.r.toArray());
    abdomen.rotation.x = ABDOMEN.tilt;
    // Elytra: two wing cases over the abdomen, parted by a seam down the middle.
    for (const sd of [1, -1] as const) add(this.body, faceted(new ConvexGeometry(elytronPoints(sd))), shellDark, [0, 0, 0]);
    add(this.body, faceted(new ConvexGeometry(mirror(HEAD_POINTS))), shell, [0, 0, 0]);
    // Eyes: angular faceted gems set into the sides of the head, looking forward and out.
    const eyeGeo = faceted(new THREE.OctahedronGeometry(1, 0));
    for (const sd of [1, -1]) {
      const e = add(this.body, eyeGeo, eye, [sd * 44, 306, 190], [10, 16, 22]);
      e.rotation.set(0, sd * 0.55, sd * 0.2);
    }

    const mandibleGeo = faceted(new THREE.ConeGeometry(14, 100, 4)).rotateX(Math.PI / 2).translate(0, 0, 50);
    for (const side of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 32, 255, 195);
      const m = new THREE.Mesh(mandibleGeo, shellDark);
      m.castShadow = true;
      pivot.add(m);
      this.body.add(pivot);
      this.mandibles.push(pivot);
    }

    const tailGeo = faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6));
    for (let i = 0; i < TAIL_BASE.length - 1; i++) {
      const r = 70 - i * 12;
      this.tailSegs.push(add(this.body, tailGeo, i % 2 ? shellDark : shell, [0, 0, 0], [r, 1, r]));
    }
    this.stinger = add(this.body, faceted(new THREE.ConeGeometry(22, 90, 5)), glow, [0, 0, 0]);
    this.body.add(this.stingerTip);
    this.updateTail(0);

    const femurGeo = faceted(new THREE.BoxGeometry(1, 1, 1));
    const tibiaGeo = faceted(new THREE.CylinderGeometry(0.35, 1, 1, 5));
    const kneeGeo = faceted(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 6; i++) {
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      this.legs.push({
        side,
        hipLocal: new THREE.Vector3(side * 75, 290, LEG_Z[i]!),
        restFoot: new THREE.Vector3(side * 390, 0, FOOT_Z[i]!),
        femur: add(this.root, femurGeo, shellDark, [0, 0, 0], [58, 1, 58]),
        tibia: add(this.root, tibiaGeo, shell, [0, 0, 0], [38, 1, 38]),
        knee: add(this.root, kneeGeo, joint, [0, 0, 0], [40, 40, 40]),
      });
    }

    this.root.add(this.body);
  }

  /**
   * Curl and sway the tail chain; the stinger and spike origin ride on the last point.
   * For Tail Swat, `swatTarget` (body space) and weight `w` bend the chain so the tip reaches the target.
   */
  updateTail(time: number, swatTarget: THREE.Vector3 | null = null, w = 0): void {
    for (let i = 1; i < this.tailPts.length; i++) {
      const base = TAIL_BASE[i]!;
      const k = i / (this.tailPts.length - 1);
      this.tailPts[i]!.set(base.x + Math.sin(time * 1.3) * 25 * k, base.y + Math.sin(time * 2.1 + i) * 10 * k, base.z);
    }
    if (swatTarget && w !== 0) {
      const bent = tailSwatPoints(this.tailPts, swatTarget, w);
      bent.forEach((p, i) => this.tailPts[i]!.copy(p));
    }
    for (let i = 0; i < this.tailSegs.length; i++) {
      placeSegment(this.tailSegs[i]!, this.tailPts[i]!, this.tailPts[i + 1]!);
    }
    const tip = this.tailPts[this.tailPts.length - 1]!;
    const prev = this.tailPts[this.tailPts.length - 2]!;
    const end = tip.clone().addScaledVector(tip.clone().sub(prev).normalize(), 70);
    placeSegment(this.stinger, tip, end);
    this.stinger.scale.set(1, 1, 1);
    this.stingerTip.position.copy(end);
  }
}
