import { CONFIG } from '../../config';
import type { AtmosphereTint } from '../../render/atmosphere';
import { angleDelta, type Vec2 } from '../../util/math';

const U = CONFIG.kaiju.ultimate;
const T = U.t;
const C = CONFIG.kaiju.colors;

/** Plasma Lance's sky: night, a near-black zenith over a deep blue horizon, cold dim moonlight and lit windows; the light comes from where the city's sun is. */
export const LANCE_ATMOSPHERE: AtmosphereTint = {
  skyZenith: C.lanceZenith,
  skyHorizon: C.lanceHorizon,
  fog: C.lanceFog,
  hemiSky: C.lanceHemiSky,
  hemiGround: C.lanceHemiGround,
  hemiIntensity: U.hemiIntensity,
  sun: C.lanceSun,
  sunIntensity: U.sunIntensity,
  windowGlow: { color: C.lanceWindows, strength: 0.8 },
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
/** How long the beam's cut-out takes (s). */
const CUT_OUT = 0.15;

export type LancePhase = {
  /** World time scale: 1, easing to U.timeScale, back to 1 over the last 0.4 s. */
  time: number;
  /** Night sky blend 0..1. */
  sky: number;
  /** Camera pull 0..1: out by the time it fires, home by the end. */
  camera: number;
  /** How far the debris has floated up 0..1. */
  lift: number;
  /** The plates' and vents' blaze 0..1. */
  blaze: number;
  /** Beam strength 0..1. */
  beam: number;
  /** The beam's bearing from the facing (rad, + toward the Kaiju's left): its right edge until it fires, to its left edge. */
  sweep: number;
  /** Where the head looks (bearing from the facing, rad), or null: after the roar it eases round from straight ahead to the right edge, then follows the beam until it cuts out. */
  look: number | null;
  done: boolean;
};

/** Plasma Lance at `t` real seconds after Q. */
export function lancePhase(t: number): LancePhase {
  const slow = Math.min(smooth(t / T.easeIn), 1 - smooth((t - (T.end - 0.4)) / 0.4));
  return {
    time: 1 - (1 - U.timeScale) * slow,
    sky: Math.min(smooth(t / T.sky), outro(t)),
    camera: Math.min(easeInOutCubic(t / T.fire), easeInOutCubic(outro(t))),
    lift: smooth(ramp(t, T.liftFrom, T.fire)),
    blaze: Math.min(smooth(ramp(t, T.glowFrom, T.glowTo)), outro(t)),
    beam: t < T.fire ? 0 : 1 - ramp(t, T.sweepTo, T.sweepTo + CUT_OUT),
    sweep: -U.halfAngle + 2 * U.halfAngle * ramp(t, T.fire, T.sweepTo),
    look: t < T.roarTo || t >= T.sweepTo + CUT_OUT ? null : t < T.fire ? -U.halfAngle * smooth(ramp(t, T.roarTo, T.fire)) : -U.halfAngle + 2 * U.halfAngle * ramp(t, T.fire, T.sweepTo),
    done: t >= T.end,
  };
}

/** How long the roar lasts in world (slowed) seconds: from Q until roarTo, the integral of the time scale. */
export function lanceRoarWorldLength(): number {
  const n = 200;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += lancePhase(((i + 0.5) / n) * T.roarTo).time;
  return (sum / n) * T.roarTo;
}

/** The bearing of `p` from a body at `origin` facing `yaw` (rad, in (−π, π], + toward its left). */
export function bearingOf(origin: Vec2, yaw: number, p: Vec2): number {
  return angleDelta(yaw, Math.atan2(p.x - origin.x, p.z - origin.z));
}

/** Half the angle (rad) a target of `radius` at `dist` covers as seen from the Kaiju; a right angle once it is that close. */
export function angularSize(dist: number, radius: number): number {
  return Math.asin(Math.min(1, radius / Math.max(dist, radius, 1e-6)));
}

/** True when a target of `radius` at `p` lies in the wedge (U.range, ±U.halfAngle) in front of a body at `origin` facing `yaw`. */
export function inWedge(origin: Vec2, yaw: number, p: Vec2, radius: number): boolean {
  const d = Math.hypot(p.x - origin.x, p.z - origin.z);
  if (d > U.range + radius) return false;
  return Math.abs(bearingOf(origin, yaw, p)) <= U.halfAngle + angularSize(d, radius);
}

/** True when the beam, moving from bearing `prev` to `cur` this frame, passed over `bearing` (widened by `widen` either side). */
export function crossed(prev: number, cur: number, bearing: number, widen: number): boolean {
  return cur > prev && bearing + widen > prev && bearing - widen <= cur;
}
