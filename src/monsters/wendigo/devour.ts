import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Atmosphere } from '../../cities/types';
import type { Vec2 } from '../../util/math';

const U = CONFIG.wendigo.ultimate;
const T = U.t;
const C = CONFIG.wendigo.colors;

/** Devour's blood sky: a near-black red zenith over a blood-red horizon, red fog, dimmed red light from a low sun. */
export const BLOOD_ATMOSPHERE: Atmosphere = {
  skyZenith: C.bloodZenith,
  skyHorizon: C.bloodHorizon,
  fog: C.bloodFog,
  hemiSky: C.bloodHemiSky,
  hemiGround: C.bloodHemiGround,
  hemiIntensity: U.hemiIntensity,
  sun: C.bloodSun,
  sunIntensity: U.sunIntensity,
  sunDir: { x: 0.4, y: 0.35, z: -0.85 },
  windowGlow: { color: C.bloodSun, strength: 0.15 },
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

export type DevourPhase = {
  /** World time scale: 1, easing to U.timeScale, back to 1 over the last 0.4 s. */
  time: number;
  /** Blood sky blend 0..1. */
  sky: number;
  /** Camera pull-back 0..1. */
  camera: number;
  /** Black circle opacity 0..1. */
  circle: number;
  /** Lightning is striking. */
  bolts: boolean;
  /** Figures rising, 0..1 (1 at the grasp). */
  emerge: number;
  /** Figures sinking with their victims, 0..1. */
  drag: number;
  done: boolean;
};

/** Devour at `t` real seconds after Q. */
export function devourPhase(t: number): DevourPhase {
  const slow = Math.min(smooth(t / T.easeIn), 1 - smooth((t - (T.end - 0.4)) / 0.4));
  return {
    time: 1 - (1 - U.timeScale) * slow,
    sky: Math.min(smooth(t / T.sky), outro(t)),
    camera: Math.min(easeInOutCubic(t / T.cameraIn), easeInOutCubic(outro(t))),
    circle: Math.min(smooth(ramp(t, T.circleFrom, T.circleTo)), outro(t)),
    bolts: t >= T.boltsFrom && t < T.boltsTo,
    emerge: ramp(t, T.emergeFrom, T.grasp),
    drag: ramp(t, T.dragFrom, T.dragTo),
    done: t >= T.end,
  };
}

/**
 * Who Devour takes: every live target within `radius` (plus its own radius) of `center`, at any altitude. Bosses
 * are set apart (they take damage instead); the rest nearest first, the first `maxFigures` held by figures.
 */
export function devourVictims(center: Vec2, radius: number, targets: readonly Target[], maxFigures: number): { held: Target[]; extra: Target[]; bosses: Target[] } {
  const dist = (t: Target) => Math.hypot(t.position.x - center.x, t.position.z - center.z);
  const inside = targets.filter((t) => t.isAlive() && dist(t) <= radius + t.radius);
  const bosses = inside.filter((t) => t.boss);
  const taken = inside.filter((t) => !t.boss).sort((a, b) => dist(a) - dist(b));
  return { held: taken.slice(0, maxFigures), extra: taken.slice(maxFigures), bosses };
}
