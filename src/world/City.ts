import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import type { Vec2 } from '../util/math';
import { mulberry32 } from '../util/rng';
import { blastTopples, chunksInRadius, DestroyedLog, generateChunk, planStreaming, type BuildingSpec, type ChunkContent } from './chunks';
import { blockGroundTexture, craterTexture, facadeTexture } from './pixelTextures';
import { faceted, toonMat } from '../render/toon';

type BuildingState = 'standing' | 'collapsing' | 'rubble';

class Building implements Target {
  readonly kind = 'building' as const;
  readonly airborne = false;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly maxHp: number;
  readonly box: THREE.Box3;
  hp: number;
  state: BuildingState = 'standing';
  rubbleSlot = -1;
  /** Collapse time; negative while waiting for the impact's shock front to arrive. */
  t = 0;
  /** Collapse dust is due when the delayed collapse actually starts. */
  dustPending = false;
  tiltAxis = new THREE.Vector3();

  constructor(
    readonly chunk: string,
    readonly index: number,
    readonly slot: number,
    readonly spec: BuildingSpec,
    private city: City,
  ) {
    this.position = new THREE.Vector3(spec.x, spec.h / 2, spec.z);
    this.radius = Math.max(spec.w, spec.d) / 2;
    this.maxHp = Math.round(spec.h * CONFIG.world.buildingHpPerMetre);
    this.hp = this.maxHp;
    this.box = new THREE.Box3(
      new THREE.Vector3(spec.x - spec.w / 2, 0, spec.z - spec.d / 2),
      new THREE.Vector3(spec.x + spec.w / 2, spec.h, spec.z + spec.d / 2),
    );
  }

  isAlive(): boolean {
    return this.state === 'standing';
  }

  applyDamage(amount: number): void {
    this.city.damage(this, amount);
  }
}

type LoadedChunk = { content: ChunkContent; buildings: Building[]; treeSlots: number[] };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
/** Ground texture covers 2x2 blocks; the ground plane snaps to this so the pattern stays world-aligned. */
const GROUND_TILE = CONFIG.world.blockSize * 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _c = new THREE.Color();

/** Radius of the pod's crater (and its ground decal) around the origin. */
export const CRATER_RADIUS = CONFIG.world.clearRadius + CONFIG.world.blockSize * 0.5;

/**
 * Endless city streamed in chunks around a centre point (the monster). Buildings of all loaded
 * chunks share fixed-size instanced pools whose slots are recycled, so draw calls stay constant.
 * Destroyed buildings are remembered per chunk and come back as rubble.
 */
export class City {
  readonly buildingMesh: THREE.InstancedMesh;
  private rubbleMesh: THREE.InstancedMesh;
  private treeMesh: THREE.InstancedMesh;
  private ground: THREE.Mesh;
  private crater: THREE.Mesh;
  private chunks = new Map<string, LoadedChunk>();
  private loadedKeys = new Set<string>();
  private slotOwner: (Building | null)[];
  private freeSlots: number[] = [];
  private freeTrees: number[] = [];
  private freeRubble: number[] = [];
  private treeUsed: boolean[];
  private rubbleUsed: boolean[];
  private collapsing: Building[] = [];
  private destroyed = new DestroyedLog();
  private dirty = false;
  onCollapseStart: (pos: THREE.Vector3, size: number) => void = () => {};

  constructor(
    scene: THREE.Scene,
    private seed: number,
    private onDestroyed: OnDestroyed,
  ) {
    const { palette, world } = CONFIG;

    const tex = blockGroundTexture();
    const span = Math.ceil((world.unloadRadius * 2.4) / GROUND_TILE) * GROUND_TILE;
    tex.repeat.set(span / GROUND_TILE, span / GROUND_TILE);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), toonMat(0xffffff, { map: tex }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;

    const craterMat = toonMat(0xffffff, { map: craterTexture() });
    craterMat.alphaTest = 0.5;
    craterMat.polygonOffset = true;
    craterMat.polygonOffsetFactor = -2;
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(CRATER_RADIUS, 32).rotateX(-Math.PI / 2), craterMat);
    this.crater.position.y = 0.5;
    this.crater.receiveShadow = true;
    // Hidden until the pod lands.
    this.crater.visible = false;
    scene.add(this.ground, this.crater);

    // Unit box with base at y=0; per-face materials: sides = facade, top = roof.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const facade = toonMat(0xffffff, { map: facadeTexture() });
    const roof = toonMat(palette.roof);
    const max = world.maxBuildings;
    this.buildingMesh = new THREE.InstancedMesh(box, [facade, facade, roof, roof, facade, facade], max);
    this.buildingMesh.castShadow = true;
    this.buildingMesh.receiveShadow = true;
    const rubbleGeo = faceted(new THREE.DodecahedronGeometry(0.5, 0)).translate(0, 0.25, 0);
    this.rubbleMesh = new THREE.InstancedMesh(rubbleGeo, toonMat(palette.debris), world.maxRubble);
    this.rubbleMesh.receiveShadow = true;
    const cone = faceted(new THREE.ConeGeometry(0.5, 1.6, 5)).translate(0, 0.8, 0);
    this.treeMesh = new THREE.InstancedMesh(cone, toonMat(palette.groundDark), world.maxTrees);
    this.treeMesh.castShadow = true;
    for (const m of [this.buildingMesh, this.rubbleMesh, this.treeMesh]) {
      m.frustumCulled = false;
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setMatrixAt(i, ZERO);
    }
    for (let i = 0; i < max; i++) this.buildingMesh.setColorAt(i, _c.setHex(0xffffff));
    this.slotOwner = new Array(max).fill(null);
    this.treeUsed = new Array(world.maxTrees).fill(false);
    this.rubbleUsed = new Array(world.maxRubble).fill(false);
    this.resetPools();
    scene.add(this.buildingMesh, this.rubbleMesh, this.treeMesh);

    this.stream(new THREE.Vector3(), Infinity);
  }

  private resetPools(): void {
    this.freeSlots = [];
    for (let i = CONFIG.world.maxBuildings - 1; i >= 0; i--) this.freeSlots.push(i);
    this.freeTrees = [];
    for (let i = CONFIG.world.maxTrees - 1; i >= 0; i--) this.freeTrees.push(i);
    this.freeRubble = [];
    for (let i = CONFIG.world.maxRubble - 1; i >= 0; i--) this.freeRubble.push(i);
  }

  /** Draw only up to the highest slot in use: empty slots still cost vertex work even at zero scale. */
  private updateCounts(): void {
    const high = (used: (i: number) => boolean, n: number) => {
      let i = n - 1;
      while (i >= 0 && !used(i)) i--;
      return i + 1;
    };
    this.buildingMesh.count = high((i) => this.slotOwner[i] !== null, this.slotOwner.length);
    this.treeMesh.count = high((i) => this.treeUsed[i]!, this.treeUsed.length);
    this.rubbleMesh.count = high((i) => this.rubbleUsed[i]!, this.rubbleUsed.length);
  }

  /** Forget all destruction and rebuild the city around the origin. */
  reset(): void {
    this.crater.visible = false;
    for (const key of [...this.loadedKeys]) this.unloadChunk(key);
    this.collapsing = [];
    this.destroyed.clear();
    this.resetPools();
    this.stream(new THREE.Vector3(), Infinity);
  }

  destroyedCount(): number {
    return this.destroyed.count;
  }

  targetForInstance(slot: number): Target | null {
    const b = this.slotOwner[slot];
    return b && b.isAlive() ? b : null;
  }

  /** Nearest standing building hit by the ray, tested against each building's box. */
  pickBuilding(ray: THREE.Ray): Target | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const chunk of this.chunks.values()) {
      for (const b of chunk.buildings) {
        if (b.state !== 'standing' || !ray.intersectBox(b.box, _hit)) continue;
        const d = _hit.distanceToSquared(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
    }
    return best;
  }

  forEachStandingInRadius(p: Vec2, r: number, fn: (t: Target) => void): void {
    for (const ref of chunksInRadius(p.x, p.z, r + CONFIG.world.blockSize)) {
      const chunk = this.chunks.get(ref.key);
      if (!chunk) continue;
      for (const b of chunk.buildings) {
        if (b.state !== 'standing') continue;
        if (Math.hypot(b.spec.x - p.x, b.spec.z - p.z) <= r + b.radius) fn(b);
      }
    }
  }

  damage(b: Building, amount: number): void {
    if (b.state !== 'standing') return;
    b.hp -= amount;
    if (b.hp > 0) return;
    this.collapse(b, true);
  }

  /** Start a building's collapse. `award` false (the crater blast) gives no EXP and doesn't count in the stats. */
  private collapse(b: Building, award: boolean, delay = 0): void {
    b.state = 'collapsing';
    b.t = -delay;
    b.dustPending = delay > 0;
    const rng = mulberry32(b.slot + 99);
    b.tiltAxis.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    this.collapsing.push(b);
    this.destroyed.mark(b.chunk, b.index, award);
    if (!b.dustPending) this.collapseDust(b);
    if (award) this.onDestroyed(b, Math.max(1, Math.round(b.maxHp * CONFIG.world.buildingExpPerHp)));
  }

  private collapseDust(b: Building): void {
    this.onCollapseStart(new THREE.Vector3(b.spec.x, 0, b.spec.z), Math.max(b.spec.w, b.spec.d));
  }

  /**
   * The pod's impact, with no EXP and no stat: flatten every building touching the crater radius `r`, topple a
   * thinning share of those out to `outer` (see blastTopples), and show the crater decal. Collapses start as the
   * shock front reaches them, travelling at `speed` m/s. `instant` (a skipped intro) writes rubble now,
   * finishing any collapse already under way.
   */
  blast(p: Vec2, r: number, instant: boolean, outer = r, speed = Infinity): void {
    for (const ref of chunksInRadius(p.x, p.z, outer + CONFIG.world.blockSize)) {
      const chunk = this.chunks.get(ref.key);
      if (!chunk) continue;
      for (const b of chunk.buildings) {
        if (b.state === 'rubble') continue;
        const d = Math.hypot(b.spec.x - p.x, b.spec.z - p.z) - b.radius;
        if (!blastTopples(b.spec.x, b.spec.z, d, r, outer)) continue;
        if (!instant) {
          if (b.state === 'standing') this.collapse(b, false, Math.max(0, d) / speed);
          continue;
        }
        if (b.state === 'collapsing') this.collapsing.splice(this.collapsing.indexOf(b), 1);
        this.destroyed.mark(b.chunk, b.index, false);
        this.writeRubble(b);
      }
    }
    this.crater.visible = true;
    this.dirty = true;
  }

  /** Animate collapses and stream chunks around `center`. */
  update(dt: number, center: THREE.Vector3): void {
    this.stream(center, CONFIG.world.chunksPerFrame);
    const T = CONFIG.world.collapseTime;
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const b = this.collapsing[i]!;
      b.t += dt;
      if (b.t < 0) continue;
      if (b.dustPending) {
        b.dustPending = false;
        this.collapseDust(b);
      }
      const k = Math.min(1, b.t / T);
      if (k >= 1) {
        this.collapsing.splice(i, 1);
        this.writeRubble(b);
      } else {
        this.writeStanding(b, k * k * b.spec.h, k * 0.3);
      }
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.updateCounts();
      for (const m of [this.buildingMesh, this.rubbleMesh, this.treeMesh]) m.instanceMatrix.needsUpdate = true;
      if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
    }
  }

  private stream(center: THREE.Vector3, maxLoads: number): void {
    const s = GROUND_TILE;
    this.ground.position.set(Math.round(center.x / s) * s, 0, Math.round(center.z / s) * s);
    const plan = planStreaming(this.loadedKeys, center.x, center.z);
    for (const key of plan.unload) this.unloadChunk(key);
    let n = 0;
    for (const ref of plan.load) {
      if (n++ >= maxLoads) break;
      this.loadChunk(ref.key, ref.cx, ref.cz);
    }
  }

  private loadChunk(key: string, cx: number, cz: number): void {
    const content = generateChunk(this.seed, cx, cz);
    const buildings: Building[] = [];
    const treeSlots: number[] = [];
    content.buildings.forEach((spec, index) => {
      const slot = this.freeSlots.pop();
      if (slot === undefined) return;
      const b = new Building(key, index, slot, spec, this);
      this.slotOwner[slot] = b;
      this.buildingMesh.setColorAt(slot, _c.setHex(CONFIG.palette.buildingFacades[spec.style]!));
      if (this.destroyed.has(key, index)) this.writeRubble(b);
      else this.writeStanding(b, 0, 0);
      buildings.push(b);
    });
    for (const t of content.trees) {
      const slot = this.freeTrees.pop();
      if (slot === undefined) break;
      _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.setScalar(t.s));
      this.treeMesh.setMatrixAt(slot, _m);
      this.treeUsed[slot] = true;
      treeSlots.push(slot);
    }
    this.chunks.set(key, { content, buildings, treeSlots });
    this.loadedKeys.add(key);
    this.dirty = true;
  }

  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const b of chunk.buildings) {
      this.buildingMesh.setMatrixAt(b.slot, ZERO);
      this.releaseRubble(b);
      this.slotOwner[b.slot] = null;
      this.freeSlots.push(b.slot);
    }
    for (const slot of chunk.treeSlots) {
      this.treeMesh.setMatrixAt(slot, ZERO);
      this.treeUsed[slot] = false;
      this.freeTrees.push(slot);
    }
    if (this.collapsing.length) this.collapsing = this.collapsing.filter((b) => b.chunk !== key);
    this.chunks.delete(key);
    this.loadedKeys.delete(key);
    this.dirty = true;
  }

  private writeRubble(b: Building): void {
    b.state = 'rubble';
    const s = b.spec;
    this.buildingMesh.setMatrixAt(b.slot, ZERO);
    if (b.rubbleSlot < 0) {
      const slot = this.freeRubble.pop();
      if (slot === undefined) return; // pool full: the lot is simply left empty
      b.rubbleSlot = slot;
      this.rubbleUsed[slot] = true;
    }
    _q.setFromAxisAngle(UP, b.slot);
    _m.compose(_p.set(s.x, 0, s.z), _q, _s.set(s.w * 1.1, s.h * 0.12 + 6, s.d * 1.1));
    this.rubbleMesh.setMatrixAt(b.rubbleSlot, _m);
  }

  private releaseRubble(b: Building): void {
    if (b.rubbleSlot < 0) return;
    this.rubbleMesh.setMatrixAt(b.rubbleSlot, ZERO);
    this.rubbleUsed[b.rubbleSlot] = false;
    this.freeRubble.push(b.rubbleSlot);
    b.rubbleSlot = -1;
  }

  private writeStanding(b: Building, sink: number, tilt: number): void {
    const s = b.spec;
    _q.setFromAxisAngle(b.tiltAxis.lengthSq() > 0 ? b.tiltAxis : X_AXIS, tilt);
    _m.compose(_p.set(s.x, -sink, s.z), _q, _s.set(s.w, s.h, s.d));
    this.buildingMesh.setMatrixAt(b.slot, _m);
  }
}
