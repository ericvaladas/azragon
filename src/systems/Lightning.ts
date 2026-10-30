import * as THREE from 'three';
import { LEADER, boltLife, boltPath, segmentBrightness, strikeFlash, strokeHeat, strokeTimes } from './lightningMath';

/** Bolts alive at once; a new strike takes the oldest slot. */
const MAX_BOLTS = 4;
/** Main channel segments, branch count and segments per branch. */
const MAIN_SEGS = 14;
const BRANCHES = 5;
const BRANCH_SEGS = 5;
const SEGS_PER_BOLT = MAIN_SEGS + BRANCHES * BRANCH_SEGS;
const VERTS_PER_BOLT = SEGS_PER_BOLT * 6;
/** Bolts start this high (m) above the strike point. */
const HEIGHT = 3000;
/** Ribbon half-widths (m): the white core and the red edge around it; branches are this much thinner. */
const CORE_W = 5;
const EDGE_W = 12;
const BRANCH_W = 0.5;
/** Sideways wander of the main channel and of a branch (m). */
const JITTER = 160;
const BRANCH_JITTER = 90;
/** Scorch marks: how many, their radius (m) and how long they take to shrink away (s). */
const SCORCHES = 8;
const SCORCH_R = 70;
const SCORCH_LIFE = 2;

/** A bolt in flight: its age, whether its first stroke has landed, where it strikes, and its stroke times (strokeTimes). */
type Bolt = { age: number; on: boolean; struck: boolean; ground: THREE.Vector3; strokes: number[] };

const _from = new THREE.Vector3();
const _right = new THREE.Vector3();
const _end = new THREE.Vector3();
const _p: THREE.Vector3[] = [];
const _f: THREE.Vector3[] = [];
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _hot = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/**
 * Lightning as slow-motion footage shows it: faint branch crawlers creep down from the sky in jerks; when the leader
 * touches the ground the main channel appears at once, white-hot (lighting the scene and scorching the ground), while
 * the branches die, then fades; once or twice more it re-strikes down the same channel, blazing back to full
 * (strokeTimes, segmentBrightness). Drawn as camera-facing ribbons, a white core inside an edge of the given colour
 * (the colours are the caller's, so each ultimate can have its own), additive. Three draw calls; everything is pooled.
 */
export class Lightning {
  private bolts: Bolt[] = Array.from({ length: MAX_BOLTS }, () => ({ age: 0, on: false, struck: false, ground: new THREE.Vector3(), strokes: [] as number[] }));
  private next = 0;
  private core: THREE.Mesh;
  private edge: THREE.Mesh;
  /** Per segment of every bolt: its descent fraction (0 at the sky, 1 at the ground) and whether it is the main channel. */
  private depth = new Float32Array(MAX_BOLTS * SEGS_PER_BOLT);
  private main = new Uint8Array(MAX_BOLTS * SEGS_PER_BOLT);
  private scorch: THREE.InstancedMesh;
  private scorchAge = new Float32Array(SCORCHES).fill(Infinity);
  private scorchAt: THREE.Vector3[] = Array.from({ length: SCORCHES }, () => new THREE.Vector3());
  private nextScorch = 0;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private colors: { core: number; edge: number; scorch: number },
    private rand: () => number = Math.random,
    /** Called as each return stroke hits the ground. */
    private onStroke: (ground: THREE.Vector3) => void = () => {},
  ) {
    // Drawn after the ground overlays (Devour's circle, pools), which would otherwise paint over the bolts.
    this.core = this.ribbon(scene, 6);
    this.edge = this.ribbon(scene, 5);
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

  /** A strike begins over `ground`: its leader starts down now, its first stroke lands LEADER s later, and it re-strikes once or twice. */
  strike(ground: THREE.Vector3): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_BOLTS;
    const bolt = this.bolts[i]!;
    bolt.age = 0;
    bolt.on = true;
    bolt.struck = false;
    strokeTimes(this.rand, bolt.strokes);
    bolt.ground.copy(ground);
    // Ribbons face the camera across its right vector at the moment of the strike (a strike lasts well under a second).
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    if (_right.lengthSq() === 0) _right.set(1, 0, 0);
    _from.set(ground.x + (this.rand() - 0.5) * 600, ground.y + HEIGHT, ground.z + (this.rand() - 0.5) * 600);
    boltPath(_from, ground, MAIN_SEGS, JITTER, this.rand, _p);
    let seg = 0;
    for (let k = 0; k < MAIN_SEGS; k++) this.quad(i, seg++, _p[k]!, _p[k + 1]!, true, 1);
    for (let b = 0; b < BRANCHES; b++) {
      // A branch leaves the channel somewhere on its upper two thirds and dies off downward and to one side.
      const start = _p[1 + Math.floor(this.rand() * ((MAIN_SEGS * 2) / 3))]!;
      const len = 500 + this.rand() * 700;
      _end.set(start.x + (this.rand() - 0.5) * len * 1.4, start.y - len * (0.6 + this.rand() * 0.4), start.z + (this.rand() - 0.5) * len * 1.4);
      _end.y = Math.max(ground.y + 50, _end.y);
      boltPath(start, _end, BRANCH_SEGS, BRANCH_JITTER, this.rand, _f);
      for (let k = 0; k < BRANCH_SEGS; k++) this.quad(i, seg++, _f[k]!, _f[k + 1]!, false, BRANCH_W);
    }
    for (const m of [this.core, this.edge]) (m.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Write segment `seg` of bolt `b` (a → c) into both ribbons, `w` × their widths across the camera, and record its depth. */
  private quad(b: number, seg: number, a: THREE.Vector3, c: THREE.Vector3, main: boolean, w: number): void {
    const slot = b * SEGS_PER_BOLT + seg;
    const ground = this.bolts[b]!.ground.y;
    this.depth[slot] = 1 - (a.y - ground) / HEIGHT;
    this.main[slot] = main ? 1 : 0;
    for (const [mesh, width] of [[this.core, CORE_W * w], [this.edge, EDGE_W * w]] as const) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const o = slot * 6;
      const ax = _right.x * width;
      const az = _right.z * width;
      pos.setXYZ(o, a.x - ax, a.y, a.z - az);
      pos.setXYZ(o + 1, a.x + ax, a.y, a.z + az);
      pos.setXYZ(o + 2, c.x + ax, c.y, c.z + az);
      pos.setXYZ(o + 3, a.x - ax, a.y, a.z - az);
      pos.setXYZ(o + 4, c.x + ax, c.y, c.z + az);
      pos.setXYZ(o + 5, c.x - ax, c.y, c.z - az);
    }
  }

  /** Advance by dt; returns this frame's flash (0..1) for the scene light. */
  update(dt: number): number {
    let any = false;
    let flash = 0;
    for (const bolt of this.bolts) {
      if (!bolt.on) continue;
      bolt.age += dt;
      if (!bolt.struck && bolt.age >= LEADER) {
        // The return stroke: the ground takes the hit.
        bolt.struck = true;
        const s = this.nextScorch;
        this.nextScorch = (s + 1) % SCORCHES;
        this.scorchAt[s]!.set(bolt.ground.x, 4, bolt.ground.z);
        this.scorchAge[s] = 0;
        this.onStroke(bolt.ground);
      }
      if (bolt.age >= boltLife(bolt.strokes)) bolt.on = false;
      else any = true;
      flash = Math.max(flash, strikeFlash(bolt.age, bolt.strokes));
    }
    for (const [mesh, hex] of [[this.core, this.colors.core], [this.edge, this.colors.edge]] as const) {
      const col = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let b = 0; b < MAX_BOLTS; b++) {
        const bolt = this.bolts[b]!;
        // The main channel burns white-hot through the stroke, edge and all, cooling back to its colour as it fades.
        _hot.setHex(hex).lerp(WHITE, bolt.on ? strokeHeat(bolt.age, bolt.strokes) : 0);
        for (let s = 0; s < SEGS_PER_BOLT; s++) {
          const slot = b * SEGS_PER_BOLT + s;
          const main = this.main[slot] === 1;
          const k = bolt.on ? segmentBrightness(bolt.age, this.depth[slot]!, main, bolt.strokes) : 0;
          if (main) _c.copy(_hot);
          else _c.setHex(hex);
          _c.multiplyScalar(k);
          for (let v = 0; v < 6; v++) col.setXYZ(slot * 6 + v, _c.r, _c.g, _c.b);
        }
      }
      col.needsUpdate = true;
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
    return flash;
  }

  clear(): void {
    for (const b of this.bolts) b.on = false;
    this.scorchAge.fill(Infinity);
    this.scorch.count = 0;
    this.core.visible = this.edge.visible = false;
  }

  dispose(): void {
    for (const m of [this.core, this.edge, this.scorch]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
