import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * A jagged bolt from `from` to `to` in `segments` steps into `out` (reusing its vectors): the ends exact, each inner
 * point pushed off the straight line by up to `jitter`, in a random direction across it.
 */
export function boltPath(from: THREE.Vector3, to: THREE.Vector3, segments: number, jitter: number, rand: () => number, out: THREE.Vector3[]): THREE.Vector3[] {
  _dir.subVectors(to, from).normalize();
  // Two axes across the bolt.
  _a.set(Math.abs(_dir.y) < 0.9 ? 0 : 1, Math.abs(_dir.y) < 0.9 ? 1 : 0, 0).cross(_dir).normalize();
  _b.crossVectors(_dir, _a);
  out.length = Math.min(out.length, segments + 1);
  for (let i = 0; i <= segments; i++) {
    const p = (out[i] ??= new THREE.Vector3()).lerpVectors(from, to, i / segments);
    if (i === 0 || i === segments) continue;
    const ang = rand() * Math.PI * 2;
    const r = rand() * jitter;
    p.addScaledVector(_a, Math.cos(ang) * r).addScaledVector(_b, Math.sin(ang) * r);
  }
  return out;
}

/** Seconds the return stroke shines, from the strike to fully faded; it holds full for STROKE_HOLD first. */
export const BOLT_LIFE = 0.75;
const STROKE_HOLD = 0.12;
/** Seconds the scene light holds full on a stroke, and its whole glow. */
const FLASH_HOLD = 0.08;
const FLASH_LIFE = 0.58;
/** A bolt re-strikes RESTRIKES[0]..[1] times after its first stroke, each GAP[0]..[1] s after the one before. */
const RESTRIKES = [1, 2] as const;
const GAP = [0.18, 0.35] as const;

/**
 * One return stroke's brightness (0..1) `age` s after it lands, as slow-motion footage shows it: a blinding flash
 * held for STROKE_HOLD s (long enough to see), then a steady fade to nothing by BOLT_LIFE.
 */
export function boltBrightness(age: number): number {
  if (age < 0 || age >= BOLT_LIFE) return 0;
  if (age <= STROKE_HOLD) return 1;
  return (1 - (age - STROKE_HOLD) / (BOLT_LIFE - STROKE_HOLD)) ** 2;
}

/** The scene light's flash (0..1) `age` s after a stroke: held full for FLASH_HOLD s, then a smooth fade, gone by FLASH_LIFE. */
export function flashBrightness(age: number): number {
  if (age < 0 || age >= FLASH_LIFE) return 0;
  if (age <= FLASH_HOLD) return 1;
  const t = age - FLASH_HOLD;
  return Math.exp(-t / 0.12) * (1 - t / (FLASH_LIFE - FLASH_HOLD));
}

/** Seconds the stepped leader takes to creep from the sky to the ground before the first return stroke. */
export const LEADER = 0.3;
/** The leader comes down in this many jerky steps. */
const LEADER_STEPS = 8;
/**
 * Brightness of the faint leader's branch crawlers (the main channel stays dark until the stroke, then appears at
 * once); of the branches as the first stroke lights them, and how long they take to die.
 */
const LEADER_GLOW = 0.18;
const BRANCH_FLASH = 0.7;
const BRANCH_FADE = 0.12;

/**
 * A bolt's stroke times (s after its strike starts) into `out`: the first as its leader touches the ground (LEADER),
 * then RESTRIKES re-strikes down the same channel, each GAP s after the last, as real lightning does.
 */
export function strokeTimes(rand: () => number, out: number[]): number[] {
  out.length = 0;
  out.push(LEADER);
  const n = RESTRIKES[0] + Math.floor(rand() * (RESTRIKES[1] - RESTRIKES[0] + 1));
  for (let i = 0; i < n; i++) out.push(out[out.length - 1]! + GAP[0] + rand() * (GAP[1] - GAP[0]));
  return out;
}

/** How long a bolt with these strokes lasts: until its last stroke has faded. */
export function boltLife(strokes: readonly number[]): number {
  return strokes[strokes.length - 1]! + BOLT_LIFE;
}

const ONE_STROKE = [LEADER] as const;

/**
 * Brightness (0..1) of one segment of a bolt `age` s after the strike starts, `depth` its descent fraction (0 at the
 * sky, 1 at the ground), `main` true on the channel that reaches the ground, false on a branch, `strokes` its stroke
 * times (strokeTimes). As in slow-motion footage: a faint stepped leader of branch crawlers creeps down in
 * LEADER_STEPS jerks; at the first stroke the main channel appears at once at full brightness (boltBrightness: a
 * held flash, then a fade) while the branches flare dimly and die within BRANCH_FADE s; each re-strike blazes the
 * same main channel back to full (the branches stay dark).
 */
export function segmentBrightness(age: number, depth: number, main: boolean, strokes: readonly number[] = ONE_STROKE): number {
  const first = strokes[0]!;
  if (age < 0) return 0;
  if (age < first) {
    if (main) return 0;
    const tip = (Math.floor((age / first) * LEADER_STEPS) + 1) / LEADER_STEPS;
    return depth <= tip ? LEADER_GLOW : 0;
  }
  if (!main) {
    const s = age - first;
    return s < BRANCH_FADE ? BRANCH_FLASH * (1 - s / BRANCH_FADE) : 0;
  }
  let k = 0;
  for (const t of strokes) k = Math.max(k, boltBrightness(age - t));
  return k;
}

/** Seconds a stroke burns white-hot after its hold before cooling to its own colour. */
const HEAT_COOL = 0.25;

/** How white-hot (0..1) the main channel burns `age` s after the strike starts: full through each stroke's hold, then cooling. */
export function strokeHeat(age: number, strokes: readonly number[] = ONE_STROKE): number {
  let k = 0;
  for (const t of strokes) {
    const s = age - t;
    if (s < 0) continue;
    k = Math.max(k, s <= STROKE_HOLD ? 1 : 1 - (s - STROKE_HOLD) / HEAT_COOL);
  }
  return Math.max(0, k);
}

/** The scene light's flash for a bolt `age` s after its strike starts: nothing during the leader, full at each stroke. */
export function strikeFlash(age: number, strokes: readonly number[] = ONE_STROKE): number {
  let k = 0;
  for (const t of strokes) k = Math.max(k, flashBrightness(age - t));
  return k;
}
