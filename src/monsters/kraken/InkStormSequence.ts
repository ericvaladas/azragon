import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Vec2 } from '../../util/math';
import { faceted, toonMat } from '../../render/toon';
import { Lightning } from '../../systems/Lightning';
import { Rain } from '../../systems/Rain';
import { ballistic } from '../../systems/projectileMath';
import type { Ultimate } from '../../systems/ultimate';
import { InkFx } from './InkFx';
import { JET } from './inkMath';
import { chunkTargets, inkPhase, inkVictims } from './inkStorm';

const U = CONFIG.kraken.ultimate;
const T = U.t;
const C = CONFIG.kraken.colors;
const BOSS_DAMAGE = CONFIG.wendigo.ultimate.bossDamage;
/** When the chunks come up out of the ground: halfway through the grab. */
const TORN_AT = (T.grabFrom + T.grabTo) / 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** When the slowest ink jet has landed (its flight played at inkSpeed): the ink starts taking what is under it. */
const INK_LANDS = T.inkFrom + JET.maxTime / U.inkSpeed;

/** What Ink Storm does to the game, supplied by GameScene. */
export type InkStormHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Taken under the ink: it dies without the usual explosion, giving its EXP. */
  take(t: Target): void;
  /** Hit by a chunk: it dies with the usual explosion. */
  smash(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Storm sky blend 0..1 (0 restores the city's own). */
  sky(k: number): void;
  /** Camera pull-back 0..1 (0 restores the player's own view). */
  camera(k: number): void;
  shake(amount: number): void;
  /** A lightning flash on the scene light, 0..1. */
  flash(k: number): void;
  /** Hold the Kraken this high (m) above where it stands; null sets it down on the ground and frees it. */
  height(y: number | null, brace?: number): void;
  /** The tentacle tips, world space (null when the body has no arms). */
  tips(): readonly THREE.Vector3[] | null;
  /** The arms reach out along the ground and dig in at these points, one each (the brace pose takes them there). */
  grab(points: THREE.Vector3[]): void;
  /** Swing arm `arm` to throw at `at`: drawing back for `windup` real seconds (whipping out at its end), then following through for `follow`. */
  swing(arm: number, at: THREE.Vector3, windup: number, follow: number): void;
  /** The siphon's world point, squirting down. */
  siphon(out: THREE.Vector3): THREE.Vector3;
  /** Dust and rubble bursting up at a ground point. */
  dust(at: THREE.Vector3): void;
};

/** A chunk: still in the ground (`off`), held at its arm's tip, flying (`t` s in) toward its aircraft or a point in the ink, or gone. */
type Chunk = { state: 'off' | 'held' | 'flying' | 'gone'; from: THREE.Vector3; to: THREE.Vector3; target: Target | null; t: number };
type Pending = { t: number; target: Target };

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _axis = new THREE.Vector3(0.4, 1, 0.2).normalize();

/**
 * Ink Storm, the Kraken's ultimate, on its real-time timeline (inkPhase): the world slows, the camera pulls back, the
 * sky turns to storm, lightning strikes and rain falls; all eight arms reach out along the ground and dig in, tearing
 * up a chunk each; braced on them, the Kraken pushes off straight up, squirts ink jets down across the circle that
 * billow into a cloud, taking every ground unit and building under it (nearest first); the arms swing their chunks
 * overhead at the nearest aircraft (or down into the ink); it falls back where it jumped and everything clears. It
 * owns its rain, its lightning, its ink and its chunks.
 */
export class InkStorm implements Ultimate {
  active = false;
  private t = 0;
  private time = 1;
  private center = new THREE.Vector3();
  private damageMult = 1;
  private grabbed = false;
  private torn = false;
  private inked = false;
  private swept = false;
  private aimed = false;
  private landed = false;
  private jets = 0;
  private thrown = 0;
  private swung = 0;
  private bolted = 0;
  private lightning: Lightning;
  private falling: Pending[] = [];
  private chunks: Chunk[] = Array.from({ length: U.chunks }, () => ({ state: 'off' as const, from: new THREE.Vector3(), to: new THREE.Vector3(), target: null, t: 0 }));
  private grabPoints = Array.from({ length: U.chunks }, () => new THREE.Vector3());
  private chunkMesh: THREE.InstancedMesh;
  private rain: Rain;
  private ink: InkFx;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private host: InkStormHost,
    private rand: () => number = Math.random,
  ) {
    this.chunkMesh = new THREE.InstancedMesh(faceted(new THREE.DodecahedronGeometry(0.5, 0)), toonMat(C.chunk), U.chunks);
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.count = 0;
    this.chunkMesh.visible = false;
    scene.add(this.chunkMesh);
    this.rain = new Rain(scene, C.rain);
    this.ink = new InkFx(scene, { blobs: U.inkJets, puffs: InkFx.puffsFor(U.inkJets) });
    // Dust and a jolt land with each return stroke.
    this.lightning = new Lightning(scene, camera, { core: C.boltCore, edge: C.boltEdge, scorch: C.boltScorch }, rand, (at) => {
      this.host.dust(at);
      this.host.shake(0.04);
    });
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
    this.host.shake(0.3);
  }

  /** Advance by real seconds (0 while paused). Returns true on the frame it ends. */
  update(realDt: number): boolean {
    if (!this.active) {
      // The last of the ink thins away after control returns.
      this.ink.update(realDt * U.inkSpeed);
      return false;
    }
    this.t += realDt;
    const ph = inkPhase(this.t);
    this.time = ph.time;
    this.host.sky(ph.sky);
    this.host.camera(ph.camera);
    this.rain.update(realDt * ph.time, this.camera, ph.rain);
    this.host.height(ph.height, ph.brace);
    this.ink.update(realDt * U.inkSpeed);
    const c = { x: this.center.x, z: this.center.z };

    // Lightning as the sky darkens.
    while (this.bolted < U.bolts.length && this.t >= U.bolts[this.bolted]!) {
      this.bolted++;
      const a = this.rand() * Math.PI * 2;
      const r = (0.3 + 0.7 * Math.sqrt(this.rand())) * U.boltSpread * U.radius;
      this.lightning.strike(_v.set(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r));
    }
    this.host.flash(this.lightning.update(realDt));

    if (!this.grabbed && this.t >= T.grabFrom) {
      this.grabbed = true;
      for (let i = 0; i < U.chunks; i++) {
        const a = (i / U.chunks) * Math.PI * 2;
        this.grabPoints[i]!.set(c.x + Math.sin(a) * U.grabReach, 0, c.z + Math.cos(a) * U.grabReach);
      }
      this.host.grab(this.grabPoints);
    }
    if (!this.torn && this.t >= TORN_AT) {
      // Each arm tears its chunk out of the ground.
      this.torn = true;
      for (let i = 0; i < U.chunks; i++) {
        this.chunks[i]!.state = 'held';
        this.host.dust(this.grabPoints[i]!);
      }
      this.host.shake(0.25);
    }

    if (!this.inked && this.t >= T.inkFrom) {
      // The cloud reaches each ground unit, boss and building under it in turn, nearest the centre first.
      this.inked = true;
      const span = T.inkTo - INK_LANDS;
      const when = (t: Target) => INK_LANDS + span * Math.min(1, Math.hypot(t.position.x - c.x, t.position.z - c.z) / U.radius);
      const v = inkVictims(c, U.radius, this.host.enemies());
      for (const t of [...v.ground, ...v.bosses, ...this.host.buildingsWithin(c, U.radius)]) this.falling.push({ t: when(t), target: t });
      this.falling.sort((a, b) => a.t - b.t);
    }
    while (this.inked && this.jets < U.inkJets && this.t >= T.inkFrom + (U.inkSquirt * this.jets) / U.inkJets) {
      // Jets spread over the circle on a sunflower spiral, each bursting into a big cloud where it lands.
      const j = this.jets++;
      const r = U.radius * 0.85 * Math.sqrt((j + 0.5) / U.inkJets);
      const a = j * GOLDEN;
      _v.set(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r);
      this.ink.jet(this.host.siphon(_p), _v, U.inkScale);
    }
    while (this.falling.length > 0 && this.t >= this.falling[0]!.t) {
      const t = this.falling.shift()!.target;
      if (!t.isAlive()) continue;
      if (t.kind === 'building') t.applyDamage(1e9);
      else if (t.boss) this.host.hurtBoss(t, BOSS_DAMAGE * this.damageMult);
      else this.host.take(t);
    }
    if (!this.swept && this.t >= T.inkTo) {
      // Anyone who walked in under the ink since it fell goes too.
      this.swept = true;
      for (const t of inkVictims(c, U.radius, this.host.enemies()).ground) this.host.take(t);
    }

    // Aimed as the first arm starts its swing.
    if (!this.aimed && this.t >= T.throwFrom - U.swingWindup) {
      this.aimed = true;
      const air = chunkTargets(c, U.radius, this.host.enemies(), U.chunks);
      for (let i = 0; i < U.chunks; i++) {
        const k = this.chunks[i]!;
        k.target = air[i] ?? null;
        if (!k.target) {
          // No aircraft for it: down into the ink.
          const a = (i / U.chunks + this.rand()) * Math.PI * 2;
          const r = Math.sqrt(this.rand()) * U.radius * 0.8;
          k.to.set(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r);
        }
      }
    }
    // Each arm starts its swing so the whip lands as its chunk leaves.
    while (this.aimed && this.swung < U.chunks && this.t >= this.releaseAt(this.swung) - U.swingWindup) {
      const k = this.chunks[this.swung]!;
      this.host.swing(this.swung++, k.target ? k.target.position : k.to, U.swingWindup, U.swingFollow);
    }
    const tips = this.host.tips();
    while (this.aimed && this.thrown < U.chunks && this.t >= this.releaseAt(this.thrown)) {
      const k = this.chunks[this.thrown++]!;
      this.heldAt(this.thrown - 1, tips, k.from);
      k.state = 'flying';
      k.t = 0;
    }
    for (const k of this.chunks) {
      if (k.state !== 'flying') continue;
      k.t += realDt;
      // It follows its aircraft while it lives; if another weapon gets it first, it carries on to where it was.
      if (k.target?.isAlive()) k.to.copy(k.target.position);
      if (k.t < U.chunkFlight) continue;
      k.state = 'gone';
      const hit = k.target;
      if (hit?.isAlive()) {
        if (hit.boss) this.host.hurtBoss(hit, BOSS_DAMAGE * this.damageMult);
        else this.host.smash(hit);
      } else if (!hit) this.host.dust(k.to);
    }
    this.drawChunks(tips);

    if (!this.landed && this.t >= T.fallTo) {
      this.landed = true;
      this.host.dust(this.center);
      this.host.shake(0.6);
    }
    if (!ph.done) return false;
    this.host.height(null);
    this.host.flash(0);
    this.host.sky(0);
    this.host.camera(0);
    this.clear(true);
    return true;
  }

  /** When chunk `i` leaves its arm's tip (s). */
  private releaseAt(i: number): number {
    return T.throwFrom + ((T.throwTo - T.throwFrom) * i) / U.chunks;
  }

  /** Where arm `i` holds its chunk: its tip, or (with no arms) a point on the ring under the Kraken. */
  private heldAt(i: number, tips: readonly THREE.Vector3[] | null, out: THREE.Vector3): THREE.Vector3 {
    const tip = tips?.[i];
    if (tip) return out.copy(tip);
    return out.copy(this.grabPoints[i]!).setY(inkPhase(this.t).height);
  }

  private drawChunks(tips: readonly THREE.Vector3[] | null): void {
    let n = 0;
    for (let i = 0; i < U.chunks; i++) {
      const k = this.chunks[i]!;
      if (k.state === 'held') this.heldAt(i, tips, _p);
      else if (k.state === 'flying') ballistic(k.from, k.to, U.chunkArc, Math.min(1, k.t / U.chunkFlight), _p);
      else continue;
      _q.setFromAxisAngle(_axis, this.t * 3 + i);
      this.chunkMesh.setMatrixAt(n++, _m.compose(_p, _q, _s.setScalar(U.chunkSize)));
    }
    this.chunkMesh.count = n;
    this.chunkMesh.visible = n > 0;
    this.chunkMesh.instanceMatrix.needsUpdate = true;
  }

  /** Stop at once, restoring the sky, camera, time and the Kraken on the ground (restart, exit, death). */
  cancel(): void {
    if (this.active) {
      this.host.height(null);
      this.host.sky(0);
      this.host.camera(0);
      this.host.flash(0);
    }
    this.clear();
  }

  /** Reset to idle; `keepInk` leaves the last of the ink to thin away (the natural end). */
  private clear(keepInk = false): void {
    this.active = false;
    this.t = 0;
    this.time = 1;
    this.grabbed = this.torn = this.inked = this.swept = this.aimed = this.landed = false;
    this.jets = this.thrown = this.swung = this.bolted = 0;
    this.falling = [];
    for (const k of this.chunks) {
      k.state = 'off';
      k.target = null;
    }
    this.chunkMesh.count = 0;
    this.chunkMesh.visible = false;
    this.rain.clear();
    this.lightning.clear();
    if (!keepInk) this.ink.clear();
  }

  dispose(): void {
    this.chunkMesh.removeFromParent();
    this.chunkMesh.geometry.dispose();
    (this.chunkMesh.material as THREE.Material).dispose();
    this.rain.dispose();
    this.ink.dispose();
    this.lightning.dispose();
  }
}
