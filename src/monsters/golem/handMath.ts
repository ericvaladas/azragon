import * as THREE from 'three';
import { SWAT_TIMES } from '../../monster/tailSwat';

/**
 * Shadow Hands timeline (s from the grab's start), on the shared anti-air clock: the hand bursts out of its pool by
 * EMERGE, lunges onto the flyer by IMPACT (when the anti-air damage lands), crushes until HOLD, drags the wreck down
 * to the pool by DRAG, then dissolves into smoke by TOTAL.
 */
export const HAND_T = (() => {
  const emerge = SWAT_TIMES.windup;
  const impact = SWAT_TIMES.impact;
  const hold = impact + 0.14;
  const drag = hold + 0.6;
  return { emerge, impact, hold, drag, total: drag + 0.45 };
})();

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
  // Clawed as it surfaces, spread wide during the lunge, snapping shut just as it arrives.
  let grip: number;
  if (t < T.emerge) grip = 0.35 * (1 - t / T.emerge);
  else if (t < T.impact - 0.04) grip = 0;
  else grip = smooth(clamp01((t - (T.impact - 0.04)) / 0.12));
  if (released && t > T.hold) grip *= 1 - clamp01((t - T.hold) / 0.2);
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
