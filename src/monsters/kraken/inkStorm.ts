import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { AtmosphereTint } from '../../render/atmosphere';
import type { Vec2 } from '../../util/math';

const U = CONFIG.kraken.ultimate;
const T = U.t;
const C = CONFIG.kraken.colors;

/** Ink Storm's sky: a near-black slate zenith over a dark grey-blue horizon, grey fog, dimmed cold light; the sun stays where the city has it. */
export const STORM_ATMOSPHERE: AtmosphereTint = {
  skyZenith: C.stormZenith,
  skyHorizon: C.stormHorizon,
  fog: C.stormFog,
  hemiSky: C.stormHemiSky,
  hemiGround: C.stormHemiGround,
  hemiIntensity: U.hemiIntensity,
  sun: C.stormSun,
  sunIntensity: U.sunIntensity,
  windowGlow: { color: C.stormSun, strength: 0.25 },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const easeInOutCubic = (x: number) => {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
/** 0 before a, rising to 1 at b. */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/**
 * The Kraken's height (m) through the leap, one arc with the speed carried across its three parts: pushed off from
 * standing, it rises to the hang height (hangDrop below the peak) still climbing; through the hang it drifts on a
 * slow ballistic arc over the peak and back down to that height; then it falls, gathering speed, to the ground.
 */
function leapHeight(t: number): number {
  const hang = U.peak * (1 - U.hangDrop);
  const D = T.fallFrom - T.peakAt;
  // The hang: rising U.peak * hangDrop to the apex in D / 2 under constant gravity g, entering at speed v.
  const g = (8 * U.peak * U.hangDrop) / (D * D);
  const v = (g * D) / 2;
  if (t < T.leapFrom) return 0;
  if (t < T.peakAt) {
    // Hermite: from rest at 0 to `hang` arriving at speed v.
    const R = T.peakAt - T.leapFrom;
    const u = (t - T.leapFrom) / R;
    return hang * (3 * u * u - 2 * u * u * u) + v * R * (u * u * u - u * u);
  }
  if (t < T.fallFrom) {
    const s = t - T.peakAt;
    return hang + v * s - (g * s * s) / 2;
  }
  // The fall: leaving `hang` at speed v downward, accelerating evenly to reach the ground at fallTo.
  const F = T.fallTo - T.fallFrom;
  const s = Math.min(t - T.fallFrom, F);
  const a = (2 * (hang - v * F)) / (F * F);
  return Math.max(0, hang - v * s - (a * s * s) / 2);
}

/** 1 until the outro, falling to 0 at the end. */
const outro = (t: number) => 1 - ramp(t, T.outroFrom, T.end);

export type InkPhase = {
  /** World time scale: 1, easing to U.timeScale, back to 1 over the last 0.4 s. */
  time: number;
  /** Storm sky blend 0..1. */
  sky: number;
  /** Camera pull-back 0..1: all the way out by the top of the rise (cameraTo), home by the end. */
  camera: number;
  /** Rain strength 0..1. */
  rain: number;
  /** The Kraken's height above the ground (m). */
  height: number;
  /** How hard the arms brace on the ground 0..1: pressed down after the grab, pushing off early in the rise. */
  brace: number;
  /** The ink cloud's coverage of the circle 0..1. */
  ink: number;
  done: boolean;
};

/** Ink Storm at `t` real seconds after Q. */
export function inkPhase(t: number): InkPhase {
  const slow = Math.min(smooth(t / T.easeIn), 1 - smooth((t - (T.end - 0.4)) / 0.4));
  return {
    time: 1 - (1 - U.timeScale) * slow,
    sky: Math.min(smooth(t / T.sky), outro(t)),
    camera: Math.min(easeInOutCubic(t / T.cameraTo), easeInOutCubic(outro(t))),
    rain: Math.min(smooth(ramp(t, T.rainFrom, T.sky)), outro(t)),
    height: leapHeight(t),
    brace: Math.min(smooth(ramp(t, T.braceFrom, T.braceIn)), 1 - smooth(ramp(t, T.leapFrom, T.pushTo))),
    ink: Math.min(smooth(ramp(t, T.inkFrom, T.inkTo)), outro(t)),
    done: t >= T.end,
  };
}

const dist = (c: Vec2, t: Target) => Math.hypot(t.position.x - c.x, t.position.z - c.z);

/** Who the ink takes: every live ground target within `radius` (plus its own radius), nearest first; bosses apart (hurt instead). */
export function inkVictims(center: Vec2, radius: number, targets: readonly Target[]): { ground: Target[]; bosses: Target[] } {
  const inside = targets.filter((t) => t.isAlive() && !t.airborne && dist(center, t) <= radius + t.radius);
  return {
    ground: inside.filter((t) => !t.boss).sort((a, b) => dist(center, a) - dist(center, b)),
    bosses: inside.filter((t) => t.boss),
  };
}

/** The aircraft the chunks go to: live airborne targets over the circle (any altitude), nearest first, at most `n`, one each. */
export function chunkTargets(center: Vec2, radius: number, targets: readonly Target[], n: number): Target[] {
  return targets
    .filter((t) => t.isAlive() && t.airborne && dist(center, t) <= radius)
    .sort((a, b) => dist(center, a) - dist(center, b))
    .slice(0, n);
}
