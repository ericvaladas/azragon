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

const _ctrl = new THREE.Vector3();
const _curve = new THREE.Vector3();

/**
 * Tail chain bent toward `target` (model space). Weight 0 is the rest pose; weight 1 lays the chain
 * along an arcing curve from the root to the target, so the tip lands exactly on it (stretching if needed).
 * The root never moves.
 */
export function tailSwatPoints(base: readonly THREE.Vector3[], target: THREE.Vector3, w: number): THREE.Vector3[] {
  const root = base[0]!;
  const n = base.length;
  _ctrl.addVectors(root, target).multiplyScalar(0.5);
  _ctrl.y += 250;
  return base.map((b, i) => {
    const k = i / (n - 1);
    const a = (1 - k) * (1 - k);
    const c = 2 * (1 - k) * k;
    const d = k * k;
    _curve.set(a * root.x + c * _ctrl.x + d * target.x, a * root.y + c * _ctrl.y + d * target.y, a * root.z + c * _ctrl.z + d * target.z);
    return b.clone().lerp(_curve, w);
  });
}
