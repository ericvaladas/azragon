import * as THREE from 'three';
import { CONFIG } from '../config';
import { toonMat } from '../render/toon';
import { damp } from '../util/math';
import { movePhase, type MechAction } from './mechMath';
import { LEG_REACH, LOWER_LEN, MECH_LEGS, MECH_PIVOTS as PV, MECH_TUBES, UPPER_LEN, mechParts } from './mechModel';

/** Ground covered per footfall (model units). A planted foot slides back half of it either side of its rest spot. */
export const STEP = 0.25;
const HALF_STEP = STEP / 2;
/** How high a swinging foot lifts, and how far the hull bobs, at full stride (model units). */
const LIFT = 0.07;
const BOB = 0.012;
/** Mid-dash the legs gallop at this multiple of a full walking stride. */
const GALLOP = 1.4;
/** The hull pitches and rolls about the line through the rear hips, so the rear feet stay put as it rears up. */
const REAR_Z = MECH_LEGS[2]!.z;
/** How far the cannons slide back at full recoil (model units). */
const RECOIL = 0.05;
/** The leg's upper and lower segments' rest angles in its plane (rad up from straight out). */
const UPPER_REST = Math.atan2(PV.kneeY, PV.kneeZ);
const LOWER_REST = Math.atan2(PV.footY, PV.footZ);
const MIN_REACH = Math.abs(LOWER_LEN - UPPER_LEN) + 1e-3;
const MAX_REACH = UPPER_LEN + LOWER_LEN - 1e-3;

/**
 * Where the mech's body and feet are, in model units in the mech's own frame (1 tall, facing +Z, +X its left): the hull
 * raised by `lift`, pitched (nose down positive) and rolled (left side up positive) about the rear hip line, slid
 * forward by `shift`; the cannons' recoil (0..1); and the four feet (x, y, z each, in MECH_LEGS order).
 */
export type MechPose = { lift: number; pitch: number; roll: number; shift: number; recoil: number; feet: number[] };
const SCALARS = ['lift', 'pitch', 'roll', 'shift', 'recoil'] as const;

export function restPose(out: MechPose = { lift: 0, pitch: 0, roll: 0, shift: 0, recoil: 0, feet: new Array<number>(12).fill(0) }): MechPose {
  for (const k of SCALARS) out[k] = 0;
  MECH_LEGS.forEach((leg, i) => setFoot(out, i, leg.x + Math.sin(leg.splay) * LEG_REACH, 0, leg.z + Math.cos(leg.splay) * LEG_REACH));
  return out;
}

/** Eases every value of `pose` toward `target` at `rate` (1/s). */
export function dampPose(pose: MechPose, target: MechPose, rate: number, dt: number): void {
  for (const k of SCALARS) pose[k] = damp(pose[k], target[k], rate, dt);
  for (let i = 0; i < 12; i++) pose.feet[i] = damp(pose.feet[i]!, target.feet[i]!, rate, dt);
}

function setFoot(p: MechPose, i: number, x: number, y: number, z: number): void {
  p.feet[i * 3] = x;
  p.feet[i * 3 + 1] = y;
  p.feet[i * 3 + 2] = z;
}

/** Leg `i`'s hip in the mech's frame under the pose's hull lift, pitch, roll and shift; written into `out`. */
export function hipOf(i: number, p: MechPose, out: THREE.Vector3): THREE.Vector3 {
  const leg = MECH_LEGS[i]!;
  // Roll about Z, then pitch about X (three.js's XYZ Euler order), about the rear hip line.
  const x1 = leg.x * Math.cos(p.roll);
  const y1 = leg.x * Math.sin(p.roll);
  const z = leg.z - REAR_Z;
  return out.set(x1, PV.bodyY + p.lift + y1 * Math.cos(p.pitch) - z * Math.sin(p.pitch), REAR_Z + p.shift + y1 * Math.sin(p.pitch) + z * Math.cos(p.pitch));
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
  alive: boolean;
  /** 0 .. 1 through the sparking before it blows apart. */
  dying: number;
  wrecked: boolean;
  recoil: number;
};

const _hip = new THREE.Vector3();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
 * The pose the mech's state asks for, written into `out`. Walking, diagonal pairs step together (front-left with
 * rear-right) and the hull bobs as each pair plants. The stab rocks the hull back and draws one front blade up and
 * back, then spikes it forward; the stomp pitches the hull up with both front blades lifted, then crashes them down; the dash crouches low on all four
 * legs, then gallops. Dying it sags; wrecked, its legs splay flat and the hull drops.
 */
export function targetPose(s: MechPoseInput, out: MechPose): MechPose {
  restPose(out);
  out.recoil = s.recoil;
  const amp = s.dashing ? GALLOP : s.gait;
  for (let i = 0; i < 4; i++) {
    const ph = s.stride + (i === 1 || i === 2 ? Math.PI : 0);
    nudge(out, i, 0, Math.max(0, Math.cos(ph)) * LIFT * amp, Math.sin(ph) * HALF_STEP * amp);
  }
  out.lift = BOB * amp * Math.cos(2 * s.stride);
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
  const mv = CONFIG.mech.moves[a];
  const ph = movePhase(a, s.actT);
  const u = ease(Math.min(1, s.actT / mv.windup));
  const back = ph === 'recover' ? 1 - (s.actT - mv.windup - mv.strike) / mv.recover : ph === 'done' ? 0 : 1;
  if (a === 'punch') {
    const i = s.stabLeg;
    const side = MECH_LEGS[i]!.x > 0 ? 1 : -1;
    if (ph === 'windup') {
      // Rears back on its haunches, the blade drawn up and back, the knee kept low and out.
      out.pitch = -0.14 * u;
      out.lift = 0.03 * u;
      out.shift = -0.03 * u;
      moveFoot(out, i, 0.06, 0.18, -0.14, u);
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
      out.pitch = -0.32 * u;
      out.lift = 0.04 * u;
      moveFoot(out, 0, 0.04, 0.24, -0.06, u);
      moveFoot(out, 1, 0.04, 0.24, -0.06, u);
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
  } else {
    // Ranged moves rock back a little to fire.
    out.pitch = (a === 'barrage' ? -0.08 : -0.03) * (ph === 'windup' ? u : back);
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
    // Yaw about the world vertical, then tip about its own left-right axis as the wreck settles.
    this.root.rotation.order = 'YXZ';
  }

  apply(p: MechPose): void {
    this.pivot.position.set(0, PV.bodyY + p.lift, REAR_Z + p.shift);
    this.pivot.rotation.set(p.pitch, 0, p.roll);
    this.cannons.position.z = -p.recoil * RECOIL;
    for (let i = 0; i < 4; i++) {
      hipOf(i, p, _hip);
      const a = solveLeg(_hip, p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!, MECH_LEGS[i]!.splay, _angles);
      this.mounts[i]!.position.copy(_hip);
      this.mounts[i]!.rotation.y = a.yaw;
      this.uppers[i]!.rotation.x = a.upper;
      this.lowers[i]!.rotation.x = a.knee;
    }
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

  /** Launcher tube `k`'s mouth (MECH_TUBES order) in world space; written into `out`. */
  tube(k: number, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const t = MECH_TUBES[k]!;
    return out.set(t.x, t.y, t.z).applyMatrix4(this.body.matrixWorld);
  }
}
