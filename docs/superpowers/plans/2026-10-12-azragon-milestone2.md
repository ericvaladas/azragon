# AZRAGON Milestone 2 (Threats, Abilities & Pacing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first minute exciting with a strong baseline monster and fast levels. Add five
telegraphed enemy types that unlock over about 5 minutes, two active abilities (Leap and Roar) and six
rankable automatic abilities. Escalate difficulty so a decent run ends at around 8 minutes.

**Architecture:** Every enemy type implements one `EnemySystem` interface. An `EnemyRegistry` owns
the systems, a table-driven `SpawnDirector`, and the per-frame `WorldContext` they share. All damage
to the monster goes through one pure `resolveHit` plus `GameScene.damageMonster`. Rules live in pure,
unit-tested modules: spawn table, difficulty, tether clamp, leap arc, laser phases, artillery math,
ability cooldowns, progression ranks and edge arrows. Thin Three.js classes render them.
`GameScene` stays the orchestrator.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright (scripted checks).

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone2-design.md`

## Global Constraints

- All M1 constraints still apply. See CLAUDE.md and the M1 plan:
  - no `useEffect`;
  - no `setPixelRatio`;
  - +Z forward and +X is the model's left;
  - Pointer Events only;
  - instancing for repeated meshes;
  - all tunables in `src/config.ts`.
- Draw calls stay **under 150** in a busy late-game wave, measured with `?debug=1`.
- Every new attack is **telegraphed** before it can hurt the monster.
- Enemy HP scales by `difficulty(t).hpMult` at spawn time. Enemy damage scales by `dmgMult` inside
  `resolveHit`. Enemy code passes base damage only.
- While the monster is **airborne** (mid-Leap), area attacks (`laser` and `artillery` sources) deal no
  damage. All other sources still hit.
- **Monster baseline:**

  | Stat | Value |
  |---|---|
  | moveSpeed | 90 |
  | turnRate | 2.4 |
  | meleeCooldown | 0.7 |
  | spikeCooldown | 0.5 |
  | spikeDamage | 45 |
  | expBase | 20 |
  | expExponent | 1.55 |

- **Unlock times (s):**

  | Enemy | Unlock |
  |---|---|
  | tank | 0 |
  | jet | 20 |
  | blimp | 45 |
  | sam | 90 |
  | artillery | 150 |
  | truck | 210 |
  | laser | 270 |

- **Ability timings:** Leap has an 8 s cooldown, 1000 m range, 1.1 s duration, 260 m peak and 260 m
  landing radius. Roar unlocks at level 5, with a 20 s cooldown, 600 m radius and 1.2 s duration.
- **Keys and buttons:** desktop keys are Space (Leap) and R (Roar). Buttons sit bottom-right inside the
  safe area at 64 px.
- **Commits:** commit after every task. Each message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Several tethers from opposite sides:** the monster stays within every tether circle without
   jitter or teleporting. Leap and Roar snap all tethers. Pinned by `tether.test.ts` (Task 7) and the
   Leap snap path (Task 9).
2. **Ability input outside `playing`:** during level-up, pause, dying or game over, the Space and R
   keys and the buttons do nothing, and aim mode is cancelled when the state leaves `playing`. Pinned
   by `abilities.test.ts` (Task 9), and `GameScene.pressAbility` guards on state.
3. **Restart in the middle of a laser, tether, leap or acid pool:** every enemy system clears, the
   laser returns to idle, the monster is grounded, ability cooldowns reset and pools vanish. Pinned by
   the scripted restart check (Task 11) and each system's `clear()`.
4. **Damage while airborne:** laser and artillery miss; shells, rockets, missiles and blimp blasts
   still hit. Pinned by `combat.test.ts` (Task 2).
5. **Long runs with maxed abilities:** offers never come up empty or with duplicates, and fall back to
   stat upgrades. The early-ability guarantee only applies to the first three level-ups. Pinned by
   `Progression.test.ts` (Task 10).

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | New tunables for every enemy, ability and spawn rule |
| `src/combat.ts` (+test) | `TargetKind` extended; pure `resolveHit()` |
| `src/enemies/types.ts` | `EnemyKind`, `DamageSource`, `WorldContext`, `EnemySystem` |
| `src/enemies/spawnTable.ts` (+test) | `difficulty(t)`, unlocked kinds, weighted pick |
| `src/enemies/SpawnDirector.ts` (+test) | Table-driven director returning `EnemyKind[]` |
| `src/enemies/EnemyRegistry.ts` | Owns systems and director; per-frame targets cache; spawning; clear |
| `src/enemies/TankFleet.ts`, `JetSquadron.ts` | Adapted to `EnemySystem` |
| `src/enemies/Blimps.ts` | Kamikaze blimps |
| `src/enemies/SamSilos.ts` | Silos plus shootable missiles |
| `src/enemies/artilleryMath.ts` (+test), `Artillery.ts` | Batteries, strike circles |
| `src/monster/tether.ts` (+test), `src/enemies/GrappleTrucks.ts` | Trucks, cables, tether clamp |
| `src/enemies/laserPhases.ts` (+test), `OrbitalLaser.ts` | Orbital laser |
| `src/world/roads.ts` (+test) | `ringOnRoads()` for the opening wave |
| `src/systems/edgeArrows.ts` (+test), `Chevrons.ts` | Readability |
| `src/systems/abilities.ts` (+test), `src/monster/leap.ts` (+test), `src/systems/Shockwave.ts` | Active abilities |
| `src/systems/Progression.ts` (+test) | Ability ranks, offer rules |
| `src/systems/Passives.ts`, `AcidPools.ts`, `BroodDrones.ts` | Automatic abilities |
| `src/monster/Monster.ts` | Leap and roar poses, airborne flag, move constraint |
| `src/systems/Input.ts`, `Markers.ts` | Keyboard; leap aim ring |
| `src/GameEvents.ts`, `src/App.tsx`, `src/ui/AbilityButtons.tsx`, `src/ui/EdgeArrows.tsx`, `src/ui/Hud.tsx`, `src/style.css` | UI |
| `src/GameScene.ts` | Orchestrates the registry, abilities and passives |

### Task 1: Pacing baseline — faster monster, faster levels, opening tank ring

**Files:**
- Modify: `src/config.ts`, `src/systems/Progression.test.ts`, `src/world/roads.ts`, `src/world/roads.test.ts`, `src/enemies/TankFleet.ts`, `src/GameScene.ts`

**Interfaces:**
- Produces: `ringOnRoads(center: Vec2, n: number, r: number, origin: number, pitch: number): Vec2[]`, `TankFleet.spawnAt(x: number, z: number): void`, `CONFIG.opening = { time: 5, count: 8, radius: 1200 }`.

- [ ] **Step 1: Update the Progression tests for the new EXP curve, and add a failing `ringOnRoads` test**

In `src/systems/Progression.test.ts`, make the EXP tests derive from `expToNext` instead of literals, and pin the new curve:

```ts
describe('expToNext', () => {
  it('follows expBase * level^expExponent, rounded (M2 curve: 20, 59, ...)', () => {
    expect(expToNext(1)).toBe(20);
    expect(expToNext(2)).toBe(59);
    expect(expToNext(5)).toBeGreaterThan(expToNext(4));
  });
});
```

In the other Progression tests, replace every `40 + 102` with `expToNext(1) + expToNext(2)`, every lone `40` with `expToNext(1)`, and `p.addExp(40 + 102 + 5)` with `p.addExp(expToNext(1) + expToNext(2) + 5)`.

Append to `src/world/roads.test.ts`:

```ts
import { ringOnRoads } from './roads';

describe('ringOnRoads', () => {
  it('places n points about r away, each on a road line', () => {
    const pts = ringOnRoads({ x: 130, z: -70 }, 8, 1200, 0, 200);
    expect(pts).toHaveLength(8);
    for (const p of pts) {
      const onX = Math.abs(p.x - Math.round(p.x / 200) * 200) < 1e-6;
      const onZ = Math.abs(p.z - Math.round(p.z / 200) * 200) < 1e-6;
      expect(onX || onZ).toBe(true);
      expect(Math.abs(Math.hypot(p.x - 130, p.z + 70) - 1200)).toBeLessThanOrEqual(150);
    }
  });
});
```

- [ ] **Step 2: Change the config, then run the tests and confirm the new ones fail**

In `src/config.ts` set:
- `monster.moveSpeed: 90`
- `monster.turnRate: 2.4`
- `monster.meleeCooldown: 0.7`
- `monster.spikeCooldown: 0.5`
- `monster.spikeDamage: 45`
- `progression.expBase: 20`
- `progression.expExponent: 1.55`

Then add a top-level entry:

```ts
  /** One-off wave at the start of every run, outside the spawn budget. */
  opening: { time: 5, count: 8, radius: 1200 },
```

Run: `npx vitest run src/systems/Progression.test.ts src/world/roads.test.ts`
Expected: the Progression tests pass with the new curve, and `ringOnRoads` fails (not exported).

- [ ] **Step 3: Implement `ringOnRoads`**

Append to `src/world/roads.ts`:

```ts
/** n points around `center` at radius r, alternately snapped to the nearest north-south or east-west road line. */
export function ringOnRoads(center: Vec2, n: number, r: number, origin: number, pitch: number): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    out.push(k % 2 === 0 ? { x: snapToRoad(x, origin, pitch), z } : { x, z: snapToRoad(z, origin, pitch) });
  }
  return out;
}
```

Run: `npx vitest run src/world/roads.test.ts`. Expected: PASS.

- [ ] **Step 4: Add `TankFleet.spawnAt` and the opening wave**

In `src/enemies/TankFleet.ts`, split `spawn` so the placement is reusable:

```ts
  spawn(around: THREE.Vector3, rng: () => number): void {
    const a = rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + rng() * 0.3);
    this.spawnAt(snapToRoad(around.x + Math.cos(a) * r, ROAD_ORIGIN, CONFIG.world.blockSize), around.z + Math.sin(a) * r, rng);
  }

  /** Spawn a tank at an exact point (assumed on a road). */
  spawnAt(x: number, z: number, rng: () => number = Math.random): void {
    if (this.tanks.length >= MAX_TANKS) return;
    const t = new Tank(this.damage);
    t.position.set(x, S * 0.3, z);
    t.fireCd = 1 + rng() * CONFIG.tank.fireCooldown;
    this.tanks.push(t);
  }
```

In `src/GameScene.ts`, add the field `private openingDone = false;`. In `update()`, inside `if (this.state === 'playing')` after `this.runTime += dt;`, add:

```ts
        if (!this.openingDone && this.runTime >= CONFIG.opening.time) {
          this.openingDone = true;
          const c = { x: this.monster.position.x, z: this.monster.position.z };
          for (const p of ringOnRoads(c, CONFIG.opening.count, CONFIG.opening.radius, ROAD_ORIGIN, CONFIG.world.blockSize)) this.tanks.spawnAt(p.x, p.z, this.rng);
        }
```

In `restart()`, add `this.openingDone = false;`. Import `ringOnRoads` from `./world/roads` and `ROAD_ORIGIN` from `./world/chunks`.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`. Expected: all pass.

Scripted check (dev server running), run with Playwright as in M1: load the page, wait for `window.__game.runTime > 6`, and read `window.__game.tanks.count()`.
Expected: at least 8.

Also log `window.__game.progression.level` after 60 s of game time with the monster idle on auto-defense. Report the value to the user as a pacing data point; it is not a gate.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Faster baseline monster, faster early levels, opening tank ring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Enemy framework — spawn table, difficulty, registry, single damage path

Replaces per-type wiring with `EnemySystem` + `EnemyRegistry`, makes the director table-driven for
all seven kinds, adds difficulty scaling, and routes every hit on the monster through `resolveHit`.
Tanks and jets are adapted; behaviour is otherwise unchanged.

**Files:**
- Create: `src/enemies/types.ts`, `src/enemies/spawnTable.ts`, `src/enemies/spawnTable.test.ts`, `src/enemies/EnemyRegistry.ts`, `src/combat.test.ts`
- Modify: `src/combat.ts`, `src/config.ts`, `src/enemies/SpawnDirector.ts` (rewrite), `src/enemies/SpawnDirector.test.ts` (rewrite), `src/enemies/TankFleet.ts`, `src/enemies/JetSquadron.ts`, `src/GameScene.ts`

**Interfaces:**
- Produces (exact):
  - `type TargetKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'missile' | 'artillery' | 'truck' | 'building'` (combat.ts)
  - `type DamageSource = 'shell' | 'rocket' | 'missile' | 'blimp' | 'artillery' | 'laser'` (combat.ts)
  - `resolveHit(amount: number, source: DamageSource, c: { dmgMult: number; deflectChance: number; airborne: boolean }, roll: number): { damage: number; deflected: boolean }`
  - `type EnemyKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'artillery' | 'truck' | 'laser'`, `ENEMY_KINDS: readonly EnemyKind[]`
  - `type Difficulty = { hpMult: number; dmgMult: number }`
  - `interface WorldContext` and `interface EnemySystem` (code below)
  - `difficulty(tSec: number): Difficulty`, `openKinds(tSec: number, alive: Record<EnemyKind, number>): EnemyKind[]`, `pickKind(kinds: readonly EnemyKind[], rng: () => number): EnemyKind | null`
  - `class SpawnDirector { elapsed: number; constructor(rng); reset(); update(dt: number, alive: Record<EnemyKind, number>): EnemyKind[] }`
  - `class EnemyRegistry { constructor(rng: () => number); add(s: EnemySystem): void; get<T extends EnemySystem>(kind: EnemyKind): T; update(dt: number, ctx: WorldContext, spawning: boolean): void; targets(): Target[]; counts(): Record<EnemyKind, number>; clear(): void; readonly director: SpawnDirector }`
  - `GameScene.damageMonster(amount: number, source: DamageSource): void`

- [ ] **Step 1: Write failing tests for `resolveHit`, the spawn table, and the director**

`src/combat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveHit } from './combat';

const base = { dmgMult: 1.5, deflectChance: 0.3, airborne: false };

describe('resolveHit', () => {
  it('scales damage by the difficulty multiplier', () => {
    expect(resolveHit(10, 'laser', base, 0.99)).toEqual({ damage: 15, deflected: false });
  });
  it('lets area attacks (laser, artillery) miss an airborne monster, but not projectiles', () => {
    const air = { ...base, airborne: true };
    expect(resolveHit(10, 'laser', air, 0.99).damage).toBe(0);
    expect(resolveHit(10, 'artillery', air, 0.99).damage).toBe(0);
    expect(resolveHit(10, 'shell', air, 0.99).damage).toBe(15);
  });
  it('deflects projectiles and blimp blasts when the roll is under the chance; never lasers', () => {
    expect(resolveHit(10, 'rocket', base, 0.29)).toEqual({ damage: 0, deflected: true });
    expect(resolveHit(10, 'blimp', base, 0.29).deflected).toBe(true);
    expect(resolveHit(10, 'rocket', base, 0.3).deflected).toBe(false);
    expect(resolveHit(10, 'laser', base, 0).deflected).toBe(false);
    expect(resolveHit(10, 'artillery', base, 0).deflected).toBe(false);
  });
});
```

`src/enemies/spawnTable.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { difficulty, openKinds, pickKind } from './spawnTable';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const none = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

describe('difficulty', () => {
  it('starts at 1x and grows linearly per minute', () => {
    expect(difficulty(0)).toEqual({ hpMult: 1, dmgMult: 1 });
    const d = difficulty(240);
    expect(d.hpMult).toBeCloseTo(1 + 4 * CONFIG.difficulty.hpPerMin);
    expect(d.dmgMult).toBeCloseTo(1 + 4 * CONFIG.difficulty.dmgPerMin);
  });
});

describe('openKinds', () => {
  it('follows the unlock timeline', () => {
    expect(openKinds(0, none())).toEqual(['tank']);
    expect(openKinds(19.9, none())).toEqual(['tank']);
    expect(openKinds(20, none())).toEqual(['tank', 'jet']);
    expect(openKinds(45, none())).toContain('blimp');
    expect(openKinds(90, none())).toContain('sam');
    expect(openKinds(150, none())).toContain('artillery');
    expect(openKinds(210, none())).toContain('truck');
    expect(openKinds(270, none())).toEqual([...ENEMY_KINDS]);
  });
  it('excludes kinds at their cap', () => {
    const alive = none();
    alive.laser = CONFIG.spawns.laser.cap;
    alive.tank = CONFIG.spawns.tank.cap;
    const open = openKinds(300, alive);
    expect(open).not.toContain('laser');
    expect(open).not.toContain('tank');
  });
});

describe('pickKind', () => {
  it('returns null for no options and respects weights', () => {
    expect(pickKind([], Math.random)).toBeNull();
    const rng = mulberry32(5);
    let tanks = 0;
    let jets = 0;
    for (let i = 0; i < 10000; i++) {
      const k = pickKind(['tank', 'jet'], rng);
      if (k === 'tank') tanks++;
      else jets++;
    }
    const expected = CONFIG.spawns.tank.weight / CONFIG.spawns.jet.weight;
    expect(tanks / jets).toBeGreaterThan(expected * 0.85);
    expect(tanks / jets).toBeLessThan(expected * 1.15);
  });
});
```

Replace `src/enemies/SpawnDirector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SpawnDirector } from './SpawnDirector';
import { ENEMY_KINDS, type EnemyKind } from './types';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const zero = (): Record<EnemyKind, number> => Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0])) as Record<EnemyKind, number>;

function run(dir: SpawnDirector, seconds: number, alive = zero()): EnemyKind[] {
  const out: EnemyKind[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...dir.update(0.05, alive));
  return out;
}

describe('SpawnDirector', () => {
  it('sends only tanks in the first 20 s', () => {
    const s = run(new SpawnDirector(mulberry32(1)), 19);
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s)).toEqual(new Set(['tank']));
  });

  it('has sent every kind by minute 5 (counts kept at zero)', () => {
    expect(new Set(run(new SpawnDirector(mulberry32(2)), 330))).toEqual(new Set(ENEMY_KINDS));
  });

  it('never exceeds per-kind caps', () => {
    const alive = zero();
    for (const k of ENEMY_KINDS) alive[k] = CONFIG.spawns[k].cap;
    expect(run(new SpawnDirector(mulberry32(3)), 400, alive)).toEqual([]);
  });

  it('escalates over time', () => {
    const dir = new SpawnDirector(mulberry32(4));
    const early = run(dir, 60).length;
    run(dir, 240);
    expect(run(dir, 60).length).toBeGreaterThan(early * 1.5);
  });

  it('never bursts more than the budget cap in one update', () => {
    const dir = new SpawnDirector(mulberry32(5));
    dir.update(10000, zero());
    expect(dir.update(10000, zero()).length).toBeLessThanOrEqual(CONFIG.director.budgetCap);
  });

  it('reset restarts the clock', () => {
    const dir = new SpawnDirector(mulberry32(6));
    run(dir, 300);
    dir.reset();
    expect(dir.elapsed).toBe(0);
    expect(new Set(run(dir, 5))).toEqual(new Set(['tank']));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/combat.test.ts src/enemies`
Expected: FAIL (missing `resolveHit`, `spawnTable`, `types`, `CONFIG.spawns`).

- [ ] **Step 3: Add config, types, `resolveHit`, the spawn table, and the director**

In `src/config.ts`, replace the `director` block and add `spawns` and `difficulty`:

```ts
  director: {
    baseRate: 0.6,
    rateGrowthPerMin: 0.6,
    budgetCap: 12,
    spawnRing: 2000,
  },
  /** Per-kind spawn rules: unlock time (s), budget cost, concurrent cap, pick weight. */
  spawns: {
    tank: { unlock: 0, cost: 1, cap: 40, weight: 10 },
    jet: { unlock: 20, cost: 4, cap: 8, weight: 4 },
    blimp: { unlock: 45, cost: 3, cap: 6, weight: 3 },
    sam: { unlock: 90, cost: 5, cap: 4, weight: 2 },
    artillery: { unlock: 150, cost: 8, cap: 2, weight: 2 },
    truck: { unlock: 210, cost: 5, cap: 4, weight: 2 },
    laser: { unlock: 270, cost: 10, cap: 1, weight: 4 },
  },
  difficulty: { hpPerMin: 0.25, dmgPerMin: 0.15 },
```

Fix references to the removed director keys:
- In `TankFleet.ts`, use `const MAX_TANKS = CONFIG.spawns.tank.cap;`.
- Search for `director.max`, `director.jet`, and `director.tankCost` and remove any remaining uses.

In `src/combat.ts`, widen `TargetKind`, then append:

```ts
export type DamageSource = 'shell' | 'rocket' | 'missile' | 'blimp' | 'artillery' | 'laser';

const AREA: ReadonlySet<DamageSource> = new Set(['laser', 'artillery']);
const DEFLECTABLE: ReadonlySet<DamageSource> = new Set(['shell', 'rocket', 'missile', 'blimp']);

/**
 * Damage the monster actually takes from one hit. Area attacks miss while airborne (mid-Leap);
 * projectiles and blimp blasts can be deflected (Chitin Deflection) when `roll` < deflectChance.
 */
export function resolveHit(
  amount: number,
  source: DamageSource,
  c: { dmgMult: number; deflectChance: number; airborne: boolean },
  roll: number,
): { damage: number; deflected: boolean } {
  if (c.airborne && AREA.has(source)) return { damage: 0, deflected: false };
  if (DEFLECTABLE.has(source) && roll < c.deflectChance) return { damage: 0, deflected: true };
  return { damage: amount * c.dmgMult, deflected: false };
}
```

`src/enemies/types.ts`:

```ts
import type * as THREE from 'three';
import type { DamageSource, OnDestroyed, Target } from '../combat';
import type { Particles } from '../systems/Particles';
import type { Vec2 } from '../util/math';

export type EnemyKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'artillery' | 'truck' | 'laser';
export const ENEMY_KINDS: readonly EnemyKind[] = ['tank', 'jet', 'blimp', 'sam', 'artillery', 'truck', 'laser'];

export type Difficulty = { hpMult: number; dmgMult: number };

/** Everything an enemy system may read or call during spawn/update. Rebuilt by GameScene each frame. */
export interface WorldContext {
  readonly monster: { readonly position: THREE.Vector3; readonly alive: boolean; readonly airborne: boolean };
  readonly difficulty: Difficulty;
  /** Run time in minutes (for salvo sizes etc.). */
  readonly minutes: number;
  readonly rng: () => number;
  readonly particles: Particles;
  /** Thrash: multiplier on tether duration, and damage dealt to a truck when its tether snaps. */
  readonly tetherDurationMult: number;
  readonly thrashDamage: number;
  damageMonster(amount: number, source: DamageSource): void;
  damageBuildings(p: Vec2, r: number, amount: number): void;
  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void;
  shake(amount: number): void;
  readonly onDestroyed: OnDestroyed;
}

export interface EnemySystem {
  readonly kind: EnemyKind;
  spawn(ctx: WorldContext): void;
  update(dt: number, ctx: WorldContext): void;
  /** Live, targetable entities (may include missiles for SAM silos). */
  targets(): readonly Target[];
  /** Concurrent count for spawn caps. */
  count(): number;
  clear(): void;
}
```

`src/enemies/spawnTable.ts`:

```ts
import { CONFIG } from '../config';
import { ENEMY_KINDS, type Difficulty, type EnemyKind } from './types';

export function difficulty(tSec: number): Difficulty {
  const m = Math.max(0, tSec) / 60;
  return { hpMult: 1 + CONFIG.difficulty.hpPerMin * m, dmgMult: 1 + CONFIG.difficulty.dmgPerMin * m };
}

/** Kinds unlocked at tSec whose concurrent count is under cap, in ENEMY_KINDS order. */
export function openKinds(tSec: number, alive: Record<EnemyKind, number>): EnemyKind[] {
  return ENEMY_KINDS.filter((k) => tSec >= CONFIG.spawns[k].unlock && alive[k] < CONFIG.spawns[k].cap);
}

/** Weighted random pick by CONFIG.spawns[k].weight. */
export function pickKind(kinds: readonly EnemyKind[], rng: () => number): EnemyKind | null {
  if (kinds.length === 0) return null;
  const total = kinds.reduce((s, k) => s + CONFIG.spawns[k].weight, 0);
  let r = rng() * total;
  for (const k of kinds) {
    r -= CONFIG.spawns[k].weight;
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1]!;
}
```

Replace `src/enemies/SpawnDirector.ts`:

```ts
import { CONFIG } from '../config';
import { openKinds, pickKind } from './spawnTable';
import type { EnemyKind } from './types';

/**
 * Budget-based escalation over the spawn table. The next kind is rolled first and saved up for,
 * so expensive enemies are not starved by cheap ones. Caps limit concurrent enemies per kind.
 */
export class SpawnDirector {
  elapsed = 0;
  private budget = 0;
  private next: EnemyKind | null = null;

  constructor(private rng: () => number) {}

  reset(): void {
    this.elapsed = 0;
    this.budget = 0;
    this.next = null;
  }

  update(dt: number, alive: Record<EnemyKind, number>): EnemyKind[] {
    const D = CONFIG.director;
    this.elapsed += dt;
    const rate = D.baseRate + (D.rateGrowthPerMin * this.elapsed) / 60;
    this.budget = Math.min(D.budgetCap, this.budget + rate * dt);
    const counts = { ...alive };
    const out: EnemyKind[] = [];
    for (;;) {
      if (this.next === null) this.next = pickKind(openKinds(this.elapsed, counts), this.rng);
      if (this.next === null) break;
      const rule = CONFIG.spawns[this.next];
      if (counts[this.next] >= rule.cap) {
        this.next = null;
        break;
      }
      if (this.budget < rule.cost) break;
      this.budget -= rule.cost;
      out.push(this.next);
      counts[this.next]++;
      this.next = null;
    }
    return out;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/combat.test.ts src/enemies`
Expected: PASS. If "every kind by minute 5" fails, the base rate is too low to afford a laser (cost 10) by 330 s. Check the `director` values against this task and don't weaken the test.

- [ ] **Step 5: Adapt `TankFleet` and `JetSquadron` to `EnemySystem`**

`TankFleet`:
- Declare `implements EnemySystem` with `readonly kind = 'tank' as const;`.
- Make the constructor take only `(scene: THREE.Scene)`.
- Add a field `private ctx: WorldContext | null = null;`.
- Rename `update(dt, monster)` to `update(dt: number, ctx: WorldContext)`. Its first lines become `this.ctx = ctx; const monster = ctx.monster.position;`.
- Replace `this.fire(muzzle, aim, T.damage)` with `ctx.fireShell(muzzle, aim, T.damage)`.
- In `damage`, replace `this.onDestroyed(t, CONFIG.tank.exp)` with `this.ctx?.onDestroyed(t, CONFIG.tank.exp)`.
- Replace `spawn(around, rng)` with:

```ts
  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    const a = ctx.rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const around = ctx.monster.position;
    this.spawnAt(snapToRoad(around.x + Math.cos(a) * r, ROAD_ORIGIN, CONFIG.world.blockSize), around.z + Math.sin(a) * r, ctx);
  }

  /** Spawn a tank at an exact point (assumed on a road), HP scaled by difficulty. */
  spawnAt(x: number, z: number, ctx: WorldContext): void {
    if (this.tanks.length >= MAX_TANKS) return;
    const t = new Tank(this.damage);
    t.hp = CONFIG.tank.hp * ctx.difficulty.hpMult;
    t.position.set(x, S * 0.3, z);
    t.fireCd = 1 + ctx.rng() * CONFIG.tank.fireCooldown;
    this.tanks.push(t);
  }
```

In `GameScene`, the opening wave from Task 1 calls `tanks.spawnAt(p.x, p.z, ctx)`.

`JetSquadron`:
- Declare `implements EnemySystem` with `readonly kind = 'jet' as const;`.
- Make the constructor take only `(private scene: THREE.Scene)`.
- Remove the `onTrail` and `onCrash` fields.
- Add `private ctx: WorldContext | null = null;`.
- Rename `spawn(around, rng)` to `spawn(ctx: WorldContext)`, using `ctx.monster.position` and `ctx.rng`, and set `j.hp = CONFIG.jet.hp * ctx.difficulty.hpMult;`.
- Rename `update(dt, monster)` to `update(dt: number, ctx: WorldContext)`, starting with `this.ctx = ctx; const monster = ctx.monster.position;`.
- Replace `this.fire(...)` with `ctx.fireRocket(...)`.
- Replace `this.onTrail(j.position)` with `ctx.particles.emit('smoke', j.position, 1, 0.3)`.
- Replace `this.onCrash(p)` with an inline block:

```ts
          const p = j.position.clone().setY(0);
          ctx.particles.explosion(p, 2);
          ctx.particles.ring('dust', p, 120, 12);
          ctx.shake(0.3);
```

- In `damage`, use `this.ctx?.onDestroyed(j, CONFIG.jet.exp)`.

Both systems: `targets()`, `count()` and `clear()` stay as they are.

- [ ] **Step 6: Create `EnemyRegistry`**

`src/enemies/EnemyRegistry.ts`:

```ts
import type { Target } from '../combat';
import { SpawnDirector } from './SpawnDirector';
import { ENEMY_KINDS, type EnemyKind, type EnemySystem, type WorldContext } from './types';

/** Owns every enemy system plus the director; caches the live target list once per frame. */
export class EnemyRegistry {
  readonly director: SpawnDirector;
  private systems = new Map<EnemyKind, EnemySystem>();
  private cache: Target[] = [];
  private cacheValid = false;

  constructor(rng: () => number) {
    this.director = new SpawnDirector(rng);
  }

  add(s: EnemySystem): void {
    this.systems.set(s.kind, s);
  }

  get<T extends EnemySystem>(kind: EnemyKind): T {
    const s = this.systems.get(kind);
    if (!s) throw new Error(`No enemy system for ${kind}`);
    return s as T;
  }

  counts(): Record<EnemyKind, number> {
    const out = {} as Record<EnemyKind, number>;
    for (const k of ENEMY_KINDS) out[k] = this.systems.get(k)?.count() ?? 0;
    return out;
  }

  /** Spawns (when `spawning`), then updates every system. */
  update(dt: number, ctx: WorldContext, spawning: boolean): void {
    if (spawning) {
      for (const kind of this.director.update(dt, this.counts())) this.systems.get(kind)?.spawn(ctx);
    }
    for (const s of this.systems.values()) s.update(dt, ctx);
    this.cacheValid = false;
  }

  /** Live targetable enemies; rebuilt at most once per update. */
  targets(): Target[] {
    if (!this.cacheValid) {
      this.cache = [];
      for (const s of this.systems.values()) for (const t of s.targets()) if (t.isAlive()) this.cache.push(t);
      this.cacheValid = true;
    }
    return this.cache;
  }

  clear(): void {
    for (const s of this.systems.values()) s.clear();
    this.director.reset();
    this.cacheValid = false;
  }
}
```

- [ ] **Step 7: Wire the registry and `damageMonster` into `GameScene`**

Replace these fields: `director`, `tanks`, `jets` → `private enemies: EnemyRegistry; private ctx!: WorldContext;`. Keep `rng`.

In the constructor, replace the director, tanks and jets setup with:

```ts
    this.enemies = new EnemyRegistry(this.rng);
    this.enemies.add(new TankFleet(this.scene));
    this.enemies.add(new JetSquadron(this.scene));
    this.ctx = this.buildContext();
```

Add these methods:

```ts
  /** One mutable context object shared by all enemy systems; refreshed each frame. */
  private buildContext(): WorldContext {
    const self = this;
    return {
      get monster() {
        return { position: self.monster.position, alive: self.monster.alive, airborne: self.monster.airborne };
      },
      get difficulty() {
        return difficulty(self.runTime);
      },
      get minutes() {
        return self.runTime / 60;
      },
      rng: this.rng,
      particles: this.particles,
      get tetherDurationMult() {
        return self.passiveTetherMult();
      },
      get thrashDamage() {
        return self.passiveThrashDamage();
      },
      damageMonster: (amount, source) => this.damageMonster(amount, source),
      damageBuildings: (p, r, amount) => this.city.forEachStandingInRadius(p, r, (t) => t.applyDamage(amount)),
      fireShell: (from, to, damage) => {
        this.projectiles.fireShell(from, to, damage);
        this.particles.emit('fire', from, 2, 0.3);
      },
      fireRocket: (from, to, damage) => {
        this.projectiles.fireRocket(from, to, damage);
        this.particles.emit('fire', from, 2, 0.3);
      },
      shake: (a) => this.rig.addTrauma(a),
      onDestroyed: this.onTargetDestroyed,
    };
  }

  /** Thrash hooks; Task 10 returns real values. */
  private passiveTetherMult(): number {
    return 1;
  }
  private passiveThrashDamage(): number {
    return 0;
  }
  /** Chitin Deflection hook; Task 10 returns the real chance. */
  private deflectChance(): number {
    return 0;
  }

  /** The only way the monster takes damage. */
  damageMonster(amount: number, source: DamageSource): void {
    const m = this.monster;
    if (!m.alive || this.state !== 'playing') return;
    const r = resolveHit(amount, source, { dmgMult: difficulty(this.runTime).dmgMult, deflectChance: this.deflectChance(), airborne: m.airborne }, Math.random());
    if (r.deflected) {
      this.particles.emit('spark', m.position.clone().setY(300 * CONFIG.monster.scale), 8);
      return;
    }
    if (r.damage <= 0) return;
    m.hp = Math.max(0, m.hp - r.damage);
    m.flash();
    this.rig.addTrauma(Math.min(0.4, 0.03 + r.damage * 0.004));
    if (m.hp <= 0) this.startDying();
  }
```

Add a temporary member to `Monster`, with a comment that Task 9 drives it: `airborne = false;`.

Replace the old wiring:
- **Spawning loop:** replace the per-kind spawning loop, `this.tanks.update(...)` and `this.jets.update(...)` in `update()` with one line, placed where `jets.update` was, so it runs during `dying` too:

  ```ts
  this.enemies.update(dt, this.ctx, this.state === 'playing');
  ```

- **Opening wave:** use `this.enemies.get<TankFleet>('tank').spawnAt(p.x, p.z, this.ctx)`.
- **Targets:** `enemyTargets()` returns `this.enemies.targets()`.
- **Shell and rocket hits:** in `onProjectileHit`, replace the monster-damage branch with:

  ```ts
  this.particles.explosion(h.point, 0.6);
  this.damageMonster(h.damage, h.kind === 'shell' ? 'shell' : 'rocket');
  ```

- **Restart:** replace the tank, jet and director clears with `this.enemies.clear();`.
- **Explosions:** in `onTargetDestroyed`, replace the tank/jet explosion lines with `if (target.kind !== 'building') this.particles.explosion(target.position, target.airborne ? 1.2 : 1);`.

Imports: `EnemyRegistry`, `difficulty`, `resolveHit`, `type DamageSource`, `type WorldContext`, `TankFleet`, `JetSquadron`.

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`. Expected: all pass, and `tsc` is clean.
Run the M1 scripted enemy check (fast-forward `window.__game.enemies.director.elapsed = 32`). Expected: tanks and jets spawn, rockets reduce HP, and spikes kill jets.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add enemy framework: spawn table, difficulty, registry, single damage path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Readability — chevrons over enemies, screen-edge arrows for off-screen threats

**Files:**
- Create: `src/systems/edgeArrows.ts`, `src/systems/edgeArrows.test.ts`, `src/systems/Chevrons.ts`, `src/ui/EdgeArrows.tsx`
- Modify: `src/config.ts`, `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx`, `src/style.css`

**Interfaces:**
- Produces:
  - `edgeArrow(ndcX: number, ndcY: number, behind: boolean, w: number, h: number, margin: number): { x: number; y: number; angle: number } | null`
  - `type ThreatArrow = { x: number; y: number; angle: number; kind: TargetKind }`, with event `threats: ThreatArrow[]`
  - `class Chevrons { constructor(scene: THREE.Scene); update(targets: readonly Target[], camera: THREE.Camera, time: number): void }`
  - `CONFIG.readability = { threatKinds: ['blimp', 'sam', 'artillery', 'truck'], maxArrows: 8, arrowMarginPx: 28, chevronMax: 80 }`

- [ ] **Step 1: Write the failing test**

`src/systems/edgeArrows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { edgeArrow } from './edgeArrows';

const W = 400;
const H = 800;
const M = 20;

describe('edgeArrow', () => {
  it('returns null for points on screen', () => {
    expect(edgeArrow(0.3, -0.5, false, W, H, M)).toBeNull();
  });
  it('pins a point far to the right onto the right edge, pointing right', () => {
    const a = edgeArrow(5, 0, false, W, H, M)!;
    expect(a.x).toBeCloseTo(W - M);
    expect(a.y).toBeCloseTo(H / 2);
    expect(a.angle).toBeCloseTo(0);
  });
  it('pins a point above onto the top edge, pointing up', () => {
    const a = edgeArrow(0, 3, false, W, H, M)!;
    expect(a.y).toBeCloseTo(M);
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
  });
  it('mirrors points behind the camera (they show on the opposite edge)', () => {
    const a = edgeArrow(0, 0.4, true, W, H, M)!;
    expect(a.y).toBeCloseTo(H - M);
    expect(a.angle).toBeCloseTo(Math.PI / 2);
  });
  it('always stays inside the margin box', () => {
    for (const [x, y] of [[9, 9], [-9, 2], [0.2, -40], [-3, -3]] as const) {
      const a = edgeArrow(x, y, false, W, H, M)!;
      expect(a.x).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.x).toBeLessThanOrEqual(W - M + 1e-6);
      expect(a.y).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.y).toBeLessThanOrEqual(H - M + 1e-6);
    }
  });
});
```

Run: `npx vitest run src/systems/edgeArrows.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `edgeArrow`**

`src/systems/edgeArrows.ts`:

```ts
/**
 * Screen-edge indicator for a projected point (NDC from Vector3.project). Returns null when the point
 * is on screen. Points behind the camera are mirrored so the arrow points the way to turn.
 * angle is in screen space (radians, 0 = right, +π/2 = down).
 */
export function edgeArrow(
  ndcX: number,
  ndcY: number,
  behind: boolean,
  w: number,
  h: number,
  margin: number,
): { x: number; y: number; angle: number } | null {
  if (!behind && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) return null;
  let dx = behind ? -ndcX : ndcX;
  let dy = behind ? ndcY : -ndcY; // screen y points down
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) dy = 1;
  const hw = w / 2 - margin;
  const hh = h / 2 - margin;
  const k = Math.min(hw / Math.max(Math.abs(dx), 1e-9), hh / Math.max(Math.abs(dy), 1e-9));
  dx *= k;
  dy *= k;
  return { x: w / 2 + dx, y: h / 2 + dy, angle: Math.atan2(dy, dx) };
}
```

Run: `npx vitest run src/systems/edgeArrows.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 3: Implement `Chevrons`, the threats event, and the UI**

Add to `src/config.ts`:

```ts
  readability: {
    threatKinds: ['blimp', 'sam', 'artillery', 'truck'] as readonly string[],
    maxArrows: 8,
    arrowMarginPx: 28,
    chevronMax: 80,
  },
```

Add `chevron: 0xff3b2f,` to `palette`.

`src/systems/Chevrons.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Red downward chevrons floating over every live enemy, sized by camera distance so they stay readable. */
export class Chevrons {
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.ConeGeometry(0.5, 1, 3).rotateX(Math.PI);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: CONFIG.palette.chevron, fog: false }), CONFIG.readability.chevronMax);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(targets: readonly Target[], camera: THREE.Camera, time: number): void {
    let n = 0;
    for (const t of targets) {
      if (n >= CONFIG.readability.chevronMax) break;
      const d = camera.position.distanceTo(t.position);
      const size = Math.min(70, Math.max(16, d * 0.014));
      _p.copy(t.position);
      _p.y += t.radius * 0.6 + size * 1.6 + Math.sin(time * 5 + n) * size * 0.15;
      _q.setFromAxisAngle(_s.set(0, 1, 0), time * 2);
      _m.compose(_p, _q, _s.set(size, size * 1.2, size));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

`src/GameEvents.ts`:
- Add `import type { TargetKind } from './combat';`.
- Add `export type ThreatArrow = { x: number; y: number; angle: number; kind: TargetKind };`.
- Add `threats: ThreatArrow[];` to `GameEventMap`.

`GameScene`:
- Add the field `private chevrons: Chevrons;` and create it in the constructor.
- In `update()`, after the camera rig update, call `this.chevrons.update(this.enemyTargets(), this.camera, this.elapsed);` (it shows during level-up too).
- In the 10 Hz HUD block, also call `this.emitThreats();`:

```ts
  private emitThreats(): void {
    const el = this.pixel.domElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const kinds = CONFIG.readability.threatKinds;
    const m = this.monster.position;
    const list = this.enemyTargets()
      .filter((t) => kinds.includes(t.kind))
      .sort((a, b) => a.position.distanceToSquared(m) - b.position.distanceToSquared(m))
      .slice(0, CONFIG.readability.maxArrows);
    const out: ThreatArrow[] = [];
    for (const t of list) {
      this.tmpV.copy(t.position).project(this.camera);
      const behind = this.tmpV.z > 1;
      const a = edgeArrow(this.tmpV.x, this.tmpV.y, behind, w, h, CONFIG.readability.arrowMarginPx);
      if (a) out.push({ ...a, kind: t.kind });
    }
    this.events.emit('threats', out);
  }
```

`src/ui/EdgeArrows.tsx`:

```tsx
import type { ThreatArrow } from '../GameEvents';

const ICON: Partial<Record<ThreatArrow['kind'], string>> = { blimp: '🎈', sam: '🚀', artillery: '💣', truck: '🪝' };

export function EdgeArrows({ arrows }: { arrows: ThreatArrow[] }) {
  return (
    <div className="edge-arrows">
      {arrows.map((a, i) => (
        <div key={i} className="edge-arrow" style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>
          <div className="edge-arrow-head" style={{ transform: `rotate(${a.angle}rad)` }} />
          <span className="edge-arrow-icon">{ICON[a.kind] ?? '!'}</span>
        </div>
      ))}
    </div>
  );
}
```

`App.tsx`:
- Add `const [threats, setThreats] = useState<ThreatArrow[]>([]);`.
- Subscribe with `game.events.on('threats', setThreats);`.
- Render `{state === 'playing' && <EdgeArrows arrows={threats} />}` before the HUD inside `.hud`.

`style.css`:

```css
.edge-arrows { position: absolute; inset: 0; pointer-events: none; }
.edge-arrow { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: transform 100ms linear; }
.edge-arrow-head {
  position: absolute; left: -9px; top: -9px; width: 18px; height: 18px;
  clip-path: polygon(100% 50%, 0 0, 25% 50%, 0 100%);
  background: var(--color-danger, #ff3b2f);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
.edge-arrow-icon { position: absolute; left: -10px; top: 10px; font-size: 14px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Screenshot check: run the game with tanks around and confirm red chevrons float above each tank and jet at both sizes.
Edge arrows are checked in Task 4, once blimps exist.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add enemy chevrons and off-screen threat arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Kamikaze blimps

A slow airborne bomb that drifts to the monster's head and detonates. Shooting it down early is
the counter.

**Files:**
- Create: `src/enemies/Blimps.ts`
- Modify: `src/config.ts`, `src/GameScene.ts`

**Interfaces:**
- Consumes: `EnemySystem`, `WorldContext`, `toonMat`, `faceted`.
- Produces: `class Blimps implements EnemySystem` (kind `'blimp'`); `CONFIG.blimp`.

- [ ] **Step 1: Add config**

```ts
  blimp: { hp: 180, speed: 40, size: 170, spawnDist: 2200, altitude: 520, headHeight: 330, triggerDist: 190, damage: 120, exp: 25 },
```

Add these palette entries: `blimp: 0xe6e2da, blimpTrim: 0xd8322a, blimpTrimDark: 0x5a1612`.

- [ ] **Step 2: Implement `Blimps`**

`src/enemies/Blimps.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';

const B = CONFIG.blimp;
const MAX = CONFIG.spawns.blimp.cap;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Blimp implements Target {
  readonly kind = 'blimp' as const;
  readonly airborne = true;
  readonly radius = B.size * 0.45;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  yaw = 0;
  flashT = 0;
  phase = Math.random() * 10;

  constructor(
    hp: number,
    private onDamage: (b: Blimp, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Kamikaze blimps: drift to the monster's head and detonate unless shot down first. */
export class Blimps implements EnemySystem {
  readonly kind = 'blimp' as const;
  private blimps: Blimp[] = [];
  private envelope: THREE.InstancedMesh;
  private trim: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const env = faceted(new THREE.SphereGeometry(0.5, 10, 6)).scale(0.42, 0.42, 1);
    this.envelope = new THREE.InstancedMesh(env, toonMat(P.blimp), MAX);
    const trimGeo = mergeGeometries([
      faceted(new THREE.CylinderGeometry(0.215, 0.215, 0.1, 10)).rotateX(Math.PI / 2),
      faceted(new THREE.BoxGeometry(0.12, 0.08, 0.28)).translate(0, -0.25, 0),
      faceted(new THREE.BoxGeometry(0.02, 0.22, 0.14)).translate(0, 0.14, -0.44),
      faceted(new THREE.BoxGeometry(0.22, 0.02, 0.14)).translate(0, 0, -0.44),
    ])!;
    this.trim = new THREE.InstancedMesh(trimGeo, toonMat(0xffffff), MAX);
    for (const m of [this.envelope, this.trim]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      for (let i = 0; i < MAX; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
    }
  }

  targets(): readonly Target[] {
    return this.blimps;
  }

  count(): number {
    return this.blimps.length;
  }

  clear(): void {
    this.blimps = [];
    this.draw(0);
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.blimps.length >= MAX) return;
    const b = new Blimp(B.hp * ctx.difficulty.hpMult, this.damage);
    const a = ctx.rng() * Math.PI * 2;
    const m = ctx.monster.position;
    b.position.set(m.x + Math.cos(a) * B.spawnDist, B.altitude, m.z + Math.sin(a) * B.spawnDist);
    this.blimps.push(b);
  }

  private damage = (b: Blimp, amount: number): void => {
    if (!b.alive) return;
    b.hp -= amount;
    b.flashT = 0.1;
    if (b.hp > 0) return;
    b.alive = false;
    this.ctx?.particles.explosion(b.position, 2.5);
    this.ctx?.onDestroyed(b, B.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    _aim.set(m.x, B.headHeight * CONFIG.monster.scale, m.z);
    for (let i = this.blimps.length - 1; i >= 0; i--) {
      const b = this.blimps[i]!;
      if (!b.alive) {
        this.blimps.splice(i, 1);
        continue;
      }
      b.flashT = Math.max(0, b.flashT - dt);
      b.phase += dt;
      const d = b.position.distanceTo(_aim);
      if (d <= B.triggerDist && ctx.monster.alive) {
        b.alive = false;
        ctx.particles.explosion(b.position, 3.5);
        ctx.particles.ring('dust', b.position.clone().setY(0), 200, 16);
        ctx.shake(0.5);
        ctx.damageMonster(B.damage, 'blimp');
        this.blimps.splice(i, 1);
        continue;
      }
      const step = Math.min(d, B.speed * dt);
      b.position.addScaledVector(_s.subVectors(_aim, b.position).normalize(), step);
      b.position.y += Math.sin(b.phase * 1.3) * 6 * dt;
      b.yaw = Math.atan2(_aim.x - b.position.x, _aim.z - b.position.z);
    }
    this.draw(ctx.minutes * 60);
  }

  private draw(time: number): void {
    const P = CONFIG.palette;
    this.blimps.forEach((b, i) => {
      _q.setFromAxisAngle(UP, b.yaw);
      _m.compose(b.position, _q, _s.setScalar(B.size));
      this.envelope.setMatrixAt(i, _m);
      this.trim.setMatrixAt(i, _m);
      this.envelope.setColorAt(i, _c.setHex(b.flashT > 0 ? 0xffd0a0 : 0xffffff));
      const blink = Math.floor(time * 2 + b.phase) % 2 === 0;
      this.trim.setColorAt(i, _c.setHex(blink ? P.blimpTrim : P.blimpTrimDark));
    });
    for (const m of [this.envelope, this.trim]) {
      m.count = this.blimps.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
```

In `GameScene`'s constructor, register it: `this.enemies.add(new Blimps(this.scene));`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check with Playwright:
1. Load the page, wait 2 s, then call `const g = window.__game; for (let i = 0; i < 3; i++) g.enemies.get('blimp').spawn(g.ctx);`.
2. Every 2 s, log `g.enemies.counts().blimp` and `g.monster.hp`.
3. Screenshot at 4 s.

Expected:
- Blimps exist and appear in screenshots as white envelopes with red trim and chevrons.
- When off-screen, a `threats` event includes `kind: 'blimp'`. Subscribe with `g.events.on('threats', ...)`.
- Either auto-defense shoots them down (EXP rises) or one detonates and HP drops by about 120.

**Look checkpoint:** show the blimp screenshot to the user, keep going, and retune from their feedback.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add kamikaze blimps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: SAM silos and shootable missiles

**Files:**
- Create: `src/enemies/SamSilos.ts`
- Modify: `src/config.ts`, `src/GameScene.ts`

**Interfaces:**
- Consumes: `EnemySystem`, `WorldContext`, `steerToward`, `snapToRoad`, `ROAD_ORIGIN`.
- Produces: `class SamSilos implements EnemySystem` (kind `'sam'`). `targets()` returns raised silos (`'sam'`) plus in-flight missiles (`'missile'`). `count()` is silos only.

- [ ] **Step 1: Add config**

```ts
  sam: {
    hp: 260, exp: 30, size: 70, spawnMin: 600, spawnMax: 1400,
    riseTime: 1, upTime: 6, sinkTime: 1, downMin: 4, downMax: 6, fireDelay: 1.2,
    missiles: 4, missileSpeed: 300, missileTurn: 1.6, missileDamage: 35, missileExp: 2, missileTtl: 12, missileHitDist: 120,
  },
```

Add these palette entries: `samHatch: 0x2e3236, samLauncher: 0x7d8a6a, missile: 0xf2f2ee`.

- [ ] **Step 2: Implement `SamSilos`**

`src/enemies/SamSilos.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import { ROAD_ORIGIN } from '../world/chunks';
import { snapToRoad } from '../world/roads';
import { steerToward } from './steer';
import type { EnemySystem, WorldContext } from './types';

const C = CONFIG.sam;
const MAX = CONFIG.spawns.sam.cap;
const MAX_MISSILES = MAX * C.missiles * 2;
type Phase = 'rising' | 'up' | 'sinking' | 'down';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _d = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

class Silo implements Target {
  readonly kind = 'sam' as const;
  readonly airborne = false;
  readonly radius = C.size * 0.6;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  phase: Phase = 'rising';
  t = 0;
  raise = 0;
  fired = false;
  downFor = C.downMin;

  constructor(
    hp: number,
    private onDamage: (s: Silo, amount: number) => void,
  ) {
    this.hp = hp;
  }

  /** Targetable only while mostly raised. */
  isAlive(): boolean {
    return this.alive && this.raise > 0.5;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

class Missile implements Target {
  readonly kind = 'missile' as const;
  readonly airborne = true;
  readonly radius = 25;
  readonly position = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 1, 0);
  alive = true;
  age = 0;
  trailT = 0;

  constructor(private onDamage: (m: Missile) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(): void {
    this.onDamage(this);
  }
}

/** Silos rise from hatches, fire a homing volley, and sink back. Missiles can be shot down. */
export class SamSilos implements EnemySystem {
  readonly kind = 'sam' as const;
  private silos: Silo[] = [];
  private missiles: Missile[] = [];
  private hatch: THREE.InstancedMesh;
  private launcher: THREE.InstancedMesh;
  private missileMesh: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    this.hatch = new THREE.InstancedMesh(faceted(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 8)), toonMat(P.samHatch), MAX);
    const tubes = [-0.18, 0.18].flatMap((x) => [-0.18, 0.18].map((z) => faceted(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 6)).translate(x, 0.75, z)));
    this.launcher = new THREE.InstancedMesh(mergeGeometries([faceted(new THREE.BoxGeometry(0.8, 0.5, 0.8)).translate(0, 0.25, 0), ...tubes])!, toonMat(P.samLauncher), MAX);
    this.missileMesh = new THREE.InstancedMesh(faceted(new THREE.ConeGeometry(0.5, 1, 5)), new THREE.MeshBasicMaterial({ color: P.missile }), MAX_MISSILES);
    for (const m of [this.hatch, this.launcher, this.missileMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = m !== this.missileMesh;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  targets(): readonly Target[] {
    return [...this.silos, ...this.missiles];
  }

  count(): number {
    return this.silos.length;
  }

  clear(): void {
    this.silos = [];
    this.missiles = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.silos.length >= MAX) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = C.spawnMin + ctx.rng() * (C.spawnMax - C.spawnMin);
    const m = ctx.monster.position;
    const pitch = CONFIG.world.blockSize;
    const s = new Silo(C.hp * ctx.difficulty.hpMult, this.damageSilo);
    s.position.set(snapToRoad(m.x + Math.cos(a) * r, ROAD_ORIGIN, pitch), C.size * 0.4, snapToRoad(m.z + Math.sin(a) * r, ROAD_ORIGIN, pitch));
    ctx.particles.ring('dust', s.position.clone().setY(0), C.size * 1.5, 10);
    this.silos.push(s);
  }

  private damageSilo = (s: Silo, amount: number): void => {
    if (!s.isAlive()) return;
    s.hp -= amount;
    if (s.hp > 0) return;
    s.alive = false;
    this.ctx?.particles.explosion(s.position, 2);
    this.ctx?.onDestroyed(s, C.exp);
  };

  private damageMissile = (m: Missile): void => {
    if (!m.alive) return;
    m.alive = false;
    this.ctx?.particles.explosion(m.position, 0.5);
    this.ctx?.onDestroyed(m, C.missileExp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const mp = ctx.monster.position;
    _aim.set(mp.x, 280 * CONFIG.monster.scale, mp.z);

    for (let i = this.silos.length - 1; i >= 0; i--) {
      const s = this.silos[i]!;
      if (!s.alive) {
        this.silos.splice(i, 1);
        continue;
      }
      s.t += dt;
      if (s.phase === 'rising') {
        s.raise = Math.min(1, s.t / C.riseTime);
        if (s.t >= C.riseTime) this.enter(s, 'up');
      } else if (s.phase === 'up') {
        if (!s.fired && s.t >= C.fireDelay && ctx.monster.alive) {
          s.fired = true;
          for (let k = 0; k < C.missiles; k++) this.launch(s, k, ctx);
        }
        if (s.t >= C.upTime) this.enter(s, 'sinking');
      } else if (s.phase === 'sinking') {
        s.raise = Math.max(0, 1 - s.t / C.sinkTime);
        if (s.t >= C.sinkTime) {
          s.downFor = C.downMin + ctx.rng() * (C.downMax - C.downMin);
          this.enter(s, 'down');
        }
      } else if (s.t >= s.downFor) {
        s.fired = false;
        ctx.particles.ring('dust', s.position.clone().setY(0), C.size * 1.2, 8);
        this.enter(s, 'rising');
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      if (!m.alive) {
        this.missiles.splice(i, 1);
        continue;
      }
      m.age += dt;
      steerToward(m.dir, _d.subVectors(_aim, m.position).normalize(), C.missileTurn * dt);
      m.position.addScaledVector(m.dir, C.missileSpeed * dt);
      m.trailT += dt;
      if (m.trailT > 0.06) {
        m.trailT = 0;
        ctx.particles.emit('smoke', m.position, 1, 0.15);
      }
      if (m.position.distanceTo(_aim) < C.missileHitDist) {
        m.alive = false;
        ctx.particles.explosion(m.position, 0.8);
        ctx.damageMonster(C.missileDamage, 'missile');
      } else if (m.age > C.missileTtl || m.position.y < 0) {
        m.alive = false;
        ctx.particles.explosion(m.position, 0.5);
      }
    }
    this.draw();
  }

  private enter(s: Silo, p: Phase): void {
    s.phase = p;
    s.t = 0;
  }

  private launch(s: Silo, k: number, ctx: WorldContext): void {
    if (this.missiles.length >= MAX_MISSILES) return;
    const m = new Missile(this.damageMissile);
    m.position.set(s.position.x + (k % 2 ? 1 : -1) * C.size * 0.18, C.size * 1.3, s.position.z + (k < 2 ? 1 : -1) * C.size * 0.18);
    m.dir.set((ctx.rng() - 0.5) * 0.3, 1, (ctx.rng() - 0.5) * 0.3).normalize();
    ctx.particles.emit('fire', m.position, 3, 0.4);
    this.missiles.push(m);
  }

  private draw(): void {
    this.silos.forEach((s, i) => {
      _m.compose(_p.set(s.position.x, 1, s.position.z), _q.identity(), _s.setScalar(C.size));
      this.hatch.setMatrixAt(i, _m);
      if (s.raise <= 0.01) {
        this.launcher.setMatrixAt(i, HIDDEN);
      } else {
        _m.compose(_p.set(s.position.x, -C.size * 1.5 * (1 - s.raise), s.position.z), _q.identity(), _s.setScalar(C.size));
        this.launcher.setMatrixAt(i, _m);
      }
    });
    this.missiles.forEach((m, i) => {
      _q.setFromUnitVectors(FWD, m.dir);
      _m.compose(m.position, _q, _s.set(10, 34, 10));
      this.missileMesh.setMatrixAt(i, _m);
    });
    this.hatch.count = this.launcher.count = this.silos.length;
    this.missileMesh.count = this.missiles.length;
    for (const m of [this.hatch, this.launcher, this.missileMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
```

Register it in `GameScene`: `this.enemies.add(new SamSilos(this.scene));`.

Missiles are `Target`s, so the existing auto-defense (`nearestInRange`) and spike targeting shoot them down without changes.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check:
1. Spawn 2 silos via `g.enemies.get('sam').spawn(g.ctx)`.
2. Sample every 1 s for 14 s: `g.enemies.get('sam').silos.map(s => s.phase)`, the missile count, `g.monster.hp`, and `g.kills`.

Expected:
- The phases cycle `rising → up → sinking → down`.
- 4 missiles launch per raised silo.
- Some missiles are shot down (kills rise) and others hit (HP drops by about 35 each).

Take a screenshot while raised. **Look checkpoint.**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add SAM silos with shootable homing missiles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Artillery batteries and telegraphed strike circles

**Files:**
- Create: `src/enemies/artilleryMath.ts`, `src/enemies/artilleryMath.test.ts`, `src/enemies/Artillery.ts`
- Modify: `src/config.ts`, `src/GameScene.ts`

**Interfaces:**
- Produces:
  - `strikeFill(t: number, fillTime: number): number`
  - `strikeHits(monster: Vec2, strike: Vec2, radius: number): boolean`
  - `salvoSize(minutes: number): number`
  - `strikePoints(center: Vec2, n: number, spread: number, rng: () => number): Vec2[]`
  - `class Artillery implements EnemySystem` (kind `'artillery'`; targets are guns of kind `'artillery'`; `count()` = batteries)

- [ ] **Step 1: Add config and write the failing tests**

Config:

```ts
  artillery: {
    hp: 120, exp: 20, size: 40, guns: 3, gunSpacing: 70, distMin: 2500, distMax: 3500,
    salvoEvery: 6, fillTime: 2, radius: 90, damage: 60, buildingDamage: 200, spread: 260,
    baseSalvo: 3, unlockMin: 2.5, minutesPerExtra: 1.5, maxSalvo: 8,
  },
```

Add these palette entries: `strike: 0xff3b2f, artillery: 0x5f6b45`.

`src/enemies/artilleryMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { salvoSize, strikeFill, strikeHits, strikePoints } from './artilleryMath';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const A = CONFIG.artillery;

describe('strikeFill', () => {
  it('fills linearly from 0 to 1 over fillTime and clamps', () => {
    expect(strikeFill(0, 2)).toBe(0);
    expect(strikeFill(1, 2)).toBeCloseTo(0.5);
    expect(strikeFill(5, 2)).toBe(1);
    expect(strikeFill(-1, 2)).toBe(0);
  });
});

describe('strikeHits', () => {
  it('hits inside or on the radius, misses outside', () => {
    expect(strikeHits({ x: 0, z: 0 }, { x: 60, z: 0 }, 90)).toBe(true);
    expect(strikeHits({ x: 0, z: 0 }, { x: 90, z: 0 }, 90)).toBe(true);
    expect(strikeHits({ x: 0, z: 0 }, { x: 91, z: 0 }, 90)).toBe(false);
  });
});

describe('salvoSize', () => {
  it('starts at baseSalvo when artillery unlocks, grows with time, and caps', () => {
    expect(salvoSize(A.unlockMin)).toBe(A.baseSalvo);
    expect(salvoSize(A.unlockMin + A.minutesPerExtra)).toBe(A.baseSalvo + 1);
    expect(salvoSize(0)).toBe(A.baseSalvo);
    expect(salvoSize(999)).toBe(A.maxSalvo);
  });
});

describe('strikePoints', () => {
  it('returns n points within spread, the first exactly on the centre', () => {
    const c = { x: 500, z: -200 };
    const pts = strikePoints(c, 5, 260, mulberry32(1));
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(c);
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThanOrEqual(260);
  });
});
```

Run: `npx vitest run src/enemies/artilleryMath.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `artilleryMath.ts`**

```ts
import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

export function strikeFill(t: number, fillTime: number): number {
  return Math.min(1, Math.max(0, t / fillTime));
}

export function strikeHits(monster: Vec2, strike: Vec2, radius: number): boolean {
  return Math.hypot(monster.x - strike.x, monster.z - strike.z) <= radius;
}

/** Strikes per salvo: baseSalvo at unlock, +1 every minutesPerExtra, capped at maxSalvo. */
export function salvoSize(minutes: number): number {
  const A = CONFIG.artillery;
  const extra = Math.floor(Math.max(0, minutes - A.unlockMin) / A.minutesPerExtra);
  return Math.min(A.maxSalvo, A.baseSalvo + extra);
}

/** First strike on `center` (where the monster is); the rest scattered uniformly within `spread`. */
export function strikePoints(center: Vec2, n: number, spread: number, rng: () => number): Vec2[] {
  const out: Vec2[] = [{ x: center.x, z: center.z }];
  for (let i = 1; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * spread;
    out.push({ x: center.x + Math.cos(a) * d, z: center.z + Math.sin(a) * d });
  }
  return out;
}
```

Run: `npx vitest run src/enemies/artilleryMath.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 3: Implement `Artillery`**

`src/enemies/Artillery.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import type { Vec2 } from '../util/math';
import { salvoSize, strikeFill, strikeHits, strikePoints } from './artilleryMath';
import type { EnemySystem, WorldContext } from './types';

const A = CONFIG.artillery;
const MAX_BATTERIES = CONFIG.spawns.artillery.cap;
const MAX_GUNS = MAX_BATTERIES * A.guns;
const MAX_STRIKES = 32;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Barrel elevation, applied after the gun's yaw. */
const _pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6);

class Gun implements Target {
  readonly kind = 'artillery' as const;
  readonly airborne = false;
  readonly radius = A.size * 0.7;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  yaw = 0;

  constructor(
    hp: number,
    private onDamage: (g: Gun, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

type Battery = { guns: Gun[]; salvoT: number };
type Strike = { at: Vec2; t: number };

/** Far-off gun batteries; each salvo paints red circles that fill, then shells land. */
export class Artillery implements EnemySystem {
  readonly kind = 'artillery' as const;
  private batteries: Battery[] = [];
  private strikes: Strike[] = [];
  private gunMesh: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private fillMesh: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const gunGeo = faceted(new THREE.BoxGeometry(1, 0.5, 1.2)).translate(0, 0.25, 0);
    // Body and barrel are two instances of the same box per gun.
    this.gunMesh = new THREE.InstancedMesh(gunGeo, toonMat(P.artillery), MAX_GUNS * 2);
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.9, depthWrite: false }), MAX_STRIKES);
    this.fillMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.strike, transparent: true, opacity: 0.35, depthWrite: false }), MAX_STRIKES);
    this.gunMesh.castShadow = true;
    for (const m of [this.gunMesh, this.ringMesh, this.fillMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.ringMesh.renderOrder = this.fillMesh.renderOrder = 2;
  }

  targets(): readonly Target[] {
    return this.batteries.flatMap((b) => b.guns);
  }

  count(): number {
    return this.batteries.length;
  }

  clear(): void {
    this.batteries = [];
    this.strikes = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.batteries.length >= MAX_BATTERIES) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = A.distMin + ctx.rng() * (A.distMax - A.distMin);
    const m = ctx.monster.position;
    const cx = m.x + Math.cos(a) * r;
    const cz = m.z + Math.sin(a) * r;
    const guns: Gun[] = [];
    for (let i = 0; i < A.guns; i++) {
      const g = new Gun(A.hp * ctx.difficulty.hpMult, this.damage);
      const off = (i - (A.guns - 1) / 2) * A.gunSpacing;
      g.position.set(cx - Math.sin(a) * off, A.size * 0.3, cz + Math.cos(a) * off);
      g.yaw = Math.atan2(m.x - cx, m.z - cz);
      guns.push(g);
    }
    this.batteries.push({ guns, salvoT: A.salvoEvery * 0.5 });
  }

  private damage = (g: Gun, amount: number): void => {
    if (!g.alive) return;
    g.hp -= amount;
    if (g.hp > 0) return;
    g.alive = false;
    this.ctx?.particles.explosion(g.position, 1.2);
    this.ctx?.onDestroyed(g, A.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    for (let i = this.batteries.length - 1; i >= 0; i--) {
      const b = this.batteries[i]!;
      b.guns = b.guns.filter((g) => g.alive);
      if (b.guns.length === 0) {
        this.batteries.splice(i, 1);
        continue;
      }
      for (const g of b.guns) g.yaw = Math.atan2(m.x - g.position.x, m.z - g.position.z);
      b.salvoT -= dt;
      if (b.salvoT <= 0 && ctx.monster.alive) {
        b.salvoT = A.salvoEvery;
        for (const g of b.guns) ctx.particles.emit('fire', _p.copy(g.position).setY(A.size), 3, 0.3);
        for (const at of strikePoints({ x: m.x, z: m.z }, salvoSize(ctx.minutes), A.spread, ctx.rng)) {
          if (this.strikes.length < MAX_STRIKES) this.strikes.push({ at, t: 0 });
        }
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]!;
      s.t += dt;
      if (s.t < A.fillTime) continue;
      _p.set(s.at.x, 10, s.at.z);
      ctx.particles.explosion(_p, 1.4);
      ctx.particles.ring('dust', _p.setY(0), A.radius, 10);
      ctx.shake(0.2);
      ctx.damageBuildings(s.at, A.radius, A.buildingDamage);
      if (strikeHits({ x: m.x, z: m.z }, s.at, A.radius)) ctx.damageMonster(A.damage, 'artillery');
      this.strikes.splice(i, 1);
    }
    this.draw();
  }

  private draw(): void {
    let n = 0;
    for (const b of this.batteries) {
      for (const g of b.guns) {
        _q.setFromAxisAngle(UP, g.yaw);
        _m.compose(g.position, _q, _s.setScalar(A.size));
        this.gunMesh.setMatrixAt(n++, _m);
        // Barrel: a long thin instance pitched up toward the target.
        _p.set(Math.sin(g.yaw), 0, Math.cos(g.yaw)).multiplyScalar(A.size * 0.6).add(g.position).setY(A.size * 0.55);
        _q.setFromAxisAngle(UP, g.yaw).multiply(_pitch);
        _m.compose(_p, _q, _s.set(A.size * 0.15, A.size * 0.3, A.size * 1.3));
        this.gunMesh.setMatrixAt(n++, _m);
      }
    }
    this.gunMesh.count = n;
    this.strikes.forEach((s, i) => {
      _m.compose(_p.set(s.at.x, 3, s.at.z), _q.identity(), _s.setScalar(A.radius));
      this.ringMesh.setMatrixAt(i, _m);
      const f = Math.max(0.02, strikeFill(s.t, A.fillTime));
      _m.compose(_p.set(s.at.x, 2.5, s.at.z), _q.identity(), _s.set(A.radius * f, 1, A.radius * f));
      this.fillMesh.setMatrixAt(i, _m);
    });
    this.ringMesh.count = this.fillMesh.count = this.strikes.length;
    for (const m of [this.gunMesh, this.ringMesh, this.fillMesh]) m.instanceMatrix.needsUpdate = true;
  }
}
```

Register it in `GameScene`: `this.enemies.add(new Artillery(this.scene));`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check:
1. Spawn a battery via `g.enemies.get('artillery').spawn(g.ctx)`.
2. Wait 4 s.
3. Screenshot (circles should be visible around the monster), and confirm a `threats` event includes `'artillery'`.
4. Then, with the monster standing still, check HP drops by about 60 per circle hit.
5. Then issue a move order away right after a salvo appears. HP should not drop from circles it left.

**Look checkpoint.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add artillery batteries with telegraphed strike circles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Grappling trucks and tethers

**Files:**
- Create: `src/monster/tether.ts`, `src/monster/tether.test.ts`, `src/enemies/GrappleTrucks.ts`
- Modify: `src/config.ts`, `src/monster/Monster.ts`, `src/GameEvents.ts`, `src/ui/Hud.tsx`, `src/style.css`, `src/GameScene.ts`

**Interfaces:**
- Produces:
  - `type Tether = { x: number; z: number; length: number }`
  - `clampToTethers(from: Vec2, to: Vec2, tethers: readonly Tether[]): Vec2`
  - `Monster.constrain: ((from: Vec2, to: Vec2) => Vec2) | null`
  - `class GrappleTrucks implements EnemySystem` (kind `'truck'`), with `activeTethers(): Tether[]`, `snapAll(): void` and `tethered(): boolean`
  - `HudSnapshot.tethered: boolean`

- [ ] **Step 1: Write the failing tests**

`src/monster/tether.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampToTethers } from './tether';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('clampToTethers', () => {
  const t = { x: 0, z: 0, length: 500 };

  it('passes moves through when there are no tethers or the move stays inside', () => {
    expect(clampToTethers({ x: 0, z: 0 }, { x: 900, z: 0 }, [])).toEqual({ x: 900, z: 0 });
    expect(clampToTethers({ x: 100, z: 0 }, { x: 200, z: 50 }, [t])).toEqual({ x: 200, z: 50 });
  });

  it('stops a move at the tether circle', () => {
    const p = clampToTethers({ x: 490, z: 0 }, { x: 520, z: 0 }, [t]);
    expect(d(p, t)).toBeCloseTo(500);
    expect(p.z).toBeCloseTo(0);
  });

  it('allows moving back inward even when starting outside the length', () => {
    expect(clampToTethers({ x: 700, z: 0 }, { x: 650, z: 0 }, [t])).toEqual({ x: 650, z: 0 });
  });

  it('does not let a start point outside the length drift further away', () => {
    const p = clampToTethers({ x: 700, z: 0 }, { x: 720, z: 0 }, [t]);
    expect(d(p, t)).toBeCloseTo(700);
  });

  it('keeps the monster inside every circle with opposing tethers, without teleporting', () => {
    const a = { x: -300, z: 0, length: 320 };
    const b = { x: 300, z: 0, length: 320 };
    const from = { x: 0, z: 0 };
    const to = { x: 0, z: 200 };
    const p = clampToTethers(from, to, [a, b]);
    expect(d(p, a)).toBeLessThanOrEqual(320 + 1e-6);
    expect(d(p, b)).toBeLessThanOrEqual(320 + 1e-6);
    expect(d(p, from)).toBeLessThanOrEqual(d(to, from) + 1e-6);
  });
});
```

Run: `npx vitest run src/monster/tether.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `clampToTethers`**

`src/monster/tether.ts`:

```ts
import type { Vec2 } from '../util/math';

export type Tether = { x: number; z: number; length: number };

/**
 * Clamp a proposed move so the monster never ends further from any anchor than that tether allows.
 * The allowed radius is max(length, current distance), so a monster already beyond its length can
 * move inward but not outward. Projections onto discs are non-expansive, so the result never lies
 * further from `from` than `to` does.
 */
export function clampToTethers(from: Vec2, to: Vec2, tethers: readonly Tether[]): Vec2 {
  if (tethers.length === 0) return to;
  let x = to.x;
  let z = to.z;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const t of tethers) {
      const allowed = Math.max(t.length, Math.hypot(from.x - t.x, from.z - t.z));
      const dx = x - t.x;
      const dz = z - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > allowed + 1e-9) {
        x = t.x + (dx / dist) * allowed;
        z = t.z + (dz / dist) * allowed;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}
```

Run: `npx vitest run src/monster/tether.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 3: Constrain monster movement**

In `src/monster/Monster.ts`, add the field `constrain: ((from: Vec2, to: Vec2) => Vec2) | null = null;`. In `moveToward`, replace the two position-update lines with:

```ts
      let nx = this.position.x + Math.sin(this.yaw) * step;
      let nz = this.position.z + Math.cos(this.yaw) * step;
      if (this.constrain) {
        const c = this.constrain({ x: this.position.x, z: this.position.z }, { x: nx, z: nz });
        nx = c.x;
        nz = c.z;
      }
      const moved = Math.hypot(nx - this.position.x, nz - this.position.z);
      this.position.x = nx;
      this.position.z = nz;
      this.cycle += moved / (CONFIG.monster.strideLength * CONFIG.monster.scale);
```

Then remove the old `this.cycle += step / ...` line. The legs then stop cycling when a tether holds the monster.

- [ ] **Step 4: Implement `GrappleTrucks`**

Config:

```ts
  truck: { hp: 70, exp: 22, size: 60, speed: 40, range: 900, anchorTime: 1, harpoonTime: 0.5, tetherTime: 6, slack: 50, cooldown: 4 },
```

Add these palette entries: `truck: 0x8a6d3b, truckDark: 0x3d3328, cable: 0x1d1f22`.

`src/enemies/GrappleTrucks.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { Tether } from '../monster/tether';
import { faceted, toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import { ROAD_ORIGIN } from '../world/chunks';
import { planRoadPath, snapToRoad } from '../world/roads';
import type { EnemySystem, WorldContext } from './types';

const T = CONFIG.truck;
const MAX = CONFIG.spawns.truck.cap;
const S = T.size;
type Phase = 'driving' | 'anchoring' | 'firing' | 'tethered' | 'cooldown';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _tilt = new THREE.Quaternion();

class Truck implements Target {
  readonly kind = 'truck' as const;
  readonly airborne = false;
  readonly radius = S * 0.6;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  phase: Phase = 'driving';
  t = 0;
  heading = 0;
  path: Vec2[] = [];
  replanT = 0;
  tether: Tether | null = null;
  tetherTtl = 0;

  constructor(
    hp: number,
    private onDamage: (t: Truck, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Trucks drive in on roads, anchor, and harpoon the monster; the cable limits how far it can walk. */
export class GrappleTrucks implements EnemySystem {
  readonly kind = 'truck' as const;
  private trucks: Truck[] = [];
  private cab: THREE.InstancedMesh;
  private bed: THREE.InstancedMesh;
  private cable: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const box = faceted(new THREE.BoxGeometry(1, 1, 1));
    this.cab = new THREE.InstancedMesh(box, toonMat(P.truck), MAX * 2);
    this.bed = new THREE.InstancedMesh(box, toonMat(P.truckDark), MAX * 2);
    this.cable = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 4), new THREE.MeshBasicMaterial({ color: P.cable }), MAX);
    for (const m of [this.cab, this.bed, this.cable]) {
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = true;
      scene.add(m);
    }
  }

  targets(): readonly Target[] {
    return this.trucks;
  }

  count(): number {
    return this.trucks.length;
  }

  clear(): void {
    this.trucks = [];
    this.draw();
  }

  activeTethers(): Tether[] {
    const out: Tether[] = [];
    for (const t of this.trucks) if (t.phase === 'tethered' && t.tether) out.push(t.tether);
    return out;
  }

  tethered(): boolean {
    return this.trucks.some((t) => t.phase === 'tethered');
  }

  /** Leap/Roar: break every cable; Thrash damages the truck on each snap. */
  snapAll(): void {
    for (const t of this.trucks) {
      if (t.phase !== 'tethered' && t.phase !== 'firing') continue;
      this.release(t);
      const dmg = this.ctx?.thrashDamage ?? 0;
      if (dmg > 0) t.applyDamage(dmg);
    }
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.trucks.length >= MAX) return;
    const a = ctx.rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + ctx.rng() * 0.3);
    const m = ctx.monster.position;
    const t = new Truck(T.hp * ctx.difficulty.hpMult, this.damage);
    t.position.set(snapToRoad(m.x + Math.cos(a) * r, ROAD_ORIGIN, CONFIG.world.blockSize), S * 0.3, m.z + Math.sin(a) * r);
    this.trucks.push(t);
  }

  private damage = (t: Truck, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp > 0) return;
    t.alive = false;
    t.tether = null;
    this.ctx?.particles.explosion(t.position, 1.3);
    this.ctx?.onDestroyed(t, T.exp);
  };

  private release(t: Truck): void {
    t.tether = null;
    t.phase = 'cooldown';
    t.t = 0;
    this.ctx?.particles.emit('spark', _p.copy(t.position).setY(S), 8);
  }

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const mp = ctx.monster.position;
    const goal = { x: mp.x, z: mp.z };
    for (let i = this.trucks.length - 1; i >= 0; i--) {
      const t = this.trucks[i]!;
      if (!t.alive) {
        this.trucks.splice(i, 1);
        continue;
      }
      t.t += dt;
      const here = { x: t.position.x, z: t.position.z };
      const d = dist2(here, goal);
      if (t.phase !== 'driving') t.heading = Math.atan2(goal.x - here.x, goal.z - here.z);
      switch (t.phase) {
        case 'driving': {
          if (d <= T.range && ctx.monster.alive) {
            t.phase = 'anchoring';
            t.t = 0;
            ctx.particles.ring('dust', _p.copy(t.position).setY(0), S * 1.5, 10);
            ctx.shake(0.05);
            break;
          }
          t.replanT -= dt;
          if (t.path.length === 0 || t.replanT <= 0) {
            t.path = planRoadPath(here, goal, ROAD_ORIGIN, CONFIG.world.blockSize);
            t.replanT = 4;
          }
          const wp = t.path[0];
          if (!wp) break;
          const wd = dist2(here, wp);
          const step = Math.min(wd, T.speed * dt);
          if (wd > 1e-3) {
            t.heading = Math.atan2(wp.x - here.x, wp.z - here.z);
            t.position.x += ((wp.x - here.x) / wd) * step;
            t.position.z += ((wp.z - here.z) / wd) * step;
          }
          if (wd - step < 1) t.path.shift();
          break;
        }
        case 'anchoring':
          if (t.t >= T.anchorTime) {
            t.phase = 'firing';
            t.t = 0;
            ctx.particles.emit('fire', _p.copy(t.position).setY(S), 4, 0.4);
          }
          break;
        case 'firing':
          if (t.t >= T.harpoonTime) {
            t.phase = 'tethered';
            t.t = 0;
            t.tether = { x: t.position.x, z: t.position.z, length: d + T.slack };
            t.tetherTtl = T.tetherTime * ctx.tetherDurationMult;
            ctx.shake(0.15);
          }
          break;
        case 'tethered':
          if (t.t >= t.tetherTtl || !ctx.monster.alive) this.release(t);
          break;
        case 'cooldown':
          if (t.t >= T.cooldown) {
            t.phase = d <= T.range ? 'firing' : 'driving';
            t.t = 0;
          }
          break;
      }
    }
    this.draw();
  }

  private draw(): void {
    const mp = this.ctx?.monster.position;
    let n = 0;
    this.trucks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _m.compose(_p.set(t.position.x, S * 0.25, t.position.z), _q, _s.set(S * 0.5, S * 0.45, S * 1.4));
      this.bed.setMatrixAt(i * 2, _m);
      _p.set(Math.sin(t.heading), 0, Math.cos(t.heading)).multiplyScalar(S * 0.75).add(t.position).setY(S * 0.4);
      _m.compose(_p, _q, _s.set(S * 0.5, S * 0.6, S * 0.4));
      this.cab.setMatrixAt(i * 2, _m);
      // Harpoon cannon on the bed, tilted toward the monster when deployed.
      const tilt = t.phase === 'driving' ? 0 : -0.5;
      _q.setFromAxisAngle(UP, t.heading).multiply(_tilt.setFromAxisAngle(X_AXIS, tilt));
      _m.compose(_p.copy(t.position).setY(S * 0.65), _q, _s.set(S * 0.18, S * 0.18, S * 0.9));
      this.cab.setMatrixAt(i * 2 + 1, _m);
      this.bed.setMatrixAt(i * 2 + 1, HIDDEN);
      if (mp && (t.phase === 'firing' || t.phase === 'tethered')) {
        const k = t.phase === 'firing' ? Math.min(1, t.t / T.harpoonTime) : 1;
        _a.copy(t.position).setY(S * 0.7);
        _b.set(mp.x, 250 * CONFIG.monster.scale, mp.z);
        _b.lerpVectors(_a, _b, k);
        const len = _a.distanceTo(_b);
        _p.addVectors(_a, _b).multiplyScalar(0.5);
        _q.setFromUnitVectors(UP, _s.subVectors(_b, _a).normalize());
        _m.compose(_p, _q, _s.set(4, len, 4));
        this.cable.setMatrixAt(n++, _m);
      }
    });
    this.cab.count = this.bed.count = this.trucks.length * 2;
    this.cable.count = n;
    for (const m of [this.cab, this.bed, this.cable]) m.instanceMatrix.needsUpdate = true;
  }
}
```

- [ ] **Step 5: Wire the trucks, the tether clamp, and the HUD warning into `GameScene`**

- Register the system: `this.enemies.add(new GrappleTrucks(this.scene));`.
- In the constructor, after the registry: `this.monster.constrain = (from, to) => clampToTethers(from, to, this.enemies.get<GrappleTrucks>('truck').activeTethers());`.
- In `GameEvents.ts`, add `tethered: boolean;` to `HudSnapshot`.
- In `emitHud`, add `tethered: this.enemies.get<GrappleTrucks>('truck').tethered(),`.
- In App's `EMPTY_HUD`, add `tethered: false`.
- In `ui/Hud.tsx`, add `{hud.tethered && <div className="hud-tethered">Tethered</div>}` after `.hud-row`.

`style.css`:

```css
.hud-tethered {
  margin: 8px auto 0;
  width: max-content;
  padding: 4px 10px;
  border-radius: 3px;
  background: rgba(255, 59, 47, 0.85);
  font-weight: 700;
  animation: tethered-blink 600ms steps(2) infinite;
}
@keyframes tethered-blink { 50% { opacity: 0.45; } }
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check:
1. Spawn 2 trucks.
2. Sample `phase` until one is `'tethered'`.
3. Then order the monster to move 2 km away and wait 2 s.

Expected:
- Monster distance from that truck ≤ tether length + 1.
- The HUD shows TETHERED.
- After about 6 s the tether releases and the monster walks away.

Screenshot while tethered (a cable from truck to monster). **Look checkpoint.**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add grappling trucks with tethers that limit monster movement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Orbital laser

**Files:**
- Create: `src/enemies/laserPhases.ts`, `src/enemies/laserPhases.test.ts`, `src/enemies/OrbitalLaser.ts`
- Modify: `src/config.ts`, `src/GameScene.ts`

**Interfaces:**
- Produces:
  - `type LaserPhase = 'idle' | 'tracking' | 'locked' | 'firing' | 'cooldown'`
  - `type LaserState = { phase: LaserPhase; t: number; x: number; z: number; cooldownFor: number }`
  - `LASER_IDLE: LaserState`
  - `startLaser(s: LaserState, at: Vec2): LaserState`
  - `stepLaser(s: LaserState, dt: number, target: Vec2, roll: number): LaserState` (roll in [0, 1) picks the cooldown length)
  - `laserHits(s: LaserState, monster: Vec2): boolean`
  - `class OrbitalLaser implements EnemySystem` (kind `'laser'`; no targets; `count()` is 1 unless idle)

- [ ] **Step 1: Add config and write the failing tests**

```ts
  laser: {
    trackTime: 2.5, lockTime: 0.4, fireTime: 1.5, cooldownMin: 20, cooldownMax: 30,
    trackSpeed: 120, startOffset: 350, radius: 110, dps: 220, buildingDps: 400, beamHeight: 4000, scorchLife: 10,
  },
```

Add these palette entries: `laserFaint: 0xcfe8ff, laserCore: 0xf0ffff, scorch: 0x2a2620`.

`src/enemies/laserPhases.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LASER_IDLE, laserHits, startLaser, stepLaser, type LaserState } from './laserPhases';
import { CONFIG } from '../config';

const L = CONFIG.laser;
const run = (s: LaserState, seconds: number, target = { x: 0, z: 0 }, roll = 0.5) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) s = stepLaser(s, 0.05, target, roll);
  return s;
};

describe('orbital laser phases', () => {
  it('starts tracking at the given point, only from idle', () => {
    const s = startLaser(LASER_IDLE, { x: 300, z: 0 });
    expect(s).toMatchObject({ phase: 'tracking', x: 300, z: 0, t: 0 });
    expect(startLaser(s, { x: 0, z: 0 })).toBe(s);
  });

  it('tracks toward the target no faster than trackSpeed', () => {
    const s = stepLaser(startLaser(LASER_IDLE, { x: 300, z: 0 }), 0.5, { x: 0, z: 0 }, 0.5);
    expect(s.x).toBeCloseTo(300 - L.trackSpeed * 0.5);
  });

  it('goes tracking → locked → firing → cooldown → idle on schedule', () => {
    let s = startLaser(LASER_IDLE, { x: 0, z: 0 });
    s = run(s, L.trackTime + 0.01);
    expect(s.phase).toBe('locked');
    s = run(s, L.lockTime + 0.01);
    expect(s.phase).toBe('firing');
    s = run(s, L.fireTime + 0.01);
    expect(s.phase).toBe('cooldown');
    expect(s.cooldownFor).toBeCloseTo(L.cooldownMin + 0.5 * (L.cooldownMax - L.cooldownMin));
    s = run(s, s.cooldownFor + 0.06);
    expect(s.phase).toBe('idle');
  });

  it('freezes the point once locked', () => {
    let s = run(startLaser(LASER_IDLE, { x: 0, z: 0 }), L.trackTime + 0.01);
    const { x, z } = s;
    s = stepLaser(s, 0.2, { x: 999, z: 999 }, 0.5);
    expect(s.x).toBe(x);
    expect(s.z).toBe(z);
  });

  it('hits only while firing and inside the radius', () => {
    let s = run(startLaser(LASER_IDLE, { x: 0, z: 0 }), L.trackTime + L.lockTime + 0.05);
    expect(s.phase).toBe('firing');
    expect(laserHits(s, { x: s.x + L.radius - 1, z: s.z })).toBe(true);
    expect(laserHits(s, { x: s.x + L.radius + 1, z: s.z })).toBe(false);
    s = { ...s, phase: 'locked' };
    expect(laserHits(s, { x: s.x, z: s.z })).toBe(false);
  });
});
```

Run: `npx vitest run src/enemies/laserPhases.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `laserPhases.ts`**

```ts
import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

export type LaserPhase = 'idle' | 'tracking' | 'locked' | 'firing' | 'cooldown';
export type LaserState = { phase: LaserPhase; t: number; x: number; z: number; cooldownFor: number };

export const LASER_IDLE: LaserState = { phase: 'idle', t: 0, x: 0, z: 0, cooldownFor: 0 };

export function startLaser(s: LaserState, at: Vec2): LaserState {
  if (s.phase !== 'idle') return s;
  return { phase: 'tracking', t: 0, x: at.x, z: at.z, cooldownFor: 0 };
}

/** Advance one step. Tracking eases the strike point toward `target` at trackSpeed; later phases hold it. */
export function stepLaser(s: LaserState, dt: number, target: Vec2, roll: number): LaserState {
  const L = CONFIG.laser;
  const t = s.t + dt;
  switch (s.phase) {
    case 'idle':
      return s;
    case 'tracking': {
      const dx = target.x - s.x;
      const dz = target.z - s.z;
      const d = Math.hypot(dx, dz);
      const k = d > 1e-9 ? Math.min(1, (L.trackSpeed * dt) / d) : 0;
      const x = s.x + dx * k;
      const z = s.z + dz * k;
      return t >= L.trackTime ? { ...s, phase: 'locked', t: 0, x, z } : { ...s, t, x, z };
    }
    case 'locked':
      return t >= L.lockTime ? { ...s, phase: 'firing', t: 0 } : { ...s, t };
    case 'firing':
      return t >= L.fireTime
        ? { ...s, phase: 'cooldown', t: 0, cooldownFor: L.cooldownMin + roll * (L.cooldownMax - L.cooldownMin) }
        : { ...s, t };
    case 'cooldown':
      return t >= s.cooldownFor ? { ...LASER_IDLE } : { ...s, t };
  }
}

export function laserHits(s: LaserState, monster: Vec2): boolean {
  return s.phase === 'firing' && Math.hypot(monster.x - s.x, monster.z - s.z) <= CONFIG.laser.radius;
}
```

Run: `npx vitest run src/enemies/laserPhases.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 3: Implement `OrbitalLaser`**

`src/enemies/OrbitalLaser.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { LASER_IDLE, laserHits, startLaser, stepLaser, type LaserState } from './laserPhases';
import type { EnemySystem, WorldContext } from './types';

const L = CONFIG.laser;
const MAX_SCORCH = 6;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A strike from orbit: faint tracking beam, brief lock, then a burning column. Dodged, never destroyed. */
export class OrbitalLaser implements EnemySystem {
  readonly kind = 'laser' as const;
  private state: LaserState = { ...LASER_IDLE };
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private glowMat: THREE.MeshBasicMaterial;
  private scorch: THREE.InstancedMesh;
  private scorchMat: THREE.MeshBasicMaterial;
  private scorches: { x: number; z: number; age: number }[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: P.laserFaint, transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(cyl, this.beamMat);
    this.core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: P.laserCore, fog: false }));
    this.glowMat = new THREE.MeshBasicMaterial({ color: P.laserFaint, transparent: true, opacity: 0.4, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), this.glowMat);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: P.scorch, transparent: true, opacity: 0.75, depthWrite: false });
    this.scorch = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), this.scorchMat, MAX_SCORCH);
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    for (const o of [this.beam, this.core, this.glow]) {
      o.visible = false;
      o.frustumCulled = false;
      o.renderOrder = 3;
    }
    scene.add(this.beam, this.core, this.glow, this.scorch);
  }

  targets(): readonly Target[] {
    return [];
  }

  count(): number {
    return this.state.phase === 'idle' ? 0 : 1;
  }

  clear(): void {
    this.state = { ...LASER_IDLE };
    this.scorches = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    const m = ctx.monster.position;
    const a = ctx.rng() * Math.PI * 2;
    this.state = startLaser(this.state, { x: m.x + Math.cos(a) * L.startOffset, z: m.z + Math.sin(a) * L.startOffset });
  }

  update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const m = ctx.monster.position;
    const before = this.state.phase;
    this.state = stepLaser(this.state, dt, { x: m.x, z: m.z }, ctx.rng());
    const s = this.state;
    if (s.phase === 'firing') {
      if (before !== 'firing') ctx.shake(0.4);
      ctx.shake(0.08);
      if (ctx.monster.alive && laserHits(s, { x: m.x, z: m.z })) ctx.damageMonster(L.dps * dt, 'laser');
      ctx.damageBuildings({ x: s.x, z: s.z }, L.radius, L.buildingDps * dt);
      ctx.particles.emit('fire', _p.set(s.x, 5, s.z), 2, 1.2);
      ctx.particles.emit('smoke', _p.set(s.x, 20, s.z), 1, 1.5);
    }
    if (before === 'firing' && s.phase === 'cooldown') {
      if (this.scorches.length >= MAX_SCORCH) this.scorches.shift();
      this.scorches.push({ x: s.x, z: s.z, age: 0 });
    }
    for (const sc of this.scorches) sc.age += dt;
    this.scorches = this.scorches.filter((sc) => sc.age < L.scorchLife);
    this.draw();
  }

  private draw(): void {
    const s = this.state;
    const show = s.phase === 'tracking' || s.phase === 'locked' || s.phase === 'firing';
    this.beam.visible = this.glow.visible = show;
    this.core.visible = s.phase === 'firing';
    if (show) {
      const firing = s.phase === 'firing';
      const r = firing ? L.radius : s.phase === 'locked' ? 26 : 16 + Math.sin(this.time * 12) * 3;
      this.beam.position.set(s.x, 0, s.z);
      this.beam.scale.set(r, L.beamHeight, r);
      this.beamMat.opacity = firing ? 0.85 : s.phase === 'locked' ? 0.6 : 0.22 + 0.08 * Math.sin(this.time * 8);
      this.core.position.set(s.x, 0, s.z);
      this.core.scale.set(L.radius * 0.45, L.beamHeight, L.radius * 0.45);
      this.glow.position.set(s.x, 4, s.z);
      this.glow.scale.setScalar(firing ? L.radius * 1.4 : L.radius);
      this.glowMat.opacity = firing ? 0.7 : 0.25;
    }
    this.scorches.forEach((sc, i) => {
      _m.compose(_p.set(sc.x, 1.5, sc.z), _q.identity(), _s.set(L.radius, 1, L.radius).multiplyScalar(1 - (sc.age / L.scorchLife) * 0.3));
      this.scorch.setMatrixAt(i, _m);
    });
    this.scorch.count = this.scorches.length;
    this.scorch.instanceMatrix.needsUpdate = true;
  }
}
```

Register it in `GameScene`: `this.enemies.add(new OrbitalLaser(this.scene));`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check:
1. Call `g.enemies.get('laser').spawn(g.ctx)` with the monster idle.
2. Screenshot at +1 s (a faint beam near the monster) and at +3 s (bright column).
3. Log HP each 0.5 s.

Expected: HP drops only during firing, and only if the point reached the monster.

Repeat with a move order 600 m away issued at +1 s. Expected: no HP loss from the laser.

**Look checkpoint.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add telegraphed orbital laser strike

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Active abilities — Leap and Roar

**Files:**
- Create: `src/systems/abilities.ts`, `src/systems/abilities.test.ts`, `src/monster/leap.ts`, `src/monster/leap.test.ts`, `src/systems/Shockwave.ts`, `src/ui/AbilityButtons.tsx`
- Modify: `src/config.ts`, `src/monster/Monster.ts`, `src/systems/Input.ts`, `src/systems/Markers.ts`, `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx`, `src/style.css`

**Interfaces:**
- Produces:
  - `type ActiveId = 'leap' | 'roar'`
  - `type AbilityView = { id: ActiveId; unlocked: boolean; ready: boolean; cdFrac: number; aiming: boolean; unlockLevel: number }`
  - `class Abilities { aiming: boolean; unlocked(id, level): boolean; ready(id, level): boolean; tick(dt): void; toggleAim(level): boolean; cancelAim(): void; trigger(id, level): boolean; view(level): AbilityView[]; reset(): void }`
  - `leapTarget(from: Vec2, to: Vec2, maxRange: number): Vec2`
  - `leapPosition(from: Vec2, to: Vec2, t: number, duration: number, peak: number): { x: number; y: number; z: number }`
  - Monster additions: `startLeap(to: Vec2): void`, `get airborne(): boolean`, `onLeapLand: (p: THREE.Vector3) => void`, `startRoar(): void`, `get busy(): boolean` (true while leaping or roaring)
  - `GameScene.pressAbility(id: ActiveId): void`
  - event `abilities: AbilityView[]`
  - Input handler `key(code: string): void`
  - `Markers.setAim(p: THREE.Vector3 | null, radius: number): void`

- [ ] **Step 1: Add config and write the failing tests**

```ts
  abilities: {
    leap: { unlockLevel: 1, cooldown: 8, range: 1000, duration: 1.1, peak: 260, landRadius: 260, damage: 150 },
    roar: { unlockLevel: 5, cooldown: 20, radius: 600, duration: 1.2, damage: 120, buildingDamage: 300 },
  },
```

`src/systems/abilities.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Abilities } from './abilities';
import { CONFIG } from '../config';

const A = CONFIG.abilities;

describe('Abilities', () => {
  it('unlocks leap from level 1 and roar at its unlock level', () => {
    const a = new Abilities();
    expect(a.unlocked('leap', 1)).toBe(true);
    expect(a.unlocked('roar', A.roar.unlockLevel - 1)).toBe(false);
    expect(a.unlocked('roar', A.roar.unlockLevel)).toBe(true);
    expect(a.trigger('roar', 1)).toBe(false);
  });

  it('starts cooldowns on trigger and becomes ready again after them', () => {
    const a = new Abilities();
    expect(a.trigger('leap', 1)).toBe(true);
    expect(a.ready('leap', 1)).toBe(false);
    expect(a.trigger('leap', 1)).toBe(false);
    a.tick(A.leap.cooldown / 2);
    expect(a.view(1).find((v) => v.id === 'leap')!.cdFrac).toBeCloseTo(0.5);
    a.tick(A.leap.cooldown / 2 + 0.01);
    expect(a.ready('leap', 1)).toBe(true);
  });

  it('toggles leap aim only when leap is ready; triggering leap ends aiming', () => {
    const a = new Abilities();
    expect(a.toggleAim(1)).toBe(true);
    expect(a.aiming).toBe(true);
    expect(a.toggleAim(1)).toBe(false);
    a.toggleAim(1);
    a.trigger('leap', 1);
    expect(a.aiming).toBe(false);
    expect(a.toggleAim(1)).toBe(false);
  });

  it('cancelAim and reset clear state', () => {
    const a = new Abilities();
    a.toggleAim(1);
    a.cancelAim();
    expect(a.aiming).toBe(false);
    a.trigger('leap', 1);
    a.reset();
    expect(a.ready('leap', 1)).toBe(true);
  });
});
```

`src/monster/leap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { leapPosition, leapTarget } from './leap';

describe('leapTarget', () => {
  it('keeps targets within range and clamps farther ones along the same direction', () => {
    expect(leapTarget({ x: 0, z: 0 }, { x: 300, z: 400 }, 1000)).toEqual({ x: 300, z: 400 });
    const p = leapTarget({ x: 0, z: 0 }, { x: 3000, z: 4000 }, 1000);
    expect(p.x).toBeCloseTo(600);
    expect(p.z).toBeCloseTo(800);
  });
});

describe('leapPosition', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 1000, z: 0 };
  it('starts at from, ends at to, on the ground', () => {
    expect(leapPosition(from, to, 0, 1, 200)).toEqual({ x: 0, y: 0, z: 0 });
    const end = leapPosition(from, to, 1, 1, 200);
    expect(end.x).toBeCloseTo(1000);
    expect(end.y).toBeCloseTo(0);
  });
  it('peaks at the midpoint and clamps past the duration', () => {
    const mid = leapPosition(from, to, 0.5, 1, 200);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(200);
    expect(leapPosition(from, to, 5, 1, 200).x).toBeCloseTo(1000);
  });
});
```

Run: `npx vitest run src/systems/abilities.test.ts src/monster/leap.test.ts`. Expected: FAIL (modules not found).

- [ ] **Step 2: Implement `abilities.ts` and `leap.ts`**

`src/systems/abilities.ts`:

```ts
import { CONFIG } from '../config';

export type ActiveId = 'leap' | 'roar';
export type AbilityView = { id: ActiveId; unlocked: boolean; ready: boolean; cdFrac: number; aiming: boolean; unlockLevel: number };

const IDS: readonly ActiveId[] = ['leap', 'roar'];

/** Cooldowns, level unlocks, and Leap's aim mode for the two active abilities. */
export class Abilities {
  aiming = false;
  private cd: Record<ActiveId, number> = { leap: 0, roar: 0 };

  unlocked(id: ActiveId, level: number): boolean {
    return level >= CONFIG.abilities[id].unlockLevel;
  }

  ready(id: ActiveId, level: number): boolean {
    return this.unlocked(id, level) && this.cd[id] <= 0;
  }

  tick(dt: number): void {
    for (const id of IDS) this.cd[id] = Math.max(0, this.cd[id] - dt);
  }

  /** Leap button / Space: enter aim when ready, or leave it. Returns the new aiming state. */
  toggleAim(level: number): boolean {
    this.aiming = this.aiming ? false : this.ready('leap', level);
    return this.aiming;
  }

  cancelAim(): void {
    this.aiming = false;
  }

  /** Start the ability's cooldown; false (no-op) if not ready. */
  trigger(id: ActiveId, level: number): boolean {
    if (!this.ready(id, level)) return false;
    this.cd[id] = CONFIG.abilities[id].cooldown;
    if (id === 'leap') this.aiming = false;
    return true;
  }

  view(level: number): AbilityView[] {
    return IDS.map((id) => ({
      id,
      unlocked: this.unlocked(id, level),
      ready: this.ready(id, level),
      cdFrac: this.cd[id] / CONFIG.abilities[id].cooldown,
      aiming: id === 'leap' && this.aiming,
      unlockLevel: CONFIG.abilities[id].unlockLevel,
    }));
  }

  reset(): void {
    this.cd = { leap: 0, roar: 0 };
    this.aiming = false;
  }
}
```

`src/monster/leap.ts`:

```ts
import type { Vec2 } from '../util/math';

/** Clamp a leap destination to maxRange along the same direction. */
export function leapTarget(from: Vec2, to: Vec2, maxRange: number): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxRange) return { x: to.x, z: to.z };
  return { x: from.x + (dx / d) * maxRange, z: from.z + (dz / d) * maxRange };
}

/** Parabolic arc: ground at both ends, `peak` at the midpoint; t is clamped to [0, duration]. */
export function leapPosition(from: Vec2, to: Vec2, t: number, duration: number, peak: number): { x: number; y: number; z: number } {
  const k = Math.min(1, Math.max(0, t / duration));
  return { x: from.x + (to.x - from.x) * k, y: peak * 4 * k * (1 - k), z: from.z + (to.z - from.z) * k };
}
```

Run: `npx vitest run src/systems/abilities.test.ts src/monster/leap.test.ts`. Expected: PASS (7 tests).

- [ ] **Step 3: Add leap, roar and crouch to `Monster`**

Remove the `airborne = false;` field added in Task 2, then add:

```ts
  onLeapLand: (p: THREE.Vector3) => void = () => {};
  crouch = false;
  private leapT = -1;
  private leapFrom = { x: 0, z: 0 };
  private leapTo = { x: 0, z: 0 };
  private roarT = -1;

  get airborne(): boolean {
    return this.leapT >= 0;
  }

  /** Leaping or roaring: the brain must not move or attack. */
  get busy(): boolean {
    return this.leapT >= 0 || this.roarT >= 0;
  }

  startLeap(to: Vec2): void {
    this.leapFrom = { x: this.position.x, z: this.position.z };
    this.leapTo = { x: to.x, z: to.z };
    this.leapT = 0;
    this.yaw = yawTo(this.leapFrom, this.leapTo);
    this.meleeT = -1;
  }

  startRoar(): void {
    this.roarT = 0;
    this.meleeT = -1;
  }
```

At the top of `tick(dt)`, before the cooldown lines, add:

```ts
    const L = CONFIG.abilities.leap;
    if (this.leapT >= 0) {
      this.leapT += dt;
      const p = leapPosition(this.leapFrom, this.leapTo, this.leapT, L.duration, L.peak);
      this.position.set(p.x, p.y, p.z);
      this.pose.pitch = 0.25 * Math.sin(Math.PI * Math.min(1, this.leapT / L.duration)) - 0.1;
      if (this.leapT >= L.duration) {
        this.leapT = -1;
        this.position.y = 0;
        this.pose.dip = 60;
        this.onLeapLand(this.position.clone());
      }
    }
    if (this.roarT >= 0) {
      this.roarT += dt;
      const k = this.roarT / CONFIG.abilities.roar.duration;
      this.pose.pitch = -0.45 * Math.sin(Math.PI * Math.min(1, k));
      if (k >= 1) this.roarT = -1;
    }
```

Then change the existing `if (this.meleeT < 0)` decay block so it also targets a crouch:

```ts
    if (this.meleeT < 0) {
      if (this.leapT < 0 && this.roarT < 0) this.pose.pitch *= Math.exp(-10 * dt);
      this.pose.dip += ((this.crouch ? 35 : 0) - this.pose.dip) * (1 - Math.exp(-10 * dt));
      return;
    }
```

In `animate`, when `this.roarT >= 0`, spread the mandibles wider: use `twitch = 0.55` instead of the computed value. In `reset()`, add `this.leapT = -1; this.roarT = -1; this.crouch = false; this.position.y = 0;`.

Import `leapPosition` from `./leap`.

- [ ] **Step 4: Add `Shockwave`, the aim ring, and keyboard input**

`src/systems/Shockwave.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';

const LIFE = 0.6;

/** Expanding ground ring for Roar. */
export class Shockwave {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private t = -1;
  private radius = 1;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.stinger, transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  start(center: THREE.Vector3, radius: number): void {
    this.mesh.position.set(center.x, 6, center.z);
    this.radius = radius;
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / LIFE);
    this.mesh.scale.setScalar(this.radius * (0.1 + 0.9 * (1 - (1 - k) * (1 - k))));
    this.mat.opacity = 1 - k;
    if (k >= 1) {
      this.t = -1;
      this.mesh.visible = false;
    }
  }
}
```

In `Markers.ts`, add an aim ring:
- The field `private aim = ring(CONFIG.palette.stinger, 0.9);`, added to the scene in the constructor.
- This method:

```ts
  setAim(p: THREE.Vector3 | null, radius: number): void {
    this.aim.visible = p !== null;
    if (p) {
      this.aim.position.set(p.x, 4, p.z);
      this.aim.scale.setScalar(radius * (1 + Math.sin(this.time * 10) * 0.04));
    }
  }
```

In `Input.ts`:
- Add `key(code: string): void;` to `InputHandlers`.
- In the constructor, add `window.addEventListener('keydown', this.onKey);`.
- In `dispose`, remove it.
- Add this method:

```ts
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.code !== 'Space' && e.code !== 'KeyR')) return;
    e.preventDefault();
    this.h.key(e.code);
  };
```

- [ ] **Step 5: Wire the abilities into `GameScene`**

Add the fields `private abilities = new Abilities(); private shockwave: Shockwave; private aimPoint: THREE.Vector3 | null = null;`.

In the constructor:
- Create the shockwave.
- Add `key: (code) => this.pressAbility(code === 'Space' ? 'leap' : 'roar'),` to the Input handlers.
- Add `this.monster.onLeapLand = (p) => this.leapLand(p);`.

Add these methods:

```ts
  pressAbility(id: ActiveId): void {
    if (this.state !== 'playing' || !this.monster.alive) return;
    const level = this.progression.level;
    if (id === 'leap') {
      this.monster.crouch = this.abilities.toggleAim(level);
      if (!this.monster.crouch) this.markers.setAim(null, 0);
      return;
    }
    if (!this.abilities.trigger('roar', level)) return;
    this.roar();
  }

  private trucks(): GrappleTrucks {
    return this.enemies.get<GrappleTrucks>('truck');
  }

  private leapTo(ground: THREE.Vector3): void {
    const m = this.monster;
    const to = leapTarget({ x: m.position.x, z: m.position.z }, { x: ground.x, z: ground.z }, CONFIG.abilities.leap.range);
    if (!this.abilities.trigger('leap', this.progression.level)) return;
    this.trucks().snapAll();
    m.crouch = false;
    m.startLeap(to);
    this.order = null;
    this.markers.setTarget(null);
    this.markers.setAim(null, 0);
    this.particles.ring('dust', m.position, 200, 12);
  }

  private leapLand(p: THREE.Vector3): void {
    const L = CONFIG.abilities.leap;
    const dmg = L.damage * this.progression.stats.damageMult;
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, L.landRadius, (t) => t.applyDamage(dmg * 3));
    for (const t of this.enemyTargets()) {
      if (!t.airborne && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= L.landRadius + t.radius) t.applyDamage(dmg);
    }
    this.particles.ring('dust', p, L.landRadius, 26);
    this.particles.emit('debris', p.clone().setY(20), 16, 1.6);
    this.rig.addTrauma(0.55);
  }

  private roar(): void {
    const R = CONFIG.abilities.roar;
    const m = this.monster;
    const p = m.position;
    m.startRoar();
    this.order = null;
    this.trucks().snapAll();
    this.shockwave.start(p, R.radius);
    const dmg = R.damage * this.progression.stats.damageMult;
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, R.radius, (t) => t.applyDamage(R.buildingDamage));
    for (const t of [...this.enemyTargets()]) {
      if (Math.hypot(t.position.x - p.x, t.position.z - p.z) > R.radius + t.radius) continue;
      t.applyDamage(t.airborne ? 1e9 : dmg);
    }
    this.particles.ring('dust', p, R.radius * 0.5, 30);
    this.rig.addTrauma(0.7);
  }
```

Then update the existing code:
- **`onTap`:** start with `if (this.abilities.aiming) { this.setRay(x, y); const g = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV); if (g) this.leapTo(g.clone()); return; }`. The existing `state !== 'playing'` guard runs before it.
- **`onHover`:** when `this.abilities.aiming`, intersect the ground, clamp with `leapTarget`, call `this.markers.setAim(new THREE.Vector3(c.x, 0, c.z), CONFIG.abilities.leap.landRadius)`, and return.
- **`updateMonster`:** right after computing `pos`, add `if (m.busy) { m.tick(dt); return; }`. The brain is skipped mid-leap and mid-roar, but contact crushing and regen still run, so place the early return after those lines by restructuring:

  ```ts
  const busy = m.busy;
  if (!busy) { /* existing decide/move/attack block */ }
  m.tick(dt);
  /* contact + regen */
  ```

- **`update()`:** while playing, add `this.abilities.tick(dt);`. Always run `this.shockwave.update(dt)` when not frozen. Emit `this.events.emit('abilities', this.abilities.view(this.progression.level));` in the 10 Hz block.
- **`setState`:** when `next !== 'playing'`, add `this.abilities.cancelAim(); this.monster.crouch = false; this.markers.setAim(null, 0);`.
- **`restart()`:** add `this.abilities.reset();`.

Imports: `Abilities`, `type ActiveId`, `Shockwave`, `leapTarget`, `GrappleTrucks`.

`GameEvents.ts`: import `AbilityView` and add `abilities: AbilityView[];` to the map.

- [ ] **Step 6: Ability buttons UI**

`src/ui/AbilityButtons.tsx`:

```tsx
import type { AbilityView, ActiveId } from '../systems/abilities';

const META: Record<ActiveId, { icon: string; key: string; label: string }> = {
  leap: { icon: '⤴', key: 'SPACE', label: 'Leap' },
  roar: { icon: '📣', key: 'R', label: 'Roar' },
};

export function AbilityButtons({ views, onPress }: { views: AbilityView[]; onPress: (id: ActiveId) => void }) {
  return (
    <div className="ability-bar">
      {views.map((v) => {
        const m = META[v.id];
        const cls = ['ability-btn', v.ready ? 'ready' : '', v.aiming ? 'aiming' : '', v.unlocked ? '' : 'locked'].join(' ');
        return (
          <button key={v.id} className={cls} onPointerDown={(e) => { e.stopPropagation(); onPress(v.id); }} aria-label={m.label}>
            <span className="ability-icon">{v.unlocked ? m.icon : '🔒'}</span>
            {!v.unlocked && <span className="ability-lock">LV {v.unlockLevel}</span>}
            {v.unlocked && v.cdFrac > 0 && <span className="ability-cd" style={{ background: `conic-gradient(rgba(0,0,0,0.65) ${v.cdFrac * 360}deg, transparent 0)` }} />}
            <span className="ability-key">{m.key}</span>
          </button>
        );
      })}
    </div>
  );
}
```

`App.tsx`:
- Add `const [abilities, setAbilities] = useState<AbilityView[]>([]);`.
- Subscribe with `game.events.on('abilities', setAbilities);`.
- Add `const press = useCallback((id: ActiveId) => gameRef.current?.pressAbility(id), []);`.
- Render `{state === 'playing' && <AbilityButtons views={abilities} onPress={press} />}` inside `.hud`.

`style.css`:

```css
.ability-bar {
  position: absolute;
  right: calc(var(--safe-right) + 14px);
  bottom: calc(var(--safe-bottom) + 18px);
  display: flex;
  gap: 12px;
  pointer-events: auto;
}
.ability-btn {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.6);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  touch-action: none;
  transition: transform 100ms ease-out;
}
.ability-btn:active { transform: scale(0.92); }
.ability-btn.ready { border-color: var(--color-primary); box-shadow: 0 0 12px rgba(155, 226, 45, 0.55); animation: ability-pulse 1.2s ease-in-out infinite; }
.ability-btn.aiming { background: var(--color-primary); color: #0d1110; }
.ability-btn.locked { opacity: 0.45; filter: grayscale(0.6); }
.ability-icon { font-size: 26px; line-height: 64px; }
.ability-lock { position: absolute; left: 0; right: 0; bottom: 6px; font-size: 10px; font-weight: 700; }
.ability-key { position: absolute; left: 0; right: 0; top: 4px; font-size: 8px; opacity: 0.7; letter-spacing: 0.08em; }
.ability-cd { position: absolute; inset: 0; border-radius: 50%; }
@keyframes ability-pulse { 50% { transform: scale(1.06); } }
@media (pointer: coarse) { .ability-key { display: none; } }
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`. Expected: all pass.

**Desktop check:**
1. Press Space. The leap button shows as aiming, the monster crouches, and an aim ring follows the mouse.
2. Click 800 m away. The monster arcs (sample `position.y` > 100 mid-air), lands, and buildings collapse.
3. Space is on cooldown for 8 s.
4. Set `g.progression.level = 5` and press R. A shockwave ring appears, and blimps or jets within 600 m are destroyed.

**Phone (touch) check:**
1. Tap the Leap button, then tap the ground. The monster leaps.

**Tether check:**
1. Spawn a truck, wait for the tether, then Leap. The tether is gone right after.

**State check:**
1. During level-up, pressing Space does nothing.

Screenshot mid-leap and mid-roar. **Look checkpoint.**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Leap and Roar active abilities with buttons and keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Automatic abilities — ranks, offer rules, and the six passives

**Files:**
- Create: `src/systems/Passives.ts`, `src/systems/Passives.test.ts`, `src/systems/AcidPools.ts`, `src/systems/BroodDrones.ts`
- Modify: `src/config.ts`, `src/systems/Progression.ts`, `src/systems/Progression.test.ts`, `src/GameScene.ts`

**Interfaces:**
- Produces:
  - `type AbilityId = 'acid' | 'storm' | 'chitin' | 'frenzy' | 'brood' | 'thrash'`
  - `ABILITIES: Record<AbilityId, { title: string; icon: string; desc(rank: number): string }>`
  - `MAX_RANK = 3`
  - `Progression.ranks: Record<AbilityId, number>`
  - `class Passives { constructor(ranks: () => Record<AbilityId, number>); tetherMult(): number; thrashDamage(): number; deflectChance(): number; frenzyHeal(): number; acidPool(): { radius: number; life: number } | null; update(dt: number): { storm: number; brood: number }; reset(): void }`
  - `class AcidPools { constructor(scene); add(p: THREE.Vector3, radius: number, life: number): void; update(dt: number, targets: readonly Target[], dmgMult: number): void; clear(): void }`
  - `class BroodDrones { constructor(scene); spawn(n: number, from: THREE.Vector3): void; update(dt: number, targets: readonly Target[], dmgMult: number): void; clear(): void }`

- [ ] **Step 1: Add config and write the failing tests**

```ts
  passives: {
    acid: { radius: 60, life: 3, radiusPerRank: 0.2, lifePerRank: 1, dps: 30 },
    storm: { interval: 6, intervalStep: 1, spikes: 6, extraSpikes: 3 },
    chitin: { perRank: 0.15 },
    frenzy: { perRank: 6 },
    brood: { interval: 10, drones: 3, extraDrones: 2, life: 8, speed: 450, damage: 40, hitCooldown: 0.5 },
    thrash: { tetherMult: [1, 0.5, 0.3, 0.15], damage: 40 },
    earlyAbilityPicks: 3,
  },
```

Add these palette entries: `acid: 0x9bff3a, drone: 0x3b5d18`.

`src/systems/Passives.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Passives } from './Passives';
import type { AbilityId } from './Progression';
import { CONFIG } from '../config';

const P = CONFIG.passives;
const ranks = (r: Partial<Record<AbilityId, number>>) => () => ({ acid: 0, storm: 0, chitin: 0, frenzy: 0, brood: 0, thrash: 0, ...r });

describe('Passives', () => {
  it('has no effect at rank 0', () => {
    const p = new Passives(ranks({}));
    expect(p.tetherMult()).toBe(1);
    expect(p.thrashDamage()).toBe(0);
    expect(p.deflectChance()).toBe(0);
    expect(p.frenzyHeal()).toBe(0);
    expect(p.acidPool()).toBeNull();
    expect(p.update(100)).toEqual({ storm: 0, brood: 0 });
  });

  it('scales simple passives by rank', () => {
    const p = new Passives(ranks({ chitin: 3, frenzy: 2, thrash: 2, acid: 3 }));
    expect(p.deflectChance()).toBeCloseTo(0.45);
    expect(p.frenzyHeal()).toBe(12);
    expect(p.tetherMult()).toBe(P.thrash.tetherMult[2]);
    expect(p.thrashDamage()).toBe(P.thrash.damage);
    expect(p.acidPool()).toEqual({ radius: P.acid.radius * (1 + 2 * P.acid.radiusPerRank), life: P.acid.life + 2 * P.acid.lifePerRank });
  });

  it('fires Spike Storm on its interval with rank-scaled spike counts', () => {
    const p = new Passives(ranks({ storm: 2 }));
    const interval = P.storm.interval - P.storm.intervalStep;
    expect(p.update(interval - 0.1).storm).toBe(0);
    expect(p.update(0.2).storm).toBe(P.storm.spikes + P.storm.extraSpikes);
    expect(p.update(interval - 0.3).storm).toBe(0);
  });

  it('releases Brood Swarm drones on its interval', () => {
    const p = new Passives(ranks({ brood: 1 }));
    expect(p.update(P.brood.interval + 0.01).brood).toBe(P.brood.drones);
  });

  it('reset restarts timers', () => {
    const p = new Passives(ranks({ storm: 1 }));
    p.update(P.storm.interval - 0.5);
    p.reset();
    expect(p.update(1).storm).toBe(0);
  });
});
```

Append to `src/systems/Progression.test.ts`:

```ts
import { ABILITIES, MAX_RANK, type AbilityId } from './Progression';

describe('Progression abilities', () => {
  const isAbility = (id: string) => id in ABILITIES;

  it('ranks abilities up on choose and shows the next rank on the card', () => {
    const p = new Progression(mulberry32(7));
    p.addExp(expToNext(1));
    expect(p.choose('acid')).toBe(true);
    expect(p.ranks.acid).toBe(1);
    p.addExp(expToNext(2));
    for (let i = 0; i < 50; i++) {
      const offer = p.offer().find((o) => o.id === 'acid');
      if (offer) {
        expect(offer.title).toBe(`${ABILITIES.acid.title} II`);
        return;
      }
    }
    throw new Error('acid never offered');
  });

  it('never offers an ability at max rank', () => {
    const p = new Progression(mulberry32(8));
    for (let i = 0; i < MAX_RANK; i++) {
      p.addExp(expToNext(p.level));
      p.choose('storm');
    }
    expect(p.ranks.storm).toBe(MAX_RANK);
    p.addExp(expToNext(p.level));
    for (let i = 0; i < 200; i++) expect(p.offer().map((o) => o.id)).not.toContain('storm');
    expect(p.choose('storm')).toBe(false);
  });

  it('includes at least one ability in each of the first three offers', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = new Progression(mulberry32(seed));
      for (let pick = 0; pick < 3; pick++) {
        p.addExp(expToNext(p.level));
        const offers = p.offer();
        expect(offers.some((o) => isAbility(o.id))).toBe(true);
        p.choose(offers.find((o) => !isAbility(o.id))?.id ?? offers[0]!.id, p.offerSeq);
      }
    }
  });

  it('always offers three distinct ids, even with every ability maxed', () => {
    const p = new Progression(mulberry32(9));
    for (const id of Object.keys(ABILITIES) as AbilityId[]) p.ranks[id] = MAX_RANK;
    p.addExp(expToNext(1));
    for (let i = 0; i < 100; i++) {
      const ids = p.offer().map((o) => o.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids.some(isAbility)).toBe(false);
    }
  });

  it('reset clears ranks', () => {
    const p = new Progression(mulberry32(10));
    p.addExp(expToNext(1));
    p.choose('frenzy');
    p.reset();
    expect(p.ranks.frenzy).toBe(0);
  });
});
```

Run: `npx vitest run src/systems/Passives.test.ts src/systems/Progression.test.ts`. Expected: FAIL (missing exports and module).

- [ ] **Step 2: Extend `Progression`**

Add to `src/systems/Progression.ts`:

```ts
export type AbilityId = 'acid' | 'storm' | 'chitin' | 'frenzy' | 'brood' | 'thrash';
export const MAX_RANK = 3;
const ROMAN = ['', 'I', 'II', 'III'];

export const ABILITIES: Record<AbilityId, { title: string; icon: string; desc(rank: number): string }> = {
  acid: { title: 'Acid Footprints', icon: '🧪', desc: (r) => (r === 1 ? 'Steps leave burning acid' : 'Bigger, longer-lasting acid') },
  storm: { title: 'Spike Storm', icon: '🌩️', desc: (r) => (r === 1 ? 'Homing spike barrage every 6s' : '+3 spikes, fires faster') },
  chitin: { title: 'Chitin Deflection', icon: '🪲', desc: () => '+15% chance to deflect hits' },
  frenzy: { title: 'Feeding Frenzy', icon: '🩸', desc: () => '+6 HP per kill' },
  brood: { title: 'Brood Swarm', icon: '🐝', desc: (r) => (r === 1 ? 'Drones hunt aircraft every 10s' : '+2 drones') },
  thrash: { title: 'Thrash', icon: '🌀', desc: (r) => (r === 1 ? 'Tethers break 2x faster' : 'Tethers break even faster') },
};

const emptyRanks = (): Record<AbilityId, number> => ({ acid: 0, storm: 0, chitin: 0, frenzy: 0, brood: 0, thrash: 0 });
```

In the class:
- Add the fields `ranks = emptyRanks();` and `private picks = 0;`.
- In `reset()`, add `this.ranks = emptyRanks(); this.picks = 0;`. Leave `offerSeq` counting up across runs, so a stale pick from before a restart can never match a new offer.
- Replace `offer()` and `choose()`:

```ts
  offer(): UpgradeOffer[] {
    this.offerSeq++;
    const abilities = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => this.ranks[id] < MAX_RANK);
    const pool: string[] = [...(Object.keys(UPGRADES) as UpgradeId[]), ...abilities];
    const ids = shuffle(pool, this.rng).slice(0, CONFIG.progression.offerCount);
    const early = this.picks < CONFIG.passives.earlyAbilityPicks;
    if (early && abilities.length > 0 && !ids.some((id) => id in ABILITIES)) {
      const choices = abilities.filter((a) => !ids.includes(a));
      ids[ids.length - 1] = choices[Math.floor(this.rng() * choices.length)]!;
    }
    return ids.map((id) => {
      if (id in ABILITIES) {
        const a = ABILITIES[id as AbilityId];
        const next = this.ranks[id as AbilityId] + 1;
        return { id, title: `${a.title} ${ROMAN[next]}`, desc: a.desc(next), icon: a.icon };
      }
      const u = UPGRADES[id as UpgradeId];
      return { id, title: u.title, desc: u.desc, icon: u.icon };
    });
  }

  /** Applies an upgrade or ranks up an ability if a level is pending and `seq` (when given) is current. */
  choose(id: string, seq?: number): boolean {
    if (this.pendingLevels <= 0) return false;
    if (seq !== undefined && seq !== this.offerSeq) return false;
    if (id in ABILITIES) {
      const a = id as AbilityId;
      if (this.ranks[a] >= MAX_RANK) return false;
      this.ranks[a]++;
    } else if (id in UPGRADES) {
      this.stats = UPGRADES[id as UpgradeId].apply(this.stats);
    } else {
      return false;
    }
    this.pendingLevels--;
    this.picks++;
    return true;
  }
```

- [ ] **Step 3: Implement `Passives`**

`src/systems/Passives.ts`:

```ts
import { CONFIG } from '../config';
import type { AbilityId } from './Progression';

const P = CONFIG.passives;

/** Rank-derived passive values plus the Spike Storm and Brood Swarm timers. */
export class Passives {
  private stormT = 0;
  private broodT = 0;

  constructor(private ranks: () => Record<AbilityId, number>) {}

  tetherMult(): number {
    return P.thrash.tetherMult[this.ranks().thrash] ?? 1;
  }

  thrashDamage(): number {
    return this.ranks().thrash > 0 ? P.thrash.damage : 0;
  }

  deflectChance(): number {
    return this.ranks().chitin * P.chitin.perRank;
  }

  frenzyHeal(): number {
    return this.ranks().frenzy * P.frenzy.perRank;
  }

  acidPool(): { radius: number; life: number } | null {
    const r = this.ranks().acid;
    if (r === 0) return null;
    return { radius: P.acid.radius * (1 + (r - 1) * P.acid.radiusPerRank), life: P.acid.life + (r - 1) * P.acid.lifePerRank };
  }

  /** Advance timers; returns how many storm spikes and brood drones to release this frame. */
  update(dt: number): { storm: number; brood: number } {
    const r = this.ranks();
    let storm = 0;
    let brood = 0;
    if (r.storm > 0) {
      this.stormT += dt;
      const interval = P.storm.interval - (r.storm - 1) * P.storm.intervalStep;
      if (this.stormT >= interval) {
        this.stormT -= interval;
        storm = P.storm.spikes + (r.storm - 1) * P.storm.extraSpikes;
      }
    }
    if (r.brood > 0) {
      this.broodT += dt;
      if (this.broodT >= P.brood.interval) {
        this.broodT -= P.brood.interval;
        brood = P.brood.drones + (r.brood - 1) * P.brood.extraDrones;
      }
    }
    return { storm, brood };
  }

  reset(): void {
    this.stormT = 0;
    this.broodT = 0;
  }
}
```

Run: `npx vitest run src/systems/Passives.test.ts src/systems/Progression.test.ts`. Expected: PASS.

- [ ] **Step 4: Implement `AcidPools` and `BroodDrones`**

`src/systems/AcidPools.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const MAX = 60;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

type Pool = { x: number; z: number; r: number; life: number; age: number };

/** Glowing acid puddles from footsteps; burn ground enemies standing in them. */
export class AcidPools {
  private pools: Pool[] = [];
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: CONFIG.palette.acid, transparent: true, opacity: 0.55, depthWrite: false }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  add(p: THREE.Vector3, radius: number, life: number): void {
    if (this.pools.length >= MAX) this.pools.shift();
    this.pools.push({ x: p.x, z: p.z, r: radius, life, age: 0 });
  }

  update(dt: number, targets: readonly Target[], dmgMult: number): void {
    const dps = CONFIG.passives.acid.dps * dmgMult;
    for (const pool of this.pools) {
      pool.age += dt;
      for (const t of targets) {
        if (t.airborne || !t.isAlive()) continue;
        if (Math.hypot(t.position.x - pool.x, t.position.z - pool.z) <= pool.r + t.radius) t.applyDamage(dps * dt);
      }
    }
    this.pools = this.pools.filter((p) => p.age < p.life);
    this.pools.forEach((p, i) => {
      const k = 1 - p.age / p.life;
      _m.compose(_p.set(p.x, 2 + i * 0.01, p.z), _q.identity(), _s.set(p.r * (0.6 + 0.4 * k), 1, p.r * (0.6 + 0.4 * k)));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.count = this.pools.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.pools = [];
    this.mesh.count = 0;
  }
}
```

`src/systems/BroodDrones.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';

const B = CONFIG.passives.brood;
const MAX = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

type Drone = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; hitCd: number };

/** Small insect drones that hunt the nearest air target and ram it. */
export class BroodDrones {
  private drones: Drone[] = [];
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const geo = mergeGeometries([
      faceted(new THREE.BoxGeometry(0.35, 0.3, 1)),
      faceted(new THREE.BoxGeometry(1.4, 0.04, 0.4)).translate(0, 0.18, 0),
    ])!;
    this.mesh = new THREE.InstancedMesh(geo, toonMat(CONFIG.palette.drone), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(n: number, from: THREE.Vector3): void {
    for (let i = 0; i < n && this.drones.length < MAX; i++) {
      const a = (i / n) * Math.PI * 2;
      this.drones.push({ pos: from.clone(), vel: new THREE.Vector3(Math.cos(a), 1, Math.sin(a)).normalize().multiplyScalar(B.speed * 0.5), age: 0, hitCd: 0 });
    }
  }

  update(dt: number, targets: readonly Target[], dmgMult: number): void {
    const air = targets.filter((t) => t.airborne && t.isAlive());
    for (const d of this.drones) {
      d.age += dt;
      d.hitCd = Math.max(0, d.hitCd - dt);
      let best: Target | null = null;
      let bestD = Infinity;
      for (const t of air) {
        const dist = t.position.distanceToSquared(d.pos);
        if (dist < bestD) {
          bestD = dist;
          best = t;
        }
      }
      if (best) {
        _d.subVectors(best.position, d.pos);
        const dist = _d.length();
        d.vel.lerp(_d.normalize().multiplyScalar(B.speed), 1 - Math.exp(-4 * dt));
        if (dist < best.radius + 20 && d.hitCd <= 0) {
          best.applyDamage(B.damage * dmgMult);
          d.hitCd = B.hitCooldown;
          d.vel.multiplyScalar(-0.6);
        }
      } else {
        d.vel.y += (40 - d.vel.y) * (1 - Math.exp(-2 * dt));
      }
      d.pos.addScaledVector(d.vel, dt);
    }
    this.drones = this.drones.filter((d) => d.age < B.life);
    this.drones.forEach((d, i) => {
      _q.setFromUnitVectors(FWD, _d.copy(d.vel).normalize());
      _m.compose(d.pos, _q, _s.setScalar(28));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.count = this.drones.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.drones = [];
    this.mesh.count = 0;
  }
}
```

- [ ] **Step 5: Wire the passives into `GameScene`**

Add the fields `private passives: Passives; private acid: AcidPools; private brood: BroodDrones;` and create them in the constructor: `this.passives = new Passives(() => this.progression.ranks);`.

Replace the Task 2 hook bodies:
- `passiveTetherMult()` returns `this.passives.tetherMult()`.
- `passiveThrashDamage()` returns `this.passives.thrashDamage()`.
- `deflectChance()` returns `this.passives.deflectChance()`.

In `monster.onFootLand`, add:

```ts
      const pool = this.passives.acidPool();
      if (pool && this.state === 'playing') this.acid.add(p, pool.radius, pool.life);
```

In `onTargetDestroyed`, after `kills++`: `if (target.kind !== 'building') this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + this.passives.frenzyHeal());`.

In `update()`, while playing, after `abilities.tick(dt)`:

```ts
        const fire = this.passives.update(dt);
        if (fire.storm > 0) this.spikeStorm(fire.storm);
        if (fire.brood > 0) this.brood.spawn(fire.brood, this.monster.model.stingerTip.getWorldPosition(new THREE.Vector3()));
```

While not frozen:

```ts
      const dm = this.progression.stats.damageMult;
      this.acid.update(dt, this.enemyTargets(), dm);
      this.brood.update(dt, this.enemyTargets(), dm);
```

Add:

```ts
  /** Spike Storm: one homing spike at each of the n nearest enemies in range (repeating if fewer). */
  private spikeStorm(n: number): void {
    const m = this.monster;
    const inRange = this.enemyTargets()
      .filter((t) => t.position.distanceTo(m.position) <= CONFIG.monster.spikeRange)
      .sort((a, b) => a.position.distanceToSquared(m.position) - b.position.distanceToSquared(m.position));
    if (inRange.length === 0) return;
    const from = m.model.stingerTip.getWorldPosition(new THREE.Vector3());
    const dmg = CONFIG.monster.spikeDamage * this.progression.stats.damageMult;
    for (let i = 0; i < n; i++) {
      this.projectiles.fireSpike(from, inRange[i % inRange.length]!, dmg, (i - (n - 1) / 2) * 0.25);
    }
    this.particles.emit('spark', from, 10, 1.5);
  }
```

In `restart()`, add `this.passives.reset(); this.acid.clear(); this.brood.clear();`.

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`. Expected: all pass.
Scripted check:
1. Force ranks with `g.progression.ranks = { acid: 1, storm: 1, chitin: 3, frenzy: 1, brood: 1, thrash: 1 }`.
2. Spawn tanks, blimps and a truck, then play 15 s.

Expected:
- Green pools appear under the feet when walking.
- A spike barrage fires about every 6 s.
- Drones launch every 10 s and chase blimps.
- Sparks appear on some rocket hits (deflected).
- HP rises on kills.
- Tethers last about 3 s.

Then check the first three level-up offers in a fresh run each contain an ability card.
Screenshot the drones and acid. **Look checkpoint.**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add rankable automatic abilities: acid, spike storm, chitin, frenzy, brood, thrash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Integration — timeline, restart safety, performance, look pass, README

**Files:**
- Modify: `README.md`; config values only if the checks below call for tuning (record each change as a ruling)

- [ ] **Step 1: Unlock timeline check**

Scripted Playwright run against `npm run dev`:
- Keep the monster immortal with `g.monster.maxHp = g.monster.hp = 1e9`.
- Every 2 s of wall time, set `g.enemies.director.elapsed += 10` and `g.runTime += 10` to fast-forward.
- Record `g.enemies.counts()`.

Expected: each kind's first non-zero count appears at or after its unlock time in `CONFIG.spawns`, and every kind has appeared by game time 330 s.

- [ ] **Step 2: Restart safety check (Review Focus 3)**

In one session:
1. Spawn a truck and wait for its tether.
2. Spawn a laser and wait for `tracking`.
3. Force acid rank 1 and walk, so pools exist.
4. Press Space and click to start a leap.
5. Call `g.restart()`.

Expected, immediately after:
- `g.enemies.counts()` is all zeros.
- The laser state is `idle`.
- `g.monster.airborne === false` and `g.monster.position.y === 0`.
- `g.abilities.view(1)` has `cdFrac` of 0 and `aiming` false.
- There are no acid pools or drones.
- The HUD is not showing TETHERED.

- [ ] **Step 3: Performance check**

Load with `?debug=1`. Force a late-game wave:
1. Set `director.elapsed = 400`.
2. Spawn every kind up to its cap via `g.enemies.get(kind).spawn(g.ctx)` in a loop.
3. Set all ability ranks to 3.
4. Fire Roar once.

Expected: the overlay shows **under 150 draw calls**. If it's over, the likely offenders are per-entity meshes; instance them, ledger the change, and re-measure.

- [ ] **Step 4: Look pass**

Take phone (390×844) and desktop (1440×900) screenshots of:
- each enemy with its telegraph: blimp, raised SAM with missiles in flight, artillery circles, tethered truck, laser tracking and firing;
- Leap mid-air;
- Roar shockwave;
- the ability buttons, including cooldown and locked Roar;
- edge arrows;
- the TETHERED warning;
- level-up cards with ability ranks.

Show them to the user.

- [ ] **Step 5: Pacing data point**

In a normal run with the monster on auto-defense and no input, log the level at 60 s, 120 s and 300 s, and when death happens. Report these to the user alongside the target of reaching level 4–5 by about 60 s and dying at about 8 min with active play. Don't tune without the user's input beyond obvious breakage.

- [ ] **Step 6: README**

In `README.md`, extend the Controls table with:

```markdown
| Leap | Tap Leap button, then tap a spot | Space, then click |
| Roar (level 5) | Tap Roar button | R |
```

Add a short "Threats" list (blimp, SAM silo, artillery, grappling truck, orbital laser), with one line each on how to counter them.

- [ ] **Step 7: Final verification and commit**

```bash
npm test && npm run build
git add -A
git commit -m "Milestone 2 integration: timeline, restart safety, performance, README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all tests pass (about 120) and the build succeeds.
