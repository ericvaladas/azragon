import * as THREE from 'three';

/** An anti-air strike's timeline (s): cock back, lash to the target, hold, recover. Impact is when it arrives. */
export type SwatTiming = { windup: number; strike: number; hold: number; recover: number; impact: number; total: number };

export function swatTiming(windup: number, strike: number, hold: number, recover: number): SwatTiming {
  return { windup, strike, hold, recover, impact: windup + strike, total: windup + strike + hold + recover };
}

/** The shared anti-air timeline (Tail Swat, Snap Bite, Tentacle Lash; any kind without its own `swatTiming`). */
export const SWAT_TIMES = swatTiming(0.12, 0.1, 0.08, 0.22);

/** How far the tail is bent toward the target on timeline T: slightly negative while cocking back, 1 at full extension. */
export function swatWeight(t: number, T: SwatTiming = SWAT_TIMES): number {
  if (t <= 0 || t >= T.total) return 0;
  if (t < T.windup) return -0.25 * (t / T.windup);
  if (t < T.impact) return -0.25 + 1.25 * ((t - T.windup) / T.strike);
  if (t < T.impact + T.hold) return 1;
  return 1 - (t - T.impact - T.hold) / T.recover;
}

/** The Insect's tail swat: a longer timeline than the shared one, so the swing reads (cock, whip, follow through, recover). */
export const TAIL_SWING_TIMES = swatTiming(0.4, 0.3, 0.15, 0.6);
/** How far (rad, round the tail's root) a swing cocks out past the target, and follows through past it. */
const COCK = 0.9;
const FOLLOW = 0.6;

const ease = (u: number) => u * u * (3 - 2 * u);

/**
 * A tail swat at `t` on timeline T: how far the swing pose is blended in (0 at rest), and its sweep (rad round the
 * root from the target's bearing, + out to the target's side). It eases in while cocking out to COCK, whips across
 * (accelerating) to 0 at the hit, carries on to −FOLLOW through the hold, then blends out.
 */
export function swingPhase(t: number, T: SwatTiming = TAIL_SWING_TIMES): { blend: number; sweep: number } {
  if (t <= 0 || t >= T.total) return { blend: 0, sweep: 0 };
  if (t < T.windup) {
    const u = ease(t / T.windup);
    return { blend: u, sweep: COCK * u };
  }
  if (t < T.impact) {
    const u = (t - T.windup) / T.strike;
    return { blend: 1, sweep: COCK * (1 - u * u) };
  }
  if (t < T.impact + T.hold) {
    const u = (t - T.impact) / T.hold;
    return { blend: 1, sweep: -FOLLOW * (1 - (1 - u) * (1 - u)) };
  }
  return { blend: 1 - ease((t - T.impact - T.hold) / T.recover), sweep: -FOLLOW };
}

/**
 * A swing: how far (rad) it may turn toward its target either side; how far each segment turns from its coil toward
 * the whip's direction (fraction, so it throws out wide but keeps a little curve); and how steeply the whip may tilt
 * up toward the target (rad), never flatter than LIFT_MIN so it clears the legs.
 */
const MAX_TURN = 2.0;
const STRAIGHTEN = 0.9;
const LIFT_MIN = 0.3;
const LIFT_MAX = 0.9;

const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();

/**
 * Tail chain (model space) whipping round at `target`: it throws out from its coil toward the whip's direction (the
 * target's bearing, up to MAX_TURN, swung a further `sweep` rad out to the target's own side, tilted up toward it), so
 * it sweeps a wide arc through the target and hits with whatever part of it comes round. Each segment turns, keeping its
 * length, by `blend` (0 is the pose it was given); it never reaches, so it never grows.
 */
export function tailSwingPoints(base: readonly THREE.Vector3[], target: THREE.Vector3, sweep: number, blend: number): THREE.Vector3[] {
  const root = base[0]!;
  const side = target.x >= root.x ? 1 : -1;
  const dx = target.x - root.x;
  const dz = target.z - root.z;
  const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -MAX_TURN, MAX_TURN) + side * sweep;
  const lift = THREE.MathUtils.clamp(Math.atan2(target.y - root.y, Math.hypot(dx, dz)), LIFT_MIN, LIFT_MAX);
  _dir.set(Math.sin(yaw) * Math.cos(lift), Math.sin(lift), Math.cos(yaw) * Math.cos(lift));
  const out: THREE.Vector3[] = [root.clone()];
  for (let i = 1; i < base.length; i++) {
    _seg.subVectors(base[i]!, base[i - 1]!);
    const len = _seg.length();
    _q.setFromUnitVectors(_seg.normalize(), _dir);
    _qw.identity().slerp(_q, STRAIGHTEN * blend);
    out.push(out[i - 1]!.clone().addScaledVector(_seg.applyQuaternion(_qw), len));
  }
  return out;
}
