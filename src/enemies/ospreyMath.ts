import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

const O = CONFIG.osprey;
const TILT_UP = Math.PI / 2;

export type P3 = { x: number; y: number; z: number };
export type SquadPhase = 'approach' | 'position' | 'leave';

/**
 * A squad's shared flight: the formation centre (x, y, z), its heading, the half-width of the square, the rotor
 * pods' tilt (0 forward, π/2 straight up) and seconds into the current phase.
 */
export type Squad = { phase: SquadPhase; t: number; x: number; y: number; z: number; yaw: number; half: number; tilt: number };

/** The monster as the squad sees it: where it stands, how tall it is, how wide its body is. */
export type MonsterInfo = { x: number; z: number; height: number; bodyRadius: number };

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** Moves `v` toward `to` by at most `step`. */
const toward = (v: number, to: number, step: number) => (Math.abs(to - v) <= step ? to : v + Math.sign(to - v) * step);

export function dropAltitude(height: number): number {
  return height + O.dropClearance;
}

export function netHalf(bodyRadius: number): number {
  return bodyRadius * O.netHalfMult;
}

export function domeRadius(bodyRadius: number, width: number): number {
  return Math.max(bodyRadius * O.domeRadiusMult, width * O.domeWidthMult);
}

/** A squad spawnDist out on `bearing` from the monster, already spread to the net's width for a monster of `bodyRadius`. */
export function newSquad(monster: Vec2, bearing: number, bodyRadius: number): Squad {
  const x = monster.x + Math.sin(bearing) * O.spawnDist;
  const z = monster.z + Math.cos(bearing) * O.spawnDist;
  return { phase: 'approach', t: 0, x, y: O.cruiseAltitude, z, yaw: Math.atan2(monster.x - x, monster.z - z), half: netHalf(bodyRadius), tilt: 0 };
}

/** Moves the squad centre toward `to` by at most `step`; returns the distance left. */
function closeIn(s: Squad, to: Vec2, step: number): number {
  const dx = to.x - s.x;
  const dz = to.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d <= step) {
    s.x = to.x;
    s.z = to.z;
    return 0;
  }
  s.x += (dx / d) * step;
  s.z += (dz / d) * step;
  return d - step;
}

/** Advances the squad one step. Approach hands over to positioning by itself; positioning ends by startLeave. */
export function stepSquad(s: Squad, dt: number, m: MonsterInfo): void {
  s.t += dt;
  if (s.phase === 'approach') {
    if (Math.hypot(m.x - s.x, m.z - s.z) > 1e-6) s.yaw = Math.atan2(m.x - s.x, m.z - s.z);
    if (closeIn(s, m, O.cruiseSpeed * dt) <= O.arriveDist) {
      s.phase = 'position';
      s.t = 0;
    }
    return;
  }
  if (s.phase === 'position') {
    closeIn(s, m, O.trackSpeed * dt);
    const u = smooth(clamp01(s.t / (O.positionTime * O.settleFrac)));
    s.y = O.cruiseAltitude + (dropAltitude(m.height) - O.cruiseAltitude) * u;
    s.tilt = TILT_UP * smooth(clamp01(s.t / O.tiltTime));
    return;
  }
  s.x += Math.sin(s.yaw) * O.cruiseSpeed * dt;
  s.z += Math.cos(s.yaw) * O.cruiseSpeed * dt;
  s.y = toward(s.y, O.cruiseAltitude, O.climbRate * dt);
  s.half = toward(s.half, O.tightHalf, O.tightenRate * dt);
  s.tilt = toward(s.tilt, 0, (TILT_UP / O.tiltTime) * dt);
}

export function positionDone(s: Squad): boolean {
  return s.phase === 'position' && s.t >= O.positionTime;
}

/** Starts the exit: straight away from `from` (the monster), or on along the heading when right over it. */
export function startLeave(s: Squad, from: Vec2): void {
  s.phase = 'leave';
  s.t = 0;
  if (Math.hypot(s.x - from.x, s.z - from.z) > 1) s.yaw = Math.atan2(s.x - from.x, s.z - from.z);
}

export function squadGone(s: Squad, monster: Vec2): boolean {
  return s.phase === 'leave' && Math.hypot(s.x - monster.x, s.z - monster.z) >= O.exitDist;
}

export function dropOutcome(alive: number): 'release' | 'abort' {
  return alive >= O.minToDrop ? 'release' : 'abort';
}

/** Formation slots in squad space (+x left, +z forward): front-left, front-right, back-right, back-left. */
const SLOTS: readonly (readonly [number, number])[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

/** World (x, z) offset of `slot` from the squad centre, for a square `half` m from centre to each corner. */
export function slotOffset(slot: number, half: number, yaw: number): Vec2 {
  const [sx, sz] = SLOTS[slot]!;
  const lx = sx * half;
  const lz = sz * half;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

/**
 * Net corners in slot order: `cable` m below each living Osprey; a lost slot's corner droops `droop` × half
 * below the midpoint of its neighbours (a squad still carrying the net has at least one neighbour alive).
 */
export function netCorners(ospreys: readonly (P3 | null)[], half: number): P3[] {
  const hung = ospreys.map((p) => (p ? { x: p.x, y: p.y - O.cable, z: p.z } : null));
  return hung.map((c, i) => {
    if (c) return c;
    const a = hung[(i + 3) % 4] ?? hung[(i + 1) % 4]!;
    const b = hung[(i + 1) % 4] ?? a;
    return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - half * O.droop, z: (a.z + b.z) / 2 };
  });
}

/** Cells per side of the net grid; the grid has (NET_N + 1)² points, row-major from corner 0 toward corner 1. */
export const NET_N = 8;
/** Line segments in the grid: every row and every column. */
export const NET_SEGMENTS = 2 * NET_N * (NET_N + 1);
const idx = (i: number, j: number) => i + j * (NET_N + 1);

export function newGrid(): P3[] {
  return Array.from({ length: (NET_N + 1) * (NET_N + 1) }, () => ({ x: 0, y: 0, z: 0 }));
}

/** The carried net: a sheet across the four corners, sagging `sag` m at its centre. */
export function carriedGrid(c: readonly P3[], sag: number, out: P3[]): void {
  const [c0, c1, c2, c3] = c as [P3, P3, P3, P3];
  for (let j = 0; j <= NET_N; j++) {
    const b = j / NET_N;
    for (let i = 0; i <= NET_N; i++) {
      const a = i / NET_N;
      const p = out[idx(i, j)]!;
      const fx = c0.x + (c1.x - c0.x) * a;
      const fy = c0.y + (c1.y - c0.y) * a;
      const fz = c0.z + (c1.z - c0.z) * a;
      const bx = c3.x + (c2.x - c3.x) * a;
      const by = c3.y + (c2.y - c3.y) * a;
      const bz = c3.z + (c2.z - c3.z) * a;
      p.x = fx + (bx - fx) * b;
      p.y = fy + (by - fy) * b - sag * 16 * a * (1 - a) * b * (1 - b);
      p.z = fz + (bz - fz) * b;
    }
  }
}

/** The net draped on the monster: the square grid mapped onto a disc, rising from baseY at the rim to `height` over the centre. */
export function domeGrid(cx: number, baseY: number, cz: number, radius: number, height: number, out: P3[]): void {
  for (let j = 0; j <= NET_N; j++) {
    const v = (2 * j) / NET_N - 1;
    for (let i = 0; i <= NET_N; i++) {
      const u = (2 * i) / NET_N - 1;
      const dx = u * Math.sqrt(1 - (v * v) / 2);
      const dz = v * Math.sqrt(1 - (u * u) / 2);
      const d = Math.min(1, Math.hypot(dx, dz));
      const p = out[idx(i, j)]!;
      p.x = cx + dx * radius;
      p.y = baseY + height * (1 - d * d);
      p.z = cz + dz * radius;
    }
  }
}

/** A dropped net lying flat at groundY: the square `half` m from centre to each corner, corners in slot order. */
export function groundGrid(cx: number, cz: number, half: number, yaw: number, out: P3[]): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let j = 0; j <= NET_N; j++) {
    const lz = half * (1 - (2 * j) / NET_N);
    for (let i = 0; i <= NET_N; i++) {
      const lx = half * (1 - (2 * i) / NET_N);
      const p = out[idx(i, j)]!;
      p.x = cx + lx * c + lz * s;
      p.y = O.groundY;
      p.z = cz - lx * s + lz * c;
    }
  }
}

export function blendGrid(from: readonly P3[], to: readonly P3[], k: number, out: P3[]): void {
  for (let n = 0; n < out.length; n++) {
    const a = from[n]!;
    const b = to[n]!;
    const p = out[n]!;
    p.x = a.x + (b.x - a.x) * k;
    p.y = a.y + (b.y - a.y) * k;
    p.z = a.z + (b.z - a.z) * k;
  }
}

/** Writes the grid as line segments (every row, then every column) into `out` (NET_SEGMENTS × 6 floats). */
export function gridSegments(pts: readonly P3[], out: Float32Array): void {
  let o = 0;
  const put = (p: P3) => {
    out[o++] = p.x;
    out[o++] = p.y;
    out[o++] = p.z;
  };
  for (let j = 0; j <= NET_N; j++) {
    for (let i = 0; i < NET_N; i++) {
      put(pts[idx(i, j)]!);
      put(pts[idx(i + 1, j)]!);
    }
  }
  for (let i = 0; i <= NET_N; i++) {
    for (let j = 0; j < NET_N; j++) {
      put(pts[idx(i, j)]!);
      put(pts[idx(i, j + 1)]!);
    }
  }
}
