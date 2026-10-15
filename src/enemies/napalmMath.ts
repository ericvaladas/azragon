import { CONFIG } from '../config';

/** The tuning the napalm math reads (CONFIG.napalm satisfies it). */
export interface NapalmCfg {
  readonly spawnDist: number;
  readonly exitDist: number;
  readonly altitude: number;
  readonly speed: number;
  readonly bombs: number;
  readonly spacing: number;
  readonly bombGravity: number;
  readonly warnLead: number;
  readonly patchRadius: number;
  readonly patchLife: number;
  readonly patchFade: number;
  readonly dps: number;
  readonly contactFrac: number;
}

type Pt = { x: number; z: number };

/**
 * One bomber's straight run: it starts at (sx, sz), flies along the unit heading (hx, hz) at the cruise
 * altitude, and passes over `aim` (the monster's position at spawn) after spawnDist m.
 */
export interface NapalmRun {
  readonly sx: number;
  readonly sz: number;
  readonly hx: number;
  readonly hz: number;
  readonly aim: Pt;
}

/** One bomb's release: run time `t` it leaves the bomber, where it is then, and the seconds `fall` it takes to land. */
export interface BombRelease {
  readonly t: number;
  readonly x: number;
  readonly z: number;
  readonly fall: number;
}

/** A burning patch on the ground, `age` s old. */
export interface Patch {
  x: number;
  z: number;
  age: number;
}

/** A run starting spawnDist m from `monster` on `bearing` (x = cos, z = sin), headed straight over it. */
export function newRun(monster: Pt, bearing: number, cfg: NapalmCfg = CONFIG.napalm): NapalmRun {
  const cx = Math.cos(bearing);
  const cz = Math.sin(bearing);
  return { sx: monster.x + cx * cfg.spawnDist, sz: monster.z + cz * cfg.spawnDist, hx: -cx, hz: -cz, aim: { x: monster.x, z: monster.z } };
}

export function bomberPosition(run: NapalmRun, t: number, cfg: NapalmCfg = CONFIG.napalm): { x: number; y: number; z: number } {
  const d = cfg.speed * t;
  return { x: run.sx + run.hx * d, y: cfg.altitude, z: run.sz + run.hz * d };
}

/** True once the bomber is exitDist m past the aim point. */
export function bomberDone(_run: NapalmRun, t: number, cfg: NapalmCfg = CONFIG.napalm): boolean {
  return cfg.speed * t >= cfg.spawnDist + cfg.exitDist;
}

/** Impact points in flight order: `bombs` points `spacing` m apart along the heading, centred on the aim point. */
export function impactPoints(run: NapalmRun, cfg: NapalmCfg = CONFIG.napalm): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < cfg.bombs; k++) {
    const off = (k - (cfg.bombs - 1) / 2) * cfg.spacing;
    out.push({ x: run.aim.x + run.hx * off, z: run.aim.z + run.hz * off });
  }
  return out;
}

/** Seconds a bomb takes to fall from the cruise altitude. */
export function fallTime(cfg: NapalmCfg = CONFIG.napalm): number {
  return Math.sqrt((2 * cfg.altitude) / cfg.bombGravity);
}

/**
 * Releases in flight order. A bomb keeps the bomber's forward speed while it falls, so it leaves the bomber
 * speed × fall time short of its impact point.
 */
export function bombReleases(run: NapalmRun, cfg: NapalmCfg = CONFIG.napalm): BombRelease[] {
  const fall = fallTime(cfg);
  const lead = cfg.speed * fall;
  return impactPoints(run, cfg).map((p, k) => {
    const off = (k - (cfg.bombs - 1) / 2) * cfg.spacing;
    return { t: (cfg.spawnDist + off - lead) / cfg.speed, x: p.x - run.hx * lead, z: p.z - run.hz * lead, fall };
  });
}

/** A bomb's position `tau` s after its release; it reaches the ground (y = 0) on its impact point at tau = fall. */
export function bombPosition(run: NapalmRun, r: BombRelease, tau: number, cfg: NapalmCfg = CONFIG.napalm): { x: number; y: number; z: number } {
  const d = cfg.speed * tau;
  return { x: r.x + run.hx * d, y: Math.max(0, cfg.altitude - 0.5 * cfg.bombGravity * tau * tau), z: r.z + run.hz * d };
}

/**
 * Opacity 0..1 of the warning strip at run time `t`: fades in over 0.3 s from warnLead s before the first
 * release, holds until the first bomb lands, then fades out as the rest land; 0 once the last has landed.
 */
export function warningAlpha(run: NapalmRun, t: number, cfg: NapalmCfg = CONFIG.napalm): number {
  const rel = bombReleases(run, cfg);
  const first = rel[0];
  const last = rel[rel.length - 1];
  if (!first || !last) return 0;
  const start = first.t - cfg.warnLead;
  const firstLand = first.t + first.fall;
  const lastLand = last.t + last.fall;
  if (t < start || t >= lastLand) return 0;
  if (t < firstLand) return Math.min(1, (t - start) / 0.3);
  return 1 - (t - firstLand) / Math.max(1e-6, lastLand - firstLand);
}

/** Burn rate on a monster at `m`: dps while within reach of any live patch, else 0. Overlapping patches never stack. */
export function patchDps(patches: readonly Patch[], m: Pt, cfg: NapalmCfg = CONFIG.napalm, bodyRadius: number = CONFIG.monster.bodyRadius): number {
  const reach = cfg.patchRadius + cfg.contactFrac * bodyRadius;
  for (const p of patches) {
    if (p.age < cfg.patchLife && Math.hypot(m.x - p.x, m.z - p.z) <= reach) return cfg.dps;
  }
  return 0;
}

/** A patch's strength 0..1: flares up over its first 0.2 s and fades out over its last patchFade s. */
export function patchAlpha(age: number, cfg: NapalmCfg = CONFIG.napalm): number {
  if (age >= cfg.patchLife) return 0;
  return Math.min(1, age / 0.2, (cfg.patchLife - age) / cfg.patchFade);
}
