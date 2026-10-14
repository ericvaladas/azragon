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
 * The head as a hull over these points (body space, one side; mirrored in X): a mantis-like triangle seen from
 * the front — wide at the top, where the eyes sit on the corners, raked in to a point at the mouth — and a
 * flat wedge from the side. Few points, so it is a handful of big, sharp planes.
 */
const HEAD_POINTS: readonly P3[] = [
  [0, 344, 104], [50, 336, 104], [22, 252, 110], [0, 246, 110],
  [0, 352, 146], [64, 326, 150], [30, 250, 156],
  [0, 338, 200], [58, 330, 190], [12, 246, 214], [0, 240, 216],
  [10, 258, 224], [0, 262, 228],
];
/** Dark armour on the head (one side, +X; mirrored): each a small hull. */
const HEAD_ARMOR: readonly (readonly P3[])[] = [
  // Brow crest blade, sweeping back and up from above the eye.
  [[40, 340, 186], [54, 340, 180], [50, 332, 182], [62, 388, 100], [56, 382, 98], [54, 356, 140], [44, 350, 146]],
  // Eye socket: an angular rim the eye sits in, on the head's top corner.
  [[52, 340, 192], [70, 334, 172], [72, 316, 158], [64, 304, 168], [54, 310, 192], [64, 330, 152]],
];
/** The keel down the middle of the head (both sides at once). */
const HEAD_KEEL: readonly P3[] = [[0, 362, 116], [9, 356, 120], [-9, 356, 120], [0, 342, 206], [7, 336, 202], [-7, 336, 202], [0, 330, 140]];

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
    add(this.body, box, shellDark, [0, 360, 0], [110, 30, 170]);
    const abdomen = add(this.body, blob, shell, [0, 330, -210], [130, 105, 190]);
    abdomen.rotation.x = -0.25;
    for (let i = 0; i < 3; i++) add(this.body, box, shellDark, [0, 395 - i * 8, -140 - i * 70], [120 - i * 15, 18, 40]);
    const hull = (pts: readonly P3[], mirror: 1 | -1 = 1) => faceted(new ConvexGeometry(pts.map(([x, y, z]) => new THREE.Vector3(x * mirror, y, z))));
    const mirrored = (pts: readonly P3[]) => pts.flatMap(([x, y, z]) => (x === 0 ? [[x, y, z] as P3] : [[x, y, z] as P3, [-x, y, z] as P3]));
    add(this.body, hull(mirrored(HEAD_POINTS)), shell, [0, 0, 0]);
    add(this.body, hull(HEAD_KEEL), shellDark, [0, 0, 0]);
    for (const sd of [1, -1] as const) {
      for (const piece of HEAD_ARMOR) add(this.body, hull(piece, sd), shellDark, [0, 0, 0]);
      // Eyes: angular faceted gems set in the sockets, looking forward and out.
      const e = add(this.body, faceted(new THREE.OctahedronGeometry(1, 0)), eye, [sd * 66, 324, 178], [13, 17, 25]);
      e.rotation.set(0, sd * 0.55, sd * 0.25);
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
