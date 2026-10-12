import * as THREE from 'three';
import { CONFIG } from '../config';
import { cameraPose } from '../systems/orbit';

export type IntroPhase = 'space' | 'reentry' | 'clouds' | 'descent' | 'impact' | 'settle' | 'emerge' | 'done';

const I = CONFIG.intro;
const S = I.starts;
const ORDER: readonly Exclude<IntroPhase, 'done'>[] = ['space', 'reentry', 'clouds', 'descent', 'impact', 'settle', 'emerge'];
const NEXT: Record<Exclude<IntroPhase, 'done'>, keyof typeof S> = {
  space: 'reentry',
  reentry: 'clouds',
  clouds: 'descent',
  descent: 'impact',
  impact: 'settle',
  settle: 'emerge',
  emerge: 'done',
};

export const INTRO_LENGTH = S.done;
/** The space scene is shown before this time; the game world after (hidden under the re-entry flash). */
export const CUT_TIME = S.clouds;
export const IMPACT_TIME = S.impact;
export const EMERGE_TIME = S.emerge;

export function phaseAt(t: number): { phase: IntroPhase; k: number } {
  if (t >= INTRO_LENGTH) return { phase: 'done', k: 1 };
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const p = ORDER[i]!;
    if (t >= S[p]) return { phase: p, k: (t - S[p]) / (S[NEXT[p]] - S[p]) };
  }
  return { phase: 'space', k: 0 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const V = (a: readonly [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Game-world pod position: accelerating fall from high and behind to the origin, then half-buried. */
export function podPath(t: number, out: THREE.Vector3): THREE.Vector3 {
  if (t > IMPACT_TIME) return out.set(0, I.podRestY, 0);
  const u = clamp01((t - CUT_TIME) / (IMPACT_TIME - CUT_TIME));
  return out.set(0, I.dropHeight * (1 - u * u), -I.dropBack * (1 - u));
}

/** The camera pose gameplay starts with (default orbit around the monster at the origin). */
export function gameplayPose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const c = CONFIG.camera;
  const p = cameraPose({ yaw: c.defaultYaw, pitch: c.defaultPitch, distance: c.defaultDistance }, { x: 0, y: 0, z: 0 });
  return { pos: new THREE.Vector3(...p.pos), look: new THREE.Vector3(...p.look) };
}

const _pod = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Game-world camera after the cut: follows behind the falling pod, swings out to a wide shot by
 * impact, holds through the settle, then eases into the gameplay pose, reaching it at INTRO_LENGTH.
 */
export function cameraPath(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const wide = V(I.camWide);
  const lookImpact = V(I.lookImpact);
  if (t < IMPACT_TIME) {
    podPath(t, _pod);
    const d = easeInOut(clamp01((t - S.descent) / (IMPACT_TIME - S.descent)));
    // Offset blends from "follow the pod" to the absolute wide shot (pod is at the origin at impact).
    out.pos.copy(_pod).add(_a.copy(V(I.camFollow)).lerp(_b.copy(wide).sub(_pod), d));
    // The look target rides with the pod (which reaches the origin at impact), so it stays in frame.
    out.look.copy(_pod).add(_a.copy(V(I.lookFollow)).lerp(lookImpact, d));
    return out;
  }
  if (t < EMERGE_TIME) {
    out.pos.copy(wide);
    out.look.copy(lookImpact);
    return out;
  }
  const g = gameplayPose();
  const e = easeInOut(clamp01((t - EMERGE_TIME) / (INTRO_LENGTH - EMERGE_TIME)));
  out.pos.copy(wide).lerp(g.pos, e);
  out.look.copy(lookImpact).lerp(g.look, e);
  return out;
}

/** White-orange screen wash: builds through late re-entry, peaks at the cut (hiding it), fades; a shorter flash at impact. */
export function flashAt(t: number): number {
  const F = I.flash;
  if (t < CUT_TIME) {
    const u = clamp01((t - (CUT_TIME - F.rise)) / F.rise);
    return u * u;
  }
  if (t < CUT_TIME + F.hold) return 1;
  if (t < CUT_TIME + F.hold + F.fade) return 1 - (t - CUT_TIME - F.hold) / F.fade;
  if (t >= IMPACT_TIME && t < IMPACT_TIME + F.impactFade) return F.impactPeak * (1 - (t - IMPACT_TIME) / F.impactFade);
  return 0;
}

/** Camera trauma 0..1: grows through re-entry, buffets in the clouds, peaks at impact, rumbles as the cocoon splits. */
export function shakeAt(t: number): number {
  const { phase, k } = phaseAt(t);
  switch (phase) {
    case 'reentry':
      return 0.7 * k * k;
    case 'clouds':
      return 0.25;
    case 'descent':
      return 0.25 + 0.25 * k;
    case 'impact':
      return 1;
    case 'settle':
      return 0.6 * Math.max(0, 1 - k * 3);
    case 'emerge':
      return k < 0.3 ? 0.35 : 0;
    default:
      return 0;
  }
}

/** Monster root y while it climbs out: riseDepth (× monster scale) below the crater floor up to 0, eased out. */
export function monsterRiseY(t: number): number {
  const u = clamp01((t - EMERGE_TIME) / I.riseTime);
  const e = 1 - (1 - u) * (1 - u);
  return u >= 1 ? 0 : -I.riseDepth * CONFIG.monster.scale * (1 - e);
}
