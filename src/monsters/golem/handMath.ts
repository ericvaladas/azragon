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
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Pose weights at `t` seconds into a grab. The grip opens again while dragging when the flyer survived (`released`). */
export function handPhase(t: number, released = false): HandPhase {
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
  if (released && t > T.hold) grip *= 1 - clamp01((t - T.hold) / 0.27);
  // The drag accelerates (ease-in): a slow first pull, then a yank into the ground.
  const d = clamp01((t - T.hold) / (T.drag - T.hold));
  const drag = d * d * d;
  const fade = smooth(clamp01((t - T.drag) / (T.total - T.drag)));
  const pool = smooth(clamp01(t / T.emerge)) * (1 - fade);
  return { rise, grip, drag, fade, pool };
}

/**
 * Ground point (y = 0) the arm rises from for a flyer at `flyer`, the monster standing at `monster`: out beyond the
 * flyer, away from the monster (so the arm never comes out of its body), turned up to ±1.1 rad off that line by
 * `rand` (0..1), and set back from the flyer's ground point by 0.7 × its altitude, clamped to 120..360 m, so the arm
 * leans in rather than standing straight up.
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
  const off = Math.min(360, Math.max(120, flyer.y * 0.7));
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

/**
 * Hand frame at `rise` for an arm from its pool at `base` reaching for `target` (unit vectors): F along the hand
 * toward the fingertips, S across the knuckles, N out of the palm (S × F = N). The hand bursts out of the pool
 * reaching up, palm toward the flyer, and rolls over as it rises until, over the flyer, the fingers point on past it
 * and down and the palm faces down: an overhand grip, the fingers curling down around the prize.
 */
export function handFrame(base: THREE.Vector3, target: THREE.Vector3, rise: number, F: THREE.Vector3, S: THREE.Vector3, N: THREE.Vector3): void {
  _h.set(target.x - base.x, 0, target.z - base.z);
  if (_h.lengthSq() < 1e-6) _h.set(0, 0, 1);
  _h.normalize();
  const p = -1.25 + 1.9 * smooth(clamp01((rise - 0.15) / 0.7));
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

/**
 * Joints of an arm from `base` to `wrist` (out[0] = base, out[n] = wrist): a quadratic curve bowed up and away
 * from the straight line by `bend` × its length (an elbow), and sideways by `twist` × its length.
 */
export function armJoints(base: THREE.Vector3, wrist: THREE.Vector3, bend: number, twist: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const n = out.length - 1;
  _d.subVectors(wrist, base);
  const len = _d.length();
  if (len < 1e-6) {
    for (const p of out) p.copy(base);
    return out;
  }
  _d.divideScalar(len);
  // "Up" across the line: world up with the line's own direction taken out.
  _up.set(0, 1, 0).addScaledVector(_d, -_d.y);
  if (_up.lengthSq() < 1e-6) _up.set(1, 0, 0);
  _up.normalize();
  _side.crossVectors(_d, _up);
  _ctrl.addVectors(base, wrist).multiplyScalar(0.5).addScaledVector(_up, bend * len).addScaledVector(_side, twist * len);
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    out[k]!.set(a * base.x + b * _ctrl.x + c * wrist.x, a * base.y + b * _ctrl.y + c * wrist.y, a * base.z + b * _ctrl.z + c * wrist.z);
  }
  return out;
}
