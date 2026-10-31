import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Ultimate } from '../../systems/ultimate';
import type { Vec2 } from '../../util/math';
import { LanceBeam } from './LanceBeam';
import { LanceDebris } from './LanceDebris';
import { angularSize, bearingOf, crossed, inWedge, lancePhase } from './plasmaLance';

const U = CONFIG.kaiju.ultimate;
const T = U.t;
const BOSS_DAMAGE = CONFIG.wendigo.ultimate.bossDamage;
/** The beam meets the ground this far out (fraction of the range). */
const REACH = 0.9;
/** Buildings are gathered this far (m) past the range, so a large one poking into the wedge is found. */
const BUILDING_SLACK = 200;
/** The trench is burned, with impact bursts at the beam's end and along it, every this long (s) while the beam sweeps. */
const SCAR_EVERY = 0.05;
/** Scene light added at full beam (host.flash), and the camera shake fed each frame while it fires. */
const BEAM_LIGHT = 0.35;
const BEAM_SHAKE = 0.02;

/** What Plasma Lance does to the game, supplied by GameScene. */
export type PlasmaLanceHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Hit by the beam: it dies (or collapses) with the usual explosion. */
  destroy(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** The Kaiju's facing (yaw, rad) as Q was pressed. */
  facing(): number;
  /** The jaws, world space. */
  jaws(out: THREE.Vector3): THREE.Vector3;
  /** Turn the head toward this world point (null: free). */
  aim(at: THREE.Vector3 | null): void;
  /** Hold the Kaiju in place, its plates and vents blazing by `blaze` and roaring by `roar` (0..1 each). */
  hold(blaze: number, roar: number): void;
  /** Set it down and back to normal control. */
  release(): void;
  sky(k: number): void;
  /** Camera pull-back 0..1, keeping the player's angle (0 restores the player's view). */
  camera(k: number): void;
  shake(amount: number): void;
  flash(k: number): void;
  /** Particles: a glint vaporized, or the beam's impact on the ground. */
  burst(at: THREE.Vector3, kind: 'vapor' | 'impact'): void;
};

/** A building in the wedge: its bearing from the facing and how much its size widens it. */
type Mark = { target: Target; bearing: number; widen: number };

const _aim = new THREE.Vector3();
const _jaws = new THREE.Vector3();
const _near = new THREE.Vector3();
const _along = new THREE.Vector3();

/**
 * Plasma Lance, the Kaiju's ultimate, on its real-time timeline (lancePhase): the world slows, the sky turns to night,
 * and the Kaiju roars as the camera pulls back, while glints of light rise all around it and its plates and vents
 * blaze; then it fires a beam from its jaws that sweeps the wedge in front of it from its right to its left, burning a
 * trench along the ground under its whole length and destroying every unit, aircraft and building it crosses,
 * vaporizing the glints; then the rest of the glints drift down, and everything clears. It owns its beam, trench and
 * glints.
 */
export class PlasmaLance implements Ultimate {
  active = false;
  private t = 0;
  private time = 1;
  private damageMult = 1;
  private yaw = 0;
  private origin = { x: 0, z: 0 };
  private fired = false;
  private settled = false;
  private prevSweep = -Infinity;
  private nextScar = 0;
  private marks: Mark[] = [];
  /** Everything the beam has hit, so nothing is hit twice. */
  private hit = new Set<Target>();
  /** This frame's targets, in sweep order (reused). */
  private due: Target[] = [];
  private byEdge = (a: Target, b: Target) => this.edge(a) - this.edge(b);
  private beam: LanceBeam;
  private debris: LanceDebris;

  constructor(
    scene: THREE.Scene,
    private host: PlasmaLanceHost,
    private rand: () => number = Math.random,
  ) {
    this.beam = new LanceBeam(scene);
    this.debris = new LanceDebris(scene, rand);
  }

  /** World time scale while it runs (1 when idle). */
  timeScale(): number {
    return this.active ? this.time : 1;
  }

  start(center: THREE.Vector3, damageMult: number): void {
    this.clear();
    this.active = true;
    this.origin.x = center.x;
    this.origin.z = center.z;
    this.yaw = this.host.facing();
    this.damageMult = damageMult;
    this.debris.scatter(this.origin);
    this.host.shake(0.2);
  }

  /** Advance by real seconds (0 while paused). Returns true on the frame it ends. */
  update(realDt: number): boolean {
    if (!this.active) {
      // The scar keeps fading after control returns.
      this.beam.update(realDt);
      return false;
    }
    this.t += realDt;
    const ph = lancePhase(this.t);
    this.time = ph.time;
    this.host.sky(ph.sky);
    this.host.camera(ph.camera);
    this.host.hold(ph.blaze, ph.roar);
    // On real time, as its other beats: the leftover debris must be down before the end.
    this.debris.update(realDt, ph.lift);
    this.beam.update(realDt);

    if (!this.fired && this.t >= T.fire) {
      this.fired = true;
      this.gather();
    }
    if (ph.look !== null && !this.settled) {
      // After the roar the head eases round to the right edge, then the beam follows it.
      const a = this.yaw + ph.look;
      _aim.set(this.origin.x + Math.sin(a) * U.range * REACH, 0, this.origin.z + Math.cos(a) * U.range * REACH);
      this.host.aim(_aim);
    }
    if (this.fired && ph.beam > 0) {
      // The beam meets the ground at its bearing, out near the end of its range (where the head looks).
      const a = this.yaw + ph.sweep;
      _aim.set(this.origin.x + Math.sin(a) * U.range * REACH, 0, this.origin.z + Math.cos(a) * U.range * REACH);
      this.beam.show(this.host.jaws(_jaws), _aim, ph.beam, this.t);
      this.host.flash(BEAM_LIGHT * ph.beam);
      if (realDt > 0) this.host.shake(BEAM_SHAKE);
      while (this.t >= this.nextScar) {
        this.nextScar += SCAR_EVERY;
        // The ground burns under the beam's whole length, from near the Kaiju out to where it hits.
        _near.set(this.origin.x + Math.sin(a) * U.scarFrom, 0, this.origin.z + Math.cos(a) * U.scarFrom);
        this.beam.burn(_near, _aim);
        this.host.burst(_aim, 'impact');
        this.host.burst(_along.lerpVectors(_near, _aim, this.rand()), 'impact');
      }
      this.sweepTo(ph.sweep);
    } else if (this.fired) {
      // A long frame may have jumped past the end of the sweep: finish it first.
      this.sweepTo(ph.sweep);
      this.endBeam();
    }

    if (!ph.done) return false;
    this.host.release();
    this.host.sky(0);
    this.host.camera(0);
    this.clear(true);
    return true;
  }

  cancel(): void {
    if (this.active) {
      this.host.release();
      this.host.sky(0);
      this.host.camera(0);
      this.host.flash(0);
      this.host.aim(null);
    }
    this.clear();
  }

  dispose(): void {
    this.beam.dispose();
    this.debris.dispose();
  }

  /** The standing buildings in the wedge, fixed as it fires (they don't move; enemies are checked where they are each frame). */
  private gather(): void {
    this.marks = [];
    for (const t of this.host.buildingsWithin(this.origin, U.range + BUILDING_SLACK)) {
      if (!t.isAlive() || !inWedge(this.origin, this.yaw, t.position, t.radius)) continue;
      this.marks.push({ target: t, bearing: bearingOf(this.origin, this.yaw, t.position), widen: this.widen(t) });
    }
    this.prevSweep = -Infinity;
    this.nextScar = this.t;
  }

  /** How far a target's own size widens the bearing at which the beam catches it. */
  private widen(t: Target): number {
    return angularSize(Math.hypot(t.position.x - this.origin.x, t.position.z - this.origin.z), t.radius);
  }

  /** Take everything the beam passed over since last frame (right to left), and vaporize the debris it crossed. */
  private sweepTo(sweep: number): void {
    const prev = this.prevSweep;
    if (sweep <= prev) return;
    const due = this.due;
    due.length = 0;
    for (const m of this.marks) if (!this.hit.has(m.target) && m.target.isAlive() && crossed(prev, sweep, m.bearing, m.widen)) due.push(m.target);
    for (const t of this.host.enemies()) {
      if (this.hit.has(t) || !t.isAlive() || !inWedge(this.origin, this.yaw, t.position, t.radius)) continue;
      if (crossed(prev, sweep, bearingOf(this.origin, this.yaw, t.position), this.widen(t))) due.push(t);
    }
    // In sweep order, so a long frame still takes them right to left.
    if (due.length > 1) due.sort(this.byEdge);
    for (const t of due) {
      this.hit.add(t);
      if (t.boss) this.host.hurtBoss(t, BOSS_DAMAGE * this.damageMult);
      else this.host.destroy(t);
    }
    const ps = this.debris.positions();
    for (let i = 0; i < ps.length; i++) {
      // Only the pieces in the wedge: the rest lie all around and settle at the end.
      if (!this.debris.alive(i) || !inWedge(this.origin, this.yaw, ps[i]!, 0)) continue;
      if (!crossed(prev, sweep, bearingOf(this.origin, this.yaw, ps[i]!), 0)) continue;
      this.debris.vaporize(i);
      this.host.burst(ps[i]!, 'vapor');
    }
    this.prevSweep = sweep;
  }

  /** The bearing at which the beam first reaches `t` (its right-hand edge). */
  private edge(t: Target): number {
    return bearingOf(this.origin, this.yaw, t.position) - this.widen(t);
  }

  /** The beam is done: hide it, free the head, and let the remaining debris fall. */
  private endBeam(): void {
    if (this.settled) return;
    this.settled = true;
    this.beam.hide();
    this.host.flash(0);
    this.host.aim(null);
    this.debris.settle();
  }

  /** Reset to idle; `keepScar` leaves the scar to fade (the natural end). */
  private clear(keepScar = false): void {
    this.active = false;
    this.t = 0;
    this.time = 1;
    this.fired = this.settled = false;
    this.prevSweep = -Infinity;
    this.marks = [];
    this.hit.clear();
    this.debris.clear();
    if (keepScar) this.beam.hide();
    else this.beam.clear();
  }
}
