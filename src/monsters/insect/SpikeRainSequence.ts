import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Ultimate } from '../../systems/ultimate';
import type { Vec2 } from '../../util/math';
import { RainSpikes } from './RainSpikes';
import { inArea, landingTimes, rainPhase, scatterPoints } from './spikeRain';

const U = CONFIG.insect.ultimate;
const T = U.t;
const BOSS_DAMAGE = CONFIG.wendigo.ultimate.bossDamage;
/** Buildings are gathered this far (m) past the area, so a large one poking into it is found. */
const BUILDING_SLACK = 200;
/** The tail aims at a point this far (m) in front, U.aimHeight up. */
const AIM_AHEAD = 400;
/** The camera shake each landing adds. */
const LAND_SHAKE = 0.03;

/** What Spike Rain does to the game, supplied by GameScene. */
export type SpikeRainHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Hit by a spike: it dies (or collapses) with the usual explosion. */
  destroy(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** The Insect's facing (yaw, rad) as Q was pressed. */
  facing(): number;
  /** The stinger tip, world space. */
  stinger(out: THREE.Vector3): THREE.Vector3;
  /** Point the tail at this world point (null: free). */
  aim(at: THREE.Vector3 | null): void;
  /** Hold the Insect in place, reared up by `roar` (0..1). */
  hold(roar: number): void;
  /** Set it down and back to normal control. */
  release(): void;
  sky(k: number): void;
  /** Camera pull-back 0..1, keeping the player's angle (0 restores the player's view). */
  camera(k: number): void;
  shake(amount: number): void;
  /** A spike's impact on the ground. */
  burst(at: THREE.Vector3): void;
};

/**
 * A planned spike: when it lands (s), where (following its first target while that lives), the targets it hits, and
 * its slot in the pool (−1 before launch, or when the pool was full: it still lands on time, unseen).
 */
type Planned = { land: number; to: THREE.Vector3; targets: Target[]; slot: number; launched: boolean; landed: boolean };

const _from = new THREE.Vector3();
const _aim = new THREE.Vector3();
const noLanding = () => {};

/**
 * Spike Rain, the Insect's ultimate, on its real-time timeline (rainPhase): the world slows, the sky turns purple and
 * the fog closes in, the camera pulls back; the Insect rears up on its back legs and beats its chest with the front
 * four while its tail fires a volley of spikes high into the air; they rain down over the area in front of it, one
 * on every enemy and building there (following any that move) and the rest scattered over it, destroying what they
 * hit; anything that wandered in late is caught as the rain ends; then it drops back down and everything clears.
 */
export class SpikeRain implements Ultimate {
  active = false;
  private t = 0;
  private time = 1;
  private damageMult = 1;
  private yaw = 0;
  private origin = { x: 0, z: 0 };
  private gathered = false;
  private swept = false;
  private aiming = false;
  private plan: Planned[] = [];
  /** Next planned spike to launch and to land (the plan is in landing order). */
  private nextLaunch = 0;
  private nextLand = 0;
  private hit = new Set<Target>();
  private spikes: RainSpikes;
  private points: Vec2[] = [];
  private times: number[] = [];

  constructor(
    scene: THREE.Scene,
    private host: SpikeRainHost,
    spikeColor: number,
    private rand: () => number = Math.random,
  ) {
    this.spikes = new RainSpikes(scene, spikeColor);
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
    this.host.shake(0.2);
  }

  /** Advance by real seconds (0 while paused). Returns true on the frame it ends. */
  update(realDt: number): boolean {
    if (!this.active) return false;
    this.t += realDt;
    const ph = rainPhase(this.t);
    this.time = ph.time;
    this.host.sky(ph.sky);
    this.host.camera(ph.camera);
    this.host.hold(ph.roar);
    if (ph.aim) {
      this.aiming = true;
      _aim.set(this.origin.x + Math.sin(this.yaw) * AIM_AHEAD, U.aimHeight, this.origin.z + Math.cos(this.yaw) * AIM_AHEAD);
      this.host.aim(_aim);
    } else if (this.aiming) {
      this.aiming = false;
      this.host.aim(null);
    }

    if (!this.gathered && this.t >= T.volleyFrom) {
      this.gathered = true;
      this.gather();
    }
    // Launch each spike so it lands on time; a spike following a live target keeps after it.
    while (this.nextLaunch < this.plan.length && this.t >= this.plan[this.nextLaunch]!.land - U.flight) {
      const p = this.plan[this.nextLaunch++]!;
      p.launched = true;
      p.slot = this.spikes.launch(this.host.stinger(_from), p.to);
    }
    for (let i = this.nextLand; i < this.nextLaunch; i++) {
      const p = this.plan[i]!;
      const lead = p.targets[0];
      if (!p.landed && lead?.isAlive()) {
        p.to.copy(lead.position);
        if (p.slot >= 0) this.spikes.aimAt(p.slot, p.to);
      }
    }
    this.spikes.update(realDt, noLanding);
    while (this.nextLand < this.plan.length && this.t >= this.plan[this.nextLand]!.land) this.land(this.plan[this.nextLand++]!);

    if (this.gathered && !this.swept && this.t >= T.rainTo) {
      // Anything that wandered into the area after the gather goes as the rain ends.
      this.swept = true;
      for (const t of this.host.enemies()) if (inArea(this.origin, this.yaw, t.position, t.radius)) this.strike(t);
    }

    if (!ph.done) return false;
    this.host.release();
    this.host.sky(0);
    this.host.camera(0);
    this.clear();
    return true;
  }

  cancel(): void {
    if (this.active) {
      this.host.release();
      this.host.sky(0);
      this.host.camera(0);
      this.host.aim(null);
    }
    this.clear();
  }

  dispose(): void {
    this.spikes.dispose();
  }

  /**
   * Plan the volley: one spike on every enemy (any altitude) and standing building in the area, the rest scattered over
   * it, U.spikes in all (more if there are more targets), each given a landing time over the rain beat at random.
   */
  private gather(): void {
    const targets: Target[] = [];
    for (const t of this.host.enemies()) if (t.isAlive() && inArea(this.origin, this.yaw, t.position, t.radius)) targets.push(t);
    for (const t of this.host.buildingsWithin(this.origin, U.far + BUILDING_SLACK)) {
      if (t.isAlive() && inArea(this.origin, this.yaw, t.position, t.radius)) targets.push(t);
    }
    const n = Math.max(U.spikes, targets.length);
    scatterPoints(this.origin, this.yaw, n - targets.length, this.rand, this.points);
    landingTimes(n, this.rand, this.times);
    this.plan = [];
    for (const t of targets) this.plan.push({ land: 0, to: t.position.clone(), targets: [t], slot: -1, launched: false, landed: false });
    for (const p of this.points) this.plan.push({ land: 0, to: new THREE.Vector3(p.x, 0, p.z), targets: [], slot: -1, launched: false, landed: false });
    // Shuffle which spike lands when, then hand out the landing times in order.
    for (let i = this.plan.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [this.plan[i], this.plan[j]] = [this.plan[j]!, this.plan[i]!];
    }
    this.plan.forEach((p, i) => (p.land = this.times[i]!));
  }

  /** A spike lands: an impact, and every target it was meant for is hit. */
  private land(p: Planned): void {
    p.landed = true;
    this.host.burst(p.to);
    this.host.shake(LAND_SHAKE);
    for (const t of p.targets) this.strike(t);
  }

  /** Destroy `t` (a boss takes the heavy ultimate damage instead), once. */
  private strike(t: Target): void {
    if (this.hit.has(t) || !t.isAlive()) return;
    this.hit.add(t);
    if (t.boss) this.host.hurtBoss(t, BOSS_DAMAGE * this.damageMult);
    else this.host.destroy(t);
  }

  private clear(): void {
    this.active = false;
    this.t = 0;
    this.time = 1;
    this.gathered = this.swept = this.aiming = false;
    this.plan = [];
    this.nextLaunch = this.nextLand = 0;
    this.hit.clear();
    this.spikes.clear();
  }
}
