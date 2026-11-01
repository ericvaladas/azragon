import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { angleDelta, damp, type Vec2 } from '../util/math';
import { strikeFill, strikeHits, strikePoints } from './artilleryMath';
import { launchArc } from '../systems/projectileMath';
import { chooseAction, laserPhase, movePhase, punchHits, slamHits, type MechAction, type MechMind, type MechMove } from './mechMath';
import { MechLaser } from './mechLaser';
import { LEG_REACH, MECH_LEGS, MECH_TUBES, missileGeometry } from './mechModel';
import { MechRig, STEP, dampPose, restPose, targetPose, type MechPoseInput, type VisorState } from './mechPose';
import type { EnemySystem, WorldContext } from './types';

const M = CONFIG.mech;
const H = M.height;
const MAX_STRIKES = 16;
/** Seconds between sparks while it dies, and how snappily the pose follows its target, alive and dead (1/s). */
const SPARK_EVERY = 0.12;
const POSE_RATE = 22;
const FALL_RATE = 5;
/**
 * The barrage missiles leave the launcher tubes this many seconds apart once their circles have filled; a smoke puff
 * every TRAIL_EVERY s marks each one's arc, and the missile is this long (m).
 */
const LAUNCH_GAP = 0.08;
/** Points checked along an evade's path, and how far past its end it must stay clear of blocked ground (radii). */
const EVADE_SAMPLES = 4;
const EVADE_MARGIN = 1;
const ease = (t: number) => t * t * (3 - 2 * t);
const TRAIL_EVERY = 0.025;
const MISSILE_LENGTH = 45;
/** How far ahead along its flight (0..1) a missile looks to point its nose. */
const MISSILE_LOOK = 0.02;
const FORWARD = new THREE.Vector3(0, 0, 1);
const _ahead = new THREE.Vector3();
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _land = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
/** Scratch ground points (a foot, the mech's own spot) and the brain's input, reused every frame. */
const _foot: Vec2 = { x: 0, z: 0 };
const _here: Vec2 = { x: 0, z: 0 };
const _mind: MechMind = { dist: 0, contact: 0, engaged: false, meleeCd: 0, dashCd: 0, rocketCd: 0, barrageCd: 0, evadeCd: 0, laserCd: 0, roll: 0, evadeRoll: 1 };
/** The diagonal leg pairs that step together: front-left with rear-right, front-right with rear-left. */
const PAIRS = [[0, 3], [1, 2]] as const;

/** Turns `from` toward `to` by at most `step` rad. */
const turn = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, angleDelta(from, to)));

class MechBody implements Target {
  readonly kind = 'mech' as const;
  readonly boss = true;
  readonly airborne = false;
  readonly radius = M.radius;
  /** At chest height over its feet. */
  readonly position = new THREE.Vector3();
  alive = true;
  hp: number;

  constructor(
    readonly maxHp: number,
    private onDamage: (b: MechBody, amount: number) => void,
  ) {
    this.hp = maxHp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * A barrage circle at `at`, painted `t` s ago, and its missile: launched from launcher tube `tube` at `from` (set at
 * launch), heading along the ground direction (fx, fz) it faced at launch. It leaves at age `launchAt`, and flies for `flight` s (set at launch).
 */
/** Flight progress (0..1) of a launched strike's missile. */
const missileK = (s: { t: number; launchAt: number; flight: number }): number => Math.min(1, (s.t - s.launchAt) / Math.max(s.flight, 0.01));

type Strike = { at: Vec2; t: number; tube: number; launchAt: number; flight: number; from: THREE.Vector3; fx: number; fz: number; launched: boolean; trailT: number };

/** Scratch target pose and its input, rebuilt every draw. */
const _target = restPose();
const _poseIn: MechPoseInput = { stride: 0, gait: 0, action: 'walk', actT: 0, dashing: false, stabLeg: 0, evadeSide: 1, alive: true, dying: 0, wrecked: false, recoil: 0 };

/**
 * The boss mech: one giant four-legged spider tank, summoned by the cycle (never by the spawn director). It walks in
 * toward the monster, crushing buildings underfoot, and fights it with telegraphed front-leg stabs (the punch) and
 * rearing stomps (the slam), a gap-closing dash once it has engaged (come within dashTrigger, or engageAfter s after
 * its summoning), black shell volleys from its twin cannons and an occasional barrage of marked strike circles from its
 * box launcher. Dead, it sparks and flickers, then blows apart and vanishes inside its dust cloud. Every so often it hops back twice
 * and fires a charged laser from its eye (see MechLaser). Drawn by a MechRig.
 */
export class Mech implements EnemySystem {
  readonly kind = 'mech' as const;
  private body: MechBody | null = null;
  private ctx: WorldContext | null = null;
  private x = 0;
  private z = 0;
  private heading = 0;
  /** It has been within dashTrigger of the monster at least once, or engageAfter s have passed since its summoning. */
  private engaged = false;
  /** It is walking the monster down; once it has stopped, it stays put until a gap has lasted. */
  private chasing = true;
  /** How long the current gap past chaseGap has lasted (s). */
  private gapT = 0;
  /** Seconds since its summoning. */
  private age = 0;
  private action: MechAction = 'walk';
  private actT = 0;
  /** The current move's one-off effect (the hit check, the barrage, the dash start) has happened. */
  private struck = false;
  /** Mid-dash: moving to its stopping point, the move's clock held at the end of the wind-up. */
  private dashing = false;
  /** Which front leg the next stab uses (0 left, 1 right); it alternates. */
  private stabLeg = 0;
  private meleeCd = 0;
  private dashCd = 0;
  private rocketCd = 0;
  private barrageCd = 0;
  private evadeCd = 0;
  private laserCd = 0;
  /** Hopbacks left before the laser charges, and whether the laser's hops are under way. */
  private laserHops = 0;
  private hoppingToLaser = false;
  /** Seconds until the next evade roll. */
  private evadeCheck = 0;
  /** The current evade's start, its unit direction on the ground, and its side (1 its left, −1 its right). */
  private evadeX = 0;
  private evadeZ = 0;
  private evadeDirX = 0;
  private evadeDirZ = 0;
  private evadeSide = 1;
  /** A hopback's touchdown has happened. */
  private landed = false;
  /** Height above the ground mid-hopback (m). */
  private hopY = 0;
  /** Stride phase (rad; one footfall each π) and how far into its stride it is (0 standing .. 1 walking). */
  private stride = 0;
  private gait = 0;
  private flashT = 0;
  /** The cannons' recoil, 1 as a shell leaves, settling to 0 over cannonRecoilTime. */
  private recoil = 0;
  /** Seconds since it died (sparking), and since it blew apart (the wreck); the wreck starts at null. */
  private dyingT = 0;
  private sparkT = 0;
  private wreckT: number | null = null;
  private strikes: Strike[] = [];
  private pose = restPose();
  private readonly rig = new MechRig();
  private readonly root = this.rig.root;
  private ringMesh: THREE.InstancedMesh;
  private fillMesh: THREE.InstancedMesh;
  private missileMesh: THREE.InstancedMesh;
  private readonly laser: MechLaser;

  constructor(scene: THREE.Scene) {
    this.root.scale.setScalar(H);
    this.root.visible = false;
    scene.add(this.root);
    this.laser = new MechLaser(scene);
    const P = CONFIG.palette;
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }), MAX_STRIKES);
    this.fillMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.35, depthWrite: false }), MAX_STRIKES);
    for (const m of [this.ringMesh, this.fillMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.fillMesh.renderOrder = 2;
    this.ringMesh.renderOrder = 10;
    this.missileMesh = new THREE.InstancedMesh(missileGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), MAX_STRIKES);
    this.missileMesh.frustumCulled = false;
    this.missileMesh.count = 0;
    scene.add(this.missileMesh);
  }

  targets(): readonly Target[] {
    return this.body?.alive ? [this.body] : [];
  }

  /** 1 from its summoning until the wreck has gone in its dust cloud. */
  count(): number {
    return this.body ? 1 : 0;
  }

  /** The live mech's HP (for the boss bar); null when there is none or it is dead. */
  current(): { hp: number; maxHp: number } | null {
    const b = this.body;
    return b?.alive ? { hp: Math.max(0, b.hp), maxHp: b.maxHp } : null;
  }

  /** Its heading (rad). */
  yaw(): number {
    return this.heading;
  }

  /** Its locked or firing laser lies on the monster at `monster`. */
  laserThreat(monster: THREE.Vector3): boolean {
    return this.laser.threatening(monster);
  }

  clear(): void {
    // A cleared mech is gone for good: hits through an old reference do nothing.
    if (this.body) this.body.alive = false;
    this.body = null;
    this.strikes = [];
    this.root.visible = false;
    this.laser.hide();
    this.drawStrikes();
  }

  /** The director never spawns the mech; the cycle calls summon. */
  spawn(_ctx: WorldContext): boolean {
    return false;
  }

  /** The mech spawnDistance m from the monster in ctx.spawnDir, facing it, HP scaled by difficulty. Replaces any mech. */
  summon(ctx: WorldContext): void {
    this.clear();
    this.ctx = ctx;
    const d = ctx.spawnDir();
    const m = ctx.monster.position;
    this.x = m.x + d.x * M.spawnDistance;
    this.z = m.z + d.z * M.spawnDistance;
    this.heading = Math.atan2(m.x - this.x, m.z - this.z);
    const hp = M.hp * ctx.difficulty.hpMult;
    this.body = new MechBody(hp, this.damage);
    this.engaged = false;
    this.chasing = true;
    this.gapT = 0;
    this.age = 0;
    this.action = 'walk';
    this.actT = 0;
    this.dashing = false;
    this.meleeCd = this.dashCd = this.evadeCd = this.evadeCheck = this.hopY = 0;
    this.rocketCd = M.rocketCooldown;
    this.barrageCd = M.barrageCooldown * 0.5;
    this.laserCd = M.laserFirst;
    this.laserHops = 0;
    this.hoppingToLaser = false;
    this.stride = this.gait = this.flashT = this.recoil = 0;
    this.dyingT = this.sparkT = 0;
    this.wreckT = null;
    restPose(this.pose);
    this.root.visible = true;
    this.draw();
  }

  private damage = (b: MechBody, amount: number): void => {
    if (b !== this.body || !b.alive) return;
    b.hp -= amount;
    this.flashT = 0.1;
    if (b.hp > 0) return;
    b.alive = false;
    // Its painted barrage and its laser die with it.
    this.strikes = [];
    this.drawStrikes();
    this.laser.hide();
    this.ctx?.onDestroyed(b, 0);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    this.updateStrikes(dt, ctx);
    const b = this.body;
    if (!b) return;
    this.flashT = Math.max(0, this.flashT - dt);
    this.recoil = Math.max(0, this.recoil - dt / M.cannonRecoilTime);
    if (b.alive) this.think(dt, ctx);
    else if (!this.die(dt, ctx)) return;
    this.draw(dt);
    if (b.alive) this.updateLaser(dt, ctx, b);
  }

  private think(dt: number, ctx: WorldContext): void {
    const m = ctx.monster.position;
    const dist = Math.hypot(m.x - this.x, m.z - this.z);
    const aim = Math.atan2(m.x - this.x, m.z - this.z);
    // Where the walk and the dash stop: stopGap between the two bodies' surfaces.
    const stand = M.radius + ctx.monster.bodyRadius + M.stopGap;
    this.age += dt;
    // A monster that outruns the approach is dashed at anyway once engageAfter s have passed.
    if (!this.engaged && (dist <= M.dashTrigger || this.age >= M.engageAfter)) this.engaged = true;
    this.meleeCd -= dt;
    this.dashCd -= dt;
    this.rocketCd -= dt;
    // The barrage waits until it has come into the fight, so it never fires from beyond the fog.
    if (this.engaged) {
      this.barrageCd -= dt;
      this.laserCd -= dt;
    }
    this.evadeCd -= dt;
    if (this.action === 'walk' && ctx.monster.alive) {
      const mind = _mind;
      mind.dist = dist;
      mind.contact = M.radius + ctx.monster.bodyRadius;
      mind.engaged = this.engaged;
      mind.meleeCd = this.meleeCd;
      mind.dashCd = this.dashCd;
      mind.rocketCd = this.rocketCd;
      mind.barrageCd = this.barrageCd;
      mind.evadeCd = this.evadeCd;
      mind.laserCd = this.laserCd;
      mind.roll = ctx.rng();
      this.evadeCheck -= dt;
      mind.evadeRoll = 1;
      if (this.evadeCheck <= 0) {
        this.evadeCheck = M.evadeCheck;
        mind.evadeRoll = ctx.rng();
      }
      const next = chooseAction(mind);
      if (next === 'sidestep' || next === 'hopback') this.startEvade(next, mind.roll < 0.5 ? 1 : -1, ctx);
      else if (next === 'laser') this.beginLaser(ctx);
      else if (next !== 'walk') this.start(next);
    }
    // The laser sequence holds its ground; the chase picks up from where it was once it ends.
    if (this.action !== 'laser' && !this.hoppingToLaser) this.updateChase(dt, dist - stand);
    this.gait = damp(this.gait, this.action === 'walk' && this.chasing && dist > stand + 1 ? 1 : 0, 6, dt);
    if (this.action === 'walk') this.walk(dt, ctx, dist, aim, stand);
    else if (this.action === 'sidestep' || this.action === 'hopback') this.evade(this.action, dt, ctx, aim, dist);
    else if (this.action === 'laser') this.chargeLaser(dt, ctx, aim);
    else this.act(this.action, dt, ctx, aim, dist);
  }

  private start(a: MechMove | 'laser'): void {
    this.action = a;
    this.actT = 0;
    this.struck = false;
    this.dashing = false;
    if (a === 'punch') this.stabLeg = 1 - this.stabLeg;
  }

  /**
   * Starts the evade `a` toward `side` (sidesteps only) if its path is clear, else the sidestep to the other side, else
   * the other evade; with no clear path it stays on its feet and carries on.
   */
  private startEvade(a: 'sidestep' | 'hopback', side: number, ctx: WorldContext): void {
    if (a === 'hopback') this.tryEvade('hopback', side, ctx) || this.tryEvade('sidestep', side, ctx) || this.tryEvade('sidestep', -side, ctx);
    else this.tryEvade('sidestep', side, ctx) || this.tryEvade('sidestep', -side, ctx) || this.tryEvade('hopback', side, ctx);
  }

  /** Starts evade `move` toward `side` (sidesteps only) if its path is clear; true if it did. */
  private tryEvade(move: 'sidestep' | 'hopback', side: number, ctx: WorldContext): boolean {
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    // The model's left (+X) is (cos h, −sin h) on the ground; its back is (−sin h, −cos h).
    const dx = move === 'sidestep' ? cos * side : -sin;
    const dz = move === 'sidestep' ? -sin * side : -cos;
    if (!this.pathClear(dx, dz, move === 'sidestep' ? M.sidestepDistance : M.hopDistance, ctx)) return false;
    this.start(move);
    this.evadeX = this.x;
    this.evadeZ = this.z;
    this.evadeDirX = dx;
    this.evadeDirZ = dz;
    this.evadeSide = side;
    this.landed = false;
    return true;
  }

  /** Nothing along `dist` m in the ground direction (dx, dz), and a body's width past it, is blocked. */
  private pathClear(dx: number, dz: number, dist: number, ctx: WorldContext): boolean {
    if (!ctx.blocked) return true;
    const reach = dist + EVADE_MARGIN * M.radius;
    for (let i = 1; i <= EVADE_SAMPLES; i++) {
      const d = (reach * i) / EVADE_SAMPLES;
      if (ctx.blocked(this.x + dx * d, this.z + dz * d)) return false;
    }
    return true;
  }

  /** One frame of an evade: it keeps facing the monster and slides or jumps along its fixed line, then lands. */
  private evade(a: 'sidestep' | 'hopback', dt: number, ctx: WorldContext, aim: number, dist: number): void {
    const mv = M.moves[a];
    this.actT += dt;
    this.heading = turn(this.heading, aim, M.turnRate * dt);
    const k = Math.max(0, Math.min(1, (this.actT - mv.windup) / mv.strike));
    const px = this.x;
    const pz = this.z;
    const along = (a === 'sidestep' ? M.sidestepDistance : M.hopDistance) * (a === 'sidestep' ? ease(k) : k);
    this.x = this.evadeX + this.evadeDirX * along;
    this.z = this.evadeZ + this.evadeDirZ * along;
    if (a === 'sidestep') {
      this.footfalls(Math.hypot(this.x - px, this.z - pz), dt, ctx, dist);
    } else {
      this.hopY = M.hopHeight * 4 * k * (1 - k);
      if (k >= 1 && !this.landed) this.land(ctx);
    }
    if (movePhase(a, this.actT) !== 'done') return;
    this.evadeCd = M.evadeCooldown;
    this.action = 'walk';
    if (this.hoppingToLaser) this.nextLaserStep(ctx);
  }

  /** Starts the laser sequence: laserHops hopbacks, then the charge. */
  private beginLaser(ctx: WorldContext): void {
    this.hoppingToLaser = true;
    this.laserHops = M.laserHops;
    this.nextLaserStep(ctx);
  }

  /** The next hop whose path is clear (blocked ones are skipped); with none left, the charge. A dead monster ends it. */
  private nextLaserStep(ctx: WorldContext): void {
    if (ctx.monster.alive) {
      while (this.laserHops > 0) {
        this.laserHops--;
        if (this.tryEvade('hopback', 1, ctx)) return;
      }
      this.start('laser');
    } else {
      this.laserCd = M.laserCooldown;
    }
    this.hoppingToLaser = false;
  }

  /** The laser move's clock: it turns to the monster through the charge, then faces along the line until it is done. */
  private chargeLaser(dt: number, ctx: WorldContext, aim: number): void {
    this.actT += dt;
    const phase = laserPhase(this.actT);
    if (phase === 'charge') this.heading = turn(this.heading, aim, M.turnRate * dt);
    // The line exists once the laser itself has entered the aim phase, a frame after this clock.
    else if (phase === 'aim' && this.laser.phase === 'aim') this.heading = Math.atan2(this.laser.aim.x, this.laser.aim.z);
    const gaveUp = !ctx.monster.alive && (phase === 'charge' || phase === 'aim' || phase === 'lock');
    if (phase !== 'done' && !gaveUp) return;
    this.laserCd = M.laserCooldown;
    this.action = 'walk';
  }

  /** Runs the laser for the frame just posed, from where the eye now is; hidden outside the move. */
  private updateLaser(dt: number, ctx: WorldContext, b: MechBody): void {
    if (this.action !== 'laser') {
      this.laser.hide();
      return;
    }
    this.laser.update(laserPhase(this.actT), this.actT, dt, this.rig.eye(_eye), this.heading, ctx, b);
  }

  /** A hopback touches down: a dust ring, a shake, and every building under the body and feet crushed. */
  private land(ctx: WorldContext): void {
    this.landed = true;
    _here.x = this.x;
    _here.z = this.z;
    const crush = M.crushDps * M.hopCrush;
    ctx.razeBuildings(_here, M.crushRadius, crush);
    for (let i = 0; i < 4; i++) ctx.razeBuildings(this.foot(i, _foot), M.crushRadius, crush);
    ctx.particles.ring('dust', _p.set(this.x, 0, this.z), M.radius, 20);
    ctx.shake(M.hopShake);
  }

  /**
   * Once at the monster it holds its ground, so the player can back off: it sets out again only after a gap past
   * stand of more than chaseGap m has lasted chaseDelay s, and walks until it is back at stand.
   */
  private updateChase(dt: number, gap: number): void {
    if (gap <= 0) {
      this.chasing = false;
      this.gapT = 0;
    } else if (!this.chasing) {
      this.gapT = gap > M.chaseGap ? this.gapT + dt : 0;
      if (this.gapT >= M.chaseDelay) this.chasing = true;
    }
  }

  /** Turns toward the monster and, while chasing, strides straight ahead until `stand` m from it (centre to centre), crushing what is underfoot. */
  private walk(dt: number, ctx: WorldContext, dist: number, aim: number, stand: number): void {
    this.heading = turn(this.heading, aim, M.turnRate * dt);
    if (!ctx.monster.alive || dist <= stand || !this.chasing) return;
    const step = Math.min((this.engaged ? M.walkSpeed : M.approachSpeed) * dt, dist - stand);
    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;
    this.footfalls(step, dt, ctx, dist);
  }

  /** Advances the stride by `step` m, crushing what is underfoot; each footfall raises dust and shakes (less far off). */
  private footfalls(step: number, dt: number, ctx: WorldContext, dist: number): void {
    const before = Math.floor(this.stride / Math.PI + 0.5);
    this.stride += (Math.PI * step) / (STEP * H);
    for (let i = 0; i < 4; i++) ctx.razeBuildings(this.foot(i, _foot), M.crushRadius, M.crushDps * dt);
    if (Math.floor(this.stride / Math.PI + 0.5) === before) return;
    // A footfall: the diagonal pair swung furthest forward plants, raising dust under each foot.
    for (const i of PAIRS[Math.sin(this.stride) > 0 ? 0 : 1]) {
      const foot = this.foot(i, _foot);
      ctx.particles.ring('dust', _p.set(foot.x, 0, foot.z), M.crushRadius, 8);
    }
    ctx.shake(M.footfallShake * Math.max(0.25, 1 - dist / CONFIG.fog.far));
  }

  /** Where foot `i` (MECH_LEGS order) is on the ground, with the stride's forward swing; written into `out`. */
  private foot(i: number, out: Vec2): Vec2 {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const leg = MECH_LEGS[i]!;
    const phase = this.stride + (i === 1 || i === 2 ? Math.PI : 0);
    const across = (leg.x + Math.sin(leg.splay) * LEG_REACH) * H;
    const fwd = (leg.z + Math.cos(leg.splay) * LEG_REACH + Math.sin(phase) * (STEP / 2) * this.gait) * H;
    // The model's left (+X) is (cos h, −sin h) on the ground.
    out.x = this.x + c * across + s * fwd;
    out.z = this.z - s * across + c * fwd;
    return out;
  }

  private act(a: Exclude<MechMove, 'sidestep' | 'hopback'>, dt: number, ctx: WorldContext, aim: number, dist: number): void {
    const mv = M.moves[a];
    if (a === 'dash' && this.dashing) {
      this.dash(dt, ctx, M.radius + ctx.monster.bodyRadius + M.stopGap + M.dashStopShort);
      return;
    }
    this.actT += dt;
    const fired = this.actT >= mv.windup;
    // Melee holds its facing from the wind-up on, so a dodge to the side works; ranged moves keep turning to aim.
    if (a !== 'punch' && a !== 'slam') this.heading = turn(this.heading, aim, M.turnRate * dt);
    const m = ctx.monster.position;
    const here = _here;
    here.x = this.x;
    here.z = this.z;
    if (fired && !this.struck) {
      this.struck = true;
      if (a === 'punch' || a === 'slam') {
        const hit = a === 'punch' ? punchHits(here, this.heading, m, ctx.monster.bodyRadius) : slamHits(here, m, ctx.monster.bodyRadius);
        if (!ctx.monster.airborne && hit) ctx.damageMonster(a === 'punch' ? M.punchDamage : M.slamDamage, 'melee', this.body!);
        if (a === 'slam') {
          ctx.particles.ring('dust', _p.set(this.x, 0, this.z), M.radius + M.slamRadius, 24);
          ctx.shake(0.25);
        } else if (hit && !ctx.monster.airborne) {
          ctx.particles.emit('debris', _p.set(m.x, ctx.monster.height * 0.5, m.z), 8, 1);
          ctx.shake(0.12);
        }
      } else if (a === 'rockets') {
        this.volley(ctx, dist);
      } else if (a === 'barrage') {
        this.barrage(ctx);
      } else if (a === 'dash') {
        this.dashing = true;
        this.actT = mv.windup;
        return;
      }
    }
    if (movePhase(a, this.actT) !== 'done') return;
    if (a === 'punch' || a === 'slam') this.meleeCd = M.meleeCooldown;
    else if (a === 'dash') this.dashCd = M.dashCooldown;
    else if (a === 'rockets') this.rocketCd = M.rocketCooldown;
    else this.barrageCd = M.barrageCooldown;
    this.action = 'walk';
  }

  /** Charges at dashSpeed until `stand` m from the monster (centre to centre), flattening buildings on the way, then recovers and walks the rest of the way in. */
  private dash(dt: number, ctx: WorldContext, stand: number): void {
    const m = ctx.monster.position;
    const dx = m.x - this.x;
    const dz = m.z - this.z;
    const d = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);
    const left = d - stand;
    const step = Math.min(Math.max(0, left), M.dashSpeed * dt);
    if (d > 1e-6) {
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
    }
    _here.x = this.x;
    _here.z = this.z;
    ctx.razeBuildings(_here, M.crushRadius, M.crushDps * dt);
    ctx.particles.emit('dust', _p.set(this.x, 0, this.z), 2, 1.5);
    // The legs gallop through the lunge.
    this.stride += (Math.PI * step) / (2 * STEP * H);
    if (left - step > 1) return;
    this.dashing = false;
    this.chasing = true;
    const mv = M.moves.dash;
    this.actT = mv.windup + mv.strike;
    ctx.particles.ring('dust', _p.set(this.x, 0, this.z), M.crushRadius * 1.5, 16);
    ctx.shake(0.2);
  }

  /** Fires every barrel on the same frame, with one shake for the whole volley (less far off). */
  private volley(ctx: WorldContext, dist: number): void {
    for (let k = 0; k < M.rocketsPerVolley; k++) this.cannonShot(ctx, k % 2);
    ctx.shake(M.cannonShake * Math.max(0.25, 1 - dist / CONFIG.fog.far));
  }

  /**
   * One black shell from a cannon muzzle (0 upper, 1 lower) at the monster's upper body, with a little scatter: a flash
   * at the muzzle, smoke vented backward out of the breech and the barrels kicked back.
   */
  private cannonShot(ctx: WorldContext, barrel: number): void {
    const from = this.rig.muzzle(barrel, new THREE.Vector3());
    this.rig.barrelDir(_dir);
    this.recoil = 1;
    const r = ctx.rng;
    const aim = ctx.monster.position.clone().add(new THREE.Vector3((r() - 0.5) * 200, (250 + r() * 250) * CONFIG.monster.scale, (r() - 0.5) * 200));
    ctx.fireCannon(from, aim, M.rocketDamage);
    ctx.particles.vent('muzzleFlash', from, _dir.x, _dir.y, _dir.z, 160, M.cannonFlash);
    ctx.particles.emit('spark', from, M.cannonSparks, 0.8);
    ctx.particles.vent('ventSmoke', this.rig.breech(barrel, _p), -_dir.x, -_dir.y, -_dir.z, M.cannonSmokeSpeed, M.cannonSmoke);
  }

  /** Paints barrageCount strike circles around the monster (one on it); a missile for each leaves the launcher in turn. */
  private barrage(ctx: WorldContext): void {
    const m = ctx.monster.position;
    strikePoints(m, M.barrageCount, M.barrageSpread, ctx.rng).forEach((at, k) => {
      if (this.strikes.length >= MAX_STRIKES) return;
      this.strikes.push({ at, t: 0, tube: k % MECH_TUBES.length, launchAt: M.barrageFill + k * LAUNCH_GAP, flight: 0, from: new THREE.Vector3(), fx: 0, fz: 1, launched: false, trailT: 0 });
    });
  }

  /**
   * Fills the barrage circles; once a circle is full its missile leaves level out of the launcher's front and sweeps round and down onto
   * it at barrageMissileSpeed, hitting the monster on landing if it is still inside.
   */
  private updateStrikes(dt: number, ctx: WorldContext): void {
    if (this.strikes.length === 0) return;
    const m = ctx.monster.position;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]!;
      s.t += dt;
      if (s.t < s.launchAt) continue;
      if (!s.launched) {
        // It leaves its tube with a flash and a puff of smoke.
        s.launched = true;
        this.rig.tube(s.tube, s.from);
        s.fx = Math.sin(this.heading);
        s.fz = Math.cos(this.heading);
        s.flight = Math.hypot(s.at.x - s.from.x, s.at.z - s.from.z) / M.barrageMissileSpeed;
        ctx.particles.emit('fire', s.from, 3, 0.4);
        ctx.particles.emit('smoke', s.from, 4, 0.8);
      }
      const k = missileK(s);
      s.trailT += dt;
      if (s.trailT >= TRAIL_EVERY && k < 1) {
        s.trailT = 0;
        ctx.particles.emit('trail', this.missilePos(s, k), 1, 0.05);
      }
      if (k < 1) continue;
      _p.set(s.at.x, 10, s.at.z);
      ctx.particles.explosion(_p, 1.4);
      ctx.particles.ring('dust', _p.setY(0), M.barrageRadius, 10);
      ctx.shake(0.2);
      if (strikeHits(m, s.at, M.barrageRadius)) ctx.damageMonster(M.barrageDamage, 'artillery', this.body ?? undefined);
      this.strikes.splice(i, 1);
    }
    this.drawStrikes();
  }

  /**
   * Dying: sparks and small blasts at random points on the body for dyingTime while the visor flickers out, then a
   * final blast: bursts across the whole body and a dust cloud that swallows it. The meshes go wreckVanish s later, while
   * the cloud is at its thickest, so nothing is seen to pop out. False once removed.
   */
  private die(dt: number, ctx: WorldContext): boolean {
    const r = ctx.rng;
    if (this.wreckT === null) {
      this.dyingT += dt;
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = SPARK_EVERY;
        this.bodyPoint(r, _p);
        ctx.particles.emit('spark', _p, 6, 0.8);
        if (r() < 0.3) {
          ctx.particles.explosion(_p, 0.7);
          ctx.shake(0.08);
        }
      }
      if (this.dyingT < M.dyingTime) return true;
      this.blast(ctx);
      this.wreckT = 0;
      return true;
    }
    this.wreckT += dt;
    if (this.wreckT < M.wreckVanish) return true;
    this.body = null;
    this.root.visible = false;
    return false;
  }

  /** The final explosion: bursts across the body, a heavy shake, a billowing ground ring, and a cloud over all of it. */
  private blast(ctx: WorldContext): void {
    const r = ctx.rng;
    for (let k = 0; k < M.wreckBursts; k++) ctx.particles.explosion(this.bodyPoint(r, _p, 0.6), M.wreckBurstScale);
    ctx.particles.ring('wreckBillow', _p.set(this.x, 0, this.z), H * 0.6, M.wreckRing);
    ctx.shake(M.wreckShake);
    for (let k = 0; k < M.wreckVeils; k++) ctx.particles.emit('wreckVeil', this.cloudPoint(r, _p), 1, 0.5);
    for (let k = 0; k < M.wreckBillows; k++) ctx.particles.emit('wreckBillow', this.cloudPoint(r, _p), 1, 0.5);
  }

  /** A random point in the cloud over the wreck (world m): across its legs' span, from the ground to its collapsed height. */
  private cloudPoint(r: () => number, out: THREE.Vector3): THREE.Vector3 {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * M.width * 0.6;
    return out.set(this.x + Math.cos(a) * d, H * 0.5 * r(), this.z + Math.sin(a) * d);
  }

  /** A random point on the body (world m): within `reach` of its width of the centre, between belly and launcher top. */
  private bodyPoint(r: () => number, out: THREE.Vector3, reach = 0.3): THREE.Vector3 {
    const a = r() * Math.PI * 2;
    const d = r() * M.width * reach;
    return out.set(this.x + Math.cos(a) * d, H * (0.45 + r() * 0.45), this.z + Math.sin(a) * d);
  }

  private draw(dt = 1): void {
    const b = this.body;
    if (!b) return;
    const s = _poseIn;
    s.stride = this.stride;
    s.gait = this.gait;
    s.action = this.action;
    s.actT = this.actT;
    s.dashing = this.dashing;
    s.stabLeg = this.stabLeg;
    s.evadeSide = this.evadeSide;
    s.alive = b.alive;
    s.dying = Math.min(1, this.dyingT / M.dyingTime);
    s.wrecked = this.wreckT !== null;
    s.recoil = this.recoil;
    dampPose(this.pose, targetPose(s, _target), b.alive ? POSE_RATE : FALL_RATE, dt);
    // The barrels' kick is instant; only the body's jolt eases in with the pose.
    this.pose.recoil = this.recoil;
    this.rig.apply(this.pose);
    // Killed in mid-air, it falls back to the ground.
    if (!b.alive) this.hopY = damp(this.hopY, 0, FALL_RATE, dt);
    this.root.position.set(this.x, this.hopY, this.z);
    this.root.rotation.y = this.heading;
    const w = this.wreckT;
    b.position.set(this.x, H * 0.6, this.z);
    this.rig.setFlash(this.flashT > 0);
    this.rig.setVisor(this.visorState());
    this.rig.setGlow(w === null);
  }

  /** Bright while it winds up a telegraphed move; flickering out as it dies; dark on the wreck. */
  private visorState(): VisorState {
    if (this.wreckT !== null) return 'off';
    if (!this.body?.alive) {
      const r = this.ctx?.rng ?? Math.random;
      return r() < 1 - this.dyingT / M.dyingTime ? 'dim' : 'off';
    }
    const a = this.action;
    if ((a === 'punch' || a === 'slam' || a === 'dash' || a === 'hopback') && movePhase(a, this.actT) === 'windup') return 'bright';
    if (a === 'laser' && laserPhase(this.actT) !== 'recover') return 'bright';
    return 'dim';
  }

  /** Where a strike's missile is, `k` (0..1) through its flight from the tube to the circle. */
  private missilePos(s: Strike, k: number): THREE.Vector3 {
    return launchArc(s.from, s.fx, s.fz, _land.set(s.at.x, 0, s.at.z), M.barrageRunOut, M.barrageRise, M.barrageBack, k, _p);
  }

  private drawStrikes(): void {
    let missiles = 0;
    for (const s of this.strikes) {
      if (!s.launched) continue;
      const k = missileK(s);
      _ahead.copy(this.missilePos(s, Math.min(1, k + MISSILE_LOOK)));
      const at = this.missilePos(s, k === 1 ? 1 - MISSILE_LOOK : k);
      _dir.subVectors(_ahead, at).normalize();
      _q.setFromUnitVectors(FORWARD, _dir);
      _m.compose(at, _q, _s.setScalar(MISSILE_LENGTH));
      this.missileMesh.setMatrixAt(missiles++, _m);
    }
    this.missileMesh.count = missiles;
    this.missileMesh.instanceMatrix.needsUpdate = true;
    this.strikes.forEach((s, i) => {
      _m.compose(_p.set(s.at.x, 3, s.at.z), _q.identity(), _s.setScalar(M.barrageRadius));
      this.ringMesh.setMatrixAt(i, _m);
      const f = Math.max(0.02, strikeFill(s.t, M.barrageFill));
      _m.compose(_p.set(s.at.x, 2.5, s.at.z), _q.identity(), _s.set(M.barrageRadius * f, 1, M.barrageRadius * f));
      this.fillMesh.setMatrixAt(i, _m);
    });
    this.ringMesh.count = this.fillMesh.count = this.strikes.length;
    for (const m of [this.ringMesh, this.fillMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
