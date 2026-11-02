import * as THREE from 'three';
import { CONFIG } from '../config';
import { toonMat } from '../render/toon';
import { damp } from '../util/math';
import { laserPhase, movePhase, type MechAction } from './mechMath';
import { CRAWL_ORDER, LEG_REACH, LOWER_LEN, MECH_LEGS, MECH_PIVOTS as PV, MECH_TUBES, UPPER_LEN, mechParts } from './mechModel';

const M = CONFIG.mech;
const TAU = Math.PI * 2;
/** The hull pitches and rolls about the line through the rear hips, so the rear feet stay put as it rears up. */
const REAR_Z = MECH_LEGS[2]!.z;
/** The leg's upper and lower segments' rest angles in its plane (rad up from straight out). */
const UPPER_REST = Math.atan2(PV.kneeY, PV.kneeZ);
const LOWER_REST = Math.atan2(PV.footY, PV.footZ);
const MIN_REACH = Math.abs(LOWER_LEN - UPPER_LEN) + 1e-3;
export const MAX_REACH = UPPER_LEN + LOWER_LEN - 1e-3;

/**
 * Where the mech's body and feet are, in model units in the mech's own frame (1 tall, facing +Z, +X its left): the hull
 * raised by `lift`, pitched (nose down positive) and rolled (left side up positive) about the rear hip line, slid
 * forward by `shift` and to its left by `sway`; the cannons' recoil (0..1); and the four feet (x, y, z each, in MECH_LEGS order).
 */
export type MechPose = { lift: number; pitch: number; roll: number; shift: number; sway: number; recoil: number; feet: number[] };
const SCALARS = ['lift', 'pitch', 'roll', 'shift', 'sway', 'recoil'] as const;

export function restPose(out: MechPose = { lift: 0, pitch: 0, roll: 0, shift: 0, sway: 0, recoil: 0, feet: new Array<number>(12).fill(0) }): MechPose {
  for (const k of SCALARS) out[k] = 0;
  MECH_LEGS.forEach((leg, i) => setFoot(out, i, leg.x + Math.sin(leg.splay) * LEG_REACH, 0, leg.z + Math.cos(leg.splay) * LEG_REACH));
  return out;
}

/** Eases every value of `pose` toward `target` at `rate` (1/s). */
export function dampPose(pose: MechPose, target: MechPose, rate: number, dt: number): void {
  for (const k of SCALARS) pose[k] = damp(pose[k], target[k], rate, dt);
  for (let i = 0; i < 12; i++) pose.feet[i] = damp(pose.feet[i]!, target.feet[i]!, rate, dt);
}

/** Copies every value of `from` into `to`. */
export function copyPose(from: MechPose, to: MechPose): void {
  for (const k of SCALARS) to[k] = from[k];
  for (let i = 0; i < 12; i++) to.feet[i] = from.feet[i]!;
}

function setFoot(p: MechPose, i: number, x: number, y: number, z: number): void {
  p.feet[i * 3] = x;
  p.feet[i * 3 + 1] = y;
  p.feet[i * 3 + 2] = z;
}

/** Leg `i`'s hip in the mech's frame under the pose's hull lift, pitch, roll, shift and sway; written into `out`. */
export function hipOf(i: number, p: MechPose, out: THREE.Vector3): THREE.Vector3 {
  const leg = MECH_LEGS[i]!;
  // Roll about Z, then pitch about X (three.js's XYZ Euler order), about the rear hip line.
  const x1 = leg.x * Math.cos(p.roll);
  const y1 = leg.x * Math.sin(p.roll);
  const z = leg.z - REAR_Z;
  return out.set(x1 + p.sway, PV.bodyY + p.lift + y1 * Math.cos(p.pitch) - z * Math.sin(p.pitch), REAR_Z + p.shift + y1 * Math.sin(p.pitch) + z * Math.cos(p.pitch));
}

/** A leg's joint angles: its yaw about +Y, then the upper segment's and the knee's turns about the leg's X axis. */
export type LegAngles = { yaw: number; upper: number; knee: number };

/**
 * Two-bone IK in the leg's vertical plane: the yaw that turns the plane toward the foot, then the upper and knee turns
 * (from the rest bend) that put the spike on the foot, knee up, like a spider. A foot out of reach is reached toward.
 */
export function solveLeg(hip: THREE.Vector3, fx: number, fy: number, fz: number, splay: number, out: LegAngles): LegAngles {
  const dx = fx - hip.x;
  const dz = fz - hip.z;
  const u = Math.hypot(dx, dz);
  const v = fy - hip.y;
  out.yaw = u > 1e-4 ? Math.atan2(dx, dz) : splay;
  const d = Math.min(MAX_REACH, Math.max(MIN_REACH, Math.hypot(u, v)));
  const phi = Math.atan2(v, u);
  const cosA = (UPPER_LEN * UPPER_LEN + d * d - LOWER_LEN * LOWER_LEN) / (2 * UPPER_LEN * d);
  const a1 = phi + Math.acos(Math.max(-1, Math.min(1, cosA)));
  const a2 = Math.atan2(d * Math.sin(phi) - UPPER_LEN * Math.sin(a1), d * Math.cos(phi) - UPPER_LEN * Math.cos(a1));
  // A turn of θ about the leg's X axis lowers a segment's angle by θ; the lower segment turns with the upper.
  out.upper = UPPER_REST - a1;
  out.knee = LOWER_REST - a2 - out.upper;
  return out;
}

/** What the pose depends on: the stride, the action and its clock, and how far into dying it is. */
export type MechPoseInput = {
  stride: number;
  gait: number;
  action: MechAction;
  actT: number;
  dashing: boolean;
  /** The front leg the stab uses: 0 its left, 1 its right. */
  stabLeg: number;
  /** The side a sidestep goes: 1 its left, −1 its right. */
  evadeSide: number;
  alive: boolean;
  /** 0 .. 1 through the sparking before it blows apart. */
  dying: number;
  wrecked: boolean;
  recoil: number;
};

/** A foot's offset from its rest spot in the mech's frame (model units): `z` forward, `y` up. */
export type FootOffset = { z: number; y: number };

const _hip = new THREE.Vector3();
const _leg: FootOffset = { z: 0, y: 0 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * A foot's path through one crawl cycle, `phase` 0..1 from its plant; written into `out`. Planted, it moves back at
 * gaitStep per cycle, which is the body's speed, so it holds still on the ground. Swinging, it follows a cubic that
 * leaves and rejoins the ground at that same speed, under a sin² lift.
 */
export function gaitFoot(phase: number, out: FootOffset): FootOffset {
  const duty = M.gaitDuty;
  const travel = M.gaitStep * duty;
  if (phase < duty) {
    out.z = travel * (0.5 - phase / duty);
    out.y = 0;
    return out;
  }
  const t = (phase - duty) / (1 - duty);
  const t2 = t * t;
  const t3 = t2 * t;
  // Cubic Hermite from -travel/2 to +travel/2 with the planted foot's velocity at both ends, per unit of t.
  const m = -M.gaitStep * (1 - duty);
  out.z = (travel / 2) * (3 * t2 - 2 * t3 - (2 * t3 - 3 * t2 + 1)) + m * (t3 - 2 * t2 + t + t3 - t2);
  const s = Math.sin(Math.PI * t);
  out.y = M.gaitLift * s * s;
  return out;
}

/** Leg `i`'s phase 0..1 through its cycle at stride angle `stride`; each leg plants a quarter cycle after the last in CRAWL_ORDER. */
export function legPhase(i: number, stride: number): number {
  const p = stride / TAU - CRAWL_ORDER.indexOf(i as (typeof CRAWL_ORDER)[number]) / 4;
  return p - Math.floor(p);
}

/**
 * Leg `i`'s offset from its rest spot at `stride` and blend `gait` (0 standing .. 1 walking); written into `out`. As
 * `gait` moves, each leg blends across its own gaitSettle-wide window in CRAWL_ORDER, lifted in proportion to the
 * ground it has to cover, so a foot on its way to or from rest is off the ground.
 */
export function gaitLeg(i: number, stride: number, gait: number, out: FootOffset): FootOffset {
  gaitFoot(legPhase(i, stride), out);
  const k = CRAWL_ORDER.indexOf(i as (typeof CRAWL_ORDER)[number]);
  const lo = (k * (1 - M.gaitSettle)) / 3;
  const u = Math.max(0, Math.min(1, (gait - lo) / M.gaitSettle));
  const a = u * u * (3 - 2 * u);
  const z = out.z - Math.sign(MECH_LEGS[i]!.z) * M.gaitInset;
  const reach = (M.gaitStep * M.gaitDuty) / 2 + M.gaitInset;
  out.z = a * z;
  out.y = a * out.y + 4 * a * (1 - a) * M.gaitLift * Math.min(1, Math.abs(z) / reach);
  return out;
}

/** Adds the crawl's foot offsets, times `sign`, to the feet of `p`. */
export function addGait(p: MechPose, stride: number, gait: number, sign: number): void {
  for (let i = 0; i < 4; i++) {
    gaitLeg(i, stride, gait, _leg);
    nudge(p, i, 0, _leg.y * sign, _leg.z * sign);
  }
}

/** Moves leg `i`'s foot by (dx, dy, dz). */
function nudge(p: MechPose, i: number, dx: number, dy: number, dz: number): void {
  p.feet[i * 3] = p.feet[i * 3]! + dx;
  p.feet[i * 3 + 1] = p.feet[i * 3 + 1]! + dy;
  p.feet[i * 3 + 2] = p.feet[i * 3 + 2]! + dz;
}

/** Draws leg `i`'s foot `out` further out along its splay, `up` off the ground and `fwd` forward, all scaled by `k`. */
function moveFoot(p: MechPose, i: number, out: number, up: number, fwd: number, k: number): void {
  const splay = MECH_LEGS[i]!.splay;
  nudge(p, i, Math.sin(splay) * out * k, up * k, (Math.cos(splay) * out + fwd) * k);
}

/**
 * The pose the mech's state asks for, written into `out`. Walking, it crawls one leg at a time (see gaitFoot): the hull
 * dips as each foot plants and leans and shifts away from the swinging side. The stab rocks the hull back and draws one front blade up and
 * back, then spikes it forward; the stomp pitches the hull up with both front blades lifted, then crashes them down; the dash crouches low on all
 * four legs, then gallops; the sidestep shuffles the feet across; the hopback crouches, then tucks all four feet in the air; the laser plants low on spread feet. Dying it sags; wrecked, its legs splay flat and the hull drops.
 */
export function targetPose(s: MechPoseInput, out: MechPose): MechPose {
  restPose(out);
  out.recoil = s.recoil;
  addGait(out, s.stride, s.gait, 1);
  // Stride 0 is the middle of the left legs' two swings, and each foot plants on a quarter turn of the stride.
  const side = Math.cos(s.stride);
  out.roll = M.gaitRoll * s.gait * side;
  out.sway = -M.gaitSway * s.gait * side;
  out.lift = -M.gaitBob * s.gait * Math.cos(4 * s.stride);
  if (s.dashing) {
    for (let i = 0; i < 4; i++) {
      const ph = s.stride + (i === 1 || i === 2 ? Math.PI : 0);
      nudge(out, i, 0, Math.max(0, Math.cos(ph)) * M.gallopLift * M.gallopAmp, (Math.sin(ph) * M.gallopStep * M.gallopAmp) / 2);
    }
    out.lift += M.gallopBob * M.gallopAmp * Math.cos(2 * s.stride);
  }
  if (s.wrecked) {
    restPose(out);
    out.lift = -0.3;
    out.pitch = 0.06;
    out.roll = 0.05;
    MECH_LEGS.forEach((leg, i) => {
      const fx = leg.x + Math.sin(leg.splay) * 0.7;
      const fz = leg.z + Math.cos(leg.splay) * 0.7;
      setFoot(out, i, fx, 0, fz);
    });
    return out;
  }
  if (!s.alive) {
    const k = s.dying;
    out.lift = -0.07 * k;
    out.roll = 0.06 * k;
    out.pitch = 0.04 * k;
    MECH_LEGS.forEach((leg, i) => nudge(out, i, Math.sin(leg.splay) * 0.06 * k, 0, Math.cos(leg.splay) * 0.06 * k));
    return out;
  }
  const a = s.action;
  if (a === 'walk') return out;
  if (a === 'laser') {
    // Planted low on spread feet, the hull shuddering while the beam fires.
    const ph = laserPhase(s.actT);
    const fireEnd = M.laserCharge + M.laserAim + M.laserLock + M.laserFire;
    const k = ph === 'recover' || ph === 'done' ? Math.max(0, 1 - (s.actT - fireEnd) / M.laserRecover) : ease(Math.min(1, s.actT / M.laserCharge));
    out.lift = -0.06 * k;
    out.pitch = 0.03 * k + (ph === 'fire' ? 0.008 * Math.sin(s.actT * 45) : 0);
    MECH_LEGS.forEach((_, i) => moveFoot(out, i, 0.04, 0, 0, k));
    return out;
  }
  const mv = CONFIG.mech.moves[a];
  const ph = movePhase(a, s.actT);
  const u = ease(Math.min(1, s.actT / mv.windup));
  const back = ph === 'recover' ? 1 - (s.actT - mv.windup - mv.strike) / mv.recover : ph === 'done' ? 0 : 1;
  if (a === 'punch') {
    const i = s.stabLeg;
    const side = MECH_LEGS[i]!.x > 0 ? 1 : -1;
    if (ph === 'windup') {
      // Rears back on its haunches, the blade drawn up and back, the knee kept low and out.
      out.pitch = -0.26 * u;
      out.lift = 0.03 * u;
      out.shift = -0.03 * u;
      moveFoot(out, i, 0.12, 0.29, -0.14, u);
    } else {
      // Spikes the blade forward and down into the target, leaning in.
      out.pitch = 0.08 * back;
      out.shift = 0.04 * back;
      const j = i * 3;
      const f = out.feet;
      f[j] = f[j]! + (side * 0.13 - f[j]!) * back;
      f[j + 1] = f[j + 1]! + (0.06 - f[j + 1]!) * back;
      f[j + 2] = f[j + 2]! + (0.72 - f[j + 2]!) * back;
    }
  } else if (a === 'slam') {
    if (ph === 'windup') {
      // Rears up on its back legs, the hull pitched high and both front blades lifted, knees low and apart.
      out.pitch = -0.46 * u;
      out.lift = 0.04 * u;
      moveFoot(out, 0, 0.1, 0.35, -0.06, u);
      moveFoot(out, 1, 0.1, 0.35, -0.06, u);
    } else {
      // Crashes down, front feet planted a little ahead.
      out.pitch = 0.06 * back;
      out.lift = -0.05 * back;
      nudge(out, 0, 0, 0, 0.08 * back);
      nudge(out, 1, 0, 0, 0.08 * back);
    }
  } else if (a === 'dash') {
    if (s.dashing) {
      // Lunging: low and leaning in, front legs reaching, rear legs driving.
      out.lift += -0.07;
      out.pitch = 0.1;
      nudge(out, 0, 0, 0, 0.08);
      nudge(out, 1, 0, 0, 0.08);
      nudge(out, 2, 0, 0, -0.06);
      nudge(out, 3, 0, 0, -0.06);
    } else {
      // The tell: a low crouch on all four legs, feet spread.
      const k = ph === 'windup' ? u : back;
      out.lift = -0.13 * k;
      out.pitch = 0.04 * k;
      MECH_LEGS.forEach((leg, i) => nudge(out, i, Math.sin(leg.splay) * 0.04 * k, 0, Math.cos(leg.splay) * 0.04 * k));
    }
  } else if (a === 'sidestep') {
    // A fast sideways shuffle: diagonal pairs swap across the line of travel, the hull leaning into it.
    const k = ph === 'windup' ? u : ph === 'strike' ? 1 : back;
    out.roll = -0.07 * s.evadeSide * k;
    for (let i = 0; i < 4; i++) {
      const legPh = s.stride + (i === 1 || i === 2 ? Math.PI : 0);
      nudge(out, i, (Math.sin(legPh) * M.gallopStep * k * s.evadeSide) / 2, Math.max(0, Math.cos(legPh)) * M.gallopLift * k, 0);
    }
  } else if (a === 'hopback') {
    if (ph === 'windup' || ph === 'recover') {
      // The tell, and the landing's give: a low crouch on all four legs.
      const k = ph === 'windup' ? u : back;
      out.lift = -0.15 * k;
      out.pitch = 0.06 * k;
    } else if (ph === 'strike') {
      // In the air: every foot tucked up and in, the nose raised, out to full extent at the peak and back for the landing.
      const k = Math.sin(Math.PI * Math.min(1, (s.actT - mv.windup) / mv.strike));
      out.pitch = -0.12 * k;
      for (let i = 0; i < 4; i++) moveFoot(out, i, -0.1, 0.2, 0, k);
    }
  } else {
    // Ranged moves rock back a little to fire; each cannon shot jolts the body back further.
    out.pitch = (a === 'barrage' ? -0.08 : -0.03) * (ph === 'windup' ? u : back) - CONFIG.mech.cannonJoltPitch * s.recoil;
    out.shift = -CONFIG.mech.cannonJoltShift * s.recoil;
  }
  return out;
}

/** The visor's look: lit, flared bright (a wind-up), or dark. */
export type VisorState = 'dim' | 'bright' | 'off';

const _angles: LegAngles = { yaw: 0, upper: 0, knee: 0 };

/**
 * The mech's meshes, posed from a MechPose: the body group (hip frame, hull, turret, visor, cannons, glow), pitched and rolled
 * about the rear hip line, and four legs (a yawed mount at each hip, the upper segment, the lower blade at the knee)
 * solved by IK onto their feet. Drawn in model units; the root carries the world position, heading and scale.
 */
export class MechRig {
  readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly cannons: THREE.Mesh;
  private readonly visor: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly mounts: THREE.Object3D[] = [];
  private readonly uppers: THREE.Mesh[] = [];
  private readonly lowers: THREE.Mesh[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly bodyMat = toonMat(0xffffff, { vertexColors: true });
  private readonly flashMat = toonMat(CONFIG.palette.mechFlash, { vertexColors: true });
  private readonly visorDim = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechVisor });
  private readonly visorBright = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechVisorBright });
  private readonly glowOn = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechGlow });
  private readonly dark = new THREE.MeshBasicMaterial({ color: CONFIG.palette.mechDark });
  private flashing = false;

  constructor() {
    const g = mechParts();
    const mk = (geo: THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = this.bodyMat) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      parent.add(mesh);
      if (mat === this.bodyMat) this.meshes.push(mesh);
      return mesh;
    };
    this.root.add(this.pivot);
    this.pivot.add(this.body);
    this.body.position.z = -REAR_Z;
    mk(g.hips, this.body);
    mk(g.hull, this.body);
    mk(g.turret, this.body);
    this.cannons = mk(g.cannons, this.body);
    this.visor = mk(g.visor, this.body, this.visorDim);
    this.glow = mk(g.glow, this.body, this.glowOn);
    for (let i = 0; i < 4; i++) {
      const mount = new THREE.Object3D();
      this.root.add(mount);
      const upper = mk(g.legUpper, mount);
      const lower = mk(g.legLower, upper);
      lower.position.set(0, PV.kneeY, PV.kneeZ);
      this.mounts.push(mount);
      this.uppers.push(upper);
      this.lowers.push(lower);
    }
  }

  apply(p: MechPose): void {
    this.pivot.position.set(p.sway, PV.bodyY + p.lift, REAR_Z + p.shift);
    this.pivot.rotation.set(p.pitch, 0, p.roll);
    this.cannons.position.z = -this.barrelKick(p.recoil);
    for (let i = 0; i < 4; i++) {
      hipOf(i, p, _hip);
      const a = solveLeg(_hip, p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!, MECH_LEGS[i]!.splay, _angles);
      this.mounts[i]!.position.copy(_hip);
      this.mounts[i]!.rotation.y = a.yaw;
      this.uppers[i]!.rotation.x = a.upper;
      this.lowers[i]!.rotation.x = a.knee;
    }
  }

  /** How far back the barrels sit (model units) at recoil `r`: fast off the kick, easing home. */
  private barrelKick(r: number): number {
    return CONFIG.mech.cannonRecoil * r * r;
  }

  /** The hit flash swaps in a pre-tinted material. */
  setFlash(on: boolean): void {
    if (on === this.flashing) return;
    this.flashing = on;
    for (const m of this.meshes) m.material = on ? this.flashMat : this.bodyMat;
  }

  setVisor(v: VisorState): void {
    this.visor.material = v === 'bright' ? this.visorBright : v === 'dim' ? this.visorDim : this.dark;
  }

  setGlow(on: boolean): void {
    this.glow.material = on ? this.glowOn : this.dark;
  }

  /** Muzzle `k` (0 the upper cannon, 1 the lower) in world space; written into `out`. */
  muzzle(k: number, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.set(PV.muzzleX, PV.muzzleY[k]!, PV.muzzleZ + this.cannons.position.z).applyMatrix4(this.body.matrixWorld);
  }

  /** Cannon `k`'s breech (0 the upper cannon, 1 the lower), behind the mount, in world space; written into `out`. */
  breech(k: number, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.set(PV.muzzleX, PV.muzzleY[k]!, PV.breechZ + this.cannons.position.z).applyMatrix4(this.body.matrixWorld);
  }

  /** The unit direction the barrels point in world space; written into `out`. */
  barrelDir(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.set(0, 0, 1).transformDirection(this.body.matrixWorld);
  }

  /** How far back the barrels sit right now (model units). */
  get barrelOffset(): number {
    return -this.cannons.position.z;
  }

  /** The front of the red sensor eye in world space; written into `out`. */
  eye(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.set(PV.eyeX, PV.eyeY, PV.eyeZ).applyMatrix4(this.body.matrixWorld);
  }

  /** Launcher tube `k`'s mouth (MECH_TUBES order) in world space; written into `out`. */
  tube(k: number, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const t = MECH_TUBES[k]!;
    return out.set(t.x, t.y, t.z).applyMatrix4(this.body.matrixWorld);
  }
}
