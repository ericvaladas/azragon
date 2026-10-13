import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import type { Vec2 } from '../util/math';
import { mulberry32 } from '../util/rng';
import type { CityStyle, LandmarkSpec, SignDef } from '../cities/types';
import { blastTopples, chunksInRadius, DestroyedLog, generateChunk, planStreaming, type BuildingSpec, type ChunkContent } from './chunks';
import { canvasCityTextures, patchFacadeShader, SCREEN_FRAMES, SIGN_RECTS, type CityTextures } from './pixelTextures';
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
  signSlots: { sign: SignDef; pool: 'sign' | 'screen'; slot: number }[] = [];

  constructor(
    readonly chunk: string,
    readonly index: number,
    /** Instanced slot, or −1 for a landmark (which has its own mesh). */
    readonly slot: number,
    readonly spec: BuildingSpec,
    private city: City,
    readonly mesh: THREE.Mesh | null = null,
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

type LoadedChunk = { content: ChunkContent; buildings: Building[]; treeSlots: number[]; parkSlots: number[] };

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
const _p2 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _m2 = new THREE.Matrix4();

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
  private parkMesh: THREE.InstancedMesh;
  private signMesh: THREE.InstancedMesh;
  private signRect: THREE.InstancedBufferAttribute;
  private screenMesh: THREE.InstancedMesh;
  private freeSigns: number[] = [];
  private freeScreens: number[] = [];
  private signUsed: boolean[];
  private screenUsed: boolean[];
  private screenTex: THREE.Texture;
  private screenT = 0;
  private ground: THREE.Mesh;
  private crater: THREE.Mesh;
  private chunks = new Map<string, LoadedChunk>();
  private loadedKeys = new Set<string>();
  private slotOwner: (Building | null)[];
  private freeSlots: number[] = [];
  private freeTrees: number[] = [];
  private freeRubble: number[] = [];
  private treeUsed: boolean[];
  private freeParks: number[] = [];
  private parkUsed: boolean[];
  private overlays: THREE.Mesh[] = [];
  private landmarkMat: THREE.MeshToonMaterial;
  private facadeAttr: THREE.InstancedBufferAttribute;
  private roofMat: THREE.MeshToonMaterial;
  private treeMat: THREE.MeshToonMaterial;
  private landmarks = 0;
  private groundSpan = Math.ceil((CONFIG.world.unloadRadius * 2.4) / GROUND_TILE) * GROUND_TILE;
  private rubbleUsed: boolean[];
  private collapsing: Building[] = [];
  private destroyed = new DestroyedLog();
  private dirty = false;
  onCollapseStart: (pos: THREE.Vector3, size: number) => void = () => {};

  constructor(
    private scene: THREE.Scene,
    private _style: CityStyle,
    private seed: number,
    private onDestroyed: OnDestroyed,
    private textures: CityTextures = canvasCityTextures,
  ) {
    const { palette, world } = CONFIG;

    const span = this.groundSpan;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), toonMat(0xffffff, { map: this.groundTexture() }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;

    const craterMat = toonMat(0xffffff, { map: this.textures.crater() });
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
    const max = world.maxBuildings;
    const facade = toonMat(0xffffff, { map: this.textures.facades() });
    facade.onBeforeCompile = (sh) => patchFacadeShader(sh);
    facade.customProgramCacheKey = () => 'city-facade';
    this.roofMat = toonMat(this._style.colors.roof);
    this.facadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    box.setAttribute('aFacade', this.facadeAttr);
    this.buildingMesh = new THREE.InstancedMesh(box, [facade, facade, this.roofMat, this.roofMat, facade, facade], max);
    this.buildingMesh.castShadow = true;
    this.buildingMesh.receiveShadow = true;
    const rubbleGeo = faceted(new THREE.DodecahedronGeometry(0.5, 0)).translate(0, 0.25, 0);
    this.rubbleMesh = new THREE.InstancedMesh(rubbleGeo, toonMat(palette.debris), world.maxRubble);
    this.rubbleMesh.receiveShadow = true;
    const cone = faceted(new THREE.ConeGeometry(0.5, 1.6, 5)).translate(0, 0.8, 0);
    this.treeMat = toonMat(this._style.colors.tree);
    this.treeMesh = new THREE.InstancedMesh(cone, this.treeMat, world.maxTrees);
    this.treeMesh.castShadow = true;
    this.parkMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), toonMat(0xffffff), world.maxParks);
    for (let i = 0; i < world.maxParks; i++) this.parkMesh.setColorAt(i, _c.setHex(0xffffff));
    this.parkMesh.receiveShadow = true;
    this.parkMesh.position.y = 0.2;
    const signBox = new THREE.BoxGeometry(1, 1, 1);
    const signGeo = new THREE.BoxGeometry(1, 1, 1);
    this.signRect = new THREE.InstancedBufferAttribute(new Float32Array(world.maxSigns * 4), 4);
    signGeo.setAttribute('aRect', this.signRect);
    const signMat = new THREE.MeshBasicMaterial({ map: this.textures.signs() });
    signMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nvarying vec4 vRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vRect = aRect;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vRect;')
        .replace('#include <map_fragment>', 'diffuseColor *= texture2D(map, mix(vRect.xy, vRect.zw, vMapUv));');
    };
    signMat.customProgramCacheKey = () => 'city-sign';
    this.signMesh = new THREE.InstancedMesh(signGeo, signMat, world.maxSigns);
    this.screenTex = this.textures.screen();
    this.screenTex.repeat.set(1 / SCREEN_FRAMES, 1);
    this.screenMesh = new THREE.InstancedMesh(signBox, new THREE.MeshBasicMaterial({ map: this.screenTex }), world.maxScreens);
    for (let i = 0; i < world.maxSigns; i++) this.signMesh.setColorAt(i, _c.setHex(0xffffff));
    this.signUsed = new Array(world.maxSigns).fill(false);
    this.screenUsed = new Array(world.maxScreens).fill(false);
    for (const m of [this.buildingMesh, this.rubbleMesh, this.treeMesh, this.parkMesh, this.signMesh, this.screenMesh]) {
      m.frustumCulled = false;
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setMatrixAt(i, ZERO);
    }
    for (let i = 0; i < max; i++) this.buildingMesh.setColorAt(i, _c.setHex(0xffffff));
    this.slotOwner = new Array(max).fill(null);
    this.treeUsed = new Array(world.maxTrees).fill(false);
    this.rubbleUsed = new Array(world.maxRubble).fill(false);
    this.parkUsed = new Array(world.maxParks).fill(false);
    this.resetPools();
    scene.add(this.buildingMesh, this.rubbleMesh, this.treeMesh, this.parkMesh, this.signMesh, this.screenMesh);
    this.landmarkMat = toonMat(0xffffff, { vertexColors: true });

    this.buildOverlays();
    this.stream(new THREE.Vector3(), Infinity);
  }

  get style(): CityStyle {
    return this._style;
  }

  /** The style's ground tile, repeated across the ground plane. */
  private groundTexture(): THREE.Texture {
    const tex = this.textures.ground(this._style);
    const span = this.groundSpan;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(span / GROUND_TILE, span / GROUND_TILE);
    return tex;
  }

  /** Replace the ground decals (e.g. the Shibuya scramble) with the current style's. */
  private buildOverlays(): void {
    for (const o of this.overlays) {
      o.removeFromParent();
      o.geometry.dispose();
      (o.material as THREE.MeshToonMaterial).map?.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.overlays = this._style.overlays.map((ov) => {
      const mat = toonMat(0xffffff, { map: this.textures.overlay(ov.id) });
      mat.alphaTest = 0.5;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ov.size, ov.size).rotateX(-Math.PI / 2), mat);
      m.position.set(ov.x, 0.35, ov.z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    });
  }

  private landmarkSpec(l: LandmarkSpec): BuildingSpec {
    return { x: l.x, z: l.z, w: l.w, d: l.d, h: l.h, facade: 0, color: 0xffffff, signs: [] };
  }

  /** Whether (x, z) lies inside any loaded landmark's footprint. */
  landmarkAt(x: number, z: number): boolean {
    for (const c of this.chunks.values()) for (const b of c.buildings) {
      if (b.mesh && Math.abs(x - b.spec.x) <= b.spec.w / 2 && Math.abs(z - b.spec.z) <= b.spec.d / 2) return true;
    }
    return false;
  }

  /** Loaded landmark meshes. */
  landmarkCount(): number {
    return this.landmarks;
  }

  private resetPools(): void {
    this.freeSlots = [];
    for (let i = CONFIG.world.maxBuildings - 1; i >= 0; i--) this.freeSlots.push(i);
    this.freeTrees = [];
    for (let i = CONFIG.world.maxTrees - 1; i >= 0; i--) this.freeTrees.push(i);
    this.freeRubble = [];
    for (let i = CONFIG.world.maxRubble - 1; i >= 0; i--) this.freeRubble.push(i);
    this.freeParks = [];
    for (let i = CONFIG.world.maxParks - 1; i >= 0; i--) this.freeParks.push(i);
    this.freeSigns = [];
    for (let i = CONFIG.world.maxSigns - 1; i >= 0; i--) this.freeSigns.push(i);
    this.freeScreens = [];
    for (let i = CONFIG.world.maxScreens - 1; i >= 0; i--) this.freeScreens.push(i);
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
    this.parkMesh.count = high((i) => this.parkUsed[i]!, this.parkUsed.length);
    this.rubbleMesh.count = high((i) => this.rubbleUsed[i]!, this.rubbleUsed.length);
    this.signMesh.count = high((i) => this.signUsed[i]!, this.signUsed.length);
    this.screenMesh.count = high((i) => this.screenUsed[i]!, this.screenUsed.length);
  }

  /** Forget all destruction and rebuild the city around the origin, in `style` if given. */
  reset(style?: CityStyle): void {
    if (style && style !== this._style) {
      this._style = style;
      const mat = this.ground.material as THREE.MeshToonMaterial;
      mat.map?.dispose();
      mat.map = this.groundTexture();
      mat.needsUpdate = true;
      this.roofMat.color.setHex(style.colors.roof);
      this.treeMat.color.setHex(style.colors.tree);
    }
    this.buildOverlays();
    this.crater.visible = false;
    for (const key of [...this.loadedKeys]) this.unloadChunk(key);
    this.collapsing = [];
    this.destroyed.clear();
    this.resetPools();
    this.stream(new THREE.Vector3(), Infinity);
  }

  /** Sign slots in use. */
  signCount(): number {
    return this.signUsed.filter(Boolean).length;
  }

  /** Video-screen slots in use. */
  screenCount(): number {
    return this.screenUsed.filter(Boolean).length;
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
    const rng = mulberry32(b.slot >= 0 ? b.slot + 99 : b.index + 7919);
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
        // Landmarks and hand-placed lots (the opening view) ride out the crash.
        if (b.state === 'rubble' || b.mesh || b.spec.keep) continue;
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
    this.screenT += dt;
    this.screenTex.offset.x = (Math.floor(this.screenT / 0.7) % SCREEN_FRAMES) / SCREEN_FRAMES;
    if (this.dirty) {
      this.dirty = false;
      this.updateCounts();
      for (const m of [this.buildingMesh, this.rubbleMesh, this.treeMesh, this.parkMesh, this.signMesh, this.screenMesh]) m.instanceMatrix.needsUpdate = true;
      if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
      if (this.signMesh.instanceColor) this.signMesh.instanceColor.needsUpdate = true;
      this.signRect.needsUpdate = true;
      if (this.parkMesh.instanceColor) this.parkMesh.instanceColor.needsUpdate = true;
      this.facadeAttr.needsUpdate = true;
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
    const content = generateChunk(this._style, this.seed, cx, cz);
    const buildings: Building[] = [];
    const treeSlots: number[] = [];
    const parkSlots: number[] = [];
    content.buildings.forEach((spec, index) => {
      const slot = this.freeSlots.pop();
      if (slot === undefined) return;
      const b = new Building(key, index, slot, spec, this);
      this.slotOwner[slot] = b;
      this.buildingMesh.setColorAt(slot, _c.setHex(spec.color));
      this.facadeAttr.setX(slot, spec.facade);
      if (this.destroyed.has(key, index)) this.writeRubble(b);
      else {
        this.attachSigns(b);
        this.writeStanding(b, 0, 0);
      }
      buildings.push(b);
    });
    content.landmarks.forEach((l, i) => {
      const index = content.buildings.length + i;
      const mesh = new THREE.Mesh(l.build(), this.landmarkMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.landmarks++;
      const b = new Building(key, index, -1, this.landmarkSpec(l), this, mesh);
      if (this.destroyed.has(key, index)) this.writeRubble(b);
      else this.writeStanding(b, 0, 0);
      buildings.push(b);
    });
    const inner = CONFIG.world.blockSize - CONFIG.world.roadWidth;
    for (const p of content.parks) {
      const slot = this.freeParks.pop();
      if (slot === undefined) break;
      _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(inner, 1, inner));
      this.parkMesh.setMatrixAt(slot, _m);
      this.parkMesh.setColorAt(slot, _c.setHex(this._style.colors.park));
      this.parkUsed[slot] = true;
      parkSlots.push(slot);
    }
    for (const t of content.trees) {
      const slot = this.freeTrees.pop();
      if (slot === undefined) break;
      _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.setScalar(t.s));
      this.treeMesh.setMatrixAt(slot, _m);
      this.treeUsed[slot] = true;
      treeSlots.push(slot);
    }
    this.chunks.set(key, { content, buildings, treeSlots, parkSlots });
    this.loadedKeys.add(key);
    this.dirty = true;
  }

  private unloadChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const b of chunk.buildings) {
      if (b.mesh) {
        b.mesh.removeFromParent();
        b.mesh.geometry.dispose();
        this.landmarks--;
        this.releaseRubble(b);
        continue;
      }
      this.buildingMesh.setMatrixAt(b.slot, ZERO);
      this.releaseSigns(b);
      this.releaseRubble(b);
      this.slotOwner[b.slot] = null;
      this.freeSlots.push(b.slot);
    }
    for (const slot of chunk.treeSlots) {
      this.treeMesh.setMatrixAt(slot, ZERO);
      this.treeUsed[slot] = false;
      this.freeTrees.push(slot);
    }
    for (const slot of chunk.parkSlots) {
      this.parkMesh.setMatrixAt(slot, ZERO);
      this.parkUsed[slot] = false;
      this.freeParks.push(slot);
    }
    if (this.collapsing.length) this.collapsing = this.collapsing.filter((b) => b.chunk !== key);
    this.chunks.delete(key);
    this.loadedKeys.delete(key);
    this.dirty = true;
  }

  private writeRubble(b: Building): void {
    b.state = 'rubble';
    this.releaseSigns(b);
    const s = b.spec;
    if (b.mesh) b.mesh.visible = false;
    else this.buildingMesh.setMatrixAt(b.slot, ZERO);
    if (b.rubbleSlot < 0) {
      const slot = this.freeRubble.pop();
      if (slot === undefined) return; // pool full: the lot is simply left empty
      b.rubbleSlot = slot;
      this.rubbleUsed[slot] = true;
    }
    _q.setFromAxisAngle(UP, b.slot >= 0 ? b.slot : b.index);
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
    if (b.mesh) {
      b.mesh.visible = true;
      b.mesh.position.set(s.x, -sink, s.z);
      b.mesh.quaternion.copy(_q);
      return;
    }
    _m.compose(_p.set(s.x, -sink, s.z), _q, _s.set(s.w, s.h, s.d));
    this.buildingMesh.setMatrixAt(b.slot, _m);
    for (const e of b.signSlots) {
      const g = e.sign;
      // Building frame: base centre (x, -sink, z), tilted by _q; the sign's centre offset, rotated with it.
      _p2.set(g.lx, g.ly, g.lz).applyQuaternion(_q).add(_p.set(s.x, -sink, s.z));
      _m2.compose(_p2, _q, _s2.set(g.w, g.h, g.d));
      (e.pool === 'screen' ? this.screenMesh : this.signMesh).setMatrixAt(e.slot, _m2);
    }
  }

  private attachSigns(b: Building): void {
    for (const sign of b.spec.signs) {
      const screen = sign.kind === 'screen';
      const slot = (screen ? this.freeScreens : this.freeSigns).pop();
      if (slot === undefined) continue;
      (screen ? this.screenUsed : this.signUsed)[slot] = true;
      if (!screen) {
        this.signMesh.setColorAt(slot, _c.setHex(sign.color));
        const r = SIGN_RECTS[sign.cell ?? (sign.kind === 'billboard' ? 3 : 0)]!;
        this.signRect.setXYZW(slot, r[0], r[1], r[2], r[3]);
      }
      b.signSlots.push({ sign, pool: screen ? 'screen' : 'sign', slot });
    }
  }

  private releaseSigns(b: Building): void {
    for (const e of b.signSlots) {
      const mesh = e.pool === 'screen' ? this.screenMesh : this.signMesh;
      mesh.setMatrixAt(e.slot, ZERO);
      (e.pool === 'screen' ? this.screenUsed : this.signUsed)[e.slot] = false;
      (e.pool === 'screen' ? this.freeScreens : this.freeSigns).push(e.slot);
    }
    b.signSlots = [];
  }
}
