import * as THREE from 'three';
import { swatTiming } from '../../monster/tailSwat';

/**
 * The Wendigo's anti-air timeline (its kind's `swatTiming`): the shared one slowed about a third, so the claw it
 * lifts at the flyer reads as a deliberate, heavy reach; the damage lands 0.07 s later than the shared impact.
 */
export const WENDIGO_SWAT = swatTiming(0.16, 0.13, 0.11, 0.31);

/**
 * Shadow Hands timeline (s from the grab's start), on the Wendigo's anti-air clock and as slow and heavy as its claw
 * swat: the hand bursts out of its pool by EMERGE, lunges onto the flyer by IMPACT (when the anti-air damage lands),
 * crushes until HOLD, drags the wreck down to the pool by DRAG, then dissolves into smoke by TOTAL. Its fingers take
 * CLOSE s to shut, starting just before IMPACT.
 */
export const HAND_T = (() => {
  const emerge = WENDIGO_SWAT.windup;
  const impact = WENDIGO_SWAT.impact;
  const hold = impact + 0.19;
  const drag = hold + 0.8;
  return { emerge, impact, hold, drag, total: drag + 0.6, close: 0.16 };
})();

/**
 * The Wendigo's beckoning claw over a whole Shadow Hands grab (s, on its own clock, not the swat's): it lifts slowly
 * toward the flyer, reaching full stretch by RISE (as though drawing the hand up out of the ground), lingers, and
 * lowers back to the walk from LOWER to END, the end of the grab.
 */
export const BECKON_T = { rise: 0.95, lower: 1.2, end: HAND_T.total };

/** 0..1: how far the beckoning claw is lifted toward the flyer `t` s into its gesture. */
export function beckonLift(t: number): number {
  const B = BECKON_T;
  if (t <= 0 || t >= B.end) return 0;
  const up = Math.pow(smooth(Math.min(1, t / B.rise)), 1.3);
  return up * (1 - smooth(clamp01((t - B.lower) / (B.end - B.lower))));
}

/**
 * 0..1: how far the beckoning claw hauls down toward the ground `t` s into the grab (HAND_T clock): a tug as the
 * shadow hand clenches on the flyer at IMPACT, then down with the hand's drag, all the way by DRAG.
 */
export function beckonPull(t: number): number {
  const T = HAND_T;
  if (t < T.impact) return 0;
  const d = clamp01((t - T.hold) / (T.drag - T.hold));
  return 0.2 * smooth(clamp01((t - T.impact) / 0.14)) + 0.8 * d * d * d;
}

/** The gesture time on the rise at which the claw is lifted `lift` (0..1): a new grab picks up from there. */
export function beckonResume(lift: number): number {
  if (lift <= 0) return 0;
  let lo = 0;
  let hi = BECKON_T.rise;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (Math.pow(smooth(mid / BECKON_T.rise), 1.3) < lift) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The shadow hand's dimensions (m, before ShadowHands' scale), in its own frame: x across the knuckles (S, + toward
 * the little finger), y along the hand from the wrist (F), z out of the palm (N). The closed fist wraps round the
 * prize at (0, holdFwd, holdIn).
 */
export const HAND_DIM = {
  palmLen: 34,
  palmWidth: 40,
  thick: 13,
  /** Proximal, middle and distal phalanges, and each finger's length (index to little). */
  phalanx: [30, 25, 21] as const,
  fingerScale: [0.92, 1, 0.97, 0.8] as const,
  /** Thumb: metacarpal, proximal and distal, from its root at the heel of the palm on the index side. */
  thumb: [18, 22, 15] as const,
  thumbRoot: [-20, 10, 0] as const,
  holdFwd: 25,
  holdIn: 20,
};

/** Finger joint angles (rad, + curling toward the palm): knuckle, middle, tip; open (a little bent back), shut, squeeze. */
const CURL_OPEN = [-0.35, -0.12, -0.05] as const;
const CURL_SHUT = [1.25, 1.35, 0.95] as const;
const CURL_SQUEEZE = [0.1, 0.14, 0.12] as const;

/**
 * Joint angles [knuckle, middle, tip] of finger f (0 index .. 3 little) at grip g (0 open .. 1 shut) and squeeze
 * (0..1, the crush): each joint flexes in turn, knuckle first, and each finger a beat after the one before.
 */
export function jointCurl(g: number, squeeze: number, f: number): [number, number, number] {
  const gs = clamp01((g - 0.05 * f) / 0.85);
  const out: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const e = smooth(clamp01((gs - 0.14 * j) / 0.72));
    out[j] = CURL_OPEN[j]! + (CURL_SHUT[j]! - CURL_OPEN[j]!) * e + CURL_SQUEEZE[j]! * squeeze;
  }
  return out;
}

/**
 * Finger f's joints in the hand's frame (HAND_DIM): out[0] the knuckle on the end of the palm, out[1..2] the middle
 * and tip joints, out[3] the claw tip. Fanned wide when open, drawn together as it closes, curling toward the palm.
 */
export function fingerPoints(g: number, squeeze: number, f: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const D = HAND_DIM;
  const off = (f - 1.5) / 1.5;
  const c = jointCurl(g, squeeze, f);
  const spread = (0.5 - 0.42 * smooth(clamp01(g / 0.6))) * off;
  const sx = Math.sin(spread);
  const sy = Math.cos(spread);
  out[0]!.set(off * D.palmWidth * 0.42, D.palmLen, 0);
  let th = 0;
  for (let j = 0; j < 3; j++) {
    th += c[j]!;
    const l = D.phalanx[j]! * D.fingerScale[f]!;
    out[j + 1]!.set(out[j]!.x + sx * Math.cos(th) * l, out[j]!.y + sy * Math.cos(th) * l, out[j]!.z + Math.sin(th) * l);
  }
  return out;
}

/** Thumb segment directions (hand frame), open (out to the side, a little back) and shut (across, round the prize). */
const THUMB_OPEN = [new THREE.Vector3(-0.84, 0.54, -0.08), new THREE.Vector3(-0.8, 0.6, -0.05), new THREE.Vector3(-0.75, 0.66, 0)];
const THUMB_SHUT = [new THREE.Vector3(0.45, 0.55, 0.7), new THREE.Vector3(0.75, 0.35, 0.55), new THREE.Vector3(0.74, -0.56, -0.37)];
const _td = new THREE.Vector3();

/**
 * The thumb's joints in the hand's frame (out[0] its root at the heel of the palm .. out[3] the claw tip): splayed
 * out to the side when open; it swings across (opposed) and curls round the prize as it closes, joint by joint.
 */
export function thumbPoints(g: number, squeeze: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const D = HAND_DIM;
  out[0]!.set(...D.thumbRoot);
  for (let j = 0; j < 3; j++) {
    const e = Math.min(1.08, smooth(clamp01((g - 0.1 * j) / 0.8)) + 0.08 * squeeze);
    _td.copy(THUMB_OPEN[j]!).lerp(THUMB_SHUT[j]!, e).normalize();
    out[j + 1]!.copy(out[j]!).addScaledVector(_td, D.thumb[j]!);
  }
  return out;
}

export type HandPhase = {
  /** 0..1: how far the hand has travelled from the pool to the flyer (1 from IMPACT on). */
  rise: number;
  /** 0..1: finger closure (0 spread wide, 1 a crushing fist). */
  grip: number;
  /** 0..1: how far the held point has been dragged back down to the pool. */
  drag: number;
  /** 0..1: dissolve at the end of the grab. */
  fade: number;
  /** 0..1: the shadow pool's size. */
  pool: number;
  /** 0..1: the crush, the fist clenched tighter on the wreck it holds (0 when the flyer survived). */
  squeeze: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Pose weights at `t` seconds into a grab. Once shut the fist never opens again, to the end; when the flyer survived
 * (`survived`) it stays clenched on empty air, without the squeeze.
 */
export function handPhase(t: number, survived = false): HandPhase {
  const T = HAND_T;
  // Out of the pool slowly (a quarter of the way), then a fast lunge that decelerates onto the flyer.
  let rise: number;
  if (t < T.emerge) rise = 0.25 * smooth(clamp01(t / T.emerge));
  else {
    const u = clamp01((t - T.emerge) / (T.impact - T.emerge));
    rise = 0.25 + 0.75 * (1 - (1 - u) * (1 - u));
  }
  // Clawed as it surfaces, spread wide during the lunge, closing hard as it arrives.
  let grip: number;
  if (t < T.emerge) grip = 0.35 * (1 - t / T.emerge);
  else if (t < T.impact - 0.06) grip = 0;
  else grip = smooth(clamp01((t - (T.impact - 0.06)) / T.close));
  // The drag accelerates (ease-in): a slow first pull, then a yank into the ground.
  const d = clamp01((t - T.hold) / (T.drag - T.hold));
  const drag = d * d * d;
  const fade = smooth(clamp01((t - T.drag) / (T.total - T.drag)));
  const pool = smooth(clamp01(t / T.emerge)) * (1 - fade);
  const squeeze = survived ? 0 : smooth(clamp01((t - T.impact - 0.06) / 0.12)) * (1 - smooth(clamp01((t - T.drag) / 0.25)));
  return { rise, grip, drag, fade, pool, squeeze };
}

/**
 * Ground point (y = 0) the arm rises from for a flyer at `flyer`, the monster standing at `monster`: out beyond the
 * flyer, away from the monster (so the arm never comes out of its body), turned up to ±1.1 rad off that line by
 * `rand` (0..1), and set back from the flyer's ground point by 1.3 × its altitude, clamped to 180..600 m, so the
 * arm leans in long and low rather than standing up steeply (and need hardly bend to come over the flyer).
 */
export function handBase(flyer: THREE.Vector3, monster: THREE.Vector3, rand: number, out: THREE.Vector3): THREE.Vector3 {
  let dx = flyer.x - monster.x;
  let dz = flyer.z - monster.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) {
    dx = 1;
    dz = 0;
  } else {
    dx /= len;
    dz /= len;
  }
  const a = (rand * 2 - 1) * 1.1;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const off = Math.min(600, Math.max(180, flyer.y * 1.3));
  return out.set(flyer.x + (dx * c - dz * s) * off, 0, flyer.z + (dx * s + dz * c) * off);
}

/** How high (m) the closing hand arcs over the flyer before it drops onto it (overhand). */
const HOVER = 80;

/**
 * Where the fist closes at `rise` (handPhase) for a flyer at `target`, the arm rising from its pool at `base`: out of
 * the pool toward the flyer, arcing up over it (HOVER) and dropping down onto it exactly at rise 1, so it grabs from
 * above.
 */
export function fistPoint(base: THREE.Vector3, target: THREE.Vector3, rise: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(base.x, 40, base.z).lerp(target, rise);
  // Over the top: up as it reaches out, then down onto the flyer, still falling (linearly) as it arrives.
  const g = (1 - rise) / 0.18;
  const over = smooth(clamp01((rise - 0.2) / 0.4)) * (g >= 1 ? 1 : 1 - (1 - g) * (1 - g));
  out.y += HOVER * over;
  return out;
}

/** How far (m) out from its pool, toward the flyer, the hand plunges its prize into the ground. */
const PLUNGE = 170;

/**
 * Where the fist holding its prize is `drag` (0..1, handPhase) of the way through dragging it down: from where it
 * closed (`held`) down into the ground PLUNGE out from the pool at `base`, toward the flyer, so the arm arches up out
 * of its pool, over, and down into the ground with it.
 */
export function dragPoint(base: THREE.Vector3, held: THREE.Vector3, drag: number, out: THREE.Vector3): THREE.Vector3 {
  _h.set(held.x - base.x, 0, held.z - base.z);
  if (_h.lengthSq() < 1e-6) _h.set(0, 0, 1);
  _h.normalize();
  return out.set(base.x + _h.x * PLUNGE, -30, base.z + _h.z * PLUNGE).lerp(held, 1 - drag);
}

/** Hand pitch (rad, + fingers down) over the flyer and at the end of the drag. */
const GRAB_PITCH = -0.3;
const DRAG_PITCH = 0.4;
/** The shadow arm's bow (armJointsTo `bend`): nearly straight, leaning in from its pool. */
export const ARM_BEND = 0.05;

/**
 * Hand frame at `rise` for an arm from its pool at `base` reaching for `target` (unit vectors): F along the hand
 * toward the fingertips, S across the knuckles, N out of the palm (S × F = N). The hand bursts out of the pool
 * reaching up, palm toward the flyer, and rolls over as it rises until, over the flyer, the fingers point on past it
 * about level and the palm faces down: an overhand grip, the fingers curling down around the prize. As it drags the
 * prize down (`down`) it tips on over, fingers pointing down toward the ground.
 */
export function handFrame(base: THREE.Vector3, target: THREE.Vector3, rise: number, F: THREE.Vector3, S: THREE.Vector3, N: THREE.Vector3, down = 0): void {
  _h.set(target.x - base.x, 0, target.z - base.z);
  if (_h.lengthSq() < 1e-6) _h.set(0, 0, 1);
  _h.normalize();
  // Over the flyer the fingers lie about level (GRAB_PITCH, a touch up, so the leaning arm need hardly bend to them:
  // the palm still faces down); dragging its prize down (`down` 0..1) the hand tips over to DRAG_PITCH.
  const p = -1.25 + (1.25 + GRAB_PITCH) * smooth(clamp01((rise - 0.15) / 0.7)) + (DRAG_PITCH - GRAB_PITCH) * smooth(clamp01(down));
  const c = Math.cos(p);
  const s = Math.sin(p);
  F.set(_h.x * c, -s, _h.z * c);
  N.set(-_h.x * s, -c, -_h.z * s);
  S.crossVectors(F, N);
}

const _h = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3();
const _side = new THREE.Vector3();
const _ctrl = new THREE.Vector3();

const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const DENSE = 64;
const _dense = Array.from({ length: DENSE + 1 }, () => new THREE.Vector3());
const _arc = new Array<number>(DENSE + 1).fill(0);

/**
 * Joints of an arm from `base` to `wrist` (out[0] = base, out[n] = wrist) that arrives along the hand's direction F
 * (unit), so the wrist never bends: a cubic curve bowed up and away from the straight line by `bend` × its length (a
 * raised elbow) and sideways by `twist`, its end tangent along F (it hooks over and comes down onto whatever the
 * hand holds; the forearm's approach runs back `approach` × its length along F), the last bone laid exactly along F.
 */
export function armJointsTo(base: THREE.Vector3, wrist: THREE.Vector3, F: THREE.Vector3, bend: number, twist: number, out: THREE.Vector3[], approach = 0.35): THREE.Vector3[] {
  const n = out.length - 1;
  _d.subVectors(wrist, base);
  const len = _d.length();
  if (len < 1e-6) {
    for (const p of out) p.copy(base);
    return out;
  }
  _d.divideScalar(len);
  _up.set(0, 1, 0).addScaledVector(_d, -_d.y);
  if (_up.lengthSq() < 1e-6) _up.set(1, 0, 0);
  _up.normalize();
  _side.crossVectors(_d, _up);
  // The quadratic's bowed control, two-thirds of the way out from the base; the far one back along F from the wrist.
  _ctrl.addVectors(base, wrist).multiplyScalar(0.5).addScaledVector(_up, bend * len).addScaledVector(_side, twist * len);
  _p1.copy(base).lerp(_ctrl, 2 / 3);
  _p2.copy(wrist).addScaledVector(F, -approach * len);
  // Sample the curve finely, then lay the joints at equal arc lengths along it, so the bones are even and the bend
  // is spread through the arm rather than bunched at the wrist.
  let total = 0;
  for (let i = 0; i <= DENSE; i++) {
    const u = i / DENSE;
    const a = (1 - u) ** 3;
    const b = 3 * (1 - u) ** 2 * u;
    const c = 3 * (1 - u) * u * u;
    const e = u ** 3;
    _dense[i]!.set(
      a * base.x + b * _p1.x + c * _p2.x + e * wrist.x,
      a * base.y + b * _p1.y + c * _p2.y + e * wrist.y,
      a * base.z + b * _p1.z + c * _p2.z + e * wrist.z,
    );
    if (i > 0) total += _dense[i]!.distanceTo(_dense[i - 1]!);
    _arc[i] = total;
  }
  let i = 1;
  for (let k = 0; k <= n; k++) {
    const want = (total * k) / n;
    while (i < DENSE && _arc[i]! < want) i++;
    const span = _arc[i]! - _arc[i - 1]!;
    out[k]!.lerpVectors(_dense[i - 1]!, _dense[i]!, span > 1e-9 ? (want - _arc[i - 1]!) / span : 0);
  }
  out[0]!.copy(base);
  out[n]!.copy(wrist);
  const last = out[n]!.distanceTo(out[n - 1]!);
  out[n - 1]!.copy(wrist).addScaledVector(F, -last);
  return out;
}

