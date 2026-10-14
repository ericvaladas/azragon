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

/** Where a skip lands: just before the reveal, so the reveal (and the music change on it) still plays. */
export const SKIP_TO = EMERGE_TIME - I.skipLead;

export type SkipAction = { kind: 'jump'; to: number } | { kind: 'finish'; reveal: boolean };

/** A skip at intro time `t`: before SKIP_TO, jump there; from SKIP_TO on, finish, firing the reveal first if the clock has not reached it. */
export function skipAction(t: number): SkipAction {
  if (t < SKIP_TO) return { kind: 'jump', to: SKIP_TO };
  return { kind: 'finish', reveal: t < EMERGE_TIME };
}

/** True on the frame the intro clock passes the start of the reveal (emerge). */
export function revealCrossed(prev: number, t: number): boolean {
  return prev < EMERGE_TIME && t >= EMERGE_TIME;
}

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

/** Cocoon length for a monster of this size: its largest dimension with room to spare. */
export function podLengthFor(size: { width: number; length: number; height: number }): number {
  return Math.max(size.width, size.length, size.height) * I.podFit;
}

/** The fall's angle below horizontal: the pod drops nose-first in a straight line from high and behind. */
export const FALL_PITCH = Math.atan2(I.dropHeight, I.dropBack);
/** Turns the pod's travel frame (+Z ahead) into the fall: nose pitched FALL_PITCH down. */
const FALL_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), FALL_PITCH);

/**
 * Game-world pod position: an accelerating, straight nose-first fall from high and behind to the origin, where it
 * stays (buried nose-first) until it splits. The cut joins the fall `dropJoin` of the way down, so the drop keeps its pace.
 */
export function podPath(t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = I.dropJoin + (1 - I.dropJoin) * clamp01((t - CUT_TIME) / (IMPACT_TIME - CUT_TIME));
  const s = 1 - u * u;
  return out.set(0, I.dropHeight * s, -I.dropBack * s);
}

/** The cocoon's roll about its long axis: steady through space and the fall, frozen where it was at impact. */
export function podSpin(t: number): number {
  return Math.min(t, IMPACT_TIME) * I.spin;
}

/** The shared chase framing for a pod `length` long, in its travel frame (+Z ahead, +Y up away from the ground). */
export function chaseFrame(length: number, pos: THREE.Vector3, look: THREE.Vector3): void {
  const C = I.chase;
  pos.set(C.side * length, C.lift * length, -C.back * length);
  look.set(0, -C.dip * length, C.ahead * length);
}

/** The camera pose gameplay starts with (default orbit around the monster at the origin). */
export function gameplayPose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const c = CONFIG.camera;
  const p = cameraPose({ yaw: c.defaultYaw, pitch: c.defaultPitch, distance: c.defaultDistance }, { x: 0, y: 0, z: 0 });
  return { pos: new THREE.Vector3(...p.pos), look: new THREE.Vector3(...p.look) };
}

const _pod = new THREE.Vector3();
const _hold = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };
const UP = new THREE.Vector3(0, 1, 0);

/** The chase shot on a pod `podLength` long at `pod`, pitched into the fall. */
function chase(pod: THREE.Vector3, podLength: number, out: { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 }): void {
  chaseFrame(podLength, out.pos, out.look);
  out.pos.applyQuaternion(FALL_Q).add(pod);
  out.look.applyQuaternion(FALL_Q).add(pod);
  out.up.copy(UP).applyQuaternion(FALL_Q);
}

/**
 * Game-world camera after the cut: the space shot's chase framing, pitched into the fall so it looks down past
 * the pod at the city. It rides the pod down, stops with it at impact and holds while the crater settles, then
 * eases into the gameplay pose (upright again), reaching it at INTRO_LENGTH.
 */
export function cameraPath(
  t: number,
  podLength: number,
  out: { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 },
): { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 } {
  if (t < EMERGE_TIME) {
    chase(podPath(t, _pod), podLength, out);
    return out;
  }
  chase(podPath(IMPACT_TIME, _pod), podLength, _hold);
  const g = gameplayPose();
  const e = easeInOut(clamp01((t - EMERGE_TIME) / (INTRO_LENGTH - EMERGE_TIME)));
  out.pos.copy(_hold.pos).lerp(g.pos, e);
  out.look.copy(_hold.look).lerp(g.look, e);
  out.up.copy(_hold.up).lerp(UP, e).normalize();
  return out;
}

/** Black over the opening: fully black at the start, fading in over fadeIn s. */
export function blackAt(t: number): number {
  const u = clamp01(t / I.fadeIn);
  return 1 - u * u * (3 - 2 * u);
}

/**
 * Fog for a camera this high: pushed out while it looks down from altitude (so the city shows), the city's fog
 * (`base`, CONFIG.fog by default) near the ground.
 */
export function introFog(camY: number, out: { near: number; far: number }, base: { near: number; far: number } = CONFIG.fog): { near: number; far: number } {
  out.near = Math.max(base.near, camY * 1.1);
  out.far = Math.max(base.far, camY * 2.6);
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
      // The ground keeps rumbling as the city falls around the crater.
      return 0.85 * (1 - k) * (1 - k);
    case 'emerge':
      return k < 0.3 ? 0.35 : 0;
    default:
      return 0;
  }
}

/** How black the monster is, 1..0: a solid silhouette when the cocoon splits, holding, then fading to full colour. */
export function silhouetteAt(t: number): number {
  const R = I.reveal;
  const u = clamp01((t - EMERGE_TIME - R.hold) / R.fade);
  return 1 - u * u * (3 - 2 * u);
}

/** How curled up the monster is, 1..0: fully crouched in the cloud, straightening (eased out) over riseTime from riseAfter s after impact. */
export function monsterCrouch(t: number): number {
  const u = clamp01((t - IMPACT_TIME - I.reveal.riseAfter) / I.riseTime);
  return (1 - u) * (1 - u);
}
