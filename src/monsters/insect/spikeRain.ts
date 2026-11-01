import { CONFIG } from '../../config';
import type { AtmosphereTint } from '../../render/atmosphere';
import type { Vec2 } from '../../util/math';
import { angularSize, bearingOf } from '../kaiju/plasmaLance';

const U = CONFIG.insect.ultimate;
const T = U.t;
const C = CONFIG.insect.colors;

/** Spike Rain's sky: a deep violet zenith over a dusky purple horizon, dim violet light, and purple fog drawn in close. */
export const RAIN_ATMOSPHERE: AtmosphereTint = {
  skyZenith: C.rainZenith,
  skyHorizon: C.rainHorizon,
  fog: C.rainFog,
  fogNear: U.fogNear,
  fogFar: U.fogFar,
  hemiSky: C.rainHemiSky,
  hemiGround: C.rainHemiGround,
  hemiIntensity: U.hemiIntensity,
  sun: C.rainSun,
  sunIntensity: U.sunIntensity,
  windowGlow: { color: C.rainSun, strength: 0.2 },
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
/** The Insect drops back onto all six legs over this long (s) from the outro. */
const DROP = 1;

export type RainPhase = {
  /** World time scale: 1, easing to U.timeScale, back to 1 over the last 0.4 s. */
  time: number;
  /** Purple sky and fog blend 0..1. */
  sky: number;
  /** Camera pull-back 0..1: out by the time the rain starts, home by the end. */
  camera: number;
  /** The threat display 0..1 (standing up, front legs raised and waving, mandibles open): rising slowly from Q, held through the volley and the rain, settling in the outro. */
  roar: number;
  done: boolean;
};

/** Spike Rain at `t` real seconds after Q. */
export function rainPhase(t: number): RainPhase {
  const slow = Math.min(smooth(t / T.easeIn), 1 - smooth((t - (T.end - 0.4)) / 0.4));
  return {
    time: 1 - (1 - U.timeScale) * slow,
    sky: Math.min(smooth(t / T.sky), outro(t)),
    camera: Math.min(easeInOutCubic(t / T.rainFrom), easeInOutCubic(outro(t))),
    roar: smooth(ramp(t, 0, T.rearUp)) * (1 - smooth(ramp(t, T.outroFrom, T.outroFrom + DROP))),
    done: t >= T.end,
  };
}

/** True when a target of `radius` at `p` lies in the rain's area: U.near..U.far in front of a body at `origin` facing `yaw`, ±U.halfAngle. */
export function inArea(origin: Vec2, yaw: number, p: Vec2, radius: number): boolean {
  const d = Math.hypot(p.x - origin.x, p.z - origin.z);
  if (d < U.near - radius || d > U.far + radius) return false;
  return Math.abs(bearingOf(origin, yaw, p)) <= U.halfAngle + angularSize(d, radius);
}

/**
 * `n` landing points over the area, stratified: the area is split into a grid of cells (bearing × distance², so each
 * cell covers the same ground) and one point is jittered within each of `n` of them, spread evenly from a random
 * start. Uneven, but with no big gaps.
 */
export function scatterPoints(origin: Vec2, yaw: number, n: number, rand: () => number, out: Vec2[]): Vec2[] {
  out.length = 0;
  const rows = Math.max(1, Math.round(Math.sqrt(n / 2)));
  const cols = Math.ceil(n / rows);
  const cells = rows * cols;
  // A random subset of n cells: every k-th cell from a random start, so the dropped ones are spread out.
  const step = cells / n;
  const start = rand() * step;
  const n0 = U.near * U.near;
  const n1 = U.far * U.far;
  for (let i = 0; i < n; i++) {
    const cell = Math.min(cells - 1, Math.floor(start + i * step));
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const a = yaw - U.halfAngle + ((col + rand()) / cols) * 2 * U.halfAngle;
    const r = Math.sqrt(n0 + ((row + rand()) / rows) * (n1 - n0));
    out.push({ x: origin.x + Math.sin(a) * r, z: origin.z + Math.cos(a) * r });
  }
  return out;
}

/** `n` landing times over the rain beat, evenly spread with jitter, in order. */
export function landingTimes(n: number, rand: () => number, out: number[]): number[] {
  out.length = 0;
  const span = T.rainTo - T.rainFrom;
  for (let i = 0; i < n; i++) out.push(T.rainFrom + ((i + rand()) / n) * span);
  return out;
}
