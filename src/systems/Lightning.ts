import * as THREE from 'three';
import { boltPath } from './lightningMath';

/** Bolts alive at once; a new strike takes the oldest slot. */
const MAX_BOLTS = 4;
/** Main path segments, fork count and fork segments per bolt. */
const MAIN_SEGS = 8;
const FORKS = 2;
const FORK_SEGS = 3;
const SEGS_PER_BOLT = MAIN_SEGS + FORKS * FORK_SEGS;
const VERTS_PER_BOLT = SEGS_PER_BOLT * 6;
/** Bolts start this high (m) above the strike point. */
const HEIGHT = 3000;
/** Seconds a bolt shows at full strength, then fades over FADE. */
const SHOW = 0.12;
const FADE = 0.12;
/** The scene-light flash: full on the strike, gone after FLASH s. */
const FLASH = 0.08;
/** Ribbon half-widths (m): the white core and the red edge around it. */
const CORE_W = 9;
const EDGE_W = 26;
/** Sideways wander of the main path and of a fork (m). */
const JITTER = 140;
const FORK_JITTER = 70;
/** Scorch marks: how many, their radius (m) and how long they take to shrink away (s). */
const SCORCHES = 8;
const SCORCH_R = 70;
const SCORCH_LIFE = 2;

type Bolt = { age: number; on: boolean };

const _from = new THREE.Vector3();
const _right = new THREE.Vector3();
const _p: THREE.Vector3[] = [];
const _f: THREE.Vector3[] = [];
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * Lightning: jagged bolts from high in the sky to a ground point, each with up to two short forks, drawn as
 * camera-facing ribbons (a white core inside a red edge, additive) that show for SHOW s and fade; each strike
 * leaves a scorch mark and reports a flash for the scene light. Three draw calls; everything is pooled.
 */
export class Lightning {
  private bolts: Bolt[] = Array.from({ length: MAX_BOLTS }, () => ({ age: 0, on: false }));
  private next = 0;
  private core: THREE.Mesh;
  private edge: THREE.Mesh;
  private scorch: THREE.InstancedMesh;
  private scorchAge = new Float32Array(SCORCHES).fill(Infinity);
  private scorchAt: THREE.Vector3[] = Array.from({ length: SCORCHES }, () => new THREE.Vector3());
  private nextScorch = 0;
  private flashT = Infinity;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private colors: { core: number; edge: number; scorch: number },
    private rand: () => number = Math.random,
  ) {
    this.core = this.ribbon(scene, 2);
    this.edge = this.ribbon(scene, 1);
    const disc = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ color: colors.scorch, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      SCORCHES,
    );
    this.scorch.renderOrder = 2;
    this.scorch.frustumCulled = false;
    this.scorch.count = 0;
    scene.add(this.scorch);
  }

  private ribbon(scene: THREE.Scene, order: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_BOLTS * VERTS_PER_BOLT * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAX_BOLTS * VERTS_PER_BOLT * 3), 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  /** A bolt strikes the ground at `ground`. */
  strike(ground: THREE.Vector3): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_BOLTS;
    this.bolts[i] = { age: 0, on: true };
    // Ribbons face the camera across its right vector at the moment of the strike (a bolt lasts a blink).
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    if (_right.lengthSq() === 0) _right.set(1, 0, 0);
    _from.copy(ground).add(new THREE.Vector3((this.rand() - 0.5) * 600, HEIGHT, (this.rand() - 0.5) * 600));
    boltPath(_from, ground, MAIN_SEGS, JITTER, this.rand, _p);
    let seg = 0;
    for (let k = 0; k < MAIN_SEGS; k++) this.quad(i, seg++, _p[k]!, _p[k + 1]!);
    for (let f = 0; f < FORKS; f++) {
      // A fork leaves a point on the upper part of the bolt and dies off to one side.
      const start = _p[1 + Math.floor(this.rand() * (MAIN_SEGS / 2))]!;
      const end = start.clone().add(new THREE.Vector3((this.rand() - 0.5) * 900, -300 - this.rand() * 600, (this.rand() - 0.5) * 900));
      boltPath(start, end, FORK_SEGS, FORK_JITTER, this.rand, _f);
      for (let k = 0; k < FORK_SEGS; k++) this.quad(i, seg++, _f[k]!, _f[k + 1]!);
    }
    for (const m of [this.core, this.edge]) (m.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.flashT = 0;
    const s = this.nextScorch;
    this.nextScorch = (s + 1) % SCORCHES;
    this.scorchAt[s]!.set(ground.x, 4, ground.z);
    this.scorchAge[s] = 0;
  }

  /** Write segment `seg` of bolt `b` (a → b) into both ribbons, `w` wide across the camera. */
  private quad(b: number, seg: number, a: THREE.Vector3, c: THREE.Vector3): void {
    for (const [mesh, w] of [[this.core, CORE_W], [this.edge, EDGE_W]] as const) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const o = b * VERTS_PER_BOLT + seg * 6;
      const ax = _right.x * w;
      const az = _right.z * w;
      const v = [
        [a.x - ax, a.y, a.z - az], [a.x + ax, a.y, a.z + az], [c.x + ax, c.y, c.z + az],
        [a.x - ax, a.y, a.z - az], [c.x + ax, c.y, c.z + az], [c.x - ax, c.y, c.z - az],
      ];
      v.forEach((p, k) => pos.setXYZ(o + k, p[0]!, p[1]!, p[2]!));
    }
  }

  /** Advance by dt; returns this frame's flash (0..1) for the scene light. */
  update(dt: number): number {
    let any = false;
    for (const [mesh, hex] of [[this.core, this.colors.core], [this.edge, this.colors.edge]] as const) {
      const col = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      this.bolts.forEach((bolt, i) => {
        const k = bolt.on ? Math.max(0, 1 - Math.max(0, bolt.age - SHOW) / FADE) : 0;
        _c.setHex(hex).multiplyScalar(k);
        for (let v = 0; v < VERTS_PER_BOLT; v++) col.setXYZ(i * VERTS_PER_BOLT + v, _c.r, _c.g, _c.b);
      });
      col.needsUpdate = true;
    }
    for (const bolt of this.bolts) {
      if (!bolt.on) continue;
      bolt.age += dt;
      if (bolt.age > SHOW + FADE) bolt.on = false;
      else any = true;
    }
    this.core.visible = this.edge.visible = any;
    let n = 0;
    for (let s = 0; s < SCORCHES; s++) {
      const age = (this.scorchAge[s]! += dt);
      if (age >= SCORCH_LIFE) continue;
      const r = SCORCH_R * (1 - age / SCORCH_LIFE);
      this.scorch.setMatrixAt(n++, _m.makeScale(r, 1, r).setPosition(this.scorchAt[s]!));
    }
    this.scorch.count = n;
    this.scorch.instanceMatrix.needsUpdate = true;
    this.flashT += dt;
    return Math.max(0, 1 - this.flashT / FLASH);
  }

  clear(): void {
    for (const b of this.bolts) b.on = false;
    this.scorchAge.fill(Infinity);
    this.scorch.count = 0;
    this.core.visible = this.edge.visible = false;
    this.flashT = Infinity;
  }

  dispose(): void {
    for (const m of [this.core, this.edge, this.scorch]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
