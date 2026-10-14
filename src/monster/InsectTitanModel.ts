import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { placeSegment } from './ik';
import { tailSwatPoints } from './tailSwat';
import { SHAPES, at, between, merge, plateOn, taper } from './insectParts';

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
    const detailMat = toonMat(0xffffff, { vertexColors: true });
    this.materials = [shell, shellDark, joint, detailMat];
    /** One merged, vertex-coloured mesh of detail parts under `parent`. */
    const detail = (parent: THREE.Object3D, parts: THREE.BufferGeometry[]) => {
      const m = new THREE.Mesh(merge(parts), detailMat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

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
    const abdomen = add(this.body, blob, shell, [0, 330, -210], [130, 105, 190]);
    abdomen.rotation.x = -0.25;
    {
      // Back armour: shingled plates down the thorax over a low keel, edge spikes; segmented bands across
      // the abdomen, each in three angled plates that follow its curve.
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const z = 62 - i * 62;
        at(parts, taper([136, 14], [118, 12], 74), p.carapaceArmor, [0, 360 + i * 2, z], [1, 1, 1], [-0.1, 0, 0]);
        at(parts, SHAPES.spike, p.carapaceArmor, [0, 372 + i * 2, z - 18], [16, 26, 30], [-0.6, 0, 0]);
        for (const sd of [1, -1]) at(parts, SHAPES.spike, p.carapaceArmor, [sd * 72, 352, z - 20], [10, 28, 10], [0, 0, -sd * 1.9]);
      }
      const C: [number, number, number] = [0, 330, -210];
      const R: [number, number, number] = [130, 105, 190];
      for (let i = 0; i < 6; i++) {
        const u = 0.55 - i * 0.36;
        const tone = p.carapaceArmor;
        const along = 64 - i * 3;
        plateOn(parts, tone, C, R, -0.25, u, 0, [88 - i * 6, 16, along], 3, 0.14);
        for (const sd of [1, -1]) plateOn(parts, tone, C, R, -0.25, u, sd * 0.62, [70 - i * 5, 15, along * 0.92], 3, 0.14);
      }
      detail(this.body, parts);
    }
    {
      // Head: a wedge that narrows and drops toward the front, a crest down the middle, brow and cheek plates,
      // an upper lip between the mandibles, and short jointed antennae.
      const parts: THREE.BufferGeometry[] = [];
      at(parts, taper([106, 90], [58, 38], 112), p.carapace, [0, 292, 150], [1, 1, 1], [0.18, 0, 0]);
      // A diamond faceplate that brings the face to a point between the eyes.
      at(parts, SHAPES.spike, p.carapaceArmor, [0, 281, 214], [76, 44, 76], [Math.PI / 2 + 0.25, 0, Math.PI / 4]);
      at(parts, taper([26, 14], [10, 8], 104), p.carapaceArmor, [0, 336, 148], [1, 1, 1], [0.24, 0, 0]);
      at(parts, SHAPES.box, p.carapaceArmor, [0, 262, 207], [52, 16, 18], [0.2, 0, 0]);
      for (const sd of [1, -1]) {
        at(parts, SHAPES.box, p.carapaceArmor, [sd * 33, 323, 172], [42, 10, 44], [0.38, sd * 0.42, sd * -0.28]);
        at(parts, SHAPES.box, p.carapaceArmor, [sd * 47, 280, 150], [12, 54, 76], [0.12, sd * 0.22, 0]);
        const a0: [number, number, number] = [sd * 20, 328, 192];
        const a1: [number, number, number] = [sd * 40, 392, 226];
        const a2: [number, number, number] = [sd * 74, 432, 196];
        between(parts, SHAPES.limb, p.carapaceArmor, a0, a1, 9, 9);
        at(parts, SHAPES.blob, p.carapaceArmor, a1, [7, 7, 7]);
        between(parts, SHAPES.limb, p.carapaceArmor, a1, a2, 7, 7);
      }
      detail(this.body, parts);
    }
    // Compound eyes: big faceted domes set back on the sides of the head, looking forward and out.
    const eyeGeo = faceted(new THREE.IcosahedronGeometry(1, 0));
    for (const sd of [1, -1]) {
      const e = add(this.body, eyeGeo, eye, [sd * 43, 309, 184], [15, 19, 25]);
      e.rotation.y = sd * 0.45;
    }

    // Mandibles: curved, segmented pincers that taper to a sharp purple tip, toothed along the inner edge.
    for (const side of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 32, 255, 195);
      const parts: THREE.BufferGeometry[] = [];
      const pts: [number, number, number][] = [
        [0, 0, 0],
        [side * 10, -4, 46],
        [side * 8, -8, 90],
        [side * -4, -10, 122],
      ];
      const widths = [30, 22, 15];
      for (let i = 0; i < 3; i++) {
        between(parts, SHAPES.limb, p.carapaceArmor, pts[i]!, pts[i + 1]!, widths[i]!, widths[i]! * 0.8);
        if (i < 2) at(parts, SHAPES.blob, p.carapaceArmor, pts[i + 1]!, [widths[i + 1]! * 0.55, widths[i + 1]! * 0.5, widths[i + 1]! * 0.55]);
      }
      const tip = pts[3]!;
      between(parts, SHAPES.spike, p.joint, tip, [tip[0] + side * -12, tip[1] - 2, tip[2] + 22], 12, 12);
      for (const [k, len] of [[0.35, 20], [0.6, 17], [0.82, 14]] as const) {
        const a = pts[1]!;
        const b = pts[3]!;
        const q: [number, number, number] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        at(parts, SHAPES.spike, p.joint, [q[0] - side * 8, q[1], q[2]], [8, len, 8], [0, 0, side * (Math.PI / 2)]);
      }
      detail(pivot, parts);
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
