import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import { angleDelta, damp, type Vec2 } from '../util/math';
import { strikeFill, strikeHits, strikePoints } from './artilleryMath';
import { chooseAction, movePhase, punchHits, slamHits, type MechAction, type MechMind, type MechMove } from './mechMath';
import { MECH_PIVOTS as PV, mechParts } from './mechModel';
import type { EnemySystem, WorldContext } from './types';

const M = CONFIG.mech;
const H = M.height;
const MAX_STRIKES = 16;
/** Ground covered per step (one footfall), in model units, and the legs' swing either way at full stride (rad). */
const STEP = 0.4;
const LEG_SWING = 0.45;
/** Seconds between sparks while it dies, and how snappily the pose follows its target (1/s). */
const SPARK_EVERY = 0.12;
const POSE_RATE = 22;
/** The incoming barrage missiles show as a falling trail for the last this-many seconds of each circle's fill, from this high (m). */
const DROP_TIME = 0.5;
const DROP_FROM = 1100;
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
/** Scratch ground points (a foot, the mech's own spot) and the brain's input, reused every frame. */
const _foot: Vec2 = { x: 0, z: 0 };
const _here: Vec2 = { x: 0, z: 0 };
const _mind: MechMind = { dist: 0, contact: 0, engaged: false, meleeCd: 0, dashCd: 0, rocketCd: 0, barrageCd: 0, roll: 0 };
/** Left (+1) and right (−1). */
const SIDES = [1, -1] as const;

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

/** A barrage circle at `at`, painted `t` s ago. */
type Strike = { at: Vec2; t: number };

/** Joint angles and offsets the meshes are drawn with; each frame eases toward a target pose. */
type Pose = { legL: number; legR: number; armL: number; armR: number; torso: number; crouch: number };
const POSE_KEYS: readonly (keyof Pose)[] = ['legL', 'legR', 'armL', 'armR', 'torso', 'crouch'];
const restPose = (out: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, torso: 0, crouch: 0 }): Pose => {
  for (const k of POSE_KEYS) out[k] = 0;
  return out;
};
/** Scratch target pose, rebuilt every draw. */
const _target = restPose();

/**
 * The boss mech: one giant bipedal walker, summoned by the cycle (never by the spawn director). It walks in toward the
 * monster, crushing buildings underfoot, and fights it with telegraphed punches and ground slams, a gap-closing dash
 * once it has engaged, jet rocket volleys from its shoulder pods and an occasional barrage of marked strike circles.
 * Dead, it sparks and flickers, blows apart, collapses and sinks. Drawn as a small group of meshes (legs, pelvis,
 * torso, head, visor, arms) posed at their pivots, the body on one vertex-coloured toon material.
 */
export class Mech implements EnemySystem {
  readonly kind = 'mech' as const;
  private body: MechBody | null = null;
  private ctx: WorldContext | null = null;
  private x = 0;
  private z = 0;
  private heading = 0;
  /** It has been within dashTrigger of the monster at least once. */
  private engaged = false;
  private action: MechAction = 'walk';
  private actT = 0;
  /** The current move's one-off effect (the hit check, the barrage, the dash start) has happened. */
  private struck = false;
  private rocketsFired = 0;
  /** Mid-dash: moving to its stopping point, the move's clock held at the end of the wind-up. */
  private dashing = false;
  /** Which arm the next punch uses (+1 left, −1 right); it alternates. */
  private punchArm = 1;
  private meleeCd = 0;
  private dashCd = 0;
  private rocketCd = 0;
  private barrageCd = 0;
  /** Stride phase (rad; one footfall each π) and how far into its stride it is (0 standing .. 1 walking). */
  private stride = 0;
  private gait = 0;
  private flashT = 0;
  /** Seconds since it died (sparking), and since it blew apart (the wreck); the wreck starts at null. */
  private dyingT = 0;
  private sparkT = 0;
  private wreckT: number | null = null;
  private strikes: Strike[] = [];
  private pose = restPose();
  private readonly root = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly parts: Record<'legL' | 'legR' | 'pelvis' | 'torso' | 'head' | 'visor' | 'armL' | 'armR', THREE.Mesh>;
  private readonly bodyMat = toonMat(0xffffff, { vertexColors: true });
  private readonly flashMat = toonMat(CONFIG.palette.mechFlash, { vertexColors: true });
  private readonly visorDim = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechVisor });
  private readonly visorBright = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechVisorBright });
  private readonly visorOff = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechDark });
  private flashing = false;
  private ringMesh: THREE.InstancedMesh;
  private fillMesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const g = mechParts();
    const mk = (geo: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, mat: THREE.Material = this.bodyMat) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      parent.add(mesh);
      if (mat === this.bodyMat) this.meshes.push(mesh);
      return mesh;
    };
    const legL = mk(g.legL, this.root, PV.hipX, PV.hipY);
    const legR = mk(g.legR, this.root, -PV.hipX, PV.hipY);
    this.root.add(this.upper);
    const pelvis = mk(g.pelvis, this.upper, 0, PV.hipY);
    const torso = mk(g.torso, this.upper, 0, PV.waistY);
    const head = mk(g.head, torso, 0, PV.neckY - PV.waistY);
    const visor = mk(g.visor, head, 0, 0, this.visorDim);
    const armL = mk(g.armL, torso, PV.shoulderX, PV.shoulderY - PV.waistY);
    const armR = mk(g.armR, torso, -PV.shoulderX, PV.shoulderY - PV.waistY);
    this.parts = { legL, legR, pelvis, torso, head, visor, armL, armR };
    // Yaw about the world vertical, then tip about its own left-right axis when the wreck falls.
    this.root.rotation.order = 'YXZ';
    this.root.scale.setScalar(H);
    this.root.visible = false;
    scene.add(this.root);
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
  }

  targets(): readonly Target[] {
    return this.body?.alive ? [this.body] : [];
  }

  /** 1 from its summoning until the wreck has sunk. */
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

  clear(): void {
    // A cleared mech is gone for good: hits through an old reference do nothing.
    if (this.body) this.body.alive = false;
    this.body = null;
    this.strikes = [];
    this.root.visible = false;
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
    this.action = 'walk';
    this.actT = 0;
    this.dashing = false;
    this.meleeCd = this.dashCd = 0;
    this.rocketCd = M.rocketCooldown;
    this.barrageCd = M.barrageCooldown * 0.5;
    this.stride = this.gait = this.flashT = 0;
    this.dyingT = this.sparkT = 0;
    this.wreckT = null;
    restPose(this.pose);
    this.root.visible = true;
    this.root.rotation.x = 0;
    this.draw();
  }

  private damage = (b: MechBody, amount: number): void => {
    if (b !== this.body || !b.alive) return;
    b.hp -= amount;
    this.flashT = 0.1;
    if (b.hp > 0) return;
    b.alive = false;
    // Its painted barrage dies with it.
    this.strikes = [];
    this.drawStrikes();
    this.ctx?.onDestroyed(b, 0);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    this.updateStrikes(dt, ctx);
    const b = this.body;
    if (!b) return;
    this.flashT = Math.max(0, this.flashT - dt);
    if (b.alive) this.think(dt, ctx);
    else if (!this.die(dt, ctx)) return;
    this.draw(dt);
  }

  private think(dt: number, ctx: WorldContext): void {
    const m = ctx.monster.position;
    const dist = Math.hypot(m.x - this.x, m.z - this.z);
    const aim = Math.atan2(m.x - this.x, m.z - this.z);
    // Where the walk and the dash stop: stopGap between the two bodies' surfaces.
    const stand = M.radius + ctx.monster.bodyRadius + M.stopGap;
    if (!this.engaged && dist <= M.dashTrigger) this.engaged = true;
    this.meleeCd -= dt;
    this.dashCd -= dt;
    this.rocketCd -= dt;
    // The barrage waits until it has come into the fight, so it never fires from beyond the fog.
    if (this.engaged) this.barrageCd -= dt;
    if (this.action === 'walk' && ctx.monster.alive) {
      const mind = _mind;
      mind.dist = dist;
      mind.contact = M.radius + ctx.monster.bodyRadius;
      mind.engaged = this.engaged;
      mind.meleeCd = this.meleeCd;
      mind.dashCd = this.dashCd;
      mind.rocketCd = this.rocketCd;
      mind.barrageCd = this.barrageCd;
      mind.roll = ctx.rng();
      const next = chooseAction(mind);
      if (next !== 'walk') this.start(next);
    }
    this.gait = damp(this.gait, this.action === 'walk' && dist > stand + 1 ? 1 : 0, 6, dt);
    if (this.action === 'walk') this.walk(dt, ctx, dist, aim, stand);
    else this.act(this.action, dt, ctx, aim);
  }

  private start(a: MechMove): void {
    this.action = a;
    this.actT = 0;
    this.struck = false;
    this.rocketsFired = 0;
    this.dashing = false;
    if (a === 'punch') this.punchArm = -this.punchArm;
  }

  /** Turns toward the monster and strides straight ahead until `stand` m from it (centre to centre), crushing what is underfoot. */
  private walk(dt: number, ctx: WorldContext, dist: number, aim: number, stand: number): void {
    this.heading = turn(this.heading, aim, M.turnRate * dt);
    if (!ctx.monster.alive || dist <= stand) return;
    const step = Math.min((this.engaged ? M.walkSpeed : M.approachSpeed) * dt, dist - stand);
    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;
    const before = Math.floor(this.stride / Math.PI + 0.5);
    this.stride += (Math.PI * step) / (STEP * H);
    for (const side of SIDES) ctx.damageBuildings(this.foot(side, _foot), M.crushRadius, M.crushDps * dt);
    if (Math.floor(this.stride / Math.PI + 0.5) === before) return;
    // A footfall: the leg swung furthest forward plants.
    const foot = this.foot(Math.sin(this.stride) > 0 ? 1 : -1, _foot);
    ctx.particles.ring('dust', _p.set(foot.x, 0, foot.z), M.crushRadius, 8);
    ctx.shake(M.footfallShake * Math.max(0.25, 1 - dist / CONFIG.fog.far));
  }

  /** Where a foot (+1 left, −1 right) is on the ground, with the stride's forward swing; written into `out`. */
  private foot(side: number, out: Vec2): Vec2 {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const across = side * PV.hipX * H;
    const fwd = side * Math.sin(this.stride) * LEG_SWING * this.gait * PV.hipY * H;
    // The model's left (+X) is (cos h, −sin h) on the ground.
    out.x = this.x + c * across + s * fwd;
    out.z = this.z - s * across + c * fwd;
    return out;
  }

  private act(a: MechMove, dt: number, ctx: WorldContext, aim: number): void {
    const mv = M.moves[a];
    if (a === 'dash' && this.dashing) {
      this.dash(dt, ctx, M.radius + ctx.monster.bodyRadius + M.stopGap);
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
      } else if (a === 'barrage') {
        this.barrage(ctx);
      } else if (a === 'dash') {
        this.dashing = true;
        this.actT = mv.windup;
        return;
      }
    }
    if (a === 'rockets' && fired) {
      // The volley's rockets go out evenly through the strike.
      const due = Math.min(M.rocketsPerVolley, Math.floor(((this.actT - mv.windup) / Math.max(mv.strike, 1e-6)) * M.rocketsPerVolley) + 1);
      while (this.rocketsFired < due) this.rocket(ctx, this.rocketsFired++ % 2 ? -1 : 1);
    }
    if (movePhase(a, this.actT) !== 'done') return;
    if (a === 'punch' || a === 'slam') this.meleeCd = M.meleeCooldown;
    else if (a === 'dash') this.dashCd = M.dashCooldown;
    else if (a === 'rockets') this.rocketCd = M.rocketCooldown;
    else this.barrageCd = M.barrageCooldown;
    this.action = 'walk';
  }

  /** Charges at dashSpeed until `stand` m from the monster (centre to centre), flattening buildings on the way, then recovers. */
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
    ctx.damageBuildings(_here, M.crushRadius, M.crushDps * dt);
    ctx.particles.emit('dust', _p.set(this.x, 0, this.z), 2, 1.5);
    if (left - step > 1) return;
    this.dashing = false;
    const mv = M.moves.dash;
    this.actT = mv.windup + mv.strike;
    ctx.particles.ring('dust', _p.set(this.x, 0, this.z), M.crushRadius * 1.5, 16);
    ctx.shake(0.2);
  }

  /** A pod's launch face in world space (+1 left pod, −1 right). */
  private pod(side: number, out: THREE.Vector3): THREE.Vector3 {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const lx = side * PV.podX * H;
    const lz = PV.podZ * H;
    return out.set(this.x + c * lx + s * lz, (PV.waistY + PV.podY) * H - this.pose.crouch * PV.hipY * H, this.z - s * lx + c * lz);
  }

  /** One jet rocket from a pod at the monster's upper body, with a little scatter. */
  private rocket(ctx: WorldContext, side: number): void {
    const from = this.pod(side, new THREE.Vector3());
    const r = ctx.rng;
    const aim = ctx.monster.position.clone().add(new THREE.Vector3((r() - 0.5) * 200, (250 + r() * 250) * CONFIG.monster.scale, (r() - 0.5) * 200));
    ctx.fireRocket(from, aim, M.rocketDamage);
    ctx.particles.emit('fire', from, 3, 0.4);
    ctx.particles.emit('smoke', from, 3, 0.6);
  }

  /** Paints barrageCount strike circles around the monster (one on it), launched from both pods. */
  private barrage(ctx: WorldContext): void {
    const m = ctx.monster.position;
    for (const at of strikePoints(m, M.barrageCount, M.barrageSpread, ctx.rng)) {
      if (this.strikes.length < MAX_STRIKES) this.strikes.push({ at, t: 0 });
    }
    for (const side of SIDES) {
      this.pod(side, _p);
      ctx.particles.emit('fire', _p, 6, 0.6);
      ctx.particles.emit('smoke', _p, 8, 1);
    }
  }

  /** Fills the barrage circles; each lands when full and hits the monster if it is still inside. */
  private updateStrikes(dt: number, ctx: WorldContext): void {
    if (this.strikes.length === 0) return;
    const m = ctx.monster.position;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]!;
      s.t += dt;
      const k = (s.t - (M.barrageFill - DROP_TIME)) / DROP_TIME;
      if (k >= 0 && k < 1) ctx.particles.emit('trail', _p.set(s.at.x, (1 - k) * DROP_FROM, s.at.z), 1, 0.05);
      if (s.t < M.barrageFill) continue;
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
   * large multi-burst explosion; the wreck falls flat and sinks over wreckTime and is removed. False once removed.
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
      for (let k = 0; k < 4; k++) ctx.particles.explosion(this.bodyPoint(r, _p), 3);
      ctx.particles.ring('dust', _p.set(this.x, 0, this.z), H * 0.8, 24);
      ctx.shake(0.6);
      this.wreckT = 0;
      return true;
    }
    this.wreckT += dt;
    if (this.wreckT < M.wreckTime) return true;
    this.body = null;
    this.root.visible = false;
    return false;
  }

  /** A random point on the body (world m): within its width, between hip and head height. */
  private bodyPoint(r: () => number, out: THREE.Vector3): THREE.Vector3 {
    const a = r() * Math.PI * 2;
    const d = r() * M.width * 0.4;
    return out.set(this.x + Math.cos(a) * d, H * (PV.hipY + r() * (PV.neckY - PV.hipY)), this.z + Math.sin(a) * d);
  }

  /** The pose this frame's action asks for. */
  private targetPose(): Pose {
    const p = restPose(_target);
    const swing = Math.sin(this.stride) * this.gait;
    p.legL = -swing * LEG_SWING;
    p.legR = swing * LEG_SWING;
    p.armL = swing * 0.25;
    p.armR = -swing * 0.25;
    if (!this.body?.alive) {
      // Slumping as it dies.
      p.torso = 0.3;
      p.crouch = 0.04;
      p.armL = p.armR = 0.2;
      return p;
    }
    const a = this.action;
    if (a === 'walk') return p;
    const mv = M.moves[a];
    const ph = movePhase(a, this.actT);
    const u = Math.min(1, this.actT / mv.windup);
    const back = ph === 'recover' ? 1 - (this.actT - mv.windup - mv.strike) / mv.recover : 1;
    if (a === 'punch') {
      // One arm cocks back, then drives straight forward.
      const arm = ph === 'windup' ? 0.9 * u : -1.5 * back;
      if (this.punchArm > 0) p.armL = arm;
      else p.armR = arm;
      p.torso = ph === 'windup' ? -0.08 * u : 0.15 * back;
    } else if (a === 'slam') {
      // Both arms rise overhead, then hammer down.
      p.armL = p.armR = ph === 'windup' ? -2.8 * u : -0.9 * back;
      p.torso = ph === 'windup' ? -0.15 * u : 0.3 * back;
      p.crouch = ph === 'windup' ? 0 : 0.05 * back;
    } else if (a === 'dash') {
      // The tell: it crouches (the pelvis drops 8%) and leans in; dashing, it leans into the run, arms back.
      p.crouch = this.dashing ? 0.05 : ph === 'windup' ? 0.08 * u : 0.08 * back;
      p.torso = this.dashing ? 0.35 : 0.25 * (ph === 'windup' ? u : back);
      if (this.dashing) p.armL = p.armR = 0.6;
    } else {
      p.torso = (a === 'barrage' ? -0.2 : -0.08) * (ph === 'windup' ? u : back);
    }
    return p;
  }

  private draw(dt = 1): void {
    const b = this.body;
    if (!b) return;
    const t = this.targetPose();
    const pose = this.pose;
    for (const k of POSE_KEYS) pose[k] = damp(pose[k], t[k], POSE_RATE, dt);
    const P = this.parts;
    P.legL.rotation.x = pose.legL;
    P.legR.rotation.x = pose.legR;
    P.armL.rotation.x = pose.armL;
    P.armR.rotation.x = pose.armR;
    P.torso.rotation.x = pose.torso;
    this.upper.position.y = -pose.crouch * PV.hipY;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    const w = this.wreckT;
    if (w !== null) {
      // Topples onto its face over the first second, then sinks.
      const fall = Math.min(1, w);
      this.root.rotation.x = fall * fall * Math.PI * 0.48;
      this.root.position.y = -(w / M.wreckTime) * 0.4 * H;
    }
    b.position.set(this.x, H * 0.68, this.z);
    // The hit flash swaps in a pre-tinted material.
    const flashing = this.flashT > 0;
    if (flashing !== this.flashing) {
      this.flashing = flashing;
      for (const m of this.meshes) m.material = flashing ? this.flashMat : this.bodyMat;
    }
    P.visor.material = this.visorMaterial();
  }

  /** Bright while it winds up a telegraphed move; flickering out as it dies; dark on the wreck. */
  private visorMaterial(): THREE.Material {
    if (this.wreckT !== null) return this.visorOff;
    if (!this.body?.alive) {
      const r = this.ctx?.rng ?? Math.random;
      return r() < 1 - this.dyingT / M.dyingTime ? this.visorDim : this.visorOff;
    }
    const a = this.action;
    if ((a === 'punch' || a === 'slam' || a === 'dash') && movePhase(a, this.actT) === 'windup') return this.visorBright;
    return this.visorDim;
  }

  private drawStrikes(): void {
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
