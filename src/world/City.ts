import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import type { Vec2 } from '../util/math';
import { mulberry32 } from '../util/rng';
import type { BuildingSpec, CityLayout } from './cityLayout';
import { facadeTexture, groundTexture } from './pixelTextures';
import { faceted, toonMat } from '../render/toon';

type BuildingState = 'standing' | 'collapsing' | 'rubble';

class Building implements Target {
  readonly kind = 'building' as const;
  readonly airborne = false;
  readonly position: THREE.Vector3;
  readonly radius: number;
  hp: number;
  readonly maxHp: number;
  state: BuildingState = 'standing';
  t = 0;
  tiltAxis = new THREE.Vector3();

  constructor(
    readonly index: number,
    readonly spec: BuildingSpec,
    private city: City,
  ) {
    this.position = new THREE.Vector3(spec.x, spec.h / 2, spec.z);
    this.radius = Math.max(spec.w, spec.d) / 2;
    this.maxHp = Math.round(spec.h * CONFIG.world.buildingHpPerMetre);
    this.hp = this.maxHp;
  }

  isAlive(): boolean {
    return this.state === 'standing';
  }

  applyDamage(amount: number): void {
    this.city.damage(this, amount);
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class City {
  readonly buildingMesh: THREE.InstancedMesh;
  private rubbleMesh: THREE.InstancedMesh;
  private buildings: Building[];
  private collapsing: Building[] = [];
  private destroyed = 0;
  onCollapseStart: (pos: THREE.Vector3, size: number) => void = () => {};

  constructor(
    scene: THREE.Scene,
    readonly layout: CityLayout,
    private onDestroyed: OnDestroyed,
  ) {
    const { palette, world } = CONFIG;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(world.citySize, world.citySize), toonMat(0xffffff, { map: groundTexture(layout) }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(world.groundExtent, world.groundExtent), toonMat(palette.ground));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -1;
    outer.receiveShadow = true;
    scene.add(ground, outer);

    // Unit box with base at y=0; per-face materials: sides = facade, top = roof.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const facade = toonMat(0xffffff, { map: facadeTexture() });
    const roof = toonMat(palette.roof);
    this.buildingMesh = new THREE.InstancedMesh(box, [facade, facade, roof, roof, facade, facade], layout.buildings.length);
    this.buildingMesh.castShadow = true;
    this.buildingMesh.receiveShadow = true;

    const rubbleGeo = faceted(new THREE.DodecahedronGeometry(0.5, 0)).translate(0, 0.25, 0);
    this.rubbleMesh = new THREE.InstancedMesh(rubbleGeo, toonMat(palette.debris), layout.buildings.length);
    this.rubbleMesh.receiveShadow = true;

    this.buildings = layout.buildings.map((spec, i) => new Building(i, spec, this));
    const color = new THREE.Color();
    for (const b of this.buildings) {
      this.buildingMesh.setColorAt(b.index, color.setHex(palette.buildingFacades[b.spec.style]!));
    }
    this.reset();
    scene.add(this.buildingMesh, this.rubbleMesh);
    this.addTrees(scene);
  }

  private addTrees(scene: THREE.Scene): void {
    const cone = faceted(new THREE.ConeGeometry(0.5, 1.6, 5)).translate(0, 0.8, 0);
    const trees = new THREE.InstancedMesh(cone, toonMat(CONFIG.palette.groundDark), this.layout.trees.length);
    this.layout.trees.forEach((t, i) => {
      _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.setScalar(t.s));
      trees.setMatrixAt(i, _m);
    });
    trees.castShadow = true;
    scene.add(trees);
  }

  /** Restore every building to standing; clear rubble. */
  reset(): void {
    this.collapsing = [];
    this.destroyed = 0;
    for (const b of this.buildings) {
      b.state = 'standing';
      b.hp = b.maxHp;
      b.t = 0;
      this.writeStanding(b, 0, 0);
      this.rubbleMesh.setMatrixAt(b.index, ZERO);
    }
    this.buildingMesh.instanceMatrix.needsUpdate = true;
    this.rubbleMesh.instanceMatrix.needsUpdate = true;
    if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
    this.buildingMesh.computeBoundingSphere();
  }

  targetForInstance(id: number): Target | null {
    const b = this.buildings[id];
    return b && b.isAlive() ? b : null;
  }

  forEachStandingInRadius(p: Vec2, r: number, fn: (t: Target) => void): void {
    for (const b of this.buildings) {
      if (b.state !== 'standing') continue;
      if (Math.hypot(b.spec.x - p.x, b.spec.z - p.z) <= r + b.radius) fn(b);
    }
  }

  destroyedCount(): number {
    return this.destroyed;
  }

  damage(b: Building, amount: number): void {
    if (b.state !== 'standing') return;
    b.hp -= amount;
    if (b.hp > 0) return;
    b.state = 'collapsing';
    b.t = 0;
    const rng = mulberry32(b.index + 99);
    b.tiltAxis.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    this.collapsing.push(b);
    this.destroyed++;
    this.onCollapseStart(new THREE.Vector3(b.spec.x, 0, b.spec.z), Math.max(b.spec.w, b.spec.d));
    this.onDestroyed(b, Math.max(1, Math.round(b.maxHp * CONFIG.world.buildingExpPerHp)));
  }

  /** Animate collapses: sink and tilt, then swap to rubble. */
  update(dt: number): void {
    if (this.collapsing.length === 0) return;
    const T = CONFIG.world.collapseTime;
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const b = this.collapsing[i]!;
      b.t += dt;
      const k = Math.min(1, b.t / T);
      if (k >= 1) {
        b.state = 'rubble';
        this.buildingMesh.setMatrixAt(b.index, ZERO);
        const s = b.spec;
        _q.setFromAxisAngle(UP, b.index);
        _m.compose(_p.set(s.x, 0, s.z), _q, _s.set(s.w * 1.1, s.h * 0.12 + 6, s.d * 1.1));
        this.rubbleMesh.setMatrixAt(b.index, _m);
        this.rubbleMesh.instanceMatrix.needsUpdate = true;
        this.collapsing.splice(i, 1);
      } else {
        this.writeStanding(b, k * k * b.spec.h, k * 0.3);
      }
    }
    this.buildingMesh.instanceMatrix.needsUpdate = true;
  }

  private writeStanding(b: Building, sink: number, tilt: number): void {
    const s = b.spec;
    _q.setFromAxisAngle(b.tiltAxis.lengthSq() > 0 ? b.tiltAxis : X_AXIS, tilt);
    _m.compose(_p.set(s.x, -sink, s.z), _q, _s.set(s.w, s.h, s.d));
    this.buildingMesh.setMatrixAt(b.index, _m);
  }
}
