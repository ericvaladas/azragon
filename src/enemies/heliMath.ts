import { CONFIG } from '../config';

/** The flight tuning `stepHeli` reads (CONFIG.heli satisfies it). */
export interface HeliCfg {
  readonly radius: number;
  readonly altitude: number;
  readonly orbitSpeed: number;
  readonly approachSpeed: number;
  readonly approachGain: number;
  readonly fadeDist: number;
  readonly centreFollow: number;
  readonly centreMaxSpeed: number;
  readonly settleDist: number;
  readonly firstVolley: number;
  readonly volleyEvery: number;
  readonly rocketsPerVolley: number;
  readonly bankGain: number;
  readonly bankMax: number;
  readonly pitchMax: number;
}

/**
 * One helicopter's flight, in polar form about an orbit centre that trails the monster. `angle` is the bearing
 * from the centre (x = cos, z = sin) and `r` the distance; `dir` +1 circles with increasing angle, -1 against it.
 * `heading` is the yaw of travel (atan2(dx, dz), +Z forward), `bank` the roll (+ raises the +X side), `pitch` nose-down.
 */
export interface HeliState {
  cx: number;
  cz: number;
  angle: number;
  r: number;
  y: number;
  dir: 1 | -1;
  orbiting: boolean;
  /** Seconds to the next volley (counts only while orbiting). */
  volleyT: number;
  heading: number;
  bank: number;
  pitch: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Orbit direction for the n-th spawned helicopter: alternates so groups spread around the monster. */
export function orbitDir(n: number): 1 | -1 {
  return n % 2 === 0 ? 1 : -1;
}

/** A helicopter `dist` m from the monster on `bearing`, at the cruise altitude, facing the monster. */
export function newHeliState(monster: { x: number; z: number }, bearing: number, dist: number, dir: 1 | -1, cfg: HeliCfg = CONFIG.heli): HeliState {
  return {
    cx: monster.x,
    cz: monster.z,
    angle: bearing,
    r: dist,
    y: cfg.altitude,
    dir,
    orbiting: false,
    volleyT: 0,
    heading: Math.atan2(-Math.cos(bearing), -Math.sin(bearing)),
    bank: 0,
    pitch: 0,
  };
}

export function heliPosition(s: HeliState): { x: number; y: number; z: number } {
  return { x: s.cx + Math.cos(s.angle) * s.r, y: s.y, z: s.cz + Math.sin(s.angle) * s.r };
}

/**
 * Advances one helicopter by `dt` and returns how many rockets it fires this step (0 or a full volley).
 * Closing speed eases off near the orbit and tangential speed fades in over `fadeDist`, so the approach curves
 * smoothly into the circle; once within `settleDist` of the radius it is on orbit and starts its volley clock.
 */
export function stepHeli(s: HeliState, monster: { x: number; z: number }, dt: number, cfg: HeliCfg = CONFIG.heli): number {
  if (dt <= 0) return 0;
  const before = heliPosition(s);

  // The centre trails the monster: exponential follow, speed-capped so a jump is crossed in flight, not teleported.
  let mx = (monster.x - s.cx) * (1 - Math.exp(-cfg.centreFollow * dt));
  let mz = (monster.z - s.cz) * (1 - Math.exp(-cfg.centreFollow * dt));
  const step = Math.hypot(mx, mz);
  const cap = cfg.centreMaxSpeed * dt;
  if (step > cap) {
    mx *= cap / step;
    mz *= cap / step;
  }
  s.cx += mx;
  s.cz += mz;

  const err = s.r - cfg.radius;
  s.r += clamp(-err * cfg.approachGain, -cfg.approachSpeed, cfg.approachSpeed) * dt;
  const vt = s.dir * cfg.orbitSpeed * clamp(1 - Math.abs(err) / cfg.fadeDist, 0, 1);
  s.angle += (vt / s.r) * dt;
  s.y += (cfg.altitude - s.y) * (1 - Math.exp(-1.5 * dt));

  const after = heliPosition(s);
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const speed = Math.hypot(dx, dz) / dt;
  if (speed > 1e-3) {
    const heading = Math.atan2(dx, dz);
    const yawRate = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading)) / dt;
    s.heading = heading;
    // Turning toward -X (right) is a negative yaw rate and rolls the +X side up (positive bank).
    const want = clamp(-yawRate * cfg.bankGain, -cfg.bankMax, cfg.bankMax);
    s.bank += (want - s.bank) * (1 - Math.exp(-3 * dt));
  }
  s.pitch = cfg.pitchMax * Math.min(1, speed / cfg.approachSpeed);

  if (!s.orbiting && Math.abs(s.r - cfg.radius) <= cfg.settleDist) {
    s.orbiting = true;
    s.volleyT = cfg.firstVolley;
    return 0;
  }
  if (!s.orbiting) return 0;
  s.volleyT -= dt;
  if (s.volleyT > 1e-6) return 0;
  s.volleyT += cfg.volleyEvery;
  return cfg.rocketsPerVolley;
}
