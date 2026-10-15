# Osprey Net Squads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a level-7 enemy: a squad of four V-22 Ospreys that carries a giant net to the monster and drops it, snaring the monster (30% walk speed, no Leap or Dash) for 6 s, shortened by 1 s per attack.

**Architecture:**
- **The enemy:** a new `OspreyNets` enemy system in `src/enemies/`, modelled on `NapalmBombers`: one `THREE.Group` per Osprey, and per-Osprey materials for the hit flash. Pure flight and net maths live in `ospreyMath.ts`; the geometry lives in `ospreyModel.ts`.
- **The snare:** a small `Snare` state object in `src/systems/snare.ts`, owned by `GameScene`. Enemies reach it through one new `WorldContext.snareMonster(duration)` method.
- **Scene wiring:** `GameScene` applies the snare's speed multiplier, blocks Leap and Dash, and calls `snare.onAttack()` where each attack starts or fires.

**Tech Stack:** TypeScript, Three.js r170, Vite, Vitest. Run tests with `npx vitest run <file>`, type-check with `npx tsc --noEmit -p .`.

**Spec:** `docs/superpowers/specs/2026-10-15-osprey-net-design.md`

## Global Constraints

- Ospreys unlock at **level 7**, `cap: 1` squad (`CONFIG.spawns.osprey = { unlockLevel: 7, cost: 8, cap: 1, weight: 2 }`).
- Four Ospreys per squad. **3 or 4 alive at release → the net snares; 2 or fewer → abort** (checked at release time, and the moment the second one dies before release).
- The net cannot be dodged by walking: the squad tracks the monster until release.
- Snare: `CONFIG.snare = { duration: 6, perAttack: 1, minDuration: 2, speedMult: 0.3 }`. No leap, no dash; all attacks still work. A second net resets the timer; nets never stack.
- **No HUD element** for the snare. The leap and dash buttons show their existing not-ready look while snared.
- Osprey `hp` 100 (× difficulty `hpMult`), `exp` 15 each, never fire weapons.
- Models face +Z with +Y up; `heading = atan2(dx, dz)`; a group's `rotation.y = yaw` faces `(sin yaw, cos yaw)`.
- **Never `useEffect`**, and no React for game logic (project rule from `CLAUDE.md`).
- Comments follow the repo style: state what the code does and the constraints it meets, never history.
- Do not commit beyond each task's own commit step. **Do not push or deploy** (the owner's standing rule).

## Review Focus

1. **The monster keeps moving or leaps during the approach.** The squad must keep homing on the monster's current position, not where it was at spawn (Task 2: "approach follows a moving monster").
2. **An Osprey is killed after release, while the squad is leaving.** It must still pay EXP and must not cancel or alter the net already falling or snaring (Task 4: "kills after release still pay and leave the net alone").
3. **A second net lands while the monster is already snared.** Exactly one snared net may remain, and the snare restarts (Task 4: "a second landing replaces the first snared net"; Task 1: "start resets rather than stacks").
4. **The run resets (`clear()`) mid-drop or mid-crash.** No net or Osprey meshes may be left in the scene (Task 4: "clear removes every mesh").
5. **Enough attacks after the minimum time has passed bring the remaining time to zero.** The snare must still report its end exactly once, so the net tears free (Task 1: "attacks after minDuration end it on the next update, reported once").

---

### Task 1: Snare state and its config

**Files:**
- Modify: `src/config.ts` (add `snare` next to `abilities`)
- Create: `src/systems/snare.ts`
- Test: `src/systems/snare.test.ts`

**Interfaces:**
- Produces:
  - `class Snare` with `start(duration: number): void`, `onAttack(): void`, `update(dt: number): boolean` (true on the frame it runs out), `clear(): void`.
  - Getters: `active: boolean`, `speedMult: number`, `blocksMobility: boolean`.
  - `CONFIG.snare: { duration: number; perAttack: number; minDuration: number; speedMult: number }`.

- [ ] **Step 1: Add the config.** In `src/config.ts`, directly above the `abilities: {` block, add:

```ts
  /**
   * Snare (Osprey nets): while active the monster walks at speedMult × its speed and cannot leap or dash.
   * It lasts `duration` s; each attack takes `perAttack` s off, but never ends it sooner than `minDuration` s after it started.
   */
  snare: { duration: 6, perAttack: 1, minDuration: 2, speedMult: 0.3 },
```

- [ ] **Step 2: Write the failing test** `src/systems/snare.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { Snare } from './snare';

const S = CONFIG.snare;

/** Advances in 0.1 s steps; returns how many updates reported the end. */
function run(s: Snare, seconds: number): number {
  let ends = 0;
  for (let t = 0; t < seconds - 1e-9; t += 0.1) if (s.update(0.1)) ends++;
  return ends;
}

describe('Snare', () => {
  it('is inactive until started, with no slow and no mobility block', () => {
    const s = new Snare();
    expect(s.active).toBe(false);
    expect(s.speedMult).toBe(1);
    expect(s.blocksMobility).toBe(false);
    expect(s.update(1)).toBe(false);
  });

  it('slows and blocks mobility for its full duration, then reports the end once', () => {
    const s = new Snare();
    s.start(S.duration);
    expect(s.active).toBe(true);
    expect(s.speedMult).toBe(S.speedMult);
    expect(s.blocksMobility).toBe(true);
    expect(run(s, S.duration - 0.2)).toBe(0);
    expect(s.active).toBe(true);
    expect(run(s, 0.4)).toBe(1);
    expect(s.active).toBe(false);
    expect(s.speedMult).toBe(1);
    expect(run(s, 2)).toBe(0);
  });

  it('each attack takes perAttack off the remaining time', () => {
    const s = new Snare();
    s.start(S.duration);
    s.onAttack();
    s.onAttack();
    expect(run(s, S.duration - 2 * S.perAttack - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('never ends sooner than minDuration after it started, however many attacks', () => {
    const s = new Snare();
    s.start(S.duration);
    for (let i = 0; i < 20; i++) s.onAttack();
    expect(run(s, S.minDuration - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('attacks after minDuration end it on the next update, reported once', () => {
    const s = new Snare();
    s.start(S.duration);
    run(s, S.minDuration + 0.5);
    for (let i = 0; i < 20; i++) s.onAttack();
    expect(s.active).toBe(true);
    expect(s.update(0.01)).toBe(true);
    expect(s.update(0.01)).toBe(false);
    expect(s.active).toBe(false);
  });

  it('start resets rather than stacks', () => {
    const s = new Snare();
    s.start(S.duration);
    run(s, 4);
    s.start(S.duration);
    expect(run(s, S.duration - 0.2)).toBe(0);
    expect(run(s, 0.4)).toBe(1);
  });

  it('clear ends it silently', () => {
    const s = new Snare();
    s.start(S.duration);
    s.clear();
    expect(s.active).toBe(false);
    expect(s.update(0.1)).toBe(false);
  });

  it('ignores attacks while inactive', () => {
    const s = new Snare();
    s.onAttack();
    expect(s.active).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/systems/snare.test.ts`. Expected: FAIL, `Cannot find module './snare'` / failed to resolve import.

- [ ] **Step 4: Implement** `src/systems/snare.ts`:

```ts
import { CONFIG } from '../config';

/** Smallest remaining time an attack leaves, so the next update still ends the snare and reports it. */
const LAST_MOMENT = 1e-3;

/**
 * The monster's snare (an Osprey net): while active it walks at CONFIG.snare.speedMult and cannot leap or dash.
 * Each attack shortens it by CONFIG.snare.perAttack, never ending it sooner than CONFIG.snare.minDuration after it
 * started. Starting again resets the time; snares never stack.
 */
export class Snare {
  private remaining = 0;
  private elapsed = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  get speedMult(): number {
    return this.active ? CONFIG.snare.speedMult : 1;
  }

  get blocksMobility(): boolean {
    return this.active;
  }

  start(duration: number): void {
    this.remaining = duration;
    this.elapsed = 0;
  }

  onAttack(): void {
    if (!this.active) return;
    const floor = Math.max(LAST_MOMENT, CONFIG.snare.minDuration - this.elapsed);
    this.remaining = Math.max(floor, this.remaining - CONFIG.snare.perAttack);
  }

  /** Counts down; true only on the update that ends it. */
  update(dt: number): boolean {
    if (!this.active) return false;
    this.elapsed += dt;
    this.remaining -= dt;
    if (this.remaining > 0) return false;
    this.remaining = 0;
    return true;
  }

  /** Ends it without reporting an end (death, a new run). */
  clear(): void {
    this.remaining = 0;
    this.elapsed = 0;
  }
}
```

- [ ] **Step 5: Run the tests.** Run: `npx vitest run src/systems/snare.test.ts`. Expected: PASS (8 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/config.ts src/systems/snare.ts src/systems/snare.test.ts
git commit -m "Add the monster snare state for Osprey nets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Osprey squad flight and net maths

**Files:**
- Modify: `src/config.ts` (add `osprey` after the `napalm` block)
- Create: `src/enemies/ospreyMath.ts`
- Test: `src/enemies/ospreyMath.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `src/util/math.ts` (`{ x: number; z: number }`).
- Produces (all exported from `ospreyMath.ts`):
  - Types:
    - `P3 = { x: number; y: number; z: number }`
    - `SquadPhase = 'approach' | 'position' | 'leave'`
    - `Squad = { phase; t; x; y; z; yaw; half; tilt }`
    - `MonsterInfo = { x; z; height; bodyRadius }`
  - Squad flight: `newSquad(monster: Vec2, bearing: number): Squad`, `stepSquad(s: Squad, dt: number, m: MonsterInfo): void`, `positionDone(s): boolean`, `startLeave(s: Squad, from: Vec2): void` (turns straight away from `from` unless the squad is right over it), `squadGone(s, monster: Vec2): boolean`.
  - Sizing: `dropAltitude(height: number): number`, `netHalf(bodyRadius: number): number`, `domeRadius(bodyRadius: number, width: number): number`.
  - Outcome and formation: `dropOutcome(alive: number): 'release' | 'abort'`, `slotOffset(slot: number, half: number, yaw: number): Vec2`, `netCorners(ospreys: readonly (P3 | null)[], half: number): P3[]`.
  - Net grids: `NET_N = 8`, `newGrid(): P3[]`, `carriedGrid(corners, sag, out)`, `domeGrid(cx, baseY, cz, radius, height, out)`, `groundGrid(cx, cz, half, yaw, out)`, `blendGrid(from, to, k, out)`, `gridSegments(pts, out: Float32Array)`, `NET_SEGMENTS = 2 * NET_N * (NET_N + 1)`.

- [ ] **Step 1: Add the config.** In `src/config.ts`, directly after the closing `},` of the `napalm: { ... },` block, add:

```ts
  /**
   * Osprey Net squads: four Ospreys (one per net corner) spawn spawnDist m out and fly at cruiseSpeed and
   * cruiseAltitude in a square tightHalf m from the centre to each, homing on the monster. Within arriveDist they
   * position for positionTime s: the formation centre follows the monster at up to trackSpeed m/s, the square widens
   * to bodyRadius × netHalfMult, the squad sinks to the monster's height + dropClearance (both over the first
   * settleFrac of the phase), and the rotor pods swivel up over tiltTime s. Then, with at least minToDrop alive,
   * the net falls over dropTime s and snares the monster; otherwise it falls to the ground, lies groundLife s
   * (fading over the last second) and the squad aborts. Survivors climb back at climbRate m/s, close the square at
   * tightenRate m/s and fly out, despawning exitDist m from the monster.
   * Net: corners hang `cable` m below each Osprey; the middle sags sag × half; a lost corner droops droop × half
   * below its neighbours. Snared, it drapes as a dome of radius max(bodyRadius × domeRadiusMult,
   * width × domeWidthMult) and the monster's height. `size` is nose-to-tail length (m); rotors spin at rotorSpin rad/s.
   */
  osprey: {
    hp: 100, exp: 15, size: 80, hitRadius: 80,
    spawnDist: 2600, exitDist: 2600,
    cruiseSpeed: 220, cruiseAltitude: 650, arriveDist: 150,
    tightHalf: 45, netHalfMult: 1.8, dropClearance: 120,
    positionTime: 4, settleFrac: 0.6, tiltTime: 1.2, trackSpeed: 400,
    climbRate: 120, tightenRate: 60,
    minToDrop: 3,
    cable: 40, sag: 0.35, droop: 0.9,
    dropTime: 0.6, groundLife: 4, groundY: 3,
    domeRadiusMult: 2.2, domeWidthMult: 0.55,
    rotorSpin: 14, landShake: 0.4,
  },
```

- [ ] **Step 2: Write the failing test** `src/enemies/ospreyMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  NET_N, NET_SEGMENTS, blendGrid, carriedGrid, domeGrid, domeRadius, dropAltitude, dropOutcome, gridSegments, groundGrid,
  netCorners, netHalf, newGrid, newSquad, positionDone, slotOffset, squadGone, startLeave, stepSquad, type MonsterInfo,
} from './ospreyMath';

const O = CONFIG.osprey;
const DT = 0.05;
const at = (i: number, j: number) => i + j * (NET_N + 1);
const mon = (x = 0, z = 0): MonsterInfo => ({ x, z, height: 385, bodyRadius: 84 });

describe('squad flight', () => {
  it('spawns spawnDist from the monster at cruise altitude, tight, pods forward, heading at it', () => {
    const s = newSquad({ x: 100, z: -50 }, Math.PI / 2);
    expect(Math.hypot(s.x - 100, s.z + 50)).toBeCloseTo(O.spawnDist, 6);
    expect(s.y).toBe(O.cruiseAltitude);
    expect(s.half).toBe(O.tightHalf);
    expect(s.tilt).toBe(0);
    expect(s.phase).toBe('approach');
    expect(Math.sin(s.yaw)).toBeCloseTo((100 - s.x) / O.spawnDist, 6);
  });

  it('approach follows a moving monster and switches to positioning within arriveDist', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    let mx = 0;
    for (let t = 0; t < 30 && s.phase === 'approach'; t += DT) {
      mx += 60 * DT;
      stepSquad(s, DT, mon(mx, 0));
    }
    expect(s.phase).toBe('position');
    expect(Math.hypot(s.x - mx, s.z)).toBeLessThanOrEqual(O.arriveDist + O.cruiseSpeed * DT);
  });

  it('positions: sinks to the drop altitude, widens to the net, swivels the pods up, then is done', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (s.phase === 'approach') stepSquad(s, DT, mon());
    for (let t = 0; t < O.positionTime * O.settleFrac + DT; t += DT) stepSquad(s, DT, mon());
    expect(s.y).toBeCloseTo(dropAltitude(385), 0);
    expect(s.half).toBeCloseTo(netHalf(84), 0);
    expect(s.tilt).toBeCloseTo(Math.PI / 2, 3);
    expect(positionDone(s)).toBe(false);
    for (let t = 0; t < O.positionTime; t += DT) stepSquad(s, DT, mon());
    expect(positionDone(s)).toBe(true);
  });

  it('keeps its centre over a monster walking away while positioning', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (s.phase === 'approach') stepSquad(s, DT, mon());
    let mx = 0;
    for (let t = 0; t < O.positionTime; t += DT) {
      mx += 100 * DT;
      stepSquad(s, DT, mon(mx, 0));
    }
    expect(Math.hypot(s.x - mx, s.z)).toBeLessThan(20);
  });

  it('leaves: flies straight on, climbs back, closes up, tilts the pods forward, and is gone past exitDist', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    while (!positionDone(s)) stepSquad(s, DT, mon());
    const yaw = s.yaw;
    startLeave(s, { x: 0, z: 0 });
    expect(s.phase).toBe('leave');
    let t = 0;
    for (; t < 40 && !squadGone(s, { x: 0, z: 0 }); t += DT) stepSquad(s, DT, mon());
    expect(squadGone(s, { x: 0, z: 0 })).toBe(true);
    expect(s.yaw).toBe(yaw);
    expect(s.y).toBe(O.cruiseAltitude);
    expect(s.half).toBe(O.tightHalf);
    expect(s.tilt).toBe(0);
  });

  it('an exit started away from the monster turns straight away from it', () => {
    const s = newSquad({ x: 0, z: 0 }, 0);
    stepSquad(s, DT, mon());
    startLeave(s, { x: 0, z: 0 });
    expect(Math.sin(s.yaw) * s.x + Math.cos(s.yaw) * s.z).toBeGreaterThan(0);
    const d0 = Math.hypot(s.x, s.z);
    stepSquad(s, 1, mon());
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(d0 + O.cruiseSpeed, 3);
  });

  it('releases with 3 or 4 alive and aborts with 2 or fewer', () => {
    expect([4, 3, 2, 1, 0].map(dropOutcome)).toEqual(['release', 'release', 'abort', 'abort', 'abort']);
  });
});

describe('formation and net', () => {
  it('puts the four slots at the corners of a square, slot 0 front-left (+x, +z) at yaw 0', () => {
    expect(slotOffset(0, 10, 0)).toEqual({ x: 10, z: 10 });
    expect(slotOffset(2, 10, 0)).toEqual({ x: -10, z: -10 });
    const r = slotOffset(1, 10, Math.PI / 2);
    // Yawed a quarter turn, front-right (-x, +z) swings to (+x, +z) in world space.
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.z).toBeCloseTo(10, 6);
  });

  it('hangs corners a cable below each Osprey; a lost corner droops between its neighbours', () => {
    const c = netCorners([{ x: 10, y: 500, z: 10 }, null, { x: -10, y: 500, z: -10 }, { x: 10, y: 500, z: -10 }], 10);
    expect(c[0]).toEqual({ x: 10, y: 500 - O.cable, z: 10 });
    expect(c[1]!.x).toBeCloseTo(0, 6);
    expect(c[1]!.z).toBeCloseTo(0, 6);
    expect(c[1]!.y).toBeCloseTo(500 - O.cable - 10 * O.droop, 6);
  });

  it('sizes the drop and the dome from the monster', () => {
    expect(dropAltitude(385)).toBe(385 + O.dropClearance);
    expect(netHalf(84)).toBeCloseTo(84 * O.netHalfMult, 6);
    expect(domeRadius(84, 180)).toBeCloseTo(84 * O.domeRadiusMult, 6);
    expect(domeRadius(90, 689)).toBeCloseTo(689 * O.domeWidthMult, 6);
  });

  it('carried grid spans the corners and sags in the middle', () => {
    const c = [{ x: 10, y: 100, z: 10 }, { x: -10, y: 100, z: 10 }, { x: -10, y: 100, z: -10 }, { x: 10, y: 100, z: -10 }];
    const g = newGrid();
    carriedGrid(c, 5, g);
    expect(g[at(0, 0)]).toEqual(c[0]);
    expect(g[at(NET_N, 0)]).toEqual(c[1]);
    expect(g[at(NET_N, NET_N)]).toEqual(c[2]);
    expect(g[at(0, NET_N)]).toEqual(c[3]);
    const mid = g[at(NET_N / 2, NET_N / 2)]!;
    expect(mid.y).toBeCloseTo(95, 6);
    expect(mid.x).toBeCloseTo(0, 6);
  });

  it('dome peaks over the centre at the given height and meets the ground at its rim', () => {
    const g = newGrid();
    domeGrid(50, 0, -20, 100, 300, g);
    const top = g[at(NET_N / 2, NET_N / 2)]!;
    expect(top).toEqual({ x: 50, y: 300, z: -20 });
    const corner = g[at(0, 0)]!;
    expect(corner.y).toBeCloseTo(0, 6);
    expect(Math.hypot(corner.x - 50, corner.z + 20)).toBeCloseTo(100, 6);
  });

  it('ground grid lies flat at groundY, a square of the given half-width', () => {
    const g = newGrid();
    groundGrid(0, 0, 20, 0, g);
    for (const p of g) expect(p.y).toBe(O.groundY);
    expect(g[at(0, 0)]).toEqual({ x: 20, y: O.groundY, z: 20 });
  });

  it('blends grids point by point and writes line segments for every row and column', () => {
    const a = newGrid();
    const b = newGrid();
    for (const p of b) p.y = 10;
    const out = newGrid();
    blendGrid(a, b, 0.25, out);
    expect(out[0]!.y).toBeCloseTo(2.5, 6);
    expect(NET_SEGMENTS).toBe(2 * NET_N * (NET_N + 1));
    const buf = new Float32Array(NET_SEGMENTS * 6);
    groundGrid(0, 0, 20, 0, out);
    gridSegments(out, buf);
    // First segment: row 0 from point (0,0) to (1,0).
    expect([buf[0], buf[1], buf[2]]).toEqual([out[0]!.x, out[0]!.y, out[0]!.z]);
    expect([buf[3], buf[4], buf[5]]).toEqual([out[1]!.x, out[1]!.y, out[1]!.z]);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/enemies/ospreyMath.test.ts`. Expected: FAIL, the import `./ospreyMath` does not resolve.

- [ ] **Step 4: Implement** `src/enemies/ospreyMath.ts`:

```ts
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

export function newSquad(monster: Vec2, bearing: number): Squad {
  const x = monster.x + Math.sin(bearing) * O.spawnDist;
  const z = monster.z + Math.cos(bearing) * O.spawnDist;
  return { phase: 'approach', t: 0, x, y: O.cruiseAltitude, z, yaw: Math.atan2(monster.x - x, monster.z - z), half: O.tightHalf, tilt: 0 };
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
    s.half = O.tightHalf + (netHalf(m.bodyRadius) - O.tightHalf) * u;
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
```

- [ ] **Step 5: Run the tests.** Run: `npx vitest run src/enemies/ospreyMath.test.ts`. Expected: PASS (15 tests). If the "leaves" test times out at 40 s, check `squadGone` uses `>=` and the leave step moves along `yaw`.

- [ ] **Step 6: Commit.**

```bash
git add src/config.ts src/enemies/ospreyMath.ts src/enemies/ospreyMath.test.ts
git commit -m "Add Osprey squad flight and net maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Osprey model and palette

**Files:**
- Modify: `src/config.ts` (palette entries, after `napalmScorch`)
- Create: `src/enemies/ospreyModel.ts`
- Test: `src/enemies/ospreyModel.test.ts`

**Interfaces:**
- Consumes: `faceted`, `painted` from `src/render/toon.ts`; `CONFIG.osprey.size`.
- Produces:
  - Pivots: `PODS: readonly [THREE.Vector3, THREE.Vector3]` (wingtip pivots, body space) and `ROTOR_HUB: THREE.Vector3` (pod space).
  - Geometry: `bodyGeometry()`, `podGeometry()`, `rotorGeometry()`, `rotorDiscGeometry()`.
  - `rotorHubAt(pivot: THREE.Vector3, tilt: number, out: THREE.Vector3): THREE.Vector3`.
  - Palette: `ospreyBody`, `ospreyDark`, `ospreyGlass`, `ospreyRotor`, `netRope`.

- [ ] **Step 1: Add the palette.** In `src/config.ts`, after the line `    napalmScorch: 0x1c120b,`, add:

```ts
    /** Osprey (body is `ospreyBody`): light navy grey airframe, dark trim, tinted glass, gunmetal rotors; hemp-tan net rope that reads over the monsters' dark hides. */
    ospreyBody: 0x8f9aa6,
    ospreyDark: 0x3b434d,
    ospreyGlass: 0x7fb4c4,
    ospreyRotor: 0x1d1f22,
    netRope: 0xd8c79a,
```

- [ ] **Step 2: Write the failing test** `src/enemies/ospreyModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { PODS, bodyGeometry, podGeometry, rotorDiscGeometry, rotorGeometry, rotorHubAt } from './ospreyModel';

const S = CONFIG.osprey.size;
const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('Osprey model', () => {
  it('is a vertex-coloured airframe about `size` long, with the pods at the wingtips', () => {
    const body = bodyGeometry();
    expect(body.getAttribute('color')).toBeDefined();
    expect(podGeometry().getAttribute('color')).toBeDefined();
    const b = bounds(body);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.9 * S);
    expect(b.max.z - b.min.z).toBeLessThan(1.1 * S);
    expect(PODS[0].x).toBeCloseTo(b.max.x, 0);
    expect(PODS[1].x).toBeCloseTo(b.min.x, 0);
  });

  it('swivels the rotor hub from in front of its pod (tilt 0) to above it (tilt π/2)', () => {
    const pivot = PODS[0];
    const fwd = rotorHubAt(pivot, 0, new THREE.Vector3());
    expect(fwd.z).toBeGreaterThan(pivot.z);
    expect(fwd.y).toBeCloseTo(pivot.y, 6);
    const up = rotorHubAt(pivot, Math.PI / 2, new THREE.Vector3());
    expect(up.y).toBeGreaterThan(pivot.y);
    expect(up.z).toBeCloseTo(pivot.z, 6);
  });

  it('sizes the rotors so the two discs clear each other between the wingtips', () => {
    const r = bounds(rotorGeometry());
    const radius = Math.max(r.max.x, r.max.y);
    expect(bounds(rotorDiscGeometry()).max.x).toBeCloseTo(radius, 0);
    expect(PODS[0].x - PODS[1].x).toBeGreaterThan(2 * radius);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/enemies/ospreyModel.test.ts`. Expected: FAIL, the import `./ospreyModel` does not resolve.

- [ ] **Step 4: Implement** `src/enemies/ospreyModel.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, painted } from '../render/toon';

/**
 * V-22 Osprey model in world metres (CONFIG.osprey.size is nose-to-tail length). Body space is +Z forward, +Y up,
 * origin at the fuselage's centre. The airframe is one vertex-coloured mesh. Each wingtip carries a pod (pivot at
 * PODS, built pointing +Z) that swivels about X from forward (tilt 0) to straight up (tilt π/2); its three-blade
 * rotor sits at ROTOR_HUB in pod space and spins about the pod's Z axis.
 */
const S = CONFIG.osprey.size;
const WINGTIP = 0.39;
const ROTOR_R = 0.33;

export const PODS = [new THREE.Vector3(WINGTIP * S, 0.1 * S, 0.02 * S), new THREE.Vector3(-WINGTIP * S, 0.1 * S, 0.02 * S)] as const;
export const ROTOR_HUB = new THREE.Vector3(0, 0, 0.19 * S);
const X_AXIS = new THREE.Vector3(1, 0, 0);

type Part = THREE.BufferGeometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  return painted(faceted(new THREE.BoxGeometry(w * S, h * S, d * S)).translate(x * S, y * S, z * S), color);
}

/** A cylinder along Z (radius rFront toward +Z), centred at (x, y, z). */
function tube(rFront: number, rBack: number, len: number, seg: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rFront * S, rBack * S, len * S, seg).rotateX(Math.PI / 2);
  return painted(faceted(g.translate(x * S, y * S, z * S)), color);
}

function merge(parts: Part[]): Part {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('ospreyModel: merge failed');
  return g;
}

/** Boxy fuselage with a tapered nose and cockpit glass, high straight wing, landing-gear sponsons, cargo ramp, twin-finned tail. */
export function bodyGeometry(): Part {
  const P = CONFIG.palette;
  const body = P.ospreyBody;
  const dark = P.ospreyDark;
  const parts: Part[] = [
    box(0.17, 0.17, 0.62, 0, 0, 0.02, body),
    tube(0.05, 0.085, 0.16, 6, 0, -0.01, 0.41, body),
    box(0.15, 0.05, 0.08, 0, 0.05, 0.36, P.ospreyGlass),
    box(0.12, 0.12, 0.2, 0, 0.03, -0.38, body),
    box(0.13, 0.015, 0.18, 0, -0.08, -0.3, dark),
    box(2 * WINGTIP, 0.03, 0.13, 0, 0.1, 0.02, body),
    box(2 * WINGTIP - 0.04, 0.008, 0.12, 0, 0.118, 0.02, dark),
    box(0.26, 0.02, 0.08, 0, 0.05, -0.46, body),
  ];
  for (const sx of [-1, 1]) {
    parts.push(box(0.05, 0.06, 0.2, sx * 0.11, -0.06, 0.05, dark));
    parts.push(box(0.02, 0.16, 0.09, sx * 0.13, 0.13, -0.46, body));
  }
  return merge(parts);
}

/** Engine nacelle about the pod pivot, pointing +Z, with a dark intake ring at its front. */
export function podGeometry(): Part {
  const P = CONFIG.palette;
  return merge([tube(0.045, 0.05, 0.22, 8, 0, 0, 0.05, P.ospreyBody), tube(0.048, 0.048, 0.03, 8, 0, 0, 0.17, P.ospreyDark)]);
}

/** Three blades and a spinner in the pod's XY plane, about the local origin (place at ROTOR_HUB; spins about Z). */
export function rotorGeometry(): Part {
  const parts: Part[] = [faceted(new THREE.CylinderGeometry(0.025 * S, 0.035 * S, 0.05 * S, 6).rotateX(Math.PI / 2))];
  for (let k = 0; k < 3; k++) parts.push(faceted(new THREE.BoxGeometry(0.035 * S, ROTOR_R * S, 0.008 * S)).translate(0, (ROTOR_R / 2) * S, 0).rotateZ((k * 2 * Math.PI) / 3));
  return merge(parts);
}

/** The faint blur disc the blades sweep (place at ROTOR_HUB, drawn translucent). */
export function rotorDiscGeometry(): Part {
  return new THREE.CircleGeometry(ROTOR_R * S, 16);
}

/** Rotor hub in body space for a pod at `pivot` swivelled up by `tilt` (the pod's group rotation.x is -tilt). */
export function rotorHubAt(pivot: THREE.Vector3, tilt: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(ROTOR_HUB).applyAxisAngle(X_AXIS, -tilt).add(pivot);
}
```

- [ ] **Step 5: Run the tests.** Run: `npx vitest run src/enemies/ospreyModel.test.ts`. Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/config.ts src/enemies/ospreyModel.ts src/enemies/ospreyModel.test.ts
git commit -m "Add the Osprey model and palette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The OspreyNets enemy system

**Files:**
- Modify: `src/combat.ts:3` (add `'osprey'` to `TargetKind`)
- Modify: `src/enemies/types.ts:6-7` (`EnemyKind`, `ENEMY_KINDS`), `src/enemies/types.ts:13` (`WorldContext.monster`), and add `snareMonster` to `WorldContext`
- Modify: `src/config.ts` (`spawns.osprey`; add `'osprey'` to `readability.threatKinds`)
- Create: `src/enemies/OspreyNets.ts`
- Test: `src/enemies/OspreyNets.test.ts`
- Modify tests: `src/enemies/spawnTable.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produces from `ospreyMath.ts`, and `PODS`, `ROTOR_HUB`, `bodyGeometry`, `podGeometry`, `rotorGeometry`, `rotorDiscGeometry` from `ospreyModel.ts`. Also `CONFIG.snare.duration` (Task 1).
- Produces:
  - `class OspreyNets implements EnemySystem` with `kind = 'osprey'`.
  - `netTornFree(): void`: called by `GameScene` when the snare ends.
  - `netModes(): readonly NetMode[]`, where `NetMode = 'carried' | 'falling' | 'snared' | 'ground' | 'torn'`.
  - `WorldContext.monster` gains `bodyRadius: number`, `width: number`, `height: number` and `leapTo: Vec2 | null`.
  - `WorldContext.snareMonster(duration: number): void`.

- [ ] **Step 1: Widen the shared types.**

In `src/combat.ts` line 3, add `'osprey'`:

```ts
export type TargetKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'missile' | 'artillery' | 'truck' | 'heli' | 'napalm' | 'osprey' | 'building';
```

In `src/enemies/types.ts` replace lines 6–7:

```ts
export type EnemyKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'artillery' | 'truck' | 'laser' | 'heli' | 'napalm' | 'osprey';
export const ENEMY_KINDS: readonly EnemyKind[] = ['tank', 'jet', 'blimp', 'sam', 'artillery', 'truck', 'laser', 'heli', 'napalm', 'osprey'];
```

In the same file replace the `readonly monster: ...` line in `WorldContext` with:

```ts
  /**
   * The monster: where it is, whether it is alive or mid-leap, its body radius, standing width and height (world m),
   * and where a leap in progress will land (null when not leaping).
   */
  readonly monster: {
    readonly position: THREE.Vector3;
    readonly alive: boolean;
    readonly airborne: boolean;
    readonly bodyRadius: number;
    readonly width: number;
    readonly height: number;
    readonly leapTo: Vec2 | null;
  };
```

Then add to `WorldContext`, after `damageBuildings(...)`:

```ts
  /** Snares the monster for `duration` s (an Osprey net); while it is mid-leap, the snare starts when it lands. */
  snareMonster(duration: number): void;
```

In `src/config.ts`, add to `spawns` (after the `napalm` line):

```ts
    osprey: { unlockLevel: 7, cost: 8, cap: 1, weight: 2 },
```

and change `threatKinds` to:

```ts
    threatKinds: ['blimp', 'sam', 'artillery', 'truck', 'heli', 'napalm', 'osprey'] as readonly string[],
```

- [ ] **Step 2: Run the type-check to see the expected breakage.** Run: `npx tsc --noEmit -p .`. Expected errors:
  - **`src/GameScene.ts`:** `buildContext` is missing `snareMonster` and the new `monster` fields.
  - **`EnemyRegistry` / `GameScene`:** no `osprey` system is registered. That isn't a type error, but `counts()` will report 0 for it.

  The `GameScene` errors are fixed in Task 5. Continue.

- [ ] **Step 3: Update the spawn-table test** `src/enemies/spawnTable.test.ts`. In `it('follows the unlock levels', ...)`, after the line `expect(openKinds(6, none())).toContain('sam');` add:

```ts
    expect(openKinds(6, none())).not.toContain('osprey');
    expect(openKinds(7, none())).toContain('osprey');
```

and after the napalm test block add:

```ts
  it('unlocks Osprey squads at level 7, one at a time', () => {
    expect(CONFIG.spawns.osprey.cap).toBe(1);
    const alive = none();
    alive.osprey = 1;
    expect(openKinds(7, alive)).not.toContain('osprey');
  });
```

- [ ] **Step 4: Write the failing system test** `src/enemies/OspreyNets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { OspreyNets } from './OspreyNets';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';

const O = CONFIG.osprey;
const DT = 0.05;

function makeCtx() {
  const destroyed: { t: Target; exp: number }[] = [];
  const snares: number[] = [];
  const monster = { position: new THREE.Vector3(), alive: true, airborne: false, bodyRadius: 84, width: 180, height: 385, leapTo: null as { x: number; z: number } | null };
  const ctx = {
    monster,
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 7,
    rng: mulberry32(3),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: () => {},
    damageBuildings: () => {},
    snareMonster: (d: number) => snares.push(d),
    fireShell: () => {},
    fireRocket: () => {},
    splash: () => {},
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, destroyed, snares, monster };
}

function spawned() {
  const scene = new THREE.Scene();
  const nets = new OspreyNets(scene);
  const c = makeCtx();
  nets.spawn(c.ctx);
  return { scene, nets, ...c };
}

/** Steps until `done` or `limit` seconds pass. */
function until(nets: OspreyNets, ctx: WorldContext, done: () => boolean, limit = 40): void {
  for (let t = 0; t < limit && !done(); t += DT) nets.update(DT, ctx);
}

const alive = (nets: OspreyNets) => nets.targets().filter((t) => t.isAlive());
const kill = (t: Target) => t.applyDamage(1e9);

describe('OspreyNets', () => {
  it('spawns a squad of four airborne Ospreys with difficulty-scaled HP, capped at one squad', () => {
    const { nets, ctx } = spawned();
    expect(nets.count()).toBe(1);
    expect(nets.targets()).toHaveLength(4);
    for (const t of nets.targets()) {
      expect(t.kind).toBe('osprey');
      expect(t.airborne).toBe(true);
    }
    nets.spawn(ctx);
    expect(nets.targets()).toHaveLength(4);
    expect(nets.netModes()).toEqual(['carried']);
  });

  it('drops the net with all four alive: it falls, lands and snares for the full duration', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    expect(snares).toEqual([]);
    until(nets, ctx, () => snares.length > 0, O.dropTime + 0.2);
    expect(snares).toEqual([CONFIG.snare.duration]);
    expect(nets.netModes()).toEqual(['snared']);
  });

  it('still snares with one Osprey shot down', () => {
    const { nets, ctx, snares, destroyed } = spawned();
    kill(nets.targets()[0]!);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]!.exp).toBe(O.exp);
    until(nets, ctx, () => snares.length > 0);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('aborts the moment a second Osprey is shot down: the net falls to the ground and fades', () => {
    const { nets, ctx, snares } = spawned();
    for (let t = 0; t < 2; t += DT) nets.update(DT, ctx);
    kill(nets.targets()[1]!);
    kill(nets.targets()[2]!);
    expect(nets.netModes()).toEqual(['falling']);
    until(nets, ctx, () => nets.netModes()[0] === 'ground', O.dropTime + 0.2);
    until(nets, ctx, () => nets.netModes().length === 0, O.groundLife + 0.2);
    expect(nets.netModes()).toEqual([]);
    until(nets, ctx, () => nets.count() === 0);
    expect(snares).toEqual([]);
    expect(nets.count()).toBe(0);
  });

  it('kills after release still pay and leave the net alone', () => {
    const { nets, ctx, snares, destroyed } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    for (const t of alive(nets)) kill(t);
    expect(destroyed).toHaveLength(4);
    until(nets, ctx, () => snares.length > 0, O.dropTime + 0.2);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('tears the snared net free when told the snare ended', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => snares.length > 0);
    nets.netTornFree();
    nets.update(DT, ctx);
    expect(nets.netModes()).toEqual([]);
  });

  it('a second landing replaces the first snared net', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => snares.length > 0);
    until(nets, ctx, () => nets.count() === 0);
    nets.spawn(ctx);
    until(nets, ctx, () => snares.length > 1);
    nets.update(DT, ctx);
    expect(nets.netModes()).toEqual(['snared']);
  });

  it('drapes on the leap landing point while the monster is in the air', () => {
    const { nets, ctx, snares, monster } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    monster.airborne = true;
    monster.leapTo = { x: 500, z: 0 };
    until(nets, ctx, () => snares.length > 0, O.dropTime + 0.2);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('leaves after the drop and despawns past exitDist', () => {
    const { nets, ctx } = spawned();
    until(nets, ctx, () => nets.count() === 0, 60);
    expect(nets.count()).toBe(0);
    expect(alive(nets)).toEqual([]);
  });

  it('clear removes every mesh', () => {
    const { scene, nets, ctx } = spawned();
    const before = scene.children.length;
    expect(before).toBeGreaterThan(0);
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    kill(nets.targets()[0]!);
    nets.clear();
    expect(scene.children).toHaveLength(0);
    expect(nets.count()).toBe(0);
    expect(nets.targets()).toHaveLength(0);
    expect(nets.netModes()).toEqual([]);
  });
});
```

- [ ] **Step 5: Run it to make sure it fails.** Run: `npx vitest run src/enemies/OspreyNets.test.ts`. Expected: FAIL, the import `./OspreyNets` does not resolve.

- [ ] **Step 6: Implement** `src/enemies/OspreyNets.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import {
  NET_SEGMENTS, blendGrid, carriedGrid, domeGrid, domeRadius, dropOutcome, gridSegments, groundGrid, netCorners, newGrid,
  newSquad, positionDone, slotOffset, squadGone, startLeave, stepSquad, type MonsterInfo, type P3, type Squad,
} from './ospreyMath';
import { PODS, ROTOR_HUB, bodyGeometry, podGeometry, rotorDiscGeometry, rotorGeometry } from './ospreyModel';

const O = CONFIG.osprey;
const P = CONFIG.palette;
const SQUAD = 4;
/** Hover bob while flying (m) and its rate (rad/s), offset per slot so the four don't move in lockstep. */
const BOB = 4;
const BOB_RATE = 1.7;
const _v = new THREE.Vector3();

export type NetMode = 'carried' | 'falling' | 'snared' | 'ground' | 'torn';

/**
 * A net: carried under its squad, falling (blending from where it was released to where it lands), snared on the
 * monster, lying on the ground after an aborted drop, or torn (removed on the next update).
 */
type Net = {
  mode: NetMode;
  t: number;
  toMonster: boolean;
  start: P3[];
  pts: P3[];
  ground: { x: number; z: number; half: number; yaw: number };
  mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
};

/** A squad: its shared flight, its four Ospreys in slot order, and the net while they still carry it. */
type Team = { squad: Squad; ospreys: Osprey[]; net: Net | null };

class Osprey implements Target {
  readonly kind = 'osprey' as const;
  readonly airborne = true;
  readonly radius = O.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly pods: THREE.Group[] = [];
  readonly rotors: THREE.Group[] = [];
  hp: number;
  crashing = false;
  /** Out of the scene: crashed, or gone with its squad. */
  gone = false;
  flashT = 0;
  /** Crash fall: vertical speed, roll, roll rate and the trail clock. */
  vy = 0;
  bank = 0;
  spin = 0;
  trailT = 0;

  constructor(
    readonly team: Team,
    readonly slot: number,
    readonly material: THREE.MeshToonMaterial,
    hp: number,
    private onDamage: (o: Osprey, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return !this.crashing && !this.gone;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * Osprey Net squads: four Ospreys fly in carrying a net between them, track the monster while they sink and spread
 * it open, and drop it on the monster (snaring it) if at least CONFIG.osprey.minToDrop are still flying; with fewer,
 * the net falls to the ground. Then they fly out. The snared net stays draped on the monster until GameScene reports
 * the snare has ended (netTornFree).
 */
export class OspreyNets implements EnemySystem {
  readonly kind = 'osprey' as const;
  private ctx: WorldContext | null = null;
  private teams: Team[] = [];
  private nets: Net[] = [];
  private all: Osprey[] = [];
  private clock = 0;
  private scratch = newGrid();
  private body = bodyGeometry();
  private podGeo = podGeometry();
  private rotorGeo = rotorGeometry();
  private discGeo = rotorDiscGeometry();
  private rotorMat = toonMat(P.ospreyRotor);
  private discMat = new THREE.MeshBasicMaterial({ color: P.ospreyRotor, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  constructor(private scene: THREE.Scene) {}

  targets(): readonly Target[] {
    return this.all;
  }

  count(): number {
    return this.teams.length;
  }

  /** Each net's state, oldest first. */
  netModes(): readonly NetMode[] {
    return this.nets.map((n) => n.mode);
  }

  clear(): void {
    for (const o of this.all) this.scene.remove(o.group);
    for (const n of this.nets) this.dropNet(n);
    this.teams = [];
    this.nets = [];
    this.all = [];
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.teams.length >= CONFIG.spawns.osprey.cap) return;
    const m = ctx.monster.position;
    const team: Team = { squad: newSquad({ x: m.x, z: m.z }, ctx.rng() * Math.PI * 2), ospreys: [], net: null };
    for (let slot = 0; slot < SQUAD; slot++) {
      const mat = toonMat(0xffffff, { vertexColors: true });
      const o = new Osprey(team, slot, mat, O.hp * ctx.difficulty.hpMult, this.damage);
      const body = new THREE.Mesh(this.body, mat);
      body.castShadow = true;
      o.group.add(body);
      for (const pivot of PODS) {
        const pod = new THREE.Group();
        pod.position.copy(pivot);
        pod.add(new THREE.Mesh(this.podGeo, mat));
        const rotor = new THREE.Group();
        rotor.position.copy(ROTOR_HUB);
        rotor.add(new THREE.Mesh(this.rotorGeo, this.rotorMat), new THREE.Mesh(this.discGeo, this.discMat));
        pod.add(rotor);
        o.pods.push(pod);
        o.rotors.push(rotor);
        o.group.add(pod);
      }
      team.ospreys.push(o);
      this.all.push(o);
      this.scene.add(o.group);
    }
    team.net = this.makeNet();
    this.teams.push(team);
    this.placeTeam(team, 0);
    this.drawNet(team.net);
  }

  /** Called by GameScene when the snare runs out: the draped net bursts apart. */
  netTornFree(): void {
    const ctx = this.ctx;
    for (const n of this.nets) {
      if (n.mode !== 'snared') continue;
      n.mode = 'torn';
      if (!ctx) continue;
      const c = this.domeCentre(ctx);
      ctx.particles.emit('debris', _v.set(c.x, ctx.monster.height * 0.6, c.z), 18, 1.6);
      ctx.particles.ring('dust', _v.set(c.x, 0, c.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 16);
    }
  }

  private damage = (o: Osprey, amount: number): void => {
    if (!o.isAlive()) return;
    o.hp -= amount;
    o.flashT = 0.1;
    if (o.hp > 0) return;
    o.crashing = true;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * 2.5;
    this.ctx?.particles.explosion(o.position, 1.2);
    this.ctx?.particles.emit('smoke', o.position, 6, 0.8);
    const team = o.team;
    // Too few left to hold the net up: the drop is off at once.
    if (team.net?.mode === 'carried' && dropOutcome(this.living(team)) === 'abort') {
      const m = this.ctx!.monster.position;
      this.abort(team);
      startLeave(team.squad, { x: m.x, z: m.z });
    }
    this.ctx?.onDestroyed(o, O.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    this.clock += dt;
    const info = this.info(ctx);
    const m = ctx.monster.position;
    for (let i = this.teams.length - 1; i >= 0; i--) {
      const team = this.teams[i]!;
      stepSquad(team.squad, dt, info);
      if (positionDone(team.squad) && team.net?.mode === 'carried') {
        if (dropOutcome(this.living(team)) === 'release') this.release(team);
        else this.abort(team);
        startLeave(team.squad, { x: m.x, z: m.z });
      }
      this.placeTeam(team, dt);
      for (const o of team.ospreys) if (o.crashing && !o.gone && this.crash(o, dt, ctx)) this.remove(o);
      if (squadGone(team.squad, { x: m.x, z: m.z }) || team.ospreys.every((o) => o.gone)) {
        for (const o of team.ospreys) if (!o.gone) this.remove(o);
        this.teams.splice(i, 1);
      }
    }
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i]!;
      if (this.updateNet(n, dt, ctx)) continue;
      this.dropNet(n);
      this.nets.splice(i, 1);
    }
  }

  private info(ctx: WorldContext): MonsterInfo {
    const m = ctx.monster;
    return { x: m.position.x, z: m.position.z, height: m.height, bodyRadius: m.bodyRadius };
  }

  private living(team: Team): number {
    return team.ospreys.filter((o) => o.isAlive()).length;
  }

  /** Flies each living Osprey in its slot, swivels the pods, spins rotors, fades hit flashes, and hangs a carried net. */
  private placeTeam(team: Team, dt: number): void {
    const s = team.squad;
    const hung: (P3 | null)[] = [];
    for (const o of team.ospreys) {
      if (o.gone) continue;
      o.flashT = Math.max(0, o.flashT - dt);
      o.material.emissive.setHex(o.flashT > 0 ? 0xffffff : 0x000000);
      for (const r of o.rotors) r.rotation.z += O.rotorSpin * (o.crashing ? 0.3 : 1) * dt;
    }
    for (const o of team.ospreys) {
      if (!o.isAlive()) {
        hung.push(null);
        continue;
      }
      const off = slotOffset(o.slot, s.half, s.yaw);
      o.position.set(s.x + off.x, s.y + Math.sin(this.clock * BOB_RATE + o.slot) * BOB, s.z + off.z);
      o.group.rotation.set(0, s.yaw, 0);
      for (const pod of o.pods) pod.rotation.x = -s.tilt;
      hung.push(o.position);
    }
    if (team.net?.mode === 'carried') carriedGrid(netCorners(hung, s.half), s.half * O.sag, team.net.pts);
  }

  /** Falls, rolls, trails smoke and blows up on the ground (as the napalm bombers do). True once it has hit. */
  private crash(o: Osprey, dt: number, ctx: WorldContext): boolean {
    const yaw = o.team.squad.yaw;
    o.vy -= 120 * dt;
    o.position.x += Math.sin(yaw) * O.cruiseSpeed * 0.3 * dt;
    o.position.z += Math.cos(yaw) * O.cruiseSpeed * 0.3 * dt;
    o.position.y += o.vy * dt;
    o.bank += o.spin * dt;
    o.group.rotation.set(0, yaw, o.bank);
    o.trailT += dt;
    if (o.trailT > 0.05) {
      o.trailT = 0;
      ctx.particles.emit('smoke', o.position, 1, 0.3);
      ctx.particles.emit('fire', o.position, 1, 0.2);
    }
    if (o.position.y > 0) return false;
    const p = o.position.clone().setY(0);
    ctx.particles.explosion(p, 2);
    ctx.particles.ring('dust', p, 120, 12);
    ctx.splash(p, 2);
    ctx.shake(0.3);
    return true;
  }

  private remove(o: Osprey): void {
    o.gone = true;
    this.scene.remove(o.group);
    o.material.dispose();
    this.all = this.all.filter((x) => x !== o);
  }

  private release(team: Team): void {
    const net = team.net!;
    this.letGo(net);
    net.toMonster = true;
    team.net = null;
  }

  private abort(team: Team): void {
    const net = team.net!;
    const s = team.squad;
    this.letGo(net);
    net.toMonster = false;
    net.ground = { x: s.x, z: s.z, half: s.half, yaw: s.yaw };
    team.net = null;
  }

  private letGo(net: Net): void {
    net.mode = 'falling';
    net.t = 0;
    blendGrid(net.pts, net.pts, 0, net.start);
  }

  /** Where a net on the monster drapes: the leap's landing point while it is in the air, else under it. */
  private domeCentre(ctx: WorldContext): { x: number; z: number } {
    const m = ctx.monster;
    return m.airborne && m.leapTo ? m.leapTo : { x: m.position.x, z: m.position.z };
  }

  /** The grid a falling net is headed for: the dome on the monster, or flat on the ground under the squad. */
  private landingGrid(net: Net, ctx: WorldContext, out: P3[]): void {
    if (net.toMonster) {
      const c = this.domeCentre(ctx);
      domeGrid(c.x, 0, c.z, domeRadius(ctx.monster.bodyRadius, ctx.monster.width), ctx.monster.height, out);
    } else groundGrid(net.ground.x, net.ground.z, net.ground.half, net.ground.yaw, out);
  }

  /** Lands a net on the monster: earlier snared nets go, the snare starts (or restarts), and the ground shakes. */
  private land(net: Net, ctx: WorldContext): void {
    for (const n of this.nets) if (n !== net && n.mode === 'snared') n.mode = 'torn';
    net.mode = 'snared';
    ctx.snareMonster(CONFIG.snare.duration);
    ctx.shake(O.landShake);
    const c = this.domeCentre(ctx);
    ctx.particles.ring('dust', _v.set(c.x, 0, c.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 20);
  }

  /** Advances one net; false once it should be removed. */
  private updateNet(net: Net, dt: number, ctx: WorldContext): boolean {
    if (net.mode === 'torn') return false;
    if (net.mode === 'falling') {
      net.t += dt;
      const k = Math.min(1, net.t / O.dropTime);
      this.landingGrid(net, ctx, this.scratch);
      blendGrid(net.start, this.scratch, k * k, net.pts);
      if (k >= 1) {
        if (net.toMonster) this.land(net, ctx);
        else {
          net.mode = 'ground';
          net.t = 0;
        }
      }
    } else if (net.mode === 'snared') this.landingGrid(net, ctx, net.pts);
    else if (net.mode === 'ground') {
      net.t += dt;
      net.mesh.material.opacity = Math.max(0, Math.min(1, O.groundLife - net.t));
      if (net.t >= O.groundLife) return false;
    }
    this.drawNet(net);
    return true;
  }

  private makeNet(): Net {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NET_SEGMENTS * 6), 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: P.netRope, transparent: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const net: Net = { mode: 'carried', t: 0, toMonster: false, start: newGrid(), pts: newGrid(), ground: { x: 0, z: 0, half: 0, yaw: 0 }, mesh };
    this.nets.push(net);
    return net;
  }

  private drawNet(net: Net): void {
    const attr = net.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    gridSegments(net.pts, attr.array as Float32Array);
    attr.needsUpdate = true;
  }

  private dropNet(net: Net): void {
    this.scene.remove(net.mesh);
    net.mesh.geometry.dispose();
    net.mesh.material.dispose();
  }
}
```

- [ ] **Step 7: Run the system and spawn tests.** Run: `npx vitest run src/enemies/OspreyNets.test.ts src/enemies/spawnTable.test.ts src/enemies/SpawnDirector.test.ts`. Expected: PASS. If "a second landing replaces the first snared net" fails with two `snared` entries, check that `land()` marks earlier snared nets `torn` and that `updateNet` removes `torn` nets.

- [ ] **Step 8: Commit.** (`GameScene` still fails the type-check until Task 5; the commit is test-green on its own files.)

```bash
git add src/combat.ts src/enemies/types.ts src/config.ts src/enemies/OspreyNets.ts src/enemies/OspreyNets.test.ts src/enemies/spawnTable.test.ts
git commit -m "Add the Osprey Net enemy system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the snare and the Ospreys into GameScene

**Files:**
- Modify: `src/monster/Monster.ts` (add a `leapTarget` getter near `get airborne()`, about line 148)
- Modify: `src/GameScene.ts`. The anchors below are quoted text; line numbers drift:
  - the imports
  - the enemy registration after `this.enemies.add(new NapalmBombers(this.scene));`
  - `buildContext()`
  - `resetRun()` and `startDying()`
  - the playing-state update after `this.abilities.tick(dt);`
  - `pressAbility()` and `leapTo()`
  - `updateMonster()` (the walk call and the melee start)
  - `fireRanged()`, `tentacleSlams()`, `roar()`, `tailSweep()` and `tailSwat()`
  - the `this.events.emit('abilities', ...)` line

**Interfaces:**
- Consumes: `Snare` (Task 1), `OspreyNets.netTornFree()` (Task 4), `WorldContext.snareMonster` and the new `WorldContext.monster` fields (Task 4).
- Produces: `Monster.leapTarget: Vec2 | null`, and `GameScene` behaviour:
  - Walking is slowed while snared, and Leap and Dash are refused (their buttons show not ready).
  - Each attack calls `snare.onAttack()`.
  - The snare is cleared on death and on a new run.
  - When the snare ends, `GameScene` calls `netTornFree()`.

- [ ] **Step 1: Add `Monster.leapTarget`.** In `src/monster/Monster.ts`, directly after the `get airborne()` getter, add:

```ts
  /** Where the current leap lands; null when not leaping. */
  get leapTarget(): Vec2 | null {
    return this.leapT >= 0 ? this.leapTo : null;
  }
```

(`Vec2` is already imported in `Monster.ts`; if `tsc` says otherwise, add `import type { Vec2 } from '../util/math';`.)

- [ ] **Step 2: Register the system and own the snare.** In `src/GameScene.ts`:
  - Add imports next to the other enemy imports:

```ts
import { OspreyNets } from './enemies/OspreyNets';
import { Snare } from './systems/snare';
```

  - Add fields next to `private swatCd`/`tailCd` (search `private tailCd`):

```ts
  /** The monster's snare (Osprey nets), and a snare that arrived mid-leap, waiting for the landing (s; 0 = none). */
  private snare = new Snare();
  private pendingSnare = 0;
```

  - After `this.enemies.add(new NapalmBombers(this.scene));` add:

```ts
    this.enemies.add(new OspreyNets(this.scene));
```

- [ ] **Step 3: Extend `buildContext()`.** Replace the `get monster()` getter with:

```ts
      get monster() {
        const m = self.monster;
        return {
          position: m.position,
          alive: m.alive,
          airborne: m.airborne,
          bodyRadius: self.ms.bodyRadius,
          width: self.ms.size.width,
          height: self.ms.size.height,
          leapTo: m.leapTarget,
        };
      },
```

and after the `damageBuildings: ...` entry add:

```ts
      snareMonster: (duration) => this.snareMonster(duration),
```

Then add these methods to `GameScene` directly after `damageMonster(...)`:

```ts
  /** An Osprey net lands: snares the monster now, or when it lands if it is mid-leap. Ignored once it is dead. */
  private snareMonster(duration: number): void {
    if (!this.monster.alive || this.state !== 'playing') return;
    if (this.monster.airborne) this.pendingSnare = duration;
    else this.startSnare(duration);
  }

  /** Starts (or restarts) the snare and drops any Leap aim. */
  private startSnare(duration: number): void {
    this.snare.start(duration);
    this.abilities.cancelAim();
    this.monster.crouch = false;
    this.markers.setAim(null, 0);
  }
```

- [ ] **Step 4: Tick the snare.** In the playing-state block, directly after `this.abilities.tick(dt);`, add:

```ts
        if (this.pendingSnare > 0 && !this.monster.airborne) {
          this.startSnare(this.pendingSnare);
          this.pendingSnare = 0;
        }
        if (this.snare.update(dt)) this.enemies.get<OspreyNets>('osprey').netTornFree();
```

- [ ] **Step 5: Clear it on death and on a new run.** In `resetRun()`, after `this.abilities.reset();`, and in `startDying()`, after `this.breath.clear();`, add:

```ts
    this.snare.clear();
    this.pendingSnare = 0;
```

- [ ] **Step 6: Slow walking.** In `updateMonster()` replace:

```ts
      if (d.moveTo) m.moveToward(d.moveTo, dt, s.moveSpeedMult);
```

with:

```ts
      if (d.moveTo) m.moveToward(d.moveTo, dt, s.moveSpeedMult * this.snare.speedMult);
```

- [ ] **Step 7: Block Leap and Dash.**
  - At the top of `pressAbility(id)`, after the existing `if (this.state !== 'playing' || !this.monster.alive) return;`, add:

```ts
    if ((id === 'leap' || id === 'dash') && this.snare.blocksMobility) return;
```

  - At the top of `leapTo(ground)`, add as its first line:

```ts
      if (this.snare.blocksMobility) return;
```

  - Replace `this.events.emit('abilities', this.abilities.view());` with:

```ts
        this.events.emit('abilities', this.abilityView());
```

  - Add this method next to `pressAbility`:

```ts
  /** The ability buttons: Leap and Dash show not ready while snared. */
  private abilityView(): AbilityView[] {
    const view = this.abilities.view();
    if (!this.snare.blocksMobility) return view;
    return view.map((v) => (v.id === 'leap' || v.id === 'dash' ? { ...v, ready: false, aiming: false } : v));
  }
```

  - If `AbilityView` is not imported in `GameScene.ts` yet, add it to the existing `./systems/abilities` import: `import { ..., type AbilityView } from './systems/abilities';`.

- [ ] **Step 8: Count attacks.** Add `this.snare.onAttack();` at each of these points:
  - **Melee:** in `updateMonster()`, as the first line inside `if (d.attack === 'melee' && d.meleeAt && !outsideArc) {`.
  - **Ranged:** in `fireRanged(target)`, directly after its early-return guard line (`if (target?.airborne && (...)) return;`).
  - **Kraken arms:** in `tentacleSlams()`, inside the `for (const { arm, target } of assignStrikes(...))` loop, after `arms.start(...)`.
  - **Roar:** in `roar()`, as its first line.
  - **Tail sweep:** in `tailSweep(dt)`, directly after `this.tailCd = TS.cooldown * this.progression.stats.cooldownMult;`.
  - **Anti-air:** in `tailSwat(dt)`, directly after `this.swatCd = sw.cooldown;`.

- [ ] **Step 9: Type-check and run everything.** Run: `npx tsc --noEmit -p . && npx vitest run`. Expected: no type errors, and all tests pass (880 earlier, plus the new snare, ospreyMath, ospreyModel and OspreyNets tests).

- [ ] **Step 10: Commit.**

```bash
git add src/monster/Monster.ts src/GameScene.ts
git commit -m "Wire Osprey nets and the monster snare into the game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser check with the owner

**Files:** none unless tuning is requested (tuning goes in `CONFIG.osprey` / `CONFIG.snare`).

- [ ] **Step 1: Build.** Run: `npm run build`. Expected: `✓ built`.
- [ ] **Step 2: Hand over for playtesting.** Tell the owner to run `npm run dev`, start a run, and reach level 7 quickly with the Konami-code level-up cheat. Things to check:
  - **The squad:** reads as Ospreys with a net, and is distinct from the tanks and artillery.
  - **Positioning:** the window is long and low enough to shoot Ospreys down.
  - **The snare:** the dome is visible on each of the four monsters, walking is slowed, and Leap and Dash are greyed out.
  - **Tearing free:** attacking tears the net sooner.
  - **Losses:** one Osprey down still snares; two down drops the net on the ground.
- [ ] **Step 3: Apply the requested tuning** in `CONFIG`, re-run `npx vitest run`, and commit only when the owner says so. Never push or deploy without being asked.
