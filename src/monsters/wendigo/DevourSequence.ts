import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Vec2 } from '../../util/math';
import { Lightning } from '../../systems/Lightning';
import { DemonFigures } from './DemonFigures';
import { demonLife } from './demonModel';
import { devourPhase, devourVictims } from './devour';

const U = CONFIG.wendigo.ultimate;
const T = U.t;
const C = CONFIG.wendigo.colors;

/** What Devour does to the game, supplied by GameScene. */
export type DevourHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Take `t` into the ground: it dies without the usual explosion, giving its EXP. */
  take(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Blood sky blend 0..1 (0 restores the city's own). */
  sky(k: number): void;
  /** Camera pull-back 0..1 (0 restores the player's own view). */
  camera(k: number): void;
  shake(amount: number): void;
  /** A lightning flash on the scene light, 0..1. */
  flash(k: number): void;
  /** Particles: shadow taking a victim (`take`) or a lightning strike's dust and embers (`bolt`). */
  burst(at: THREE.Vector3, kind: 'take' | 'bolt'): void;
};

type Pending = { t: number; target: Target };

const _v = new THREE.Vector3();

/** Flat ragged disc (radius ~1): a near-black body fading to a deep-red glow toward the rim. */
function circleGeometry(): THREE.BufferGeometry {
  const n = 40;
  const pos: number[] = [];
  const col: number[] = [];
  const inner = new THREE.Color(C.circle);
  const rim = new THREE.Color(C.circleGlow);
  const at = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  const ragged = (i: number) => 0.92 + 0.08 * Math.sin(i * 2.3) * Math.sin(i * 0.7 + 1);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const o0 = ragged(i);
    const o1 = ragged((i + 1) % n);
    pos.push(0, 0, 0, ...at(a1, o1 * 0.8), ...at(a0, o0 * 0.8));
    col.push(...inner.toArray(), ...inner.toArray(), ...inner.toArray());
    pos.push(...at(a0, o0 * 0.8), ...at(a1, o1 * 0.8), ...at(a1, o1));
    pos.push(...at(a0, o0 * 0.8), ...at(a1, o1), ...at(a0, o0));
    col.push(...inner.toArray(), ...inner.toArray(), ...rim.toArray(), ...inner.toArray(), ...rim.toArray(), ...rim.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Devour, the Wendigo's ultimate, on its real-time timeline (devourPhase): the world slows, the camera pulls back,
 * the sky bleeds red and lightning strikes around; a black circle opens; demonic figures rise under every enemy in
 * it, grasp them at the grasp beat (each is taken; a boss is hurt instead) and sink with their husks while the
 * buildings in the circle collapse, nearest first; then everything drains away.
 */
export class Devour {
  active = false;
  private t = 0;
  private center = new THREE.Vector3();
  private damageMult = 1;
  private time = 1;
  private nextBolt = 0;
  private spawned = false;
  private grasped = false;
  private collapsing = false;
  private figured: Target[] = [];
  private falling: Pending[] = [];
  private circle: THREE.Mesh;
  private lightning: Lightning;
  private figures: DemonFigures;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    private host: DevourHost,
    private rand: () => number = Math.random,
  ) {
    this.circle = new THREE.Mesh(
      circleGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    );
    this.circle.renderOrder = 3;
    this.circle.visible = false;
    scene.add(this.circle);
    this.lightning = new Lightning(scene, camera, { core: C.boltCore, edge: C.boltEdge, scorch: C.circle }, rand);
    this.figures = new DemonFigures(scene);
  }

  /** World time scale while it runs (1 when idle). */
  timeScale(): number {
    return this.active ? this.time : 1;
  }

  start(center: THREE.Vector3, damageMult: number): void {
    this.clear();
    this.active = true;
    this.center.set(center.x, 0, center.z);
    this.damageMult = damageMult;
    this.circle.position.set(center.x, 3, center.z);
    this.circle.scale.setScalar(U.radius);
    this.nextBolt = T.boltsFrom;
    this.host.shake(0.5);
  }

  /** Advance by real seconds (0 while paused). Returns true on the frame it ends. */
  update(realDt: number): boolean {
    if (!this.active) return false;
    this.t += realDt;
    const ph = devourPhase(this.t);
    this.time = ph.time;
    this.host.sky(ph.sky);
    this.host.camera(ph.camera);
    this.circle.visible = ph.circle > 0;
    (this.circle.material as THREE.MeshBasicMaterial).opacity = 0.92 * ph.circle;
    this.circle.rotation.y += realDt * 0.15;
    while (ph.bolts && this.t >= this.nextBolt) {
      const a = this.rand() * Math.PI * 2;
      const r = Math.sqrt(this.rand()) * U.boltSpread * U.radius;
      _v.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
      this.lightning.strike(_v);
      this.host.burst(_v, 'bolt');
      this.host.shake(0.12);
      this.nextBolt += U.boltEvery[0] + this.rand() * (U.boltEvery[1] - U.boltEvery[0]);
    }
    this.host.flash(this.lightning.update(realDt));
    const c = { x: this.center.x, z: this.center.z };
    if (!this.spawned && this.t >= T.emergeFrom) {
      this.spawned = true;
      this.figured = devourVictims(c, U.radius, this.host.enemies(), U.maxFigures).held;
      for (const t of this.figured) this.figures.spawn(t.position, t.radius, this.center);
    }
    if (this.spawned) this.figures.update(demonLife(this.t));
    if (!this.grasped && this.t >= T.grasp) {
      this.grasped = true;
      const now = devourVictims(c, U.radius, this.host.enemies(), U.maxFigures);
      const taken = new Set(this.figured.filter((t) => t.isAlive()));
      for (const t of [...now.held, ...now.extra]) {
        if (taken.has(t)) continue;
        taken.add(t);
        // No figure for this one: a burst of shadow takes it.
        this.host.burst(t.position, 'take');
      }
      for (const t of taken) this.host.take(t);
      for (const b of now.bosses) this.host.hurtBoss(b, U.bossDamage * this.damageMult);
      this.host.shake(0.6);
    }
    if (!this.collapsing && this.t >= T.dragFrom) {
      this.collapsing = true;
      const span = T.dragTo - T.dragFrom;
      for (const b of this.host.buildingsWithin(c, U.radius)) {
        const d = Math.hypot(b.position.x - c.x, b.position.z - c.z);
        this.falling.push({ t: T.dragFrom + span * Math.min(1, d / U.radius), target: b });
      }
      this.falling.sort((a, b) => a.t - b.t);
    }
    while (this.falling.length > 0 && this.t >= this.falling[0]!.t) {
      const b = this.falling.shift()!.target;
      if (b.isAlive()) b.applyDamage(1e9);
    }
    if (!ph.done) return false;
    this.finish();
    return true;
  }

  /** Stop at once, restoring the sky, camera and time (restart, exit, death). */
  cancel(): void {
    if (this.active) this.finish();
  }

  private finish(): void {
    this.host.sky(0);
    this.host.camera(0);
    this.host.flash(0);
    this.clear();
  }

  private clear(): void {
    this.active = false;
    this.t = 0;
    this.time = 1;
    this.spawned = this.grasped = this.collapsing = false;
    this.figured = [];
    this.falling = [];
    this.circle.visible = false;
    this.lightning.clear();
    this.figures.clear();
  }

  dispose(): void {
    this.circle.removeFromParent();
    this.circle.geometry.dispose();
    (this.circle.material as THREE.Material).dispose();
    this.lightning.dispose();
    this.figures.dispose();
  }
}
