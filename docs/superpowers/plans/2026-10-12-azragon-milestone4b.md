# AZRAGON Milestone 4b (The Kraken) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Kraken the third playable monster: a many-armed brawler that crawls on its tentacles, slams enemies on every side at once with its free arms, hurls rubble at distant targets, and has its own signature upgrades.

**Architecture:**
- **Module:** the Kraken plugs into the 4a monster architecture as a new `MonsterKind` plus `MonsterBody`, under `src/monsters/kraken/`.
- **Pure logic:** crawl roles, plant events and arm-to-target assignment are pure modules.
- **`TentacleArms`:** a small logic class the body owns.
  - The body writes each arm's crawl role and world tip position into it every frame.
  - `GameScene` reads free arms from it, starts slams and hurls, and resolves their impacts.
  - The body poses each arm from it.
- **New attack kinds:** melee gains a `{ kind: 'multi' }` shape, ranged gains `'hurl'` (a new `'chunk'` projectile) and anti-air gains `'lash'`. The Insect and Kaiju paths are untouched.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright with Metal GPU for scripted checks.

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone4b-design.md`

## Global Constraints

- **Project rules:**
  - No `useEffect`.
  - Game logic in classes; React for UI only.
  - No `setPixelRatio`.
  - Models face +Z, and +X is the model's left (forward = (sin yaw, cos yaw)).
  - Tunables go in `src/config.ts`.
  - Draw calls stay under 150 on every screen.
- **The Insect and the Reptile Kaiju must not change.** All existing tests keep passing.
- **The Kraken's attacks never turn or stop its body.** Only an explicit attack order may face the body toward a target.
- **Shared kit:**
  - Leap, Dash and Roar are shared actives with the same mechanics for every monster.
  - Shield Bubble, Reflect Shield, Overload and the generic stat upgrades are shared.
  - Signature upgrades are offered only to their own monster.
- **Commits:** commit after every task. Messages end with a `Co-Authored-By:` trailer naming the model that made the commit.

## Review Focus

1. **Several free arms with several targets on different sides at once:** each arm hits one target, no target is struck by two arms at once, a pulling or reaching arm never strikes, and the body never turns. Pinned by the `assignStrikes` and `TentacleArms` tests (Tasks 1–2) and the scripted ring-of-tanks check (Task 4).
2. **A strike whose target dies mid-swing:** the arm finishes against the last known position and nothing throws. Pinned by the `TentacleArms` live-target test (Task 2).
3. **Switching away from the Kraken mid-strike, or Play Again / Change Monster:** no arm state, chunk or spin leaks into the next run or monster. Pinned by `clear()` tests (Task 2) and the scripted switch checks (Task 5).
4. **Hurl with no free arm, or no target beyond slam reach:** no throw, and the cooldown is not consumed. Pinned in Task 4 and its scripted check.
5. **Insect and Kaiju regression:** their melee, ranged and anti-air behave as before and their effect colours are unchanged. Pinned by the existing suite and the scripted regression checks (Task 5).

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | `CONFIG.kraken` (stats, arms, slam, hurl, colours); `passives.grip` |
| `src/monsters/kraken/crawl.ts` (+test) | Arm angles, front arms, crawl phase, roles, plant events |
| `src/monsters/kraken/strikes.ts` (+test) | `assignStrikes`: free arms ↔ targets within reach |
| `src/monsters/kraken/TentacleArms.ts` (+test) | Per-arm roles, tips, strike timelines, cooldowns, spin |
| `src/monsters/kraken/KrakenBody.ts` | Mantle, eyes, eight tentacle chains; crawl, strike, lash, roar, spin, leap and dash poses |
| `src/monsters/kraken/kind.ts` (+test) | `KRAKEN` `MonsterKind` |
| `src/monsters/types.ts` | `MeleeShape` multi, ranged hurl, antiAir lash, `BodyFrame` airborne/dashing, `MonsterBody.arms?`, `FxTheme.intercept` |
| `src/monster/Monster.ts` | Fills `airborne` / `dashing` in the frame |
| `src/systems/Particles.ts` | `'ink'` particle kind |
| `src/systems/Projectiles.ts` (+test) | `'chunk'` shot: `fireChunk` |
| `src/systems/Passives.ts` (+test), `src/systems/Progression.ts` | `grip` ability (Sucker Grip) |
| `src/monsters/roster.ts` (+test), `src/monsters/insect/kind.ts`, `src/monsters/kaiju/kind.ts` | Kraken playable; `fx.intercept` |
| `src/GameScene.ts` | Tentacle slams, hurl, grip, whirlpool spin, ink intercepts, multi-melee brain input |

---

### Task 1: Crawl and strike-assignment logic (pure) + `CONFIG.kraken`

**Files:**
- Create: `src/monsters/kraken/crawl.ts`, `src/monsters/kraken/crawl.test.ts`, `src/monsters/kraken/strikes.ts`, `src/monsters/kraken/strikes.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces:
  - `ARM_COUNT = 8`
  - `armAngle(i): number`, the body-relative yaw of arm i (0 = straight ahead, + = toward +X / the model's left)
  - `isFrontArm(i): boolean`
  - `crawlPhase(i, cycle): number`
  - `type ArmRole = 'pull' | 'reach' | 'free'`
  - `armRole(i, cycle, moving): ArmRole`
  - `armPlanted(prev, cur, i): boolean`
  - `assignStrikes(free: readonly number[], yaw, from: Vec2, targets, reach): { arm: number; target: T }[]`
  - `CONFIG.kraken`

- [ ] **Step 1: Config**

Add to `CONFIG` in `src/config.ts`, after the `kaiju` block:

```ts
  /** The Kraken. Stats feed its MonsterKind; arms tune the tentacles; colours its body and effects. */
  kraken: {
    stats: {
      maxHp: 1100,
      moveSpeed: 125,
      turnRate: 2.0,
      damageMult: 1.1,
      /** One crawl cycle covers this many model units (each front arm pulls the mantle half of it). */
      strideLength: 320,
      bodyRadius: 150 * MONSTER_SCALE,
      footRadius: 60,
      footDamage: 120,
      /** Slam reach (world m) — also the brain's melee range for attack orders. */
      meleeRange: 400,
      meleeRadius: 90,
      meleeDamage: 70,
      meleeCooldown: 1.4,
      meleeTiming: { windup: 0.3, impact: 0.45, end: 0.85 },
      rangedRange: 1400,
      rangedDamage: 85,
      rangedCooldown: 1.8,
      headHeight: 420,
      /** Measured standing bounding box (world m) — re-measure in Task 3 after the model exists. */
      size: { width: 760, length: 760, height: 300 },
    },
    arms: {
      /** Hurl: seconds to grab, release (throw), end; chunk splash radius (m), flight time (s), arc height (m). */
      hurl: { timing: { windup: 0.35, impact: 0.55, end: 0.9 }, splash: 110, flight: 1.3, arc: 500 },
      /** Whirlpool spin duration (s). */
      spinTime: 0.8,
    },
    colors: {
      mantle: 0x7a2348,
      mantleDark: 0x4a1430,
      underside: 0xe0a6a0,
      eye: 0xffb320,
      ink: 0x2a1838,
      chunk: 0x8a8378,
    },
  },
```

`MONSTER_SCALE` is the constant at the top of `config.ts`. The stats object must match `MonsterStats` exactly.

- [ ] **Step 2: Write the failing tests**

`src/monsters/kraken/crawl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ARM_COUNT, armAngle, armPlanted, armRole, isFrontArm } from './crawl';

const arms = [...Array(ARM_COUNT).keys()];

describe('arm layout', () => {
  it('spaces eight arms evenly around the mantle, symmetric left/right', () => {
    expect(arms.map((i) => +(armAngle(i) * (180 / Math.PI)).toFixed(1))).toEqual([-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5]);
    expect(arms.filter(isFrontArm)).toEqual([2, 3, 4, 5]);
  });
});

describe('armRole', () => {
  it('while moving: exactly two front arms pull, two reach, and the four back arms are free', () => {
    for (let c = 0; c < 2; c += 0.037) {
      const roles = arms.map((i) => armRole(i, c, true));
      expect(roles.filter((r) => r === 'pull')).toHaveLength(2);
      expect(roles.filter((r) => r === 'reach')).toHaveLength(2);
      for (const i of [0, 1, 6, 7]) expect(roles[i]).toBe('free');
    }
  });
  it('at rest every arm is free', () => {
    for (const i of arms) expect(armRole(i, 0.3, false)).toBe('free');
  });
});

describe('armPlanted', () => {
  it('plants each front arm once per crawl cycle, never two at the same instant, never a back arm', () => {
    const plants: number[][] = arms.map(() => []);
    for (let c = 0; c < 1; c += 0.01) for (const i of arms) if (armPlanted(c, c + 0.01, i)) plants[i]!.push(c);
    for (const i of [2, 3, 4, 5]) expect(plants[i]).toHaveLength(1);
    for (const i of [0, 1, 6, 7]) expect(plants[i]).toHaveLength(0);
    const when = [2, 3, 4, 5].map((i) => plants[i]![0]!);
    expect(new Set(when.map((w) => w.toFixed(2))).size).toBe(4);
    expect(armPlanted(0.4, 0.4, 3)).toBe(false);
  });
});
```

`src/monsters/kraken/strikes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assignStrikes } from './strikes';

const t = (x: number, z: number, alive = true, radius = 20) => ({ position: { x, z }, radius, isAlive: () => alive });
const at = { x: 0, z: 0 };

describe('assignStrikes', () => {
  it('sends each target the free arm pointing most nearly at it — one arm per target, one target per arm', () => {
    const ahead = t(0, 300); // bearing 0 → arm 3 or 4 (±22.5°)
    const left = t(300, 0); // bearing +90° → arm 5 (67.5°) or 6 (112.5°)
    const behind = t(0, -300); // bearing 180° → arm 0 or 7
    const pairs = assignStrikes([0, 1, 2, 3, 4, 5, 6, 7], 0, at, [behind, left, ahead], 400);
    expect(pairs).toHaveLength(3);
    const armFor = (target: object) => pairs.find((p) => p.target === target)!.arm;
    expect([3, 4]).toContain(armFor(ahead));
    expect([5, 6]).toContain(armFor(left));
    expect([0, 7]).toContain(armFor(behind));
    expect(new Set(pairs.map((p) => p.arm)).size).toBe(3);
  });
  it('uses only the free arms it is given and serves the nearest targets first when arms are scarce', () => {
    const near = t(0, 150);
    const far = t(0, 390);
    const pairs = assignStrikes([1], 0, at, [far, near], 400);
    expect(pairs).toEqual([{ arm: 1, target: near }]);
  });
  it('ignores dead targets and targets beyond reach (plus their radius)', () => {
    expect(assignStrikes([0, 1, 2], 0, at, [t(0, 200, false), t(0, 500), t(0, 415, true, 20)], 400).map((p) => p.target.position.z)).toEqual([415]);
  });
  it('measures bearings relative to the monster\'s facing', () => {
    const pairs = assignStrikes([3, 4, 0, 7], Math.PI, at, [t(0, -300)], 400);
    expect([3, 4]).toContain(pairs[0]!.arm);
  });
});
```

Run: `npx vitest run src/monsters/kraken`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/monsters/kraken/crawl.ts`:

```ts
/** Eight tentacles around the mantle. */
export const ARM_COUNT = 8;

/** Body-relative yaw of arm i (0 = straight ahead, + = toward +X, the model's left): ±22.5°, ±67.5°, ±112.5°, ±157.5°. */
export function armAngle(i: number): number {
  return -Math.PI + (i + 0.5) * (Math.PI / 4);
}

/** The four most forward-facing arms do the crawling. */
export function isFrontArm(i: number): boolean {
  return Math.abs(armAngle(i)) < Math.PI / 2;
}

/** Crawl phase offsets of the front arms: a quarter cycle apart, alternating sides, so two always pull. */
const FRONT_OFFSET: Readonly<Record<number, number>> = { 5: 0, 3: 0.25, 4: 0.5, 2: 0.75 };

/** 0..1 position of arm i in the crawl cycle (only meaningful for front arms). */
export function crawlPhase(i: number, cycle: number): number {
  const p = cycle + (FRONT_OFFSET[i] ?? 0);
  return p - Math.floor(p);
}

export type ArmRole = 'pull' | 'reach' | 'free';

/**
 * What an arm is doing: while moving, each front arm spends half the cycle planted and pulling the mantle
 * forward and half reaching ahead for its next plant; back arms (and every arm at rest) are free to strike.
 */
export function armRole(i: number, cycle: number, moving: boolean): ArmRole {
  if (!moving || !isFrontArm(i)) return 'free';
  return crawlPhase(i, cycle) < 0.5 ? 'pull' : 'reach';
}

/** True when front arm i planted (began a pull) between crawl positions prev and cur. */
export function armPlanted(prev: number, cur: number, i: number): boolean {
  if (!isFrontArm(i) || cur <= prev) return false;
  const o = FRONT_OFFSET[i]!;
  return Math.floor(prev + o) !== Math.floor(cur + o);
}
```

`src/monsters/kraken/strikes.ts`:

```ts
import { angleDelta, yawTo, type Vec2 } from '../../util/math';
import { armAngle } from './crawl';

type Cand = { position: Vec2; radius: number; isAlive(): boolean };

/**
 * Pair free arms with targets within reach: nearest targets first, each taken by the remaining free arm
 * whose anchor points most nearly at it (bearing relative to the monster's facing `yaw`). One target per
 * arm, one arm per target; unmatched arms or targets are left out.
 */
export function assignStrikes<T extends Cand>(free: readonly number[], yaw: number, from: Vec2, targets: readonly T[], reach: number): { arm: number; target: T }[] {
  const dist = (c: T) => Math.hypot(c.position.x - from.x, c.position.z - from.z);
  const inReach = targets.filter((c) => c.isAlive() && dist(c) <= reach + c.radius).sort((a, b) => dist(a) - dist(b));
  const left = [...free];
  const out: { arm: number; target: T }[] = [];
  for (const target of inReach) {
    if (left.length === 0) break;
    const bearing = angleDelta(yaw, yawTo(from, target.position));
    let best = 0;
    for (let k = 1; k < left.length; k++) {
      if (Math.abs(angleDelta(armAngle(left[k]!), bearing)) < Math.abs(angleDelta(armAngle(left[best]!), bearing))) best = k;
    }
    out.push({ arm: left[best]!, target });
    left.splice(best, 1);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters/kraken && npx tsc --noEmit && npm test`. Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Kraken: crawl roles/plant events and arm-to-target assignment (pure), CONFIG.kraken

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

### Task 2: `TentacleArms` state, plus the type and plumbing additions

**Files:**
- Create: `src/monsters/kraken/TentacleArms.ts`, `src/monsters/kraken/TentacleArms.test.ts`
- Modify:
  - `src/monsters/types.ts`
  - `src/monster/Monster.ts`, `src/monster/Monster.test.ts`
  - `src/systems/Particles.ts`
  - `src/monsters/insect/kind.ts`, `src/monsters/kaiju/kind.ts`

**Interfaces:**
- Consumes: `ARM_COUNT`, `ArmRole` (Task 1).
- Produces:
  - `type StrikeKind = 'slam' | 'hurl'`
  - `type StrikeTiming = { windup: number; impact: number; end: number }`
  - `type ArmStrike = { kind; t; target: THREE.Vector3; live: Target | null; timing; hit: boolean }`
  - `class TentacleArms`:
    - fields `roles`, `tips`, `strikes`, `spinT`
    - `isFree(i)`, `freeArms()`, `striking(): Set<Target>`
    - `start(i, kind, target, live, cooldown, timing)`
    - `spin()`
    - `update(dt, spinTime, onImpact)`
    - `clear()`
  - Type additions:
    - `MeleeShape` gains `{ kind: 'multi' }`
    - `MonsterKind.ranged` gains `'hurl'`; `MonsterKind.antiAir` gains `'lash'`
    - `BodyFrame` gains `airborne: boolean; dashing: boolean`
    - `MonsterBody` gains optional `readonly arms?: TentacleArms`
    - `FxTheme` gains `intercept: ParticleKind`
  - `ParticleKind` gains `'ink'`.

- [ ] **Step 1: Write the failing tests**

`src/monsters/kraken/TentacleArms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TentacleArms } from './TentacleArms';

const T = { windup: 0.3, impact: 0.45, end: 0.85 };
const target = (x: number, z: number) => {
  let alive = true;
  return { position: new THREE.Vector3(x, 0, z), isAlive: () => alive, kill: () => (alive = false) } as unknown as import('../../combat').Target & { kill(): void };
};

describe('TentacleArms', () => {
  it('only free, idle, rested arms can strike', () => {
    const a = new TentacleArms();
    expect(a.freeArms()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    a.roles[3] = 'pull';
    a.roles[4] = 'reach';
    expect(a.isFree(3)).toBe(false);
    expect(a.isFree(4)).toBe(false);
    a.start(3, 'slam', new THREE.Vector3(), null, 1, T);
    expect(a.strikes[3]).toBeNull();
    a.start(0, 'slam', new THREE.Vector3(), null, 1, T);
    expect(a.isFree(0)).toBe(false);
    expect(a.freeArms()).toEqual([1, 2, 5, 6, 7]);
  });

  it('lands each strike once at its impact time on the live target, then rests through its cooldown', () => {
    const a = new TentacleArms();
    const tank = target(100, 0);
    const hits: { arm: number; x: number }[] = [];
    a.start(2, 'slam', tank.position, tank, 1.2, T);
    expect(a.striking().has(tank)).toBe(true);
    tank.position.set(150, 0, 0);
    a.update(0.4, 0.8, (arm, s) => hits.push({ arm, x: s.target.x }));
    expect(hits).toHaveLength(0);
    a.update(0.1, 0.8, (arm, s) => hits.push({ arm, x: s.target.x }));
    expect(hits).toEqual([{ arm: 2, x: 150 }]);
    a.update(0.4, 0.8, () => hits.push({ arm: -1, x: 0 }));
    expect(hits).toHaveLength(1);
    expect(a.strikes[2]).toBeNull();
    expect(a.isFree(2)).toBe(false); // 0.9 s elapsed of a 1.2 s cooldown
    a.update(0.31, 0.8, () => {});
    expect(a.isFree(2)).toBe(true);
  });

  it('finishes against the last known position if the target dies mid-swing', () => {
    const a = new TentacleArms();
    const tank = target(100, 50);
    let at: THREE.Vector3 | null = null;
    a.start(1, 'hurl', tank.position, tank, 0, T);
    a.update(0.1, 0.8, () => {});
    tank.kill();
    tank.position.set(999, 0, 999);
    a.update(0.4, 0.8, (_arm, s) => (at = s.target.clone()));
    expect(at!.x).toBe(100);
    expect(at!.z).toBe(50);
  });

  it('Whirlpool spin occupies every arm for its duration; clear() resets everything', () => {
    const a = new TentacleArms();
    a.spin();
    expect(a.freeArms()).toEqual([]);
    a.update(0.5, 0.8, () => {});
    expect(a.spinT).toBeCloseTo(0.5);
    a.update(0.4, 0.8, () => {});
    expect(a.spinT).toBe(-1);
    a.start(0, 'slam', new THREE.Vector3(), null, 5, T);
    a.roles[5] = 'pull';
    a.spin();
    a.clear();
    expect(a.freeArms()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(a.strikes.every((s) => s === null)).toBe(true);
  });
});
```

Append to `src/monster/Monster.test.ts`. The stub body's `animate()` must record the frame; change it to `animate(f) { this.frames++; this.last = f; }` and add `last: null as BodyFrame | null` to the stub, importing `type BodyFrame`.

```ts
describe('Monster frame flags', () => {
  it('tells the body when it is airborne (Leap) or dashing', () => {
    const m = new Monster(new THREE.Scene(), kind());
    const body = m.body as ReturnType<typeof stubBody>;
    m.animate(0.016, 0);
    expect(body.last!.airborne).toBe(false);
    expect(body.last!.dashing).toBe(false);
    m.startLeap({ x: 0, z: 500 });
    m.animate(0.016, 0);
    expect(body.last!.airborne).toBe(true);
    m.reset();
    m.startDash({ x: 0, z: 500 });
    m.animate(0.016, 0);
    expect(body.last!.dashing).toBe(true);
  });
});
```

Run: `npx vitest run src/monsters/kraken src/monster/Monster.test.ts`. Expected: FAIL (`./TentacleArms` not found; frame flags undefined).

- [ ] **Step 2: `src/monsters/kraken/TentacleArms.ts`**

```ts
import * as THREE from 'three';
import type { Target } from '../../combat';
import { ARM_COUNT, type ArmRole } from './crawl';

export type StrikeKind = 'slam' | 'hurl';
export type StrikeTiming = { windup: number; impact: number; end: number };
export type ArmStrike = { kind: StrikeKind; t: number; target: THREE.Vector3; live: Target | null; timing: StrikeTiming; hit: boolean };

/**
 * Per-tentacle state shared by the Kraken's body and the game. The body writes each arm's crawl role and
 * world tip every frame; the game starts strikes on free arms and resolves their impacts; the body poses
 * each arm from its strike. An arm can strike only when free in the crawl, idle, rested, and not spinning.
 */
export class TentacleArms {
  readonly roles: ArmRole[] = new Array<ArmRole>(ARM_COUNT).fill('free');
  readonly tips: THREE.Vector3[] = Array.from({ length: ARM_COUNT }, () => new THREE.Vector3());
  readonly strikes: (ArmStrike | null)[] = new Array<ArmStrike | null>(ARM_COUNT).fill(null);
  /** Seconds into the Whirlpool spin, or -1. */
  spinT = -1;
  private cooldown: number[] = new Array<number>(ARM_COUNT).fill(0);

  isFree(i: number): boolean {
    return this.roles[i] === 'free' && this.strikes[i] === null && this.cooldown[i]! <= 0 && this.spinT < 0;
  }

  freeArms(): number[] {
    const out: number[] = [];
    for (let i = 0; i < ARM_COUNT; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  /** Targets an arm is already swinging at, so no second arm piles on. */
  striking(): Set<Target> {
    const s = new Set<Target>();
    for (const k of this.strikes) if (k?.live) s.add(k.live);
    return s;
  }

  /** Start a strike on arm `i` (ignored unless it is free); its cooldown runs from now. */
  start(i: number, kind: StrikeKind, target: THREE.Vector3, live: Target | null, cooldown: number, timing: StrikeTiming): void {
    if (!this.isFree(i)) return;
    this.strikes[i] = { kind, t: 0, target: target.clone(), live, timing: { ...timing }, hit: false };
    this.cooldown[i] = cooldown;
  }

  /** Whirlpool: every arm spins outward together. */
  spin(): void {
    this.spinT = 0;
  }

  /**
   * Advance strikes (each follows its live target while it lives, lands once at its impact time via
   * `onImpact`, and ends at its end time), cooldowns, and the spin (lasting `spinTime`).
   */
  update(dt: number, spinTime: number, onImpact: (arm: number, s: ArmStrike) => void): void {
    for (let i = 0; i < ARM_COUNT; i++) {
      this.cooldown[i] = Math.max(0, this.cooldown[i]! - dt);
      const s = this.strikes[i];
      if (!s) continue;
      if (s.live?.isAlive()) s.target.copy(s.live.position);
      s.t += dt;
      if (!s.hit && s.t >= s.timing.impact) {
        s.hit = true;
        onImpact(i, s);
      }
      if (s.t >= s.timing.end) this.strikes[i] = null;
    }
    if (this.spinT >= 0) {
      this.spinT += dt;
      if (this.spinT >= spinTime) this.spinT = -1;
    }
  }

  clear(): void {
    this.strikes.fill(null);
    this.cooldown.fill(0);
    this.roles.fill('free');
    this.spinT = -1;
  }
}
```

- [ ] **Step 3: Type and plumbing additions**

1. **`src/monsters/types.ts`:**
   - Add `import type { TentacleArms } from './kraken/TentacleArms';`.
   - `MeleeShape`: `{ kind: 'point' } | { kind: 'arc'; halfAngle: number } | { kind: 'multi' }`, with the doc comment "`multi`: independent tentacle strikes (Kraken), driven by the body's `arms`".
   - `MonsterKind.ranged`: `'spikes' | 'breath' | 'hurl'`.
   - `MonsterKind.antiAir`: `'tail' | 'bite' | 'lash'`.
   - `BodyFrame`: add `airborne: boolean;` and `dashing: boolean;` after `roaring`.
   - `MonsterBody`: add
     ```ts
     /** Per-tentacle strike state (Kraken); absent for single-strike bodies. */
     readonly arms?: TentacleArms;
     ```
   - `FxTheme`: add `intercept: ParticleKind` (particles shown where a defensive shot is stopped).
2. **`src/monster/Monster.ts`:**
   - Add `airborne: false, dashing: false,` to the `frame` initialiser.
   - In `animate`, after `f.roaring = …`, add `f.airborne = this.airborne;` and `f.dashing = this.dashing;`.
3. **`src/systems/Particles.ts`:**
   - Add `'ink'` to `ParticleKind`.
   - Add the preset:
     ```ts
     ink: { color: CONFIG.kraken.colors.ink, life: 1.1, size0: 30, size1: 70, speed: 120, up: 50, gravity: -10, drag: 2 },
     ```
   - Map it in `LAYER_OF` as `ink: 'smoke'`, so ink is translucent and puffy.
4. **Kinds:** in `src/monsters/insect/kind.ts` and `src/monsters/kaiju/kind.ts`, add `intercept: 'spark'` to `fx`. This is the current behaviour, so it is unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters/kraken src/monster/Monster.test.ts && npx tsc --noEmit && npm test`. Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Kraken: TentacleArms strike state; multi melee / hurl / lash kinds, frame airborne+dashing, ink particles

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

### Task 3: Kraken body, definition, roster, and select framing

**Files:**
- Create: `src/monsters/kraken/KrakenBody.ts`, `src/monsters/kraken/kind.ts`, `src/monsters/kraken/kind.test.ts`
- Modify:
  - `src/monsters/types.ts` (`MonsterId`)
  - `src/monsters/roster.ts`, `src/monsters/roster.test.ts`
  - `src/systems/menuCamera.ts`, `src/systems/menuCamera.test.ts`
  - `src/GameScene.ts` (one call site)
  - `src/config.ts` (measured size)

**Interfaces:**
- Consumes:
  - Task 1: `armAngle`, `armRole`, `armPlanted`, `crawlPhase`, `ARM_COUNT`
  - Task 2: `TentacleArms`, `BodyFrame.airborne` / `dashing`
- Produces:
  - `class KrakenBody implements MonsterBody`, with `readonly arms: TentacleArms`
  - `KRAKEN: MonsterKind`
  - `MonsterId = 'insect' | 'kaiju' | 'kraken'`
  - `frameHeight(size): number` in `menuCamera.ts`

In this task the Kraken is selectable and crawls. Its body poses strikes and spins whenever the arms report them, but nothing starts them until Task 4. With `melee: { kind: 'multi' }`, `GameScene` would still run the brain's melee, so Task 4 also gates that.

- [ ] **Step 1: Write the failing tests**

`src/monsters/kraken/kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { KRAKEN } from './kind';

describe('KRAKEN kind', () => {
  it('uses its config stats and the many-armed kit', () => {
    expect(KRAKEN.stats).toEqual(CONFIG.kraken.stats);
    expect(KRAKEN.pips).toEqual({ toughness: 3, power: 4, speed: 3 });
    expect(KRAKEN.melee).toEqual({ kind: 'multi' });
    expect(KRAKEN.ranged).toBe('hurl');
    expect(KRAKEN.antiAir).toBe('lash');
    expect(KRAKEN.tailSweep).toBe(false);
    expect(KRAKEN.moves.map((m) => m.label)).toEqual(['Tentacle Slam', 'Hurl', 'Tentacle Lash']);
  });
  it('has its own named signatures — never the Insect\'s Brood Swarm or the Kaiju\'s Meltdown', () => {
    expect(KRAKEN.signatures).not.toContain('brood');
    expect(KRAKEN.signatures).not.toContain('meltdown');
    for (const id of KRAKEN.signatures) expect(KRAKEN.abilityText[id]?.title).toBeTruthy();
    expect(KRAKEN.abilityText.spines?.title).toBe('Ink Cloud');
    expect(KRAKEN.upgradeText.multiShot?.title).toBe('More Arms');
    expect(KRAKEN.fx.particle).toBe('ink');
    expect(KRAKEN.fx.intercept).toBe('ink');
  });
});
```

In `src/monsters/roster.test.ts`, change the availability expectation to `[true, true, true, false]`, and add `expect(isMonsterId('kraken')).toBe(true);`.

Append to `src/systems/menuCamera.test.ts`, importing `frameHeight`:

```ts
describe('frameHeight', () => {
  it('frames tall monsters by height and wide, low ones by their width', () => {
    expect(frameHeight({ width: 484, length: 451, height: 344 })).toBe(344);
    expect(frameHeight({ width: 180, length: 617, height: 385 })).toBe(385);
    expect(frameHeight({ width: 760, length: 760, height: 300 })).toBeCloseTo(760 * 0.55);
  });
});
```

Run: `npx vitest run src/monsters src/systems/menuCamera.test.ts`. Expected: FAIL (`./kind` not found; Kraken unavailable; `frameHeight` missing).

- [ ] **Step 2: Select framing**

In `src/systems/menuCamera.ts`:

```ts
/** The height the select camera frames a monster by: its height, or 55% of its width for wide, low creatures. */
export function frameHeight(size: { width: number; length: number; height: number }): number {
  return Math.max(size.height, size.width * 0.55);
}
```

In `GameScene`, change the `selectPose(this.menuT, this.ms.size.height, …)` call to `selectPose(this.menuT, frameHeight(this.ms.size), …)`, and import `frameHeight`. The Insect and Kaiju values are unchanged (see the test).

- [ ] **Step 3: `src/monsters/kraken/KrakenBody.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { angleDelta } from '../../util/math';
import type { BodyFrame, MonsterBody } from '../types';
import { ARM_COUNT, armAngle, armPlanted, armRole, crawlPhase, isFrontArm } from './crawl';
import { TentacleArms } from './TentacleArms';

const K = CONFIG.kraken;
const C = K.colors;
/** Segments per tentacle; all 8 × SEGS segments are one instanced mesh (one draw call). */
const SEGS = 7;
/** Model units (before CONFIG.monster.scale). */
const MANTLE_Y = 330;
const ANCHOR_R = 120;
const ANCHOR_Y = 215;
const REST_R = 470;
const PLANT_R = 560;
const LIFT = 140;
const MAX_TIP = 820;
const THICK = 46;

const _anchor = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();

/** Root-space point on the quadratic curve anchor → ctrl → tip at u. */
function curve(u: number, out: THREE.Vector3): THREE.Vector3 {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return out.set(
    a * _anchor.x + b * _ctrl.x + c * _tip.x,
    a * _anchor.y + b * _ctrl.y + c * _tip.y,
    a * _anchor.z + b * _ctrl.z + c * _tip.z,
  );
}

/**
 * The Kraken: a bulbous mantle carried low, two glowing eyes at the front (+Z), and eight tentacles. The
 * front four crawl (reach, plant, pull); free arms writhe and strike from `arms`; all eight spin for
 * Whirlpool, spread for Roar, coil when airborne, and sweep back in a Dash. +X is its left.
 */
export class KrakenBody implements MonsterBody {
  readonly root = new THREE.Group();
  readonly arms = new TentacleArms();
  private mantle = new THREE.Group();
  private segments: THREE.InstancedMesh;
  private segMat: THREE.MeshToonMaterial;
  private tintMats: THREE.MeshToonMaterial[];
  private eyeMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private tipsLocal: THREE.Vector3[] = Array.from({ length: ARM_COUNT }, () => new THREE.Vector3());
  private nextLaunch = 0;

  constructor() {
    const skin = toonMat(C.mantle);
    const dark = toonMat(C.mantleDark);
    const under = toonMat(C.underside);
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    const pupil = toonMat(0x140808);
    this.segMat = toonMat(0xffffff);
    this.tintMats = [skin, dark, under, this.segMat];
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.x = rotX;
      m.castShadow = true;
      m.receiveShadow = true;
      this.mantle.add(m);
      return m;
    };

    // Mantle: a big dome swept back and up, mottled, over a pale underside skirt.
    add(blob, skin, [0, 20, -50], [175, 150, 220], -0.3);
    for (const [x, y, z, s] of [[60, 120, -40, 34], [-55, 95, 30, 28], [10, 150, -120, 30], [-70, 60, -150, 24], [80, 40, 40, 22]] as const) {
      add(blob, dark, [x, y, z], [s, s * 0.35, s]);
    }
    add(blob, under, [0, -95, 20], [150, 60, 150]);
    // Eyes at the front.
    for (const side of [1, -1]) {
      add(blob, this.eyeMat, [side * 72, -15, 125], [34, 30, 24]);
      add(box, pupil, [side * 72, -15, 146], [6, 26, 4]);
    }
    this.mantle.position.y = MANTLE_Y;
    this.root.add(this.mantle);

    // Tentacles: one instanced mesh of tapered segments; colour per instance (top / dark band / pale tip).
    const seg = this.keep(faceted(new THREE.CylinderGeometry(0.72, 1, 1, 6)));
    this.segments = new THREE.InstancedMesh(seg, this.segMat, ARM_COUNT * SEGS);
    this.segments.castShadow = true;
    this.segments.receiveShadow = true;
    this.segments.frustumCulled = false;
    for (let i = 0; i < ARM_COUNT; i++) {
      for (let k = 0; k < SEGS; k++) {
        this.segments.setColorAt(i * SEGS + k, _c.setHex(k >= SEGS - 2 ? C.underside : k % 2 ? C.mantleDark : C.mantle));
      }
    }
    this.root.add(this.segments);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const moving = f.motion > 0.3;
    const S = K.stats.strideLength;
    // Two front arms pull per half cycle, so the mantle surges twice per cycle.
    const surge = moving ? Math.sin(f.cycle * Math.PI * 4) * f.motion : 0;
    const bob = surge * 12 + Math.sin(f.time * 1.2) * 8 - f.pose.dip - f.pose.collapse * 220;
    this.mantle.position.set(0, MANTLE_Y + bob, surge * 10);
    this.mantle.rotation.set(f.pose.pitch + 0.08 * f.motion + (f.roaring ? -0.35 : 0), 0, 0);
    const breathe = 1 + Math.sin(f.time * 1.2) * 0.02;
    this.mantle.scale.set(breathe, 1 / breathe, breathe);
    this.root.updateMatrixWorld(true);

    // Lash: the free arm whose anchor points most nearly at the flyer.
    let lashArm = -1;
    if (f.antiAir) {
      this.root.worldToLocal(_tmp.copy(f.antiAir.target));
      const bearing = Math.atan2(_tmp.x, _tmp.z);
      let best = Infinity;
      for (let i = 0; i < ARM_COUNT; i++) {
        if (armRole(i, f.cycle, moving) !== 'free' || this.arms.strikes[i]) continue;
        const d = Math.abs(angleDelta(armAngle(i), bearing));
        if (d < best) {
          best = d;
          lashArm = i;
        }
      }
    }

    for (let i = 0; i < ARM_COUNT; i++) {
      const role = armRole(i, f.cycle, moving);
      this.arms.roles[i] = role;
      const ang = armAngle(i);
      _dir.set(Math.sin(ang), 0, Math.cos(ang));
      _anchor.copy(_dir).multiplyScalar(ANCHOR_R).setY(ANCHOR_Y + bob);

      // Resting pose: curled around the mantle, writhing; back arms trail while crawling.
      const sway = Math.sin(f.time * 0.9 + i * 1.3) * 0.15;
      _rest.set(Math.sin(ang + sway), 0, Math.cos(ang + sway)).multiplyScalar(REST_R + Math.sin(f.time * 1.3 + i * 1.7) * 40);
      _rest.y = 30 + Math.max(0, Math.sin(f.time * 1.1 + i)) * 60;
      if (moving && !isFrontArm(i)) _rest.addScaledVector(_fwd, -S * 0.25 * f.motion);
      _tip.copy(_rest);
      let arch = 80;

      if (role !== 'free') {
        // Crawl: plant ahead, slide back under the mantle (world-still), then lift and reach forward again.
        const p = crawlPhase(i, f.cycle);
        _p0.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, S / 4);
        _p1.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, -S / 4);
        if (role === 'pull') _tip.lerpVectors(_p0, _p1, p / 0.5);
        else {
          const u = (p - 0.5) / 0.5;
          _tip.lerpVectors(_p1, _p0, u);
          _tip.y = LIFT * Math.sin(Math.PI * u);
        }
        arch = 120;
      }

      const s = this.arms.strikes[i];
      if (s) {
        const T = s.timing;
        this.root.worldToLocal(_b.copy(s.target));
        _b.y = 0;
        if (s.kind === 'slam') _a.copy(_dir).multiplyScalar(PLANT_R * 0.55).setY(560);
        else _a.set(0, 680, -120);
        if (s.kind === 'hurl') _p0.copy(_dir).multiplyScalar(PLANT_R * 0.6);
        if (s.t < T.windup) {
          // Slam: rear up; Hurl: reach down to grab rubble.
          _tip.lerpVectors(_rest, s.kind === 'slam' ? _a : _p0, s.t / T.windup);
        } else if (s.t < T.impact) {
          const u = (s.t - T.windup) / (T.impact - T.windup);
          if (s.kind === 'slam') _tip.lerpVectors(_a, _b, u * u);
          else _tip.lerpVectors(_p0, _a, u);
        } else {
          const u = Math.min(1, (s.t - T.impact) / (T.end - T.impact));
          _tip.lerpVectors(s.kind === 'slam' ? _b : _a, _rest, u);
        }
        arch = 260;
      }
      if (this.arms.spinT >= 0) {
        const k = this.arms.spinT / K.arms.spinTime;
        const sa = ang + k * Math.PI * 2;
        _tip.set(Math.sin(sa) * PLANT_R * 1.1, 40 + Math.sin(Math.PI * k) * 120, Math.cos(sa) * PLANT_R * 1.1);
        arch = 60;
      }
      if (f.roaring) _tip.copy(_dir).multiplyScalar(REST_R * 1.05).setY(260);
      if (f.dashing) _tip.copy(_dir).multiplyScalar(REST_R * 0.7).addScaledVector(_fwd, -300).setY(40);
      if (f.airborne) _tip.copy(_dir).multiplyScalar(REST_R * 0.6).setY(-120);
      if (i === lashArm && f.antiAir) {
        this.root.worldToLocal(_b.copy(f.antiAir.target));
        _tip.lerp(_b, Math.max(0, Math.min(1, f.antiAir.weight)));
        arch = 40;
      }
      if (f.pose.collapse > 0) _tip.multiplyScalar(1 + f.pose.collapse * 0.15).setY(_tip.y * (1 - f.pose.collapse));
      // Never stretch past the arm's length.
      _tmp.copy(_tip).sub(_anchor);
      if (_tmp.length() > MAX_TIP) _tip.copy(_anchor).add(_tmp.setLength(MAX_TIP));

      // Arched chain anchor → tip, drawn as SEGS tapered instances.
      _ctrl.addVectors(_anchor, _tip).multiplyScalar(0.5).addScaledVector(_dir, 40);
      _ctrl.y += arch;
      for (let k = 0; k < SEGS; k++) {
        curve(k / SEGS, _a);
        curve((k + 1) / SEGS, _b);
        _tmp.subVectors(_b, _a);
        const len = _tmp.length();
        _q.setFromUnitVectors(_up, _tmp.divideScalar(Math.max(len, 1e-6)));
        const r = THICK * (1 - 0.78 * (k / SEGS));
        _m.compose(_tmp.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(r, len, r));
        this.segments.setMatrixAt(i * SEGS + k, _m);
      }

      this.tipsLocal[i]!.copy(_tip);
      this.root.localToWorld(this.arms.tips[i]!.copy(_tip));
      if (moving && armPlanted(f.prevCycle, f.cycle, i)) onFootLand(_tmp.copy(this.arms.tips[i]!).setY(0));
    }
    this.segments.instanceMatrix.needsUpdate = true;

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.eyeMat.emissiveIntensity = f.flash ? 3 : 1 + (f.roaring ? 2 : 0);
  }

  /** Hurls launch from the arm tips themselves; Barrage, Deep Throw and Ink Cloud use free arms in turn. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    for (let n = 0; n < ARM_COUNT; n++) {
      const i = (this.nextLaunch + n) % ARM_COUNT;
      if (this.arms.roles[i] === 'free' && !this.arms.strikes[i]) {
        this.nextLaunch = i + 1;
        return out.copy(this.arms.tips[i]!).setY(this.arms.tips[i]!.y + 40);
      }
    }
    return this.rangedOrigin(out);
  }

  /** Top of the mantle. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mantle.updateWorldMatrix(true, false);
    return this.mantle.localToWorld(out.set(0, 160, -40));
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.segments.dispose();
  }
}
```

Note: `onFootLand` receives the plant point (`P0` on the ground). The tip lands there at the start of the pull, because `crawlPhase` is 0 at the plant and the pull lerp starts at `_p0`.

- [ ] **Step 4: `src/monsters/kraken/kind.ts`, `MonsterId`, roster**

```ts
import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { KrakenBody } from './KrakenBody';

const K = CONFIG.kraken;

export const KRAKEN: MonsterKind = {
  id: 'kraken',
  name: 'Kraken',
  blurb: 'Hauls itself through the streets on eight grasping arms. Hits everything, everywhere.',
  pips: { toughness: 3, power: 4, speed: 3 },
  moves: [
    { icon: '🐙', label: 'Tentacle Slam' },
    { icon: '🪨', label: 'Hurl' },
    { icon: '🪢', label: 'Tentacle Lash' },
  ],
  stats: K.stats,
  melee: { kind: 'multi' },
  ranged: 'hurl',
  antiAir: 'lash',
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {
    acid: { title: 'Ink Trail', icon: '🖤', desc: (r) => (r === 1 ? 'Planted arms leave corrosive ink slicks' : 'Bigger, longer-lasting slicks') },
    storm: { title: 'Barrage', icon: '🪨', desc: (r) => (r === 1 ? 'Every free arm hurls debris every 6s' : '+3 chunks, throws faster') },
    chitin: { title: 'Thick Hide', icon: '🛡️', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Devour', icon: '🍖', desc: () => '+6 HP per kill' },
    spines: { title: 'Ink Cloud', icon: '🌫️', desc: (r) => (r === 1 ? 'Ink smothers incoming shells and missiles' : 'Thicker, wider ink') },
    swat: { title: 'Lash+', icon: '🪢', desc: () => 'Lashes flyers faster, harder, more at once' },
    nova: { title: 'Whirlpool', icon: '🌀', desc: (r) => (r === 1 ? 'All arms spin out every 7s, hitting everything near' : 'Wider, stronger, more often') },
    mortar: { title: 'Deep Throw', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs chunks at artillery, SAMs, trucks' : 'More chunks, bigger splash') },
  },
  upgradeText: {
    damage: { title: 'Crushing Coils' },
    attackSpeed: { title: 'Frenzied Arms' },
    vitality: { title: 'Leviathan Bulk' },
    regen: { title: 'Regrowth' },
    stompRadius: { title: 'Wide Grip', desc: '+20% slam radius' },
    multiShot: { title: 'More Arms', desc: '+1 hurled chunk per throw' },
    moveSpeed: { title: 'Undertow' },
  },
  fx: { spike: K.colors.chunk, glob: K.colors.ink, pool: K.colors.ink, nova: 0x6a3a8a, particle: 'ink', intercept: 'ink' },
  createBody: () => new KrakenBody(),
};
```

- In `src/monsters/types.ts`, change `MonsterId` to `'insect' | 'kaiju' | 'kraken'`.
- In `src/monsters/roster.ts`, import `KRAKEN`, add `kraken: KRAKEN` to `KINDS`, and delete the `kraken` entry from `COMING_SOON`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters src/systems/menuCamera.test.ts && npx tsc --noEmit && npm test`. Expected: PASS.

- [ ] **Step 6: Look at it, measure it, tune it**

With the dev server running, write `$SCRATCH/m4b-t3.mjs`. It goes to select, calls `g.selectStep(2)` (Kraken) and waits 1.5 s. Then it:

1. **Screenshots** the select diorama at camera angles 0.5 and 2.0. Set `g.menuT` to choose the angle.
2. **Measures** the bounding box: walk every Mesh and the instanced segments under `g.monster.body.root`. For the `InstancedMesh`, read each instance's matrix and transform the geometry's bounding-box corners. If the result differs from `CONFIG.kraken.stats.size` by more than 10%, update the config to the measured `[x, z, y]` extents (rounded) and re-run the tests.
3. **Crawls:** `g.playSelected()`, `g.skipIntro()`, then `g.order = { kind: 'move', to: { x: 0, z: 2000 } }`. Over 2.5 s, record z, count plant events by wrapping `g.monster.onFootLand`, and screenshot mid-crawl from the gameplay camera and from high above (`g.rig.orbit.pitch = 1.15`).

**Expected:**
- **Look** (judged from the screenshots): a clear giant octopus. Mottled crimson-purple mantle carried low, two glowing amber eyes at the front, eight arched tapering tentacles with pale tips. Plainly different from the Insect and Kaiju.
- **Select framing:** the whole Kraken, arms included, is visible on desktop and phone, above the panel.
- **Crawl:**
  - It moves at about 125 m/s, or about 300 m in 2.5 s allowing for the first turn.
  - There are about 2 plants per cycle (at least 6 in 2.5 s).
  - The screenshots show two front arms planted on the ground and two arched forward, with the back arms trailing.
  - Planted tips stay put on the ground as the mantle slides over them; no visible skating.
- **Draw calls:** below 150.

Fix anything that looks wrong before committing. Examples:
- arms clipping through the mantle: adjust `ANCHOR_R` / `ANCHOR_Y`;
- the mantle floating or sunk: adjust `MANTLE_Y`;
- tentacles too thin or thick at the pixel scale: adjust `THICK`;
- skating plants: check `S / 4` against the measured cycle advance.

Ledger every number you change, with old → new and why.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Kraken: mantle + eight instanced tentacles with a reach/plant/pull crawl; selectable; select frames wide monsters

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

### Task 4: Kraken combat: Tentacle Slam, Hurl, Lash, Sucker Grip, Whirlpool, Ink Cloud

**Files:**
- Modify:
  - `src/systems/Projectiles.ts`, `src/systems/Projectiles.test.ts`
  - `src/systems/Passives.ts`, `src/systems/Passives.test.ts`
  - `src/systems/Progression.ts`
  - `src/config.ts`
  - `src/monsters/kraken/kind.ts`, `src/monsters/kraken/kind.test.ts`
  - `src/GameScene.ts`

**Interfaces:**
- Consumes:
  - Task 1: `assignStrikes`
  - Task 2: `TentacleArms`, `ArmStrike`, `MonsterBody.arms`, `FxTheme.intercept`
  - Task 3: `KRAKEN`, `CONFIG.kraken`
- Produces:
  - `ShotKind` gains `'chunk'`; `Projectiles.fireChunk(from, to, damage)`
  - `AbilityId` gains `'grip'`; `Passives.grip(): { radius: number; damage: number } | null`
  - `CONFIG.passives.grip`
  - `GameScene`: `tentacleSlams()`, `hurlAt(target)`, `onArmImpact`, grip on plant, Whirlpool spin

- [ ] **Step 1: Write the failing tests**

Append to `src/systems/Projectiles.test.ts` (import `CONFIG` from `'../config'`):

```ts
describe('Projectiles.fireChunk', () => {
  it('lobs a chunk on a high arc that lands on the target after the hurl flight time', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; x: number; z: number; damage: number }[] = [];
    p.onHit = (h) => hits.push({ kind: h.kind, x: h.point.x, z: h.point.z, damage: h.damage });
    p.fireChunk(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, 0, 900), 85);
    let peak = 0;
    const steps = Math.ceil(CONFIG.kraken.arms.hurl.flight / 0.05) + 2;
    for (let i = 0; i < steps; i++) {
      p.update(0.05);
      const s = (p as unknown as { shots: { pos: THREE.Vector3 }[] }).shots[0];
      if (s) peak = Math.max(peak, s.pos.y);
    }
    expect(hits).toEqual([{ kind: 'chunk', x: 0, z: 900, damage: 85 }]);
    expect(peak).toBeGreaterThan(CONFIG.kraken.arms.hurl.arc * 0.8);
    expect(p.incoming()).toHaveLength(0);
  });
});
```

Append to `src/systems/Passives.test.ts`, first adding `grip: 0` to the `ranks` helper's record:

```ts
describe('grip', () => {
  it('Sucker Grip: off at rank 0, then a growing radius and damage per rank', () => {
    expect(new Passives(ranks({})).grip()).toBeNull();
    const g1 = new Passives(ranks({ grip: 1 })).grip()!;
    const g3 = new Passives(ranks({ grip: 3 })).grip()!;
    expect(g1).toEqual({ radius: CONFIG.passives.grip.radius[1], damage: CONFIG.passives.grip.damage[1] });
    expect(g3.radius).toBeGreaterThan(g1.radius);
    expect(g3.damage).toBeGreaterThan(g1.damage);
  });
});
```

In `src/monsters/kraken/kind.test.ts`, add `expect(KRAKEN.signatures).toContain('grip');` and `expect(KRAKEN.abilityText.grip?.title).toBe('Sucker Grip');` to the signatures test.

Run: `npx vitest run src/systems/Projectiles.test.ts src/systems/Passives.test.ts src/monsters/kraken`. Expected: FAIL (`fireChunk` and `grip` missing).

- [ ] **Step 2: Chunk projectile and Sucker Grip**

**`src/systems/Projectiles.ts`:**
1. Change `ShotKind` to `'spike' | 'shell' | 'rocket' | 'glob' | 'chunk'`.
2. Add `chunk: [60, 60, 60]` to `sizes`.
3. Add this mesh in the constructor:
   ```ts
   chunk: make('shot-chunk', faceted(new THREE.DodecahedronGeometry(0.5, 0)), CONFIG.kraken.colors.chunk, 32),
   ```
4. Add the method:
   ```ts
   /** Kraken Hurl: a chunk of rubble lobbed on a high arc; it splashes where it lands. */
   fireChunk(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
     const s = this.alloc('chunk', from, to, damage, null);
     s.dur = CONFIG.kraken.arms.hurl.flight;
   }
   ```
5. In `update`, add `else if (s.kind === 'chunk') ballistic(s.from, s.aim, CONFIG.kraken.arms.hurl.arc, k, s.pos);` after the glob branch.
6. In `draw`, add `chunk: 0` to `counts`.

Chunks keep the smoke trail; only shells and globs skip it.

**`src/config.ts`**, in `passives`:
```ts
    /** Sucker Grip (Kraken): each plant crushes the nearest ground enemy within radius[rank] of the tip. */
    grip: { radius: [0, 140, 180, 220], damage: [0, 90, 140, 200] },
```

**`src/systems/Progression.ts`:**
- Add `| 'grip'` to `AbilityId`.
- Add to `ABILITIES`:
  ```ts
  grip: { title: 'Sucker Grip', icon: '🐙', desc: (r) => (r === 1 ? 'Planted arms crush an enemy beside them' : 'Wider, harder grip') },
  ```
- Add `grip: 0` to `emptyRanks()`.

**`src/systems/Passives.ts`:**
```ts
  /** Sucker Grip (Kraken): radius and damage of the crush on each plant, or null if not taken. */
  grip(): { radius: number; damage: number } | null {
    const r = this.ranks().grip;
    return r > 0 ? { radius: P.grip.radius[r]!, damage: P.grip.damage[r]! } : null;
  }
```

**`src/monsters/kraken/kind.ts`:** add `'grip'` to `signatures`, and to `abilityText` add:
```ts
grip: { title: 'Sucker Grip', icon: '🐙', desc: (r) => (r === 1 ? 'Planted arms crush an enemy beside them' : 'Wider, harder grip') },
```

Run the Step 1 tests. Expected: PASS.

- [ ] **Step 3: Wire the Kraken into `GameScene`**

1. **Imports:** `import { assignStrikes } from './monsters/kraken/strikes';` and `import type { ArmStrike } from './monsters/kraken/TentacleArms';`.
2. **Brain input in `updateMonster`:**
   - The Kraken's arms do its melee, so the brain must never start the generic strike for it. In the `decide({...})` input, change `meleeReady: m.meleeReady(),` to `meleeReady: m.kind.melee.kind === 'multi' ? false : m.meleeReady(),`.
   - With melee never ready, the brain still faces an ordered ground target within `meleeRange` (and stops), and the arms reach it.
   - Hurl is for targets beyond slam reach. Where `rangedPool` is built, add the hurl case:
     ```ts
     const reach = this.ms.meleeRange * 0.8;
     const rangedPool =
       m.kind.ranged === 'breath' ? this.enemyTargets().filter((t) => this.canBreatheAt(t))
       : m.kind.ranged === 'hurl' ? this.enemyTargets().filter((t) => Math.hypot(t.position.x - pos.x, t.position.z - pos.z) > reach)
       : this.enemyTargets();
     ```
     Declare `reach` just before it.
3. **Ranged dispatch:** in `fireRanged`, add `else if (this.monster.kind.ranged === 'hurl') this.hurlAt(target);` before the spikes fallback.
4. **New methods:**

```ts
  /**
   * Tentacle Slam: every free arm takes the nearest unclaimed ground enemy (or the ordered target) within
   * reach on any side; the body never turns. Damage lands in onArmImpact.
   */
  private tentacleSlams(): void {
    const m = this.monster;
    const arms = m.body.arms;
    if (!arms || m.kind.melee.kind !== 'multi' || !m.alive || m.busy) return;
    const free = arms.freeArms();
    if (free.length === 0) return;
    const busy = arms.striking();
    const ordered = this.order?.kind === 'attack' && !this.order.target.airborne ? this.order.target : null;
    const cands = this.enemyTargets().filter((t) => !t.airborne && !busy.has(t));
    if (ordered && !busy.has(ordered) && !cands.includes(ordered)) cands.push(ordered);
    const from = { x: m.position.x, z: m.position.z };
    const cd = this.ms.meleeCooldown * this.progression.stats.cooldownMult;
    for (const { arm, target } of assignStrikes(free, m.yaw, from, cands, this.ms.meleeRange)) {
      arms.start(arm, 'slam', target.position, target, cd, this.ms.meleeTiming);
    }
  }

  /** Hurl: free arms (1 + extra-projectile upgrades) throw rubble at the target and its nearest neighbours. */
  private hurlAt(target: Target | null): void {
    const m = this.monster;
    const arms = m.body.arms;
    if (!target || !arms) return;
    const free = arms.freeArms();
    if (free.length === 0) return;
    const from = { x: m.position.x, z: m.position.z };
    const count = Math.min(free.length, 1 + this.progression.stats.extraSpikes);
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && Math.hypot(t.position.x - from.x, t.position.z - from.z) <= this.ms.rangedRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const H = CONFIG.kraken.arms.hurl;
    let left = free;
    for (const t of spikeTargets(target, others, count)) {
      const pick = assignStrikes(left, m.yaw, from, [t], Infinity)[0];
      if (!pick) break;
      arms.start(pick.arm, 'hurl', t.position, t, 0, H.timing);
      left = left.filter((a) => a !== pick.arm);
    }
    m.consumeRanged(this.rangedCdMult());
  }

  /** An arm's strike lands: a slam hits around its tip; a hurl releases its chunk from the tip. */
  private onArmImpact = (arm: number, s: ArmStrike): void => {
    const arms = this.monster.body.arms!;
    if (s.kind === 'hurl') {
      const tip = arms.tips[arm]!;
      this.projectiles.fireChunk(tip.clone(), s.target.clone().setY(0), this.ms.rangedDamage * this.dmgMult());
      this.particles.emit('debris', tip, 6, 0.8);
      return;
    }
    const at = { x: s.target.x, z: s.target.z };
    const r = this.ms.meleeRadius * this.progression.stats.stompRadiusMult;
    const dmg = this.ms.meleeDamage * this.dmgMult();
    this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(dmg));
    for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(dmg);
    this.tmpV.set(at.x, 0, at.z);
    this.particles.ring('dust', this.tmpV, r, 10);
    this.particles.emit('debris', this.tmpV.setY(10), 6, 1);
    this.rig.addTrauma(0.12);
  };
```

5. **Every frame:** in the `playing` block, right after `this.updateMonster(dt);`:
   ```ts
   this.tentacleSlams();
   this.monster.body.arms?.update(dt, CONFIG.kraken.arms.spinTime, this.onArmImpact);
   ```
6. **Chunk landing:** in `onProjectileHit`, before the spike branch:

```ts
    if (h.kind === 'chunk') {
      const r = CONFIG.kraken.arms.hurl.splash;
      const at = { x: h.point.x, z: h.point.z };
      this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(h.damage));
      for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(h.damage);
      this.particles.ring('dust', h.point, r, 12);
      this.particles.emit('debris', h.point, 12, 1.2);
      this.rig.addTrauma(0.15);
      return;
    }
```

7. **Sucker Grip:** in `this.monster.onFootLand`, after the acid-pool lines:
   ```ts
   const grip = this.passives.grip();
   if (grip && this.state === 'playing') {
     const victim = nearestInRange({ x: p.x, z: p.z }, this.enemyTargets().filter((t) => !t.airborne), grip.radius);
     if (victim) {
       victim.applyDamage(grip.damage * this.dmgMult());
       this.particles.emit('ink', victim.position, 8, 0.8);
     }
   }
   ```
8. **Whirlpool:** at the end of `venomNova()`, add `this.monster.body.arms?.spin();`.
9. **Ink Cloud:** in `spineShield`, change the per-threat `this.particles.emit('spark', t.pos, 8, 0.6);` to `this.particles.emit(this.monster.kind.fx.intercept, t.pos, 8, 0.6);`. The Insect and Kaiju use `'spark'`, so they are unchanged.
10. **Clearing:** in `resetRun()` (next to `this.breath.clear()`) and at the start of `startDying()`, add `this.monster.body.arms?.clear();`. `applyKind` swaps the body, so no clear is needed there.

Anti-air needs no change: Tentacle Lash uses the existing Tail Swat path (`tailSwat`, `startSwat`, `onSwatImpact`), measured from the Kraken's `headHeight`. `KrakenBody` animates the lash on the best free arm.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`. Expected: all pass.

Scripted check `$SCRATCH/m4b-t4.mjs` (desktop). Go to select, `g.selectStep(2)` (Kraken), PLAY and skip, then clear enemies by killing any spawned tanks.

1. **Ring of slams while crawling:**
   - Set `g.monster.position.set(0, 0, 0)`, `g.monster.yaw = 0` and `g.order = { kind: 'move', to: { x: 0, z: 3000 } }`.
   - Spawn tanks 300 m away on four sides: `(0, 300)`, `(300, 0)`, `(-300, 0)`, `(0, -300)`.
   - Every 100 ms record `{ yaw, z, alive count, active strikes: g.monster.body.arms.strikes.filter(Boolean).length }`.
   - Expected:
     - all four tanks are dead within about 3 s;
     - at least two strikes are active at the same time at some sample;
     - `yaw` stays 0 throughout, so the body never turned;
     - `z` keeps increasing at about the crawl speed.
2. **Hurl:**
   - Stop the order (`g.order = null`) and spawn a tank at `(0, 1000)`.
   - Expected: a `'chunk'` hit within about 3 s kills it. Wrap `g.projectiles.onHit` to log hit kinds.
3. **Hurl with every arm busy:**
   - Set `g.monster.body.arms.spinT = 0`, then spawn a tank at `(0, 1100)`.
   - Expected: no hurl starts during the spin, and `g.monster.rangedCd` is not consumed. Read it before and after.
4. **Lash:** spawn a jet (`g.enemies.get('jet').spawn(g.ctx)`) and wait until it passes within reach. Expected: it is destroyed by a lash (or confirm `startSwat` fired via a wrapped `onSwatImpact`).
5. **Sucker Grip:** with `g.progression.ranks.grip = 1`, crawl past a tank 40 m to the side of the path. Expected: it takes grip damage on a nearby plant (wrap `applyDamage` or watch its HP).
6. **Ink Cloud:** with `g.progression.ranks.spines = 1` and several tanks shelling from about 800 m, expect `'ink'` intercept puffs. Count emits by wrapping `g.particles.emit`.
7. **Screenshots:** mid-ring-slam, a hurl in flight, and a Whirlpool spin (`g.progression.ranks.nova = 1`). Read them yourself: slams visibly reach up and down onto targets on several sides; the spin looks like all arms whirling out.
8. **General:** `ERRORS none`, and draw calls below 150 throughout.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Kraken combat: 360° Tentacle Slams, Hurl chunks, Lash, Sucker Grip, Whirlpool spin, Ink Cloud puffs

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

### Task 5: End-to-end checks (Kraken flows, switching, Insect and Kaiju regression)

**Files:**
- Create (scratchpad, not committed): `$SCRATCH/m4bcheck.mjs`
- Modify only if a check fails, in the file that owns the bug. Write a failing unit test first where the logic is pure.

**Interfaces:**
- Consumes `window.__game`:
  - `getState`, `selIndex`, `selectStep`, `playSelected`, `skipIntro`, `changeMonster`, `restart`
  - `monster` (`.kind.id`, `.visible`, `.body.arms`, `.position`, `.yaw`, `.hp`)
  - `progression`, `projectiles`, `enemies`, `ctx`, `scene`
  - `pixel.renderer.info` (`.render.calls`, `.memory.geometries`, `.memory.textures`)

- [ ] **Step 1: Write and run the script**

Run at desktop 1440×900 and phone 390×844 (`isMobile`, `hasTouch`). Sections, each logging labelled JSON lines:

1. **Select:**
   - Browse to the Kraken (index 2).
   - Log `{ kind, visible, coming: entries[3].available }`.
   - Screenshot the select diorama at both sizes.
2. **Play the Kraken:**
   - PLAY, and screenshot the intro at t ≈ 12 (cocoon) and t ≈ 14 (emerging).
   - Skip the intro, then repeat the Task 4 ring-of-tanks check: four tanks at 300 m on four sides while crawling forward.
   - Log yaw, kills and the peak simultaneous strikes.
3. **Play Again and Change Monster:**
   - With a strike or spin active (start one via `g.monster.body.arms.spin()` just before death), die, then Play Again.
   - Log `{ state, kind, activeStrikes, spinT }`.
   - Then die and Change Monster. Log the same.
4. **Switch loop:**
   - Browse Insect → Kaiju → Kraken → Insect three times.
   - Log `scene.children.length`, `memory.geometries` and `memory.textures` after each step.
5. **Insect regression:** play the Insect. A tank 300 m ahead dies to the leg strike, and spikes fire from the stinger (`g.projectiles.meshes.spike.material.color` is `CONFIG.palette.stinger`).
6. **Kaiju regression:** play the Kaiju. A side tank dies to a head-aimed breath while walking (yaw unchanged), and a rear tank is hit by the tail sweep.
7. **Errors and draw calls:** collect page errors and console errors throughout, and log the maximum draw calls.

- [ ] **Step 2: Compare against the expected results**

1. **Select:** `kind: 'kraken'`, `visible: true`, `coming: false` for the Golem; the screenshots frame the whole Kraken above the panel at both sizes.
2. **Kraken run:**
   - the cocoon contains the Kraken;
   - all four ring tanks die within about 3 s;
   - peak simultaneous strikes ≥ 2;
   - yaw unchanged.
3. **Resets:** after Play Again and Change Monster, `activeStrikes: 0` and `spinT: -1`, and no stray chunks (`g.projectiles.shots` has no `chunk`).
4. **Switch loop:** `scene.children.length` is constant per monster across the loops, and the geometry and texture counts are bounded (no steady climb per switch).
5. **Regression:** Insect and Kaiju behave as described in sections 5 and 6.
6. **Errors and draw calls:** `ERRORS none`, and maximum draw calls below 150.

Read every screenshot and judge the Kraken's look and framing.

- [ ] **Step 3: Fix failures**

Use superpowers:systematic-debugging. Pure logic (crawl, strikes, `TentacleArms`, `Projectiles`, `Passives`) gets a failing unit test first. Re-run Step 1 until every line matches.

- [ ] **Step 4: Full suite and commit any fixes**

Run: `npx tsc --noEmit && npm test`. Expected: all pass. If files changed, commit:

```bash
git add -A src
git commit -m "Milestone 4b: fixes from end-to-end Kraken checks

Co-Authored-By: <your model> <noreply@anthropic.com>"
```
