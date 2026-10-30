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
/** When (s into the stroke) the channel re-strikes, flaring back up. */
export const STROKE_FLICKER = 0.28;
/** Seconds the scene light holds full on a stroke, and its whole glow. */
const FLASH_HOLD = 0.08;
const FLASH_LIFE = 0.58;

/**
 * The return stroke's brightness (0..1) `age` s after it lands, as slow-motion footage shows it: a blinding flash
 * held for STROKE_HOLD s (long enough to see), then a fade to nothing by BOLT_LIFE, with one re-strike flaring it
 * back up at STROKE_FLICKER.
 */
export function boltBrightness(age: number): number {
  if (age < 0 || age >= BOLT_LIFE) return 0;
  if (age <= STROKE_HOLD) return 1;
  const fade = (1 - (age - STROKE_HOLD) / (BOLT_LIFE - STROKE_HOLD)) ** 2;
  const flicker = 0.45 * Math.exp(-((age - STROKE_FLICKER) ** 2) / (2 * 0.025 ** 2));
  return Math.min(1, fade + flicker);
}

/** The scene light's flash (0..1) `age` s after a stroke: held full for FLASH_HOLD s, then a smooth fade, gone by FLASH_LIFE. */
export function flashBrightness(age: number): number {
  if (age < 0 || age >= FLASH_LIFE) return 0;
  if (age <= FLASH_HOLD) return 1;
  const t = age - FLASH_HOLD;
  return Math.exp(-t / 0.12) * (1 - t / (FLASH_LIFE - FLASH_HOLD));
}

/** Seconds the stepped leader takes to creep from the sky to the ground before the return stroke. */
export const LEADER = 0.3;
/** The leader comes down in this many jerky steps. */
const LEADER_STEPS = 8;
/**
 * Brightness of the faint leader: its branches, and the main channel (all but invisible, so the channel appears with
 * the stroke); of the branches as the stroke lights them, and how long they take to die.
 */
const LEADER_GLOW = 0.18;
const LEADER_MAIN = 0.05;
const BRANCH_FLASH = 0.7;
const BRANCH_FADE = 0.12;

/**
 * Brightness (0..1) of one segment of a bolt `age` s after the strike starts, `depth` its descent fraction (0 at the
 * sky, 1 at the ground), `main` true on the channel that reaches the ground, false on a branch. As in slow-motion
 * footage: a faint stepped leader creeps down, branching, in LEADER_STEPS jerks over LEADER s; when it touches the
 * ground the return stroke blazes the main channel (boltBrightness: a held flash, then a fade with one re-strike) while the
 * branches flare dimly and die within BRANCH_FADE s.
 */
export function segmentBrightness(age: number, depth: number, main: boolean): number {
  if (age < 0) return 0;
  if (age < LEADER) {
    const tip = (Math.floor((age / LEADER) * LEADER_STEPS) + 1) / LEADER_STEPS;
    return depth <= tip ? (main ? LEADER_MAIN : LEADER_GLOW) : 0;
  }
  const s = age - LEADER;
  if (main) return boltBrightness(s);
  return s < BRANCH_FADE ? BRANCH_FLASH * (1 - s / BRANCH_FADE) : 0;
}

/** Seconds the stroke burns white-hot after the hold before cooling to its own colour. */
const HEAT_COOL = 0.25;

/** How white-hot (0..1) the main channel burns `age` s after the strike starts: full from the stroke through its hold, then cooling. */
export function strokeHeat(age: number): number {
  const s = age - LEADER;
  if (s < 0) return 0;
  if (s <= STROKE_HOLD) return 1;
  return Math.max(0, 1 - (s - STROKE_HOLD) / HEAT_COOL);
}

/** The scene light's flash for a strike `age` s after it starts: nothing during the leader, full at the return stroke. */
export function strikeFlash(age: number): number {
  return age < LEADER ? 0 : flashBrightness(age - LEADER);
}
