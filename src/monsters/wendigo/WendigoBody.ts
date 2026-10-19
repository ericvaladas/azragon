import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { backhandSweep, fistKind, lungeAmount, lungeWeight, strikeReturn, strikeStarted, type FistKind } from './fist';
import { merge, piece, rng, SHAPES, type V3 } from './wendigoParts';
import { BECKON_T, beckonLift, beckonPull, beckonResume } from './handMath';
import { SWING, limbPlanted, limbSwing } from './knuckleGait';
import { clampShoulder, reachTwist, softCap, springStep, type ShoulderLimits } from './shoulder';
import { bendAngleAt, bendPoint, outwardBearing, pivotStep, stepToward } from './spine';
import { LEAP_RECOVER, leapPhase, type LeapPose } from './leapPose';
import { HOWL_AFTER, howlPose, type HowlPose } from './howlPose';

const G = CONFIG.wendigo;
const C = G.colors;
/** Model units (before CONFIG.monster.scale). The torso pivots here (just behind the hips). */
const PIVOT = new THREE.Vector3(0, 250, -60);
const UPPER = 250;
const FORE = 260;
const THIGH = 150;
const SHIN = 150;
const FIST_R = 85;
/** Hand size: the fingers' spread and reach about the palm (1 = the original long-fingered hand). */
const HAND = 0.68;
/** Torso-space shoulder and hip on the left (+X); the right mirrors x. */
const SHOULDER = new THREE.Vector3(165, 480, 80);
const HIP = new THREE.Vector3(110, 330, -130);
/** Root-space rest spots (left side) of a planted hand (its palm) and hoof, and how high each lifts mid-swing. */
const FIST_AT = new THREE.Vector3(215, FIST_R, 230);
const FOOT_AT = new THREE.Vector3(150, 0, -130);
/** The hock (heel) of the digitigrade hind leg, relative to its hoof: the leg's IK ends here; the cannon bone runs down to the hoof. */
const HOCK = new THREE.Vector3(0, 130, -45);
const FIST_LIFT = 130;
const FOOT_LIFT = 70;
/**
 * Slam: where the hand rises (left side) before it drops, out wide of the antlers. Backhand: where it cocks across
 * the chest, and its sweep radius.
 */
const SLAM_RAISE = new THREE.Vector3(295, 560, 190);
const BACKHAND_COCK = new THREE.Vector3(-60, 280, 320);
const BACKHAND_R = 450;
const ARM_REACH = UPPER + FORE - 30;
/**
 * A planted (braced) arm may straighten further than a walking one, with its shoulder slid (PROTRACT) toward the
 * hand; a posed arm (striking, slamming, reaching) as far, so a sweep goes through long rather than elbow-up.
 */
const PLANTED_REACH = UPPER + FORE - 10;
const POSED_REACH = UPPER + FORE - 12;
/** The lowest a posed hand's palm goes (its claws reach FIST_R below it): a sweep never drives them into the ground. */
const HAND_FLOOR = FIST_R - 10;
/**
 * Rending Claws lunge: for a target farther than the hand reaches standing (LUNGE_FROM for a slam, BACKHAND_R for a
 * backhand), the torso shifts toward the strike by the shortfall (up to LUNGE_MAX), sinks up to LUNGE_DROP and leans
 * up to LUNGE_LEAN rad, so the hand reaches it.
 */
const LUNGE_FROM = 380;
const LUNGE_MAX = 200;
const LUNGE_DROP = 60;
const LUNGE_LEAN = 0.25;
/**
 * Rending Claws: seconds the hand stays on its target after a slam's impact before it eases home; a backhand's
 * hand carries through for BACKHAND_HOLD instead (on its own, slower timeline, CONFIG.wendigo.fist.backhandTiming).
 */
const STRIKE_HOLD = 0.1;
const BACKHAND_HOLD = 0.14;
/** Withering Ring: seconds for both hands to rise and slam. */
const NOVA_TIME = 0.6;
/**
 * The shoulder's range (torso space, see ShoulderLimits): a level arm stops 15° behind the shoulders' plane (a
 * hanging one a little further), crosses the chest up to 34° and lifts up to 54° above level. Posed arms are held
 * to it; planted ones stay put and the body's reach recruitment softens instead.
 */
const SHOULDER_LIM: ShoulderLimits = { back: 0.26, tilt: 0.45, medial: 0.6, raise: 0.95 };
/**
 * Reach recruitment. The shoulder alone sweeps a hand from SWEEP_LO (across the chest) to SWEEP_HI rad (out and a
 * little back) of horizontal bearing from the shoulder; beyond that the front of the body turns toward the hand, up
 * to TWIST_MAX (so a target dead astern comes round beside the shoulder): the spine bends sideways (SPINE_Z0..Z1)
 * while the hips counter-rotate HIP_COUNTER of the turn. The body rolls the strike shoulder down ROLL_PER_TWIST rad
 * per rad, shifts SHIFT_PER_TWIST units toward that side and crouches CROUCH_PER_TWIST, all eased off past
 * RECRUIT_SOFT rad of turn. The torso reads the strike RECRUIT_LEAD s ahead, so it leads the arm.
 */
const SWEEP_LO = -0.55;
const SWEEP_HI = 1.55;
const TWIST_MAX = 1.5;
const HIP_COUNTER = 0.12;
const SPINE_Z0 = -150;
const SPINE_Z1 = 150;
const ROLL_PER_TWIST = 0.25;
const SHIFT_PER_TWIST = 30;
const CROUCH_PER_TWIST = 50;
const RECRUIT_SOFT = 0.7;
const RECRUIT_LEAD = 0.1;
/** A backhand's longer look-ahead: the slow body starts round before the sweep does. */
const BACKHAND_LEAD = 0.16;
/**
 * Pivot step: when the turn (target) passes STEP_ON rad the planted hand on the far side lifts and re-plants under
 * the turned shoulders, over STEP_TIME s; it steps back once the turn falls below STEP_OFF.
 */
const STEP_ON = 0.7;
const STEP_OFF = 0.35;
const STEP_TIME = 0.38;
/** The spine bend, run in the torso's vertex shader (the same map as spine.ts bendPoint, for the shoulders and head). */
const SPINE_BEND_GLSL = `
uniform float uSpineBend;
float spineSinc(float x) {
  return abs(x) < 0.05 ? 1.0 - x * x / 6.0 + x * x * x * x / 120.0 : sin(x) / x;
}
vec3 spineBend(vec3 p) {
  float s = p.z - (${SPINE_Z0.toFixed(1)});
  if (s <= 0.0 || uSpineBend == 0.0) return p;
  float L = ${(SPINE_Z1 - SPINE_Z0).toFixed(1)};
  float m = min(s, L);
  float th = uSpineBend * m / L;
  // sinc, never a division by the curvature: a GPU sin's absolute error must not be blown up by a near-straight spine.
  float sc = spineSinc(th * 0.5);
  vec3 o = vec3(p.x * cos(th) + m * (th * 0.5) * sc * sc, p.y, ${SPINE_Z0.toFixed(1)} + m * spineSinc(th) - p.x * sin(th));
  if (s > L) o += (s - L) * vec3(sin(uSpineBend), 0.0, cos(uSpineBend));
  return o;
}
vec3 spineBendNormal(vec3 p, vec3 n) {
  float th = uSpineBend * clamp((p.z - (${SPINE_Z0.toFixed(1)})) / ${(SPINE_Z1 - SPINE_Z0).toFixed(1)}, 0.0, 1.0);
  float c = cos(th);
  float s = sin(th);
  return vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
}
`;
/** The hips' midpoint (torso space): the torso turns about it, so the haunches stay over the hind hooves. */
const HIPS = new THREE.Vector3(0, HIP.y, HIP.z);
/** How far (units) a shoulder slides (scapula) toward a hand that is nearly out of reach. */
const PROTRACT = 26;
/**
 * Backhand: the bearing range (rad off the nose) its sweep ends in, toward the target as far as the body allows, and
 * the radius it reaches for (past the arm's reach, so the arm sweeps through nearly straight).
 */
const BACKHAND_END_MIN = 1.35;
const BACKHAND_END_MAX = Math.PI - 0.05;
const BACKHAND_SWEEP_R = 580;
/** Howl: how far (rad) the skull tips back from its rest (snout 35° down) to point the muzzle up at the sky. */
const HOWL_TILT = 1.65;
/**
 * Leap: where (frame units, left side) a hoof trails in the air, back and down past the hind leg's reach so the leg
 * stays straight; how deep (units) the body sinks in its crouches (leapPose sink 1).
 */
const LEAP_TRAIL = new THREE.Vector3(140, -20, -340);
const LEAP_SINK = 120;
/** Shadow Hands: how far from the shoulder the lifted claw reaches toward the flyer, and when its gesture is over. */
const BECKON_REACH = 400;
const BECKON_END = BECKON_T.end;
/** How fast (1/s) the beckoning claw's reach swings round to a new flyer. */
const BECKON_TURN = 4;
/**
 * Body springs: natural frequency (rad/s) and damping. Slow and only a little underdamped, so the body winds round
 * heavily and settles with a small overshoot, no wobble. TWIST_RATE caps how fast (rad/s) the turn it aims for may
 * move, so a target that jumps (in front of the shoulder one frame, behind it the next) never whips the body round.
 */
const TWIST_SPRING = { omega: 13, zeta: 0.75 };
const LEAN_SPRING = { omega: 9, zeta: 0.75 };
const TWIST_RATE = 7.5;
/** Fraction of the torso's turn and pitch the neck takes back, so the skull stays roughly on its target. */
const HEAD_COUNTER = 0.65;


/** The spine (torso space): from the sacrum up over the high hunched withers above the shoulders, down to the neck. */
const SPINE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 360, -180),
  new THREE.Vector3(0, 455, -115),
  new THREE.Vector3(0, 570, -35),
  new THREE.Vector3(0, 640, 55),
  new THREE.Vector3(0, 618, 150),
  new THREE.Vector3(0, 560, 228),
  new THREE.Vector3(0, 528, 272),
]);
/** The neck (torso space): on from the end of the spine, long, low and thrust forward to the back of the skull. */
const NECK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 528, 272),
  new THREE.Vector3(0, 512, 316),
  new THREE.Vector3(0, 494, 354),
  new THREE.Vector3(0, 480, 386),
]);

/**
 * The trunk (torso space): a narrow, deep-chested barrel along z under the spine. Its cross-section at z is an
 * ellipse of half-width CAGE_X·r(z) and half-height CAGE_H·r(z) about y = CAGE_Y; `theta` runs around it (0 = top,
 * π/2 = left).
 */
const CAGE_Y = 458;
const CAGE_X = 104;
const CAGE_H = 162;
const CAGE_Z: readonly (readonly [number, number])[] = [
  [-55, 0.15], [-35, 0.5], [-5, 0.8], [40, 0.96], [90, 1], [140, 0.95], [180, 0.84], [215, 0.64], [240, 0.4], [255, 0.12],
];
/** Ribs under the skin: the z where each leaves the spine, and how far round (theta) it reaches; the back ones float short. */
const RIBS: readonly (readonly [number, number])[] = [[178, 2.6], [146, 2.6], [114, 2.5], [82, 2.35], [50, 2.15], [18, 1.9], [-12, 1.6]];
/** How far (z) a rib slants back between the spine and the bottom of the trunk. */
const RIB_SLANT = 46;

function cageR(z: number): number {
  const first = CAGE_Z[0]!;
  if (z <= first[0]) return first[1];
  for (let i = 1; i < CAGE_Z.length; i++) {
    const [z1, r1] = CAGE_Z[i]!;
    const [z0, r0] = CAGE_Z[i - 1]!;
    if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return CAGE_Z[CAGE_Z.length - 1]![1];
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How far round the trunk (|theta|) the fur coat reaches at z: low on the flanks over the shoulders, higher behind. */
function coatReach(z: number): number {
  return z < 60 ? 1.15 : 1.35;
}

/** How far (model units) the ribs push the skin out at (theta, z): low ridges on the flanks, fading toward spine and belly. */
function ribBump(theta: number, z: number): number {
  const t = Math.abs(theta);
  let b = 0;
  for (const [zr, reach] of RIBS) {
    const fade = smooth(0.45, 0.85, t) * (1 - smooth(reach - 0.45, reach, t));
    if (fade <= 0) continue;
    const d = (z - (zr - RIB_SLANT * (t / Math.PI))) / 7;
    b = Math.max(b, 6 * fade * Math.exp(-d * d));
  }
  return b;
}

function cageRaw(theta: number, z: number, out: THREE.Vector3, bump = 0): THREE.Vector3 {
  const r = cageR(z);
  const k = 1 + bump / 100;
  return out.set(Math.sin(theta) * CAGE_X * r * k, CAGE_Y + Math.cos(theta) * CAGE_H * r * k, z);
}

const _ea = new THREE.Vector3();
const _eb = new THREE.Vector3();
const _ec = new THREE.Vector3();
/** The point at (theta, z) on the trunk's skin, lifted `lift` along its outward normal (written to `nrm` when given). */
function cageAt(theta: number, z: number, lift = 0, out = new THREE.Vector3(), nrm?: THREE.Vector3): THREE.Vector3 {
  cageRaw(theta + 0.01, z, _ea).sub(cageRaw(theta - 0.01, z, _eb));
  cageRaw(theta, z + 0.5, _eb).sub(cageRaw(theta, z - 0.5, _ec));
  _ec.crossVectors(_eb, _ea).normalize();
  cageRaw(theta, z, out);
  if (_ec.x * out.x + _ec.y * (out.y - CAGE_Y) < 0) _ec.negate();
  if (nrm) nrm.copy(_ec);
  return out.addScaledVector(_ec, lift);
}

/** The skull (torso space): hung low and forward at the end of the neck, the snout pitched down HEAD_PITCH rad. */
const HEAD_AT = new THREE.Vector3(0, 472, 408);
const HEAD_PITCH = 0.62;
/** Dread Gaze turns the skull about this point (torso space), where the neck meets the back of the skull. */
const HEAD_PIVOT = new THREE.Vector3(0, 480, 380);
/** Dread Gaze: how far the skull may turn (rad) left/right, down and up from its rest pose, and how fast it follows. */
const GAZE_YAW = 1.1;
const GAZE_DOWN = 0.35;
const GAZE_UP = 0.3;
const GAZE_RATE = 9;
/** Scale of the antler rack's layout. */
const RACK = 1.25;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);
const _s = new THREE.Vector3();
const _at = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _lx = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _ly = new THREE.Vector3();
const _lz = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _fist = new THREE.Vector3();
const _hock = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _sum = new THREE.Vector3();
const _raise = new THREE.Vector3();
const _end = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();
const _lunge = new THREE.Vector3();
const _rel = new THREE.Matrix4();
const _lead = new THREE.Vector3();
const _peak = new THREE.Vector3();
const _clamp = new THREE.Vector3();
const _armQ = new THREE.Quaternion();
const _armQInv = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _look = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _ca = new THREE.Color();
const _cb = new THREE.Color();

/** Extra unit shapes: an eight-sided tube, a snout tapering toward +Y, and a triangular prism. */
const TUBE = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const SNOUT = faceted(new THREE.CylinderGeometry(0.3, 0.5, 1, 7));
const TRI = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 3));
/** Ball and lumpy knob of diameter 1 (SHAPES.blob and .boulder are radius 1). */
const BALL = faceted(new THREE.IcosahedronGeometry(0.5, 1));
const NUB = faceted(new THREE.IcosahedronGeometry(0.5, 0));

/** Matrix placing a part at `pos` with its local +Y along `dir`, turned `spin` rad about it. */
function along(pos: THREE.Vector3, dir: THREE.Vector3, spin = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  _q.setFromUnitVectors(_up, _tmp.copy(dir).normalize()).multiply(_q2.setFromAxisAngle(_up, spin));
  return out.compose(pos, _q, _s.set(1, 1, 1));
}

function v3(v: THREE.Vector3): V3 {
  return [v.x, v.y, v.z];
}

/** A tube (`shape`, radius 0.5 units) of radius r from a to b, appended painted. */
function strut(out: THREE.BufferGeometry[], shape: THREE.BufferGeometry, color: number, a: V3, b: V3, r: number): void {
  const pa = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(pa);
  const len = d.length();
  if (len < 1e-3) return;
  piece(out, shape, color, [0, 0, 0], [r * 2, len, r * 2], [0, 0, 0], along(pa.addScaledVector(d, 0.5), d));
}

/**
 * A clump of matted fur: a flattened four-sided shard `len` long and `r` wide, leaving `base` along `dir`, shaded
 * from `root` at the base to `tip` at the point (the tips catch the light so the mane keeps its shape in daylight).
 */
function shard(out: THREE.BufferGeometry[], base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, root: number, tip: number, spin = 0): void {
  const g = SHAPES.spike.clone();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  _ca.setHex(root);
  _cb.setHex(tip);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, pos.getY(i) + 0.5));
    _tmp.set(_ca.r + (_cb.r - _ca.r) * u, _ca.g + (_cb.g - _ca.g) * u, _ca.b + (_cb.b - _ca.b) * u);
    col.set([_tmp.x, _tmp.y, _tmp.z], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _dir.copy(dir).normalize();
  along(_at.copy(base).addScaledVector(_dir, len / 2), _dir, spin, _m);
  g.applyMatrix4(_m.multiply(new THREE.Matrix4().makeScale(r * 2, len, r * 1.2)));
  out.push(g);
}

/** Non-indexed geometry from a flat triangle list, with face normals and blank uvs (so it merges with the primitives). */
function rawGeometry(v: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A gnarled, tapering antler tine through `pts`: radius r0 at the first point to r1 at the last, knotted at each
 * bend, ending in a worn point of colour `tip`.
 */
function branch(out: THREE.BufferGeometry[], color: number, tip: number, pts: readonly THREE.Vector3[], r0: number, r1: number): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r = r0 + ((r1 - r0) * i) / n;
    const last = i === n - 1;
    strut(out, last ? SHAPES.spike : TUBE, last ? tip : color, v3(pts[i]!), v3(pts[i + 1]!), last ? r * 1.2 : r);
    if (!last) piece(out, NUB, color, v3(pts[i + 1]!), [r * 2.4, r * 2.4, r * 2.4]);
  }
}

/**
 * Stretch a height-1, centred limb mesh from a to b (like placeSegment), turned about its axis so its local +Z
 * leans toward `ref` (the IK bend direction): a stable twist, so the knobs and sinews never spin.
 */
function placeLimb(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, ref: THREE.Vector3): void {
  _ly.subVectors(b, a);
  const len = _ly.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  obj.scale.y = len;
  if (len < 1e-6) return;
  _ly.divideScalar(len);
  _lz.copy(ref).addScaledVector(_ly, -ref.dot(_ly));
  if (_lz.lengthSq() < 1e-6) _lz.set(0, 0, 1).addScaledVector(_ly, -_ly.z);
  _lz.normalize();
  _lx.crossVectors(_ly, _lz);
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(_lx, _ly, _lz));
}

/** v with x mirrored to side sx (+1 left, −1 right). */
function mirror(v: THREE.Vector3, sx: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * sx, v.y, v.z);
}

type Arm = { upper: THREE.Mesh; fore: THREE.Mesh; fist: THREE.Mesh };
type Leg = { thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };

/**
 * The Wendigo (internally the Wendigo), a folklore horror of the northern woods: a gaunt, starved thing that stalks on very long,
 * sinewy arms and bony, clawed hands. Tight olive-grey skin shows the ribs and the knuckled lower spine beneath it;
 * a ragged black mane of matted fur hangs off its hunched withers, neck, shoulders and chest. Its face is a
 * weathered deer skull with empty sockets, carried low and forward on a long neck under a small gnarled rack hung
 * with moss. Digitigrade hind legs on cloven hooves. It has no glow: its dark magic shows in the world around it.
 * Hungry Ghosts and Bone Ward shards leave from hidden points on its back; for Dread Gaze the skull turns to stare;
 * for Shadow Hands it lifts a claw toward the flyer as the hand rises. Faces +Z; +X is its left.
 */
export class WendigoBody implements MonsterBody {
  readonly root = new THREE.Group();
  /**
   * Everything of the Wendigo hangs off this, scaled by CONFIG.wendigo.scale inside the root (which Monster scales for
   * every monster), so all the posing below stays in the same model units at any size.
   */
  private frame = new THREE.Group();
  /** Pivots at PIVOT; `shell` (offset by −PIVOT) holds the torso parts in root-like coordinates. */
  private body = new THREE.Group();
  private shell = new THREE.Group();
  /** Named `limbArms`: `arms` is MonsterBody's optional tentacle hook (the 4b Kaiju collision). */
  private limbArms: Arm[] = [];
  private legs: Leg[] = [];
  /** One matte, vertex-coloured toon material for the whole body; its emissive only carries the hit flash and level-up glow. */
  private bodyMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private launchPts: THREE.Object3D[] = [];
  /** Launch point mounts and their unbent torso-space poses, carried along the spine bend each frame. */
  private launchMounts: { obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];
  /** The torso's own material (the body's, plus the spine bend in its vertex shader), and the bend (rad) it draws. */
  private torsoMat: THREE.MeshToonMaterial;
  /** The torso's shadow material, with the same spine bend. */
  private depthMat!: THREE.MeshDepthMaterial;
  private bendU = { value: 0 };
  private bend = 0;
  /** Per side: pivot step progress (0 on its gait, 1 re-planted), its world plant, and the turn it was planted for. */
  private stepS = [0, 0];
  private stepAt = [new THREE.Vector3(), new THREE.Vector3()];
  private stepTwist = [0, 0];
  /** The skull and antlers, turned toward `lookAt` (Dread Gaze) and eased back to rest; yaw is root-relative. */
  private headPivot = new THREE.Group();
  /** The lower jaw, hinged under the skull (it drops open to howl). */
  private jawPivot = new THREE.Group();
  /** Roar (a wolf's howl): its clock (s, −1 when none), run on HOWL_AFTER past the roar to lower the head. */
  private howlT = -1;
  private headYaw = 0;
  private headPitch = 0;
  private nextLaunch = 0;
  private novaT = -1;
  /** Rending Claws: the strike's clock last frame (−1 when none), and its slam/backhand kind, latched at its start. */
  private meleePrevT = -1;
  private strikeKind: FistKind = 'slam';
  /** Torso turn (yaw, + toward the left) and extra pitch (+ forward) recruited for the reach: springs. */
  private twist = { x: 0, v: 0 };
  /** The turn the twist spring is chasing, moved at most TWIST_RATE rad/s toward the reach's need. */
  private twistGoal = 0;
  private lean = { x: 0, v: 0 };
  /** Per side (0 left): where each hand and hoof wants to be this frame (root space), and which are on the ground. */
  private gaitAt = [new THREE.Vector3(), new THREE.Vector3()];
  private handAt = [new THREE.Vector3(), new THREE.Vector3()];
  private footAt = [new THREE.Vector3(), new THREE.Vector3()];
  private handPlanted = [false, false];
  private footPlanted = [false, false];
  /**
   * Per side: the beckoning claw's gesture (Shadow Hands): `lift` its clock (s, −1 when idle), `grab` the grab's own
   * clock (the anti-air strike's, carried on after it ends), the flyer it reaches for (world), and the direction
   * (root space) the claw reaches in, eased so a new flyer draws it round rather than snapping it.
   */
  private beckons = [0, 1].map(() => ({ lift: -1, grab: -1, at: new THREE.Vector3(), dir: new THREE.Vector3(), aimed: false }));
  private airPrevT = -1;
  /**
   * Leap (with its crouch before liftoff and the landing recovery after): its clock (s, −1 when none), duration and
   * crouch fraction, and where each hand and hoof (0, 1 hands; 2, 3 hooves) left the ground at liftoff (world).
   */
  private leapT = -1;
  private leapD = 1;
  private leapC = 0;
  private leapPlant = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private leapPlanted = false;
  /** Per side: the hand is posed (striking, slamming, reaching), not walking. */
  private handPosed = [false, false];
  /** Per side: 0..1, how far a sweeping hand reaches out horizontally (at its height) toward the arm's full length. */
  private extend = [0, 0];

  constructor() {
    this.bodyMat = toonMat(0xffffff, { vertexColors: true });
    this.torsoMat = this.bodyMat.clone();
    this.torsoMat.onBeforeCompile = (sh) => {
      sh.uniforms['uSpineBend'] = this.bendU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${SPINE_BEND_GLSL}`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = spineBendNormal(position, objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = spineBend(transformed);');
    };
    this.torsoMat.customProgramCacheKey = () => 'wendigo-spine';
    const { box, spike } = SHAPES;
    const torso: THREE.BufferGeometry[] = [];
    const rand = rng(13);
    const jit = (s: number) => (rand() - 0.5) * 2 * s;
    const n = new THREE.Vector3();
    const p = new THREE.Vector3();
    /** Fur colours: mostly near-black or umber at the root; the tips lighter, some only a little. */
    const furRoot = () => (rand() < 0.55 ? C.furDark : C.fur);
    const furTip = () => (rand() < 0.65 ? C.furTip : C.fur);

    // The trunk: olive-grey skin stretched tight over the ribs, ridges catching the light, darker underneath.
    {
      const zs: number[] = [];
      for (let z = -55; z < 255; z += 6) zs.push(z);
      zs.push(255);
      const SEG = 20;
      const v: number[] = [];
      const cols: number[] = [];
      const q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const ring = (z: number, j: number, out: THREE.Vector3) => {
        const t = (j / SEG) * Math.PI * 2;
        return cageRaw(t, z, out, ribBump(t > Math.PI ? t - Math.PI * 2 : t, z));
      };
      const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) => {
        v.push(...v3(a), ...v3(b), ...v3(c));
        for (let k = 0; k < 3; k++) cols.push(hex);
      };
      for (let i = 0; i + 1 < zs.length; i++) {
        for (let j = 0; j < SEG; j++) {
          ring(zs[i]!, j, q[0]!);
          ring(zs[i + 1]!, j, q[1]!);
          ring(zs[i + 1]!, j + 1, q[2]!);
          ring(zs[i]!, j + 1, q[3]!);
          const t = ((j + 0.5) / SEG) * Math.PI * 2;
          const b = ribBump(t > Math.PI ? t - Math.PI * 2 : t, (zs[i]! + zs[i + 1]!) / 2);
          const zc = (zs[i]! + zs[i + 1]!) / 2;
          const th = Math.abs(t > Math.PI ? t - Math.PI * 2 : t);
          // Under the coat the skin is dark, so no olive shows between the clumps.
          const hex = th < coatReach(zc) - 0.2 || zc < -40 ? C.furDark : b > 3 ? C.skinLight : Math.cos(t) < -0.45 ? C.skinDark : C.skin;
          face(q[0]!, q[1]!, q[2]!, hex);
          face(q[0]!, q[2]!, q[3]!, hex);
        }
      }
      // Close both ends.
      for (const [z, cz, flip] of [[-55, -62, true], [255, 262, false]] as const) {
        const c = new THREE.Vector3(0, CAGE_Y, cz);
        for (let j = 0; j < SEG; j++) {
          ring(z, j, q[0]!);
          ring(z, j + 1, q[1]!);
          if (flip) face(c, q[1]!, q[0]!, C.skinDark);
          else face(c, q[0]!, q[1]!, C.skinDark);
        }
      }
      const g = rawGeometry(v);
      const colors = new Float32Array(cols.length * 3);
      cols.forEach((hex, i) => colors.set(new THREE.Color(hex).toArray(), i * 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      torso.push(g);
    }

    // The back: a skin ridge along the spine and a sunken belly up to the pelvis.
    {
      const N = 22;
      for (let i = 0; i < N; i++) {
        const u0 = i / N;
        const u1 = (i + 1) / N;
        const r = u0 < 0.12 ? 30 : u0 < 0.35 ? 26 : 32;
        strut(torso, TUBE, C.furDark, v3(SPINE.getPointAt(u0)), v3(SPINE.getPointAt(u1)), r);
      }
      const belly = [new THREE.Vector3(0, CAGE_Y - 80, -20), new THREE.Vector3(0, 405, -95), new THREE.Vector3(0, 380, -150)];
      strut(torso, TUBE, C.skinDark, v3(belly[0]!), v3(belly[1]!), 30);
      strut(torso, TUBE, C.skinDark, v3(belly[1]!), v3(belly[2]!), 26);
      piece(torso, NUB, C.skinDark, v3(belly[1]!), [56, 52, 56]);
    }

    // Pelvis: hip bones jutting under the skin over the haunches; the hip joints either side.
    for (const sx of [1, -1]) {
      piece(torso, NUB, C.skinLight, [sx * 76, 396, -108], [34, 22, 30]);
      piece(torso, NUB, C.skin, [sx * (HIP.x - 6), HIP.y, HIP.z], [54, 54, 54]);
    }

    // Shoulders: the joints the arms hang from, grown out of the trunk by a scapula and deltoid mass over the top,
    // a pectoral below and a sinew cord under that; the mane drapes over the join.
    for (const sx of [1, -1]) {
      const sh: V3 = [sx * (SHOULDER.x - 22), SHOULDER.y + 4, SHOULDER.z];
      piece(torso, NUB, C.skinDark, sh, [50, 56, 58]);
      piece(torso, NUB, C.skinDark, [sx * 74, 548, 70], [80, 62, 80], [0.3, 0.5, 0]);
      piece(torso, NUB, C.skinDark, [sx * 115, 526, 76], [80, 66, 86], [0.2, 1.1, 0.3]);
      piece(torso, NUB, C.skinDark, [sx * 120, 470, 112], [68, 58, 72], [0.4, 0.8, 0]);
      piece(torso, NUB, C.skinDark, [sx * 85, 478, 150], [64, 56, 70], [0.1, 0.3, 0.5]);
      strut(torso, TUBE, C.sinew, [sx * 64, 440, 140], [sx * (SHOULDER.x - 12), SHOULDER.y - 24, SHOULDER.z + 4], 8);
      for (let k = 0; k < 18; k++) {
        const u = (k % 9) / 8;
        p.set(sx * (64 + (SHOULDER.x - 74) * u), 566 - 50 * u + jit(6), (k < 9 ? 60 : 110) + jit(22));
        _dir.set(sx * (0.35 + 0.3 * u), -1, -0.3 + jit(0.3));
        shard(torso, p, _dir, 60 + rand() * 40, 16 + rand() * 6, furRoot(), furTip(), rand() * 3);
      }
    }

    // Neck: a lean column along NECK (all under the mane), black sinew cords under it.
    {
      const N = 6;
      for (let i = 0; i < N; i++) strut(torso, TUBE, C.furDark, v3(NECK.getPointAt(i / N)), v3(NECK.getPointAt((i + 1) / N)), 30 - i * 1.5);
      for (const sx of [1, -1]) strut(torso, TUBE, C.sinew, [sx * 16, 506, 250], [sx * 12, 456, 380], 7);
    }

    // The skull and rack are their own mesh on a pivot at the top of the neck, so Dread Gaze can turn the head.
    const skull: THREE.BufferGeometry[] = [];
    // The skull: a weathered deer skull, small and long-faced, the jaw hanging a little open; empty black sockets.
    const head = new THREE.Matrix4().compose(HEAD_AT, _q.setFromEuler(new THREE.Euler(HEAD_PITCH, 0, 0)), _s.set(1, 1, 1));
    // In `head` space +Z runs out along the snout and +Y up over the brow.
    const hp = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(head);
    piece(skull, BALL, C.bone, [0, 0, 0], [68, 58, 78], [0, 0, 0], head);
    piece(skull, BALL, C.boneShade, [0, 2, -30], [54, 48, 34], [0, 0, 0], head);
    piece(skull, SNOUT, C.bone, [0, -8, 62], [44, 82, 34], [Math.PI / 2, 0, 0], head);
    piece(skull, box, C.boneShade, [0, 6, 60], [14, 6, 68], [0.1, 0, 0], head);
    // Brow ridges overhanging the sockets, cheekbones under them.
    for (const sx of [1, -1]) {
      piece(skull, NUB, C.bone, [sx * 22, 20, 24], [26, 12, 32], [0, 0, 0], head);
      piece(skull, NUB, C.boneShade, [sx * 22, -16, 34], [18, 16, 40], [0, 0, 0], head);
      // The sockets: deep, empty, black.
      piece(skull, BALL, C.socket, [sx * 25, 6, 27], [21, 20, 23], [0, 0, 0], head);
    }
    // Nasal cavity at the tip and the dark of the mouth under the upper jaw.
    piece(skull, box, C.socket, [0, -4, 100], [12, 10, 14], [0, 0, 0], head);
    piece(skull, box, C.socket, [0, -24, 58], [24, 8, 62], [0, 0, 0], head);
    // The lower jaw (its own mesh, hinged under the skull, so it can drop open to howl): two thin bars hanging
    // slightly open, a few worn teeth.
    const jaw: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      const j0 = hp(sx * 22, -18, 6);
      const j1 = hp(sx * 16, -38, 50);
      const j2 = hp(sx * 8, -40, 88);
      strut(jaw, TUBE, C.boneShade, v3(j0), v3(j1), 7);
      strut(jaw, TUBE, C.boneShade, v3(j1), v3(j2), 5);
      for (let i = 0; i < 3; i++) {
        _at.lerpVectors(j1, j2, 0.15 + i * 0.3);
        strut(jaw, spike, C.boneShade, v3(_at), v3(_at.clone().add(hp(0, 12, 0).sub(HEAD_AT))), 3.5);
        const u = hp(sx * (13 - i * 2.5), -20, 48 + i * 15);
        strut(skull, spike, C.boneShade, v3(u), v3(u.clone().add(hp(0, -10, 0).sub(HEAD_AT))), 3.5);
      }
    }

    // Antlers: a small, gnarled whitetail rack. The beam sweeps back and out from the crown, then hooks forward;
    // tines rise off its top. Strands of dark moss and hair hang from it.
    for (const sx of [1, -1]) {
      const root = hp(sx * 20, 24, -10);
      const X = (x: number, y: number, z: number, j = 4) => root.clone().add(_tmp.set(sx * (x * RACK + jit(j)), y * RACK + jit(j), z * RACK + jit(j)));
      const beam = [X(0, 0, 0), X(24, 30, -24), X(56, 50, -30), X(86, 62, -12), X(102, 66, 20), X(104, 62, 54), X(92, 58, 82)];
      piece(skull, NUB, C.antler, v3(beam[0]!), [24, 14, 24]);
      branch(skull, C.antler, C.antlerTip, beam, 13, 7);
      // Tines: a short brow tine, then three off the beam, each bent its own way.
      branch(skull, C.antler, C.antlerTip, [beam[1]!, X(32, 58, -8), X(38, 80, 8, 8)], 7, 5);
      branch(skull, C.antler, C.antlerTip, [beam[3]!, X(86, 106, -18), X(76, 146, -4, 10)], 8, 5);
      branch(skull, C.antler, C.antlerTip, [beam[4]!, X(114, 100, 26), X(126, 128, 42, 10)], 7, 5);
      branch(skull, C.antler, C.antlerTip, [beam[5]!, X(112, 88, 72, 8)], 6, 4);
      for (const [i, len] of [[2, 58], [3, 40], [5, 70]] as const) {
        const at = beam[i]!.clone().add(_tmp.set(0, -6, 0));
        shard(skull, at, _dir.set(jit(0.15), -1, jit(0.15)), len, 4.5, C.moss, C.furDark, rand() * 3);
        shard(skull, at.add(_tmp.set(sx * 6, 0, 8)), _dir.set(jit(0.2), -1, jit(0.2)), len * 0.6, 3.5, C.furDark, C.moss, rand() * 3);
      }
    }

    // The mane: matted clumps of fur lying back and down along the withers and neck, all round the neck.
    {
      const curves: [THREE.CatmullRomCurve3, number, number, number][] = [[SPINE, 0.04, 1, 0.022], [NECK, 0, 0.92, 0.07]];
      const tan = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (const [curve, u0, u1, du] of curves) {
        const neck = curve === NECK;
        for (let u = u0; u <= u1 + 1e-6; u += du) {
          curve.getPointAt(Math.min(1, u), p);
          curve.getTangentAt(Math.min(1, u), tan);
          side.crossVectors(tan, _up).normalize();
          const ups = _ly.crossVectors(side, tan).normalize();
          const angles = neck ? [-2.6, -1.9, -1.2, -0.6, 0, 0.6, 1.2, 1.9, 2.6, Math.PI] : [-1.4, -0.7, 0, 0.7, 1.4];
          for (const a0 of angles) {
            const a = a0 + jit(0.2);
            n.copy(ups).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
            const base = _lz.copy(p).addScaledVector(n, neck ? 22 : 24);
            const under = Math.cos(a) < -0.3;
            // Withers and the top of the neck carry the longest, shaggiest clumps; the throat hangs a ragged ruff.
            // The coat thins and shortens down the lower back to the rump.
            const hump = Math.exp(-(((u - 0.6) / 0.25) ** 2));
            const len = (under ? 80 : neck ? 70 : 42 + 52 * hump) * (0.75 + rand() * 0.5);
            _dir.copy(n).multiplyScalar(under ? 0.25 : 0.3).addScaledVector(tan, -0.8).addScaledVector(_down, under ? 1.1 : 0.35 + Math.abs(Math.sin(a)) * 0.6);
            shard(torso, base, _dir, len, (neck ? 13 : 16) + rand() * 6, furRoot(), furTip(), rand() * 3);
          }
        }
      }
    }
    // The mane spills down over the upper flanks and the shoulders, ending in a ragged edge.
    for (let z = -40; z <= 250; z += 19) {
      for (const sx of [1, -1]) {
        // The coat stays high on the back, baring the ribs on the flanks below.
        for (let t = 0.25; t <= coatReach(z); t += 0.27) {
          const th = sx * (t + jit(0.08));
          const zz = z + jit(7);
          cageAt(th, zz, -4, p, n);
          const len = (55 + 45 * smooth(0.6, 1.35, t)) * (0.7 + rand() * 0.6) * (zz < 60 ? 0.8 : 1);
          _dir.copy(n).multiplyScalar(0.35).addScaledVector(_down, 0.8).add(_tmp.set(0, 0, -0.45));
          shard(torso, p, _dir, len, 15 + rand() * 6, furRoot(), furTip(), rand() * 3);
        }
      }
    }
    for (const sx of [1, -1]) {
      const c = new THREE.Vector3(sx * (SHOULDER.x - 36), SHOULDER.y + 26, SHOULDER.z - 4);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        n.set(sx * (0.55 + 0.45 * Math.cos(a)), 0.5 + 0.5 * Math.sin(a), 0.5 * Math.sin(a * 2 + 1)).normalize();
        p.copy(c).addScaledVector(n, 30);
        _dir.copy(n).multiplyScalar(0.5).addScaledVector(_down, 0.9).add(_tmp.set(0, 0, -0.3));
        shard(torso, p, _dir, 60 + rand() * 40, 15 + rand() * 6, furRoot(), furTip(), rand() * 3);
      }
    }
    // The chest: a long, ragged beard of fur hanging off the front of the trunk between the arms.
    for (let z = 175; z <= 250; z += 15) {
      for (let t = 1.2; t <= Math.PI + 1e-6; t += 0.32) {
        for (const sx of [1, -1]) {
          if (sx < 0 && t > Math.PI - 0.1) continue;
          cageAt(sx * (t + jit(0.06)), z + jit(6), -4, p, n);
          _dir.copy(n).multiplyScalar(0.3).addScaledVector(_down, 1).add(_tmp.set(0, 0, -0.15));
          shard(torso, p, _dir, (70 + 70 * smooth(1.6, 2.8, t)) * (0.7 + rand() * 0.6), 13 + rand() * 6, furRoot(), furTip(), rand() * 3);
        }
      }
    }
    // Thin strands hanging off the belly, and a ragged tuft of a tail.
    for (let z = -20; z <= 160; z += 26) {
      for (const sx of [1, -1]) {
        cageAt(sx * (Math.PI - 0.35 + jit(0.25)), z + jit(10), -4, p, n);
        shard(torso, p, _dir.set(jit(0.15), -1, -0.25), 40 + rand() * 50, 9 + rand() * 4, C.furDark, C.fur, rand() * 3);
      }
    }
    // A shaggy skirt over the rump and haunches.
    for (let z = -52; z <= -16; z += 12) {
      for (let t = -2.3; t <= 2.3; t += 0.38) {
        cageAt(t + jit(0.1), z + jit(4), -3, p, n);
        _dir.copy(n).multiplyScalar(0.4).addScaledVector(_down, 0.8).add(_tmp.set(0, 0, -0.5));
        shard(torso, p, _dir, (50 + rand() * 35) * (Math.abs(t) > 1.2 ? 1.2 : 1), 14 + rand() * 5, furRoot(), furTip(), rand() * 3);
      }
    }
    // Over the pelvis, hanging down over the tops of the haunches.
    for (let z = -170; z <= -80; z += 15) {
      for (let a = -2.1; a <= 2.1 + 1e-6; a += 0.35) {
        const aa = a + jit(0.1);
        n.set(Math.sin(aa), Math.cos(aa) * 0.8, -0.2).normalize();
        p.set(Math.sin(aa) * 84, 382 + Math.cos(aa) * 26 + (z + 125) * -0.35, z + jit(5));
        _dir.copy(n).multiplyScalar(0.3).addScaledVector(_down, 0.9).add(_tmp.set(0, 0, -0.4));
        shard(torso, p, _dir, (45 + rand() * 35) * (Math.abs(a) > 1 ? 1.25 : 1), 14 + rand() * 5, furRoot(), furTip(), rand() * 3);
      }
    }
    for (let k = 0; k < 7; k++) {
      p.set(jit(14), 352 + jit(8), -184 + jit(6));
      shard(torso, p, _dir.set(jit(0.4), -0.9 + jit(0.2), -0.8), 50 + rand() * 30, 11 + rand() * 4, furRoot(), furTip(), rand() * 3);
    }

    // Launch points (Hungry Ghosts, Bone Ward shards): two on the flanks behind the shoulders and one on the lumbar spine; `mouth` is where shots leave.
    const lobs: { at: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (const sx of [1, -1]) {
      const wn = new THREE.Vector3();
      lobs.push({ at: cageAt(sx * 0.62, -2, 2, new THREE.Vector3(), wn), n: wn });
    }
    lobs.push({ at: SPINE.getPointAt(0.12).add(new THREE.Vector3(0, 34, 0)), n: new THREE.Vector3(0, 1, -0.35).normalize() });
    for (const { at, n: wn } of lobs) {
      const pt = new THREE.Object3D();
      along(at, wn).decompose(pt.position, pt.quaternion, pt.scale);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 50, 0);
      pt.add(mouth);
      this.launchPts.push(mouth);
      this.launchMounts.push({ obj: pt, pos: pt.position.clone(), quat: pt.quaternion.clone() });
      this.shell.add(pt);
    }

    // The torso casts shadows but takes none: the mane and antlers would otherwise drown the trunk in shade.
    const trunk = this.mesh(this.shell, this.keep(merge(torso)), this.torsoMat);
    trunk.receiveShadow = false;
    // Its shadow bends with it.
    const depth = (this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    depth.onBeforeCompile = (sh) => {
      sh.uniforms['uSpineBend'] = this.bendU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${SPINE_BEND_GLSL}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = spineBend(transformed);');
    };
    depth.customProgramCacheKey = () => 'wendigo-spine-depth';
    trunk.customDepthMaterial = depth;
    this.headPivot.position.copy(HEAD_PIVOT);
    this.shell.add(this.headPivot);
    this.mesh(this.headPivot, this.keep(merge(skull).translate(-HEAD_PIVOT.x, -HEAD_PIVOT.y, -HEAD_PIVOT.z)), this.bodyMat).receiveShadow = false;
    const hinge = hp(0, -18, 6);
    this.jawPivot.position.copy(hinge).sub(HEAD_PIVOT);
    this.headPivot.add(this.jawPivot);
    this.mesh(this.jawPivot, this.keep(merge(jaw).translate(-hinge.x, -hinge.y, -hinge.z)), this.bodyMat).receiveShadow = false;

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.frame.scale.setScalar(G.scale);
    this.frame.add(this.body);
    this.root.add(this.frame);

    // Limbs (root space; placed by IK every frame). Limb space: Y runs from the joint nearer the body (−len/2) to
    // the far one (+len/2); +Z is the IK bend side.
    const limb = (build: (parts: THREE.BufferGeometry[]) => void, len: number) => {
      const parts: THREE.BufferGeometry[] = [];
      build(parts);
      return this.mesh(this.frame, this.keep(merge(parts).scale(1, 1 / len, 1)), this.bodyMat);
    };
    /** Clumps of fur hanging down a limb (toward +Y) from heights y0..y1, round its +Z side within ±spread rad. */
    const limbFur = (p: THREE.BufferGeometry[], y0: number, y1: number, r: number, spread: number, count: number, len: number) => {
      for (let k = 0; k < count; k++) {
        const y = y0 + ((y1 - y0) * k) / Math.max(1, count - 1) + jit(6);
        const a = jit(spread);
        _at.set(Math.sin(a) * r, y, Math.cos(a) * r);
        _ref.set(Math.sin(a) * 0.45, 1, Math.cos(a) * 0.45);
        shard(p, _at, _ref, len * (0.7 + rand() * 0.6), 11 + rand() * 4, furRoot(), furTip(), rand() * 3);
      }
    };
    const upperGeo = (p: THREE.BufferGeometry[]) => {
      const L = UPPER / 2;
      piece(p, SHAPES.limb, C.skin, [0, 0, 0], [30, UPPER - 20, 30]);
      piece(p, NUB, C.skinDark, [0, -L + 70, -4], [44, 110, 40]);
      // The deltoid cap over the joint, so the arm stays rooted in the shoulder however it swings.
      piece(p, NUB, C.skinDark, [0, -L + 18, 0], [48, 74, 48]);
      piece(p, box, C.sinew, [0, 6, -16], [10, UPPER * 0.66, 8]);
      // A bony elbow under the skin.
      piece(p, BALL, C.skinLight, [0, L - 4, 2], [38, 36, 38]);
      // Fur cloaking the shoulder and hanging off the back of the upper arm.
      limbFur(p, -L + 6, -L + 40, 20, Math.PI, 10, 66);
      limbFur(p, -L + 40, 30, 16, 2.2, 10, 60);
    };
    const foreGeo = (p: THREE.BufferGeometry[]) => {
      const L = FORE / 2;
      // Two bones under taut skin, a sinew cord between, a knobbed wrist.
      piece(p, TUBE, C.skin, [6, 0, 0], [26, FORE - 10, 26]);
      piece(p, TUBE, C.skinLight, [-10, 4, -5], [15, FORE - 50, 15]);
      piece(p, box, C.sinew, [0, -6, 13], [8, FORE * 0.6, 7]);
      piece(p, BALL, C.skinLight, [0, L - 8, 0], [34, 30, 34]);
    };
    const handGeo = (p: THREE.BufferGeometry[]) => {
      // Root-aligned, centred on the palm FIST_R above the ground (the wrist): four long, bony, knuckled fingers
      // arching up then down to black claws on the ground, splayed forward, and a hooked thumb behind. The spread
      // is scaled by HAND; the claw tips still reach the ground.
      const h = (x: number, y: number, z: number): V3 => [x * HAND, y > 0 ? y * HAND : y, z * HAND];
      piece(p, BALL, C.skinDark, h(0, 2, 8), [60 * HAND, 30, 74 * HAND]);
      for (const ang of [-0.55, -0.18, 0.18, 0.55]) {
        const s = Math.sin(ang);
        const c = Math.cos(ang);
        const k = h(s * 24, 4, c * 34);
        const j1 = h(s * 70, 36, c * 96);
        const j2 = h(s * 108, -20, c * 146);
        const tip = h(s * 120, -FIST_R + 2, c * 176);
        piece(p, NUB, C.skinLight, k, [15, 15, 15]);
        strut(p, TUBE, C.skin, k, j1, 6.5);
        piece(p, NUB, C.skinLight, j1, [15, 15, 15]);
        strut(p, TUBE, C.skinDark, j1, j2, 5.5);
        piece(p, NUB, C.skinLight, j2, [12, 12, 12]);
        strut(p, spike, C.horn, j2, tip, 6.5);
      }
      strut(p, TUBE, C.skin, h(0, -6, -24), h(0, -34, -62), 6.5);
      strut(p, spike, C.horn, h(0, -34, -62), h(0, -FIST_R + 2, -88), 6.5);
    };
    const thighGeo = (p: THREE.BufferGeometry[]) => {
      const L = THIGH / 2;
      // A lean, wasted haunch under a shaggy fringe of fur; the knee knob forward.
      piece(p, NUB, C.skin, [0, -14, 0], [50, THIGH + 10, 46]);
      piece(p, box, C.sinew, [0, 0, -22], [10, THIGH * 0.6, 8]);
      piece(p, BALL, C.skinLight, [0, L - 2, 6], [38, 36, 38]);
      for (let k = 0; k < 8; k++) {
        const a = Math.PI + jit(1.7);
        _at.set(Math.sin(a) * 20, -L + 6 + (k % 4) * 18, Math.cos(a) * 20);
        shard(p, _at, _ref.set(Math.sin(a) * 0.25, 1, Math.cos(a) * 0.25), 60 + rand() * 30, 12 + rand() * 4, furRoot(), furTip(), rand() * 3);
      }
    };
    const shinGeo = (p: THREE.BufferGeometry[]) => {
      const L = SHIN / 2;
      // A thin bone back to the hock, its tendon cord behind; a bony hock.
      piece(p, TUBE, C.skin, [0, 0, 0], [24, SHIN, 24]);
      piece(p, box, C.sinew, [0, 10, -16], [9, SHIN * 0.8, 8]);
      piece(p, BALL, C.skinLight, [0, L - 2, -6], [32, 32, 32]);
    };
    const footGeo = (p: THREE.BufferGeometry[]) => {
      // Root-aligned on the hoof's ground point: the cannon bone from the hock down to a cloven black hoof.
      const fet: V3 = [0, 34, 6];
      strut(p, TUBE, C.skinDark, [HOCK.x, HOCK.y, HOCK.z], fet, 11);
      piece(p, NUB, C.skinLight, fet, [26, 24, 26]);
      strut(p, TUBE, C.skinDark, fet, [0, 16, 22], 10);
      for (const sx of [1, -1]) piece(p, TRI, C.horn, [sx * 11, 13, 30], [24, 26, 54], [0, sx * 0.08, 0]);
      for (const sx of [1, -1]) strut(p, spike, C.horn, [sx * 9, 36, -6], [sx * 12, 12, -22], 5);
    };
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({ upper: limb(upperGeo, UPPER), fore: limb(foreGeo, FORE), fist: limb(handGeo, 1) });
      this.legs.push({ thigh: limb(thighGeo, THIGH), shin: limb(shinGeo, SHIN), foot: limb(footGeo, 1) });
    }
  }

  private mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** Withering Ring: both hands rise and slam the ground. */
  nova(): void {
    this.novaT = 0;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const m = f.motion;
    // The stride in the frame's model units (the stat is the world stride before the monster scale).
    const S = G.stats.strideLength / G.scale;
    let T: { windup: number; impact: number; end: number } = G.stats.meleeTiming;
    let hold = STRIKE_HOLD;
    // Half the distance a planted limb slides back during stance, so it stays still on the ground.
    const A = ((1 - SWING) * S) / 2;
    if (this.novaT >= 0) {
      this.novaT += f.dt;
      if (this.novaT >= NOVA_TIME) this.novaT = -1;
    }
    const nova = this.novaT >= 0 ? this.novaT / NOVA_TIME : -1;

    // Leap: crouch on the ground, spring, reach and tuck in the air, land claws first, then rise out of the crouch.
    if (f.leap) {
      if (this.leapT < 0 || f.leap.t < this.leapT) this.leapPlanted = false;
      this.leapT = f.leap.t;
      this.leapD = f.leap.duration;
      this.leapC = f.leap.crouch;
    } else if (this.leapT >= 0) {
      this.leapT = Math.max(this.leapT, this.leapD) + f.dt;
      if (this.leapT > this.leapD + LEAP_RECOVER) this.leapT = -1;
    }
    const leap: LeapPose | null = this.leapT >= 0 && f.pose.collapse === 0 ? leapPhase(this.leapT, this.leapD, this.leapC) : null;
    // Off the ground (or pushing off it): from liftoff to touchdown.
    const flying = leap !== null && this.leapT >= this.leapC * this.leapD && this.leapT <= this.leapD;
    if (flying && !this.leapPlanted) {
      // Liftoff: remember where the limbs leave the ground from, so they push off it as the body springs up.
      this.root.updateMatrixWorld();
      for (let side = 0; side < 2; side++) {
        this.frame.localToWorld(this.leapPlant[side]!.copy(this.handAt[side]!));
        this.frame.localToWorld(this.leapPlant[2 + side]!.copy(this.footAt[side]!));
      }
      this.leapPlanted = true;
    }
    // Roar: a wolf's howl, all four limbs planted.
    const roarD = CONFIG.abilities.roar.duration;
    if (f.roaring) this.howlT = this.howlT < 0 ? 0 : this.howlT + f.dt;
    else if (this.howlT >= 0) {
      this.howlT = Math.max(this.howlT, roarD) + f.dt;
      if (this.howlT > roarD + HOWL_AFTER) this.howlT = -1;
    }
    const howl: HowlPose | null = this.howlT >= 0 && f.pose.collapse === 0 ? howlPose(this.howlT, roarD) : null;
    // The ground's height in the frame (the root rises off it in the air).
    this.root.updateMatrixWorld();
    this.frame.getWorldPosition(_look);
    const groundY = this.frame.worldToLocal(_look.setY(0)).y;
    // Up to touchdown the walk is frozen and every limb on the ground stays down (no gait lift).
    const leaping = leap !== null && this.leapT <= this.leapD;

    // Rending Claws: slam or backhand is decided once, as the strike starts; the body lunges toward the strike.
    let lean = 0;
    let leanA = 0;
    _lunge.set(0, 0, 0);
    if (f.melee) {
      this.root.updateMatrixWorld();
      this.frame.worldToLocal(_aim.copy(f.melee.target));
      _aim.y = FIST_R;
      // The kind the game decided (and deals damage as); only a frame without one falls back to the same rule here.
      if (strikeStarted(this.meleePrevT, f.melee.t)) this.strikeKind = f.melee.kind ?? fistKind(Math.atan2(_aim.x, _aim.z), G.fist.frontHalf);
      this.meleePrevT = f.melee.t;
      T = this.strikeTiming();
      hold = this.strikeHold();
      // A slam lunges at the target; a backhand toward the end of its sweep, so the sweep ends at the target's distance.
      const from = this.strikeKind === 'slam' ? LUNGE_FROM : BACKHAND_R;
      const k = (lungeAmount(Math.hypot(_aim.x, _aim.z), from, LUNGE_MAX) / LUNGE_MAX) * lungeWeight(f.melee.t, T, hold);
      leanA = this.strikeKind === 'slam' ? Math.atan2(_aim.x, _aim.z) : (f.melee.side === 0 ? 1 : -1) * G.fist.backhandCenter;
      _lunge.set(Math.sin(leanA) * LUNGE_MAX * k, -LUNGE_DROP * k, Math.cos(leanA) * LUNGE_MAX * k);
      lean = LUNGE_LEAN * k;
    } else this.meleePrevT = -1;

    // Shadow Hands: the claw on the flyer's side beckons, a slow gesture over the hand's whole grab (its own clock,
    // carried on after the anti-air strike ends); a new grab picks it up from wherever the claw already is.
    this.root.updateMatrixWorld();
    let airSide = -1;
    if (f.antiAir && !f.airborne && !f.roaring) {
      this.frame.worldToLocal(_sum.copy(f.antiAir.target));
      airSide = _sum.x >= 0 ? 0 : 1;
      const b = this.beckons[airSide]!;
      if (strikeStarted(this.airPrevT, f.antiAir.t)) b.lift = beckonResume(b.lift >= 0 ? beckonLift(b.lift) : 0);
      b.grab = f.antiAir.t;
      b.at.copy(f.antiAir.target);
      this.airPrevT = f.antiAir.t;
    } else this.airPrevT = -1;
    let summonSide = -1;
    let summon = 0;
    for (let side = 0; side < 2; side++) {
      const b = this.beckons[side]!;
      if (b.lift < 0) continue;
      if (f.airborne || f.roaring || f.pose.collapse > 0 || b.lift >= BECKON_END) {
        b.lift = b.grab = -1;
        b.aimed = false;
        continue;
      }
      const lift = beckonLift(b.lift);
      if (lift > summon) {
        summon = lift;
        summonSide = side;
        this.frame.worldToLocal(_sum.copy(b.at));
      }
      b.lift += f.dt;
      if (side !== airSide) b.grab += f.dt;
    }

    // Where each hand wants to be (root space): creep on it, or strike, slam (Withering Ring), claw at the sky
    // (Roar), reach down (Leap), beckon (Shadow Hands). A hand on the ground in its stance is planted.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const g = limbSwing(f.cycle, side === 0 ? 0 : 2);
      const ml = leaping ? 0 : m;
      const gait = this.gaitAt[side]!.set(FIST_AT.x * sx, FIST_AT.y + g.lift * FIST_LIFT * ml, FIST_AT.z + g.stride * A * m);
      const want = this.handAt[side]!.copy(gait);
      const striking = f.melee !== null && f.melee.side === side;
      this.extend[side] = 0;
      if (striking) {
        const t = f.melee!.t;
        this.strikePose(t, sx, gait, want);
        if (this.strikeKind === 'backhand') this.extend[side] = t < T.windup ? 0 : t < T.impact ? smooth(T.windup, T.impact, t) : 1 - strikeReturn(t, T, hold);
      }
      if (nova >= 0) {
        // Rise, slam down by 0.65, then ease back to the gait pose.
        mirror(SLAM_RAISE, sx, _raise);
        _end.set(sx * 280, FIST_R, 320);
        if (nova < 0.5) want.lerpVectors(gait, _raise, nova / 0.5);
        else if (nova < 0.65) want.lerpVectors(_raise, _end, (nova - 0.5) / 0.15);
        else want.lerpVectors(_end, gait, smooth(0, 1, (nova - 0.65) / 0.35));
      }
      const bk = this.beckons[side]!;
      const lift = bk.lift >= 0 ? beckonLift(bk.lift) : 0;
      const beckoning = !striking && nova < 0 && lift > 0;
      if (beckoning) {
        // Reach from the shoulder up toward the flyer, hauling down toward its ground point as the hand drags it
        // (the shoulder's range and the torso's rear and turn shape it).
        mirror(SHOULDER, sx, _raise);
        this.frame.worldToLocal(_end.copy(bk.at));
        _tmp.subVectors(_end, _raise).normalize();
        _ref.copy(_end).setY(0).sub(_raise).normalize();
        _tmp.lerp(_ref, beckonPull(bk.grab)).normalize();
        if (!bk.aimed) bk.dir.copy(_tmp);
        else bk.dir.lerp(_tmp, 1 - Math.exp(-BECKON_TURN * f.dt)).normalize();
        bk.aimed = true;
        _raise.addScaledVector(bk.dir, BECKON_REACH);
        want.lerp(_raise, lift);
      }
      if (flying) {
        // Push off where it left the ground, trail, reach forward, then come down claws first onto its walking plant.
        this.frame.worldToLocal(_end.copy(this.leapPlant[side]!));
        _raise.set(sx * 230, 40, 120).lerp(_tmp.set(sx * 190, 170, 480), leap!.reach);
        _raise.lerp(_ref.copy(gait).setY(groundY + gait.y), leap!.land);
        want.copy(_raise).lerp(_end, leap!.push);
      } else if (f.airborne) want.set(sx * 230, -30, 260);
      const posed = striking || nova >= 0 || beckoning || flying || (f.airborne && !leap);
      this.handPosed[side] = posed;
      this.handPlanted[side] = !posed && g.lift * m < 1e-3;
    }
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const g = limbSwing(f.cycle, side === 0 ? 3 : 1);
      const foot = this.footAt[side]!.set(FOOT_AT.x * sx, g.lift * FOOT_LIFT * m, FOOT_AT.z + g.stride * A * m);
      if (leaping) foot.y = 0;
      if (flying) {
        // Kick off where it left the ground, then stretch straight out behind (never tucked) through the flight,
        // reaching down for the ground after the claws; it bends only on landing, in the crouch on the ground.
        this.frame.worldToLocal(_end.copy(this.leapPlant[2 + side]!));
        _raise.copy(LEAP_TRAIL).setX(LEAP_TRAIL.x * sx);
        _raise.lerp(_ref.copy(foot).setY(groundY), smooth(0.4, 1, leap!.land));
        foot.copy(_raise).lerp(_end, leap!.push);
      } else if (f.airborne && !leap) foot.set(sx * 150, 60, -60);
      this.footPlanted[side] = !flying && !(f.airborne && !leap) && (leaping || g.lift * m < 1e-3);
    }

    // The body drives the reach: the torso turns (and rolls the shoulder down) toward a hand beyond the shoulder's
    // own sweep, and pitches with the strike: coiling into the windup, uncoiling through the swing, overshooting and
    // settling after (springs). The monster's heading and path never change; this is all pose inside the root.
    let twistT = 0;
    let leanT = 0;
    let strikeEnv = 0;
    if (f.melee && !f.roaring && !f.airborne && f.pose.collapse === 0) {
      const side = f.melee.side;
      const sx = side === 0 ? 1 : -1;
      const t = f.melee.t;
      this.strikePose(Math.min(T.end, t + (this.strikeKind === 'backhand' ? BACKHAND_LEAD : RECRUIT_LEAD)), sx, this.gaitAt[side]!, _lead);
      let reach = reachTwist(this.outBearing(_lead, sx), SWEEP_LO, SWEEP_HI, TWIST_MAX);
      // 0 → 1 through the windup, held to impact and the hold, then back to 0 by the end.
      const env = t < T.windup ? smooth(0, 1, t / T.windup) : 1 - strikeReturn(t, T, hold);
      strikeEnv = env;
      const u = Math.min(1, Math.max(0, (t - T.windup) / (T.impact - T.windup)));
      if (this.strikeKind === 'slam') {
        // Turn into the target; rear back as the claw rises, then drive the shoulders down onto it.
        twistT += sx * reach + 0.3 * Math.max(-1, Math.min(1, Math.atan2(_aim.x, _aim.z))) * env;
        leanT += t < T.windup ? -0.12 * env : t < T.impact ? -0.12 + 0.3 * u * u : 0.18 * env;
      } else {
        // Beside: coil away in the windup (the claw cocked across the chest), then uncoil through the sweep. Behind
        // (`rear`): the slow body could not get round in the sweep alone, so it winds round toward the target
        // through the windup instead of coiling away, most of the way by the impact.
        const rear = smooth(1.9, 2.8, Math.abs(Math.atan2(_aim.x, _aim.z)));
        if (rear > 0) {
          this.strikePose(T.impact + hold - 1e-3, sx, this.gaitAt[side]!, _peak);
          const peak = reachTwist(this.outBearing(_peak, sx), SWEEP_LO, SWEEP_HI, TWIST_MAX);
          const pre = 0.85 * peak * smooth(0, T.impact, t) * (1 - strikeReturn(t, T, hold));
          reach = (1 - rear) * reach + rear * Math.max(reach, pre);
        }
        twistT += sx * reach - sx * 0.14 * (1 - 0.6 * rear) * (t < T.windup ? env : 1 - u);
        leanT += 0.06 * env;
      }
    }
    if (nova >= 0) {
      // Withering Ring: rear back as both claws rise, then pitch hard down into the slam.
      const u = (nova - 0.5) / 0.15;
      leanT += nova < 0.5 ? -0.2 * smooth(0, 0.5, nova) : nova < 0.65 ? -0.2 + 0.52 * u * u : 0.32 * (1 - smooth(0.65, 1, nova));
    }
    if (summonSide >= 0 && summon > 0 && !(f.melee && f.melee.side === summonSide) && nova < 0) {
      // Shadow Hands: turn toward the flyer and rear up as the claw lifts at it.
      const sx = summonSide === 0 ? 1 : -1;
      const want = this.handAt[summonSide]!;
      twistT += sx * reachTwist(this.outBearing(want, sx), SWEEP_LO, SWEEP_HI, TWIST_MAX) + 0.25 * Math.max(-1.2, Math.min(1.2, Math.atan2(_sum.x, _sum.z))) * summon;
      mirror(SHOULDER, sx, _tmp);
      const rise = Math.asin(Math.max(-1, Math.min(1, (want.y - _tmp.y) / Math.max(1, want.distanceTo(_tmp)))));
      leanT -= 0.12 * summon + softCap(Math.max(0, rise - 0.5), 0.25);
    }
    const goal = Math.max(-TWIST_MAX, Math.min(TWIST_MAX, twistT));
    const step = TWIST_RATE * f.dt;
    this.twistGoal += Math.max(-step, Math.min(step, goal - this.twistGoal));
    const twistGoal = this.twistGoal;
    springStep(this.twist, twistGoal, TWIST_SPRING.omega, TWIST_SPRING.zeta, f.dt);
    this.pivotSteps(f, twistGoal, onFootLand);
    springStep(this.lean, leanT, LEAN_SPRING.omega, LEAN_SPRING.zeta, f.dt);

    // Pose the body; if the turn would overstretch a planted limb (skating it), soften the turn until it reaches.
    // The shoulders roll toward the planting hand; the body bobs twice a cycle and breathes when still.
    const roll = Math.sin(f.cycle * Math.PI * 2) * 0.07 * m;
    const bob = Math.cos(f.cycle * Math.PI * 4) * 10 * m + Math.sin(f.time * 1.1) * 6;
    const novaY = nova < 0 ? 0 : nova < 0.5 ? 15 * smooth(0, 0.5, nova) : nova < 0.65 ? 15 - 65 * ((nova - 0.5) / 0.15) ** 2 : -50 * (1 - smooth(0.65, 1, nova));
    const base = {
      y:
        PIVOT.y + bob - (leap ? LEAP_SINK * leap.sink : f.pose.dip) + novaY - f.pose.collapse * 230 +
        (howl ? -32 * howl.lower + 16 * howl.lift + 3 * Math.sin(f.time * 41) * howl.tremble : 0),
      // Leaning toward bearing leanA: +X rotation tips the shoulders forward (+Z), −Z rotation toward the left (+X).
      pitch: (leap ? leap.pitch : howl ? 0.14 * howl.lower - 0.12 * howl.lift : f.pose.pitch) + (f.dashing ? 0.25 : 0) + f.pose.collapse * 0.4 + Math.cos(leanA) * lean,
      roll: roll - f.pose.collapse * 0.15 - Math.sin(leanA) * lean + (howl ? 0.015 * Math.sin(f.time * 47) * howl.tremble : 0),
    };
    let k = 1;
    this.poseBody(base, k);
    if (this.overstretch() > 1) {
      this.poseBody(base, 0);
      const floor = Math.max(1, this.overstretch() + 1);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        this.poseBody(base, mid);
        if (this.overstretch() <= floor) lo = mid;
        else hi = mid;
      }
      k = lo;
      this.poseBody(base, k);
    }
    // The arms' frame: the body's turn plus the spine's bend at the shoulders.
    _armQ.copy(this.body.quaternion).multiply(_qy.setFromAxisAngle(_Y, bendAngleAt(SHOULDER.z, this.bend, SPINE_Z0, SPINE_Z1)));
    _armQInv.copy(_armQ).invert();

    // Arms: two-bone IK from a shoulder that slides toward a far hand; a posed arm is held to the shoulder's range.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const arm = this.limbArms[side]!;
      const planted = this.handPlanted[side]!;
      _fist.copy(this.handAt[side]!);
      this.torsoToRoot(mirror(SHOULDER, sx, _sh), _sh);
      _tmp.subVectors(_fist, _sh).applyQuaternion(_armQInv);
      const need = smooth(0.78, 1.02, _tmp.length() / ARM_REACH);
      _tmp.normalize();
      _tmp.set(_tmp.x, _tmp.y * 0.3, Math.max(-0.2, _tmp.z)).normalize().applyQuaternion(_armQ);
      _sh.addScaledVector(_tmp, PROTRACT * need);
      _tmp.subVectors(_fist, _sh);
      const ext = this.extend[side]!;
      if (ext > 0) {
        // Out to the arm's length at the hand's own height, so the claw sweeps through on a long arm.
        const h = Math.hypot(_tmp.x, _tmp.z);
        const far = Math.sqrt(Math.max(h * h, POSED_REACH * POSED_REACH - _tmp.y * _tmp.y));
        if (h > 1e-6) _tmp.set((_tmp.x / h) * (h + (far - h) * ext), _tmp.y, (_tmp.z / h) * (h + (far - h) * ext));
      }
      const len = Math.min(planted ? PLANTED_REACH : POSED_REACH, _tmp.length());
      if (!planted) this.holdToShoulder(_tmp, sx);
      _fist.copy(_sh).add(_tmp.setLength(len));
      if (!planted && _fist.y < HAND_FLOOR) {
        // Keep the claws out of the ground: lift the hand to the floor, pulling it in to keep the arm's length.
        const dy = HAND_FLOOR - _sh.y;
        const h = Math.hypot(_fist.x - _sh.x, _fist.z - _sh.z);
        const k = h > 1e-6 ? Math.sqrt(Math.max(0, len * len - dy * dy)) / h : 0;
        _fist.set(_sh.x + (_fist.x - _sh.x) * k, HAND_FLOOR, _sh.z + (_fist.z - _sh.z) * k);
      }
      // Elbows out and back (torso space), so they turn with the body; outside the arm's range, so never inverts.
      _ref.set(sx * 260, -40, -260).applyQuaternion(_armQ);
      _pole.copy(_sh).add(_ref);
      solveTwoBone(_sh, _fist, UPPER, FORE, _pole, _elbow);
      if (!planted) {
        // The elbow's bend can carry the upper arm past the range, and turning it back can drop the claws into the
        // ground: turn the whole arm about the shoulder for each in turn, the shoulder's range last (it wins).
        for (let pass = 0; pass < 3; pass++) {
          _tmp.subVectors(_elbow, _sh).normalize();
          _clamp.copy(_tmp);
          if (this.holdToShoulder(_clamp, sx) > 0) this.turnArm(_q.setFromUnitVectors(_tmp, _clamp));
          if (pass === 2 || _fist.y >= HAND_FLOOR) break;
          _tmp.subVectors(_fist, _sh);
          const l = _tmp.length();
          const dy = Math.max(-l, HAND_FLOOR - _sh.y);
          const h = Math.hypot(_tmp.x, _tmp.z);
          const k = h > 1e-6 ? Math.sqrt(Math.max(0, l * l - dy * dy)) / h : 0;
          _clamp.set(_tmp.x * k, dy, _tmp.z * k).normalize();
          this.turnArm(_q.setFromUnitVectors(_tmp.normalize(), _clamp));
        }
      }
      placeLimb(arm.upper, _sh, _elbow, _ref);
      placeLimb(arm.fore, _elbow, _fist, _ref);
      arm.fist.position.copy(_fist);
      if (m > 0.3 && planted && this.stepS[side] === 0 && limbPlanted(f.prevCycle, f.cycle, side === 0 ? 0 : 2)) {
        onFootLand(_world.copy(this.gaitAt[side]!).setY(0).applyMatrix4(this.frame.matrixWorld));
      }
    }

    // Hind legs: digitigrade, knees forward and hocks back; the IK runs hip to hock, the cannon bone rides the hoof.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const leg = this.legs[side]!;
      const foot = this.footAt[side]!;
      _hock.copy(foot).add(HOCK);
      this.torsoToRoot(mirror(HIP, sx, _hip), _hip);
      _pole.copy(_hip).add(_ref.set(sx * 30, 0, 300));
      solveTwoBone(_hip, _hock, THIGH, SHIN, _pole, _knee);
      placeLimb(leg.thigh, _hip, _knee, _ref);
      placeLimb(leg.shin, _knee, _hock, _ref);
      leg.foot.position.copy(foot);
      if (m > 0.3 && limbPlanted(f.prevCycle, f.cycle, side === 0 ? 3 : 1)) onFootLand(_world.copy(foot).setY(0).applyMatrix4(this.frame.matrixWorld));
    }

    // Dread Gaze: the skull turns (within limits) to stare at the target; the body's heading never changes for it.
    // It rides the end of the bent neck; its turn is eased in root space, so it holds on its target while the torso
    // turns under it. With no gaze target it looks back over its shoulder at a strike or a flyer it reaches for, and
    // otherwise the neck takes back HEAD_COUNTER of the torso's turn and pitch, so the skull stays roughly ahead.
    const frontYaw = this.body.rotation.y + this.bend;
    bendPoint(HEAD_PIVOT, this.bend, SPINE_Z0, SPINE_Z1, this.headPivot.position);
    const counterPitch = -HEAD_COUNTER * this.lean.x * k;
    let yaw = (1 - HEAD_COUNTER) * frontYaw;
    let pitch = 0;
    this.shell.updateMatrixWorld(true);
    if (f.lookAt && f.pose.collapse === 0 && !howl) {
      this.shell.worldToLocal(_sum.copy(f.lookAt)).sub(this.headPivot.position).applyAxisAngle(_Y, -this.bend);
      const horiz = Math.hypot(_sum.x, _sum.z);
      yaw = Math.max(-GAZE_YAW, Math.min(GAZE_YAW, Math.atan2(_sum.x, _sum.z))) + frontYaw;
      // At rest the skull already looks ~0.45 rad below level; pitch only makes up the difference.
      pitch = Math.max(-GAZE_UP, Math.min(GAZE_DOWN, Math.atan2(-_sum.y, horiz) - 0.45)) - counterPitch;
    } else if (f.pose.collapse === 0) {
      const w = f.melee && this.strikeKind === 'backhand' ? strikeEnv : summonSide >= 0 ? summon : 0;
      if (w > 0) {
        _look.copy(this.headPivot.position).applyMatrix4(this.shell.matrix).applyMatrix4(this.body.matrix);
        const tgt = f.melee && this.strikeKind === 'backhand' ? _aim : this.frame.worldToLocal(_tmp.copy(this.beckons[summonSide]!.at));
        const want = frontYaw + Math.max(-GAZE_YAW, Math.min(GAZE_YAW, angleWrap(Math.atan2(tgt.x - _look.x, tgt.z - _look.z) - frontYaw)));
        yaw += (want - yaw) * w;
      }
    }
    const kh = 1 - Math.exp(-(f.lookAt ? GAZE_RATE : GAZE_RATE * 0.5) * f.dt);
    this.headYaw += (yaw - this.headYaw) * kh;
    this.headPitch += (pitch - this.headPitch) * kh;
    this.headPivot.rotation.set(
      Math.max(-GAZE_UP, Math.min(GAZE_DOWN, this.headPitch + counterPitch + (leap ? 0.3 * Math.max(0, leap.sink) : 0))),
      this.bend + Math.max(-GAZE_YAW, Math.min(GAZE_YAW, this.headYaw - frontYaw)),
      0,
      'YXZ',
    );
    this.jawPivot.rotation.x = 0;
    if (howl) {
      // The howl: head dropped in the build-up, then the neck stretches up and the skull tips back until the
      // muzzle points at the sky, jaw hanging wide; it sways a little and shudders as it holds.
      this.headPivot.rotation.x += 0.3 * howl.lower - HOWL_TILT * howl.lift + 0.03 * Math.sin(f.time * 53) * howl.tremble;
      this.headPivot.rotation.y += 0.1 * Math.sin(this.howlT * 2.6) * howl.lift;
      this.headPivot.position.y += 40 * howl.lift - 25 * howl.lower;
      this.headPivot.position.z += 24 * howl.lift;
      this.jawPivot.rotation.x = 0.75 * howl.jaw + 0.05 * Math.sin(f.time * 37) * howl.tremble;
    }
    // Launch points ride the bent back.
    for (const L of this.launchMounts) {
      bendPoint(L.pos, this.bend, SPINE_Z0, SPINE_Z1, L.obj.position);
      L.obj.quaternion.setFromAxisAngle(_Y, bendAngleAt(L.pos.z, this.bend, SPINE_Z0, SPINE_Z1)).multiply(L.quat);
    }

    // The body is matte: its emissive carries only the hit flash and the level-up glow.
    if (f.flash) this.bodyMat.emissive.setHex(0xffffff);
    else this.bodyMat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    this.torsoMat.emissive.copy(this.bodyMat.emissive);
  }

  /**
   * Body pose with `k` (0..1) of the recruited turn, roll, shift, crouch and pitch: the torso turns about the hips'
   * midpoint (HIPS). Updates `_rel` (torso → root space).
   */
  private poseBody(base: { y: number; pitch: number; roll: number }, k: number): void {
    const tw = this.twist.x * k;
    // The hips counter-rotate a little; the spine bends the rest of the way, so the front turns by tw in all.
    const hipYaw = -HIP_COUNTER * tw;
    this.bend = tw - hipYaw;
    this.bendU.value = this.bend;
    const soft = softCap(tw, RECRUIT_SOFT);
    // Keep the hips' midpoint where the unrecruited pose has it: offset by R₀·HIPS − R·HIPS (about PIVOT).
    this.body.rotation.set(base.pitch, 0, base.roll, 'YXZ');
    _ly.subVectors(HIPS, PIVOT).applyQuaternion(this.body.quaternion);
    this.body.rotation.set(base.pitch + this.lean.x * k, hipYaw, base.roll - ROLL_PER_TWIST * soft, 'YXZ');
    _lx.subVectors(HIPS, PIVOT).applyQuaternion(this.body.quaternion);
    this.body.position
      .set(PIVOT.x + SHIFT_PER_TWIST * soft, base.y - CROUCH_PER_TWIST * Math.abs(soft), PIVOT.z)
      .add(_lunge)
      .add(_ly.sub(_lx));
    this.body.updateMatrix();
    this.root.updateMatrixWorld(true);
    _rel.multiplyMatrices(this.body.matrix, this.shell.matrix);
  }

  /** Torso-space point p (unbent) to root space through the spine's bend and the body's pose. */
  private torsoToRoot(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return bendPoint(p, this.bend, SPINE_Z0, SPINE_Z1, out).applyMatrix4(_rel);
  }

  /**
   * Pivot steps: while the turn (`goal`, + left) is past STEP_ON, the planted hand on the far side lifts and
   * re-plants under the turned shoulders (a world-fixed spot, so it never skates as the body walks on), then steps
   * back onto its gait once the turn eases. Overrides that hand's `handAt` and planted flag.
   */
  private pivotSteps(f: BodyFrame, goal: number, onFootLand: (p: THREE.Vector3) => void): void {
    this.root.updateMatrixWorld();
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const support = !this.handPosed[side] && !f.airborne && f.pose.collapse === 0 && (goal > 0 ? side === 1 : side === 0);
      const was = this.stepS[side]!;
      const on = support && Math.abs(goal) > (was > 0 ? STEP_OFF : STEP_ON);
      if (on && was < 1) {
        // In the air: aim the plant under the deepest turn so far (its rest spot, carried through that turn).
        if (was === 0 || Math.abs(goal) > Math.abs(this.stepTwist[side]!)) this.stepTwist[side] = goal;
        const tw = this.stepTwist[side]!;
        bendPoint(mirror(FIST_AT, sx, _look), tw * (1 + HIP_COUNTER), SPINE_Z0, SPINE_Z1, _look);
        _look.sub(HIPS).applyAxisAngle(_Y, -HIP_COUNTER * tw).add(HIPS).setY(FIST_AT.y);
        this.frame.localToWorld(this.stepAt[side]!.copy(_look));
      }
      const s = stepToward(was, on, f.dt, STEP_TIME);
      this.stepS[side] = s;
      if (s <= 0) continue;
      const ph = pivotStep(s);
      this.frame.worldToLocal(_look.copy(this.stepAt[side]!));
      this.handAt[side]!.lerpVectors(this.gaitAt[side]!, _look, ph.blend);
      this.handAt[side]!.y += ph.lift * FIST_LIFT;
      this.handPlanted[side] = s >= 1;
      if (was < 1 && s >= 1) onFootLand(_world.copy(this.stepAt[side]!).setY(0));
    }
  }

  /** Turn the arm being posed (`_elbow`, `_fist`) by q about its shoulder `_sh`. */
  private turnArm(q: THREE.Quaternion): void {
    _elbow.sub(_sh).applyQuaternion(q).add(_sh);
    _fist.sub(_sh).applyQuaternion(q).add(_sh);
  }

  /** How far (units) the worst planted limb is beyond its reach in the current body pose (≤ 0 when all reach). */
  private overstretch(): number {
    let worst = -Infinity;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      if (this.handPlanted[side]) worst = Math.max(worst, this.torsoToRoot(mirror(SHOULDER, sx, _sh), _sh).distanceTo(this.handAt[side]!) - PLANTED_REACH);
      if (this.footPlanted[side]) {
        _hock.copy(this.footAt[side]!).add(HOCK);
        worst = Math.max(worst, this.torsoToRoot(mirror(HIP, sx, _hip), _hip).distanceTo(_hock) - (THIGH + SHIN - 2));
      }
    }
    return worst;
  }

  /**
   * Hold root-space arm direction `d` (any length; written back as a unit vector) to the shoulder's range on side
   * sx, in the current torso frame. Returns the angle (rad) it moved.
   */
  private holdToShoulder(d: THREE.Vector3, sx: number): number {
    d.applyQuaternion(_armQInv);
    d.x *= sx;
    const moved = clampShoulder(d, SHOULDER_LIM, d);
    d.x *= sx;
    d.applyQuaternion(_armQ);
    return moved;
  }

  /**
   * Horizontal bearing (rad) of root-space point p from side sx's resting shoulder (plus the lunge): 0 ahead, +
   * outward; behind the shoulder past π (outwardBearing), so a target astern turns the body toward it.
   */
  private outBearing(p: THREE.Vector3, sx: number): number {
    return outwardBearing(sx * (p.x - sx * SHOULDER.x - _lunge.x), p.z - SHOULDER.z - _lunge.z);
  }

  /**
   * Rending Claws (root space; `_aim` holds the target and `_lunge` the body's lunge). Slam: rise, then drop onto the
   * target. Backhand: cock across the chest, then sweep out around the side in a wide arc toward the target's bearing
   * (as far round as BACKHAND_END_MAX; the torso's turn carries it the rest), carrying through past contact. A slam
   * holds on the target for STRIKE_HOLD; then both ease back to the gait position. The kind (and so the timeline) is
   * the one latched at the strike's start.
   */
  private strikePose(t: number, sx: number, gait: THREE.Vector3, out: THREE.Vector3): void {
    const T = this.strikeTiming();
    const hold = this.strikeHold();
    if (this.strikeKind === 'slam') {
      mirror(SLAM_RAISE, sx, _raise);
      if (t < T.windup) out.lerpVectors(gait, _raise, smooth(0, 1, t / T.windup));
      else if (t < T.impact) {
        const u = (t - T.windup) / (T.impact - T.windup);
        out.lerpVectors(_raise, _aim, u * u);
      } else out.lerpVectors(_aim, gait, strikeReturn(t, T, hold));
      return;
    }
    mirror(BACKHAND_COCK, sx, _raise);
    const a0 = Math.atan2(_raise.x, _raise.z);
    const r0 = Math.hypot(_raise.x, _raise.z);
    const a1 = sx * Math.max(BACKHAND_END_MIN, Math.min(BACKHAND_END_MAX, Math.abs(Math.atan2(_aim.x, _aim.z))));
    // Along the sweep at progress u (backhandSweep: 1 is contact, past 1 the carry-through), round the body.
    // The sweep's bearing at progress u, never round past dead astern (the carry-through stops there).
    const angAt = (u: number) => sx * Math.min(BACKHAND_END_MAX, sx * (a0 + (a1 - a0) * u));
    const at = (u: number, o: THREE.Vector3) => {
      const a = angAt(u);
      const k = Math.min(1, u);
      const r = r0 + (BACKHAND_SWEEP_R - r0) * k;
      // Low early (ease-out), so the claw sweeps round under the turning head.
      const ky = 1 - (1 - k) * (1 - k);
      return o.set(Math.sin(a) * r + _lunge.x, _raise.y + (FIST_R + 30 - _raise.y) * ky, Math.cos(a) * r + _lunge.z);
    };
    if (t < T.windup) out.lerpVectors(gait, _raise, smooth(0, 1, t / T.windup));
    else if (t < T.impact + hold) at(backhandSweep(t, T, hold), out);
    else {
      // Home the way it came, round the outside (never back under the body), onto the walking hand.
      const peak = backhandSweep(T.end, T, hold);
      at(peak, _end);
      const r = strikeReturn(t, T, hold);
      const ae = angAt(peak);
      const re = Math.hypot(_end.x - _lunge.x, _end.z - _lunge.z);
      const ag = Math.atan2(gait.x, gait.z);
      const a = ae + (ag - ae) * r;
      const rr = re + (Math.hypot(gait.x, gait.z) - re) * r;
      out.set(Math.sin(a) * rr + _lunge.x * (1 - r), _end.y + (gait.y - _end.y) * r, Math.cos(a) * rr + _lunge.z * (1 - r));
    }
  }

  /** The latched strike's timeline: the backhand's own, slower one, or the kind's meleeTiming for a slam. */
  private strikeTiming(): { windup: number; impact: number; end: number } {
    return this.strikeKind === 'backhand' ? G.fist.backhandTiming : G.stats.meleeTiming;
  }

  /** Seconds the latched strike's hand holds (slam) or carries through (backhand) after impact. */
  private strikeHold(): number {
    return this.strikeKind === 'backhand' ? BACKHAND_HOLD : STRIKE_HOLD;
  }

  /** Shots leave from the launch points on the back in turn. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.launchPts[this.nextLaunch++ % this.launchPts.length]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first launch point. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.launchPts[0]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.bodyMat.dispose();
    this.torsoMat.dispose();
    this.depthMat.dispose();
  }
}

/** a wrapped into (−π, π]. */
function angleWrap(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}
