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
/** 1 until the outro, falling to 0 at the end. */
const outro = (t: number) => 1 - ramp(t, T.outroFrom, T.end);

export type InkPhase = {
  /** World time scale: 1, easing to U.timeScale, back to 1 over the last 0.4 s. */
  time: number;
  /** Storm sky blend 0..1. */
  sky: number;
  /** Camera pull-back 0..1: in by the leap, home by the end. */
  camera: number;
  /** Rain strength 0..1. */
  rain: number;
  /** The Kraken's height above the ground (m). */
  height: number;
  /** The ink cloud's coverage of the circle 0..1. */
  ink: number;
  done: boolean;
};

/** Ink Storm at `t` real seconds after Q. */
export function inkPhase(t: number): InkPhase {
  const slow = Math.min(smooth(t / T.easeIn), 1 - smooth((t - (T.end - 0.4)) / 0.4));
  const rise = 1 - Math.pow(1 - ramp(t, T.leapFrom, T.peakAt), 2);
  const fall = Math.pow(ramp(t, T.inkTo, T.fallTo), 2);
  return {
    time: 1 - (1 - U.timeScale) * slow,
    sky: Math.min(smooth(t / T.sky), outro(t)),
    camera: Math.min(easeInOutCubic(t / T.leapFrom), easeInOutCubic(outro(t))),
    rain: Math.min(smooth(ramp(t, T.rainFrom, T.sky)), outro(t)),
    height: t < T.inkTo ? U.peak * rise : U.peak * (1 - fall),
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
