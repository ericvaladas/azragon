import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { placeSegment } from './ik';

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
    add(this.body, box, shell, [0, 290, 150], [110, 90, 100]);
    add(this.body, box, eye, [36, 315, 202], [26, 18, 8]);
    add(this.body, box, eye, [-36, 315, 202], [26, 18, 8]);

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
   * `swing` in [-1, 1] lashes the tail sideways (+ toward the monster's left) and up for Tail Swat.
   */
  updateTail(time: number, swing = 0): void {
    const lash = Math.abs(swing);
    for (let i = 1; i < this.tailPts.length; i++) {
      const base = TAIL_BASE[i]!;
      const k = i / (this.tailPts.length - 1);
      this.tailPts[i]!.set(
        base.x + Math.sin(time * 1.3) * 25 * k + swing * 260 * k,
        base.y + Math.sin(time * 2.1 + i) * 10 * k + lash * 90 * k,
        base.z + lash * 140 * k,
      );
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
