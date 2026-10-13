# AZRAGON Milestone 4c (The Magma Golem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Magma Golem the fourth playable monster. It knuckle-walks through the city, fights with Molten Fist slams and backhands that never break its stride, lobs magma bombs that leave lava pools, geysers flyers from its shoulder vents, and has its own signature upgrades, including the new Molten Core.

**Architecture:**
- **Module:** the Golem plugs into the 4a/4b monster architecture as a new `MonsterKind` plus `MonsterBody`, under `src/monsters/golem/`.
- **Pure logic:** the knuckle-walk gait, the fist-strike choice and the Molten Core heat model are pure modules with unit tests.
- **Molten Fist** reuses the shared `Monster` melee timeline (`startMelee` → `f.melee` → `onMeleeImpact`):
  - a new melee shape, `{ kind: 'fist' }`, poses the striking fist in the body;
  - `GameScene` resolves it as a slam or a backhand by the target's bearing.
- **Other new kinds:** ranged gains `'lob'` (a new `'bomb'` projectile that leaves an acid-system lava pool), and anti-air gains `'geyser'` (body visual only; damage goes through the shared Tail Swat path).
- **Molten Core:** a new `'core'` passive. `GameScene` owns the heat value: damage taken raises it, it cools over time, and it feeds `dmgMult` and a burn aura. `BodyFrame.heat` drives the glow.
- **Untouched:** the Insect, Kaiju and Kraken paths.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright with Metal GPU for scripted checks.

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone4c-design.md`

## Global Constraints

- **Project rules:**
  - No `useEffect`.
  - Game logic in classes; React for UI only.
  - No `setPixelRatio`.
  - Models face +Z, and +X is the model's left (forward = (sin yaw, cos yaw); a positive bearing is toward the left).
  - Tunables go in `src/config.ts`.
  - Draw calls stay under 150 on every screen.
- **The Insect, Reptile Kaiju and Kraken must not change.** All existing tests keep passing, except the assertions this plan updates because the Golem becomes playable (roster, pick, Progression `offer(all)`, Passives `ranks` helper).
- **The Golem's attacks never turn or stop its body.** Only an explicit attack order may face the body toward a target (the shared brain already does this for orders).
- **Shared kit:**
  - Leap, Dash and Roar are shared actives with the same mechanics for every monster.
  - Shield Bubble, Reflect Shield, Overload and the generic stat upgrades are shared.
  - Signature upgrades are offered only to their own monster.
- **Visual style is the top priority.** Every body change is judged from screenshots.
- **Commits:** commit after every task. Messages end with a `Co-Authored-By:` trailer naming the model that made the commit.
- **Never deploy, never push.**

## Review Focus

1. **A fist strike while walking:**
   - The body never stops or turns (yaw unchanged unless there's an attack order).
   - The striking fist does not also fire a plant (no extra stomp under the raised fist).
   - A target that dies mid-swing leaves the strike to land harmlessly.
   - Pinned by the gait and fist tests (Task 1) and the scripted fist checks (Task 4).
2. **An attack order on a jet or blimp while playing the Golem:** Magma Lob cannot hit flyers, so the tap becomes a move order and an existing flyer order is dropped. The Golem never freezes tracking it (the 4b Kraken bug). Pinned by the scripted tap check (Task 4).
3. **Molten Core heat leaking:** heat never carries into Play Again, Change Monster or another monster. Heat stays 0 when Molten Core isn't taken. Pinned by the heat tests (Task 1) and the scripted reset checks (Tasks 4–5).
4. **Magma Lob with no ground target in range, or with the extra-projectile upgrade and only one target:** no bomb fires at a flyer, and extra bombs go to the nearest other ground targets (or repeat the main target). Pinned in Task 4's scripted check.
5. **Insect, Kaiju and Kraken regression:** their melee, ranged, anti-air and effect colours are unchanged. Pinned by the existing suite and Task 5.

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | `CONFIG.golem` (stats, fist, lob, colours); `passives.core` |
| `src/monsters/golem/knuckleGait.ts` (+test) | Four-beat limb order, swing/stance, plant events |
| `src/monsters/golem/fist.ts` (+test) | Bearing, slam-vs-backhand choice, backhand arc yaw |
| `src/monsters/golem/heat.ts` (+test) | Molten Core heat: hit, cool, damage multiplier, aura threshold |
| `src/monsters/golem/GolemBody.ts` | Basalt hulk with magma seams and core; knuckle-walk IK; fist, geyser, Eruption, roar, leap, dash, collapse poses |
| `src/monsters/golem/kind.ts` (+test) | `GOLEM` `MonsterKind` |
| `src/monsters/types.ts` | `MonsterId` golem; `MeleeShape` fist; ranged `'lob'`; antiAir `'geyser'`; `BodyFrame.heat`; `MonsterBody.nova?()` |
| `src/monster/Monster.ts` | `heat` field fed into the frame |
| `src/systems/Particles.ts` | `'magma'` particle kind |
| `src/systems/Projectiles.ts` (+test) | `'bomb'` shot: `fireBomb` |
| `src/systems/Passives.ts` (+test), `src/systems/Progression.ts` (+test) | `core` ability (Molten Core) |
| `src/monsters/roster.ts` (+test), `src/monsters/pick.test.ts` | Golem playable as the Magma Golem |
| `src/GameScene.ts` | Fist impact, Magma Lob, bomb hits and lava pools, ground-only lob orders, Molten Core heat and aura, Eruption hook |

---

### Task 1: Gait, fist and heat logic (pure) + `CONFIG.golem`

**Files:**
- Create: `src/monsters/golem/knuckleGait.ts`, `src/monsters/golem/knuckleGait.test.ts`, `src/monsters/golem/fist.ts`, `src/monsters/golem/fist.test.ts`, `src/monsters/golem/heat.ts`, `src/monsters/golem/heat.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces:
  - `LIMBS: readonly { kind: 'fist' | 'foot'; side: 0 | 1 }[]`, in planting order: left fist, right foot, right fist, left foot. Side 0 is the left (+X).
  - `SWING = 0.4`
  - `limbPhase(cycle, i): number`
  - `limbSwing(cycle, i): { lift: number; stride: number }`, with stride −1 (back) … 1 (front)
  - `limbPlanted(prev, cur, i): boolean`
  - `type FistKind = 'slam' | 'backhand'`
  - `bearingTo(from: Vec2, yaw, p: Vec2): number`
  - `fistKind(bearing, frontHalf): FistKind`
  - `backhandYaw(yaw, bearing, centre): number`
  - `heatAfterHit(heat, damage, maxHp, gain)`, `coolHeat(heat, dt, rate)`, `coreDamageMult(heat, maxBonus)`, `auraOn(heat, threshold)`
  - `CONFIG.golem`, `CONFIG.passives.core`

- [ ] **Step 1: Config**

Add to `CONFIG` in `src/config.ts`, directly after the `kraken` block:

```ts
  /** The Magma Golem. Stats feed its MonsterKind; fist and lob tune its attacks; colours its body and effects. */
  golem: {
    stats: {
      maxHp: 1450,
      moveSpeed: 110,
      turnRate: 1.6,
      damageMult: 1.2,
      /** One knuckle-walk cycle (all four limbs) covers this many model units. */
      strideLength: 340,
      bodyRadius: 170 * MONSTER_SCALE,
      footRadius: 75,
      footDamage: 160,
      /** Fist reach (world m) — also the brain's melee range for attack orders. */
      meleeRange: 360,
      meleeRadius: 110,
      meleeDamage: 95,
      meleeCooldown: 1.2,
      meleeTiming: { windup: 0.3, impact: 0.45, end: 0.85 },
      rangedRange: 1400,
      rangedDamage: 90,
      rangedCooldown: 2.0,
      headHeight: 480,
      /** Measured standing bounding box (world m) — re-measure in Task 3 after the model exists. */
      size: { width: 420, length: 420, height: 380 },
    },
    /**
     * Molten Fist: targets within `frontHalf` (rad) of dead ahead take a slam; others a backhand whose hit arc
     * is centred `backhandCenter` rad off the nose on the target's side, ±`backhandHalf`. Buildings take buildingMult×.
     */
    fist: { frontHalf: 0.75, backhandCenter: 1.95, backhandHalf: 1.25, buildingMult: 2 },
    /** Magma Lob: splash radius (m), flight time (s), arc height (m); the lava pool it leaves (radius m, life s). */
    lob: { splash: 120, flight: 1.4, arc: 520, poolRadius: 110, poolLife: 3 },
    colors: {
      basalt: 0x3a3330,
      basaltDark: 0x221e1c,
      rock: 0x564b44,
      magma: 0xff6a1a,
      core: 0xffc23a,
      eye: 0xffd060,
      ember: 0xffb347,
      lava: 0xff4a12,
    },
  },
```

In `CONFIG.passives`, add after `grip`:

```ts
    /**
     * Molten Core (Golem): heat 0..1 rises by (damage taken / max HP) × gain and cools by `cool` per second.
     * Damage × (1 + heat × bonus[rank]); at heat ≥ auraAt a burn aura of radius[rank] deals dps[rank] to ground enemies.
     */
    core: { gain: 4, cool: 0.12, auraAt: 0.5, bonus: [0, 0.3, 0.45, 0.6], radius: [0, 260, 320, 380], dps: [0, 40, 60, 85] },
```

`MONSTER_SCALE` is the constant at the top of `config.ts`. The stats object must match `MonsterStats` exactly.

- [ ] **Step 2: Write the failing tests**

`src/monsters/golem/knuckleGait.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LIMBS, SWING, limbPlanted, limbSwing } from './knuckleGait';

describe('knuckle-walk gait', () => {
  it('has four limbs in planting order: left fist, right foot, right fist, left foot', () => {
    expect(LIMBS.map((l) => `${l.kind}${l.side}`)).toEqual(['fist0', 'foot1', 'fist1', 'foot0']);
  });

  it('plants every limb exactly once per cycle, a quarter cycle apart, in LIMBS order', () => {
    const plants: { i: number; c: number }[] = [];
    const N = 2000;
    for (let k = 0; k < N; k++) {
      const prev = 0.0005 + k / N;
      const cur = 0.0005 + (k + 1) / N;
      for (let i = 0; i < 4; i++) if (limbPlanted(prev, cur, i)) plants.push({ i, c: cur });
    }
    expect(plants.map((p) => p.i).sort()).toEqual([0, 1, 2, 3]);
    const start = plants.findIndex((p) => p.i === 0);
    const cyclic = [...plants.slice(start), ...plants.slice(0, start)].map((p) => p.i);
    expect(cyclic).toEqual([0, 1, 2, 3]);
    const at = (i: number) => plants.find((p) => p.i === i)!.c;
    expect(((at(1) - at(0) + 1) % 1)).toBeCloseTo(0.25, 2);
  });

  it('never reports a plant when the cycle did not advance', () => {
    expect(limbPlanted(0.39, 0.39, 0)).toBe(false);
    expect(limbPlanted(0.41, 0.39, 0)).toBe(false);
  });

  it('lifts only while swinging, landing at the front of its stride', () => {
    expect(limbSwing(SWING / 2, 0).lift).toBeCloseTo(1);
    expect(limbSwing(SWING - 1e-6, 0).stride).toBeCloseTo(1, 4);
    expect(limbSwing(SWING + 0.1, 0).lift).toBe(0);
    expect(limbSwing(0, 0).stride).toBeCloseTo(-1);
  });

  it('keeps a planted limb still in the world: stride × half-span + cycle × stride length is constant in stance', () => {
    const S = 340;
    const A = ((1 - SWING) * S) / 2;
    const world = (c: number) => limbSwing(c, 0).stride * A + c * S;
    expect(world(0.5)).toBeCloseTo(world(0.9), 6);
  });
});
```

`src/monsters/golem/fist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { backhandYaw, bearingTo, fistKind } from './fist';

describe('Molten Fist', () => {
  it('measures bearing from the nose, positive toward the left (+X)', () => {
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: 0, z: 100 })).toBeCloseTo(0);
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: 100, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: -100, z: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(bearingTo({ x: 0, z: 0 }, Math.PI / 2, { x: 100, z: 0 })).toBeCloseTo(0);
  });

  it('slams what is ahead and backhands what is beside or behind', () => {
    expect(fistKind(0.5, 0.75)).toBe('slam');
    expect(fistKind(-0.7, 0.75)).toBe('slam');
    expect(fistKind(1.2, 0.75)).toBe('backhand');
    expect(fistKind(-Math.PI, 0.75)).toBe('backhand');
  });

  it('centres the backhand arc on the target\'s side', () => {
    expect(backhandYaw(0, 1.5, 1.95)).toBeCloseTo(1.95);
    expect(backhandYaw(0, -1.5, 1.95)).toBeCloseTo(-1.95);
    expect(backhandYaw(1, 2, 1.95)).toBeCloseTo(2.95);
  });
});
```

`src/monsters/golem/heat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { auraOn, coolHeat, coreDamageMult, heatAfterHit } from './heat';

describe('Molten Core heat', () => {
  it('heats in proportion to the hit\'s share of max HP, capped at 1', () => {
    expect(heatAfterHit(0, 100, 1000, 4)).toBeCloseTo(0.4);
    expect(heatAfterHit(0.8, 100, 1000, 4)).toBe(1);
    expect(heatAfterHit(0.2, -50, 1000, 4)).toBeCloseTo(0.2);
  });

  it('cools over time and never drops below 0', () => {
    expect(coolHeat(0.5, 1, 0.12)).toBeCloseTo(0.38);
    expect(coolHeat(0.05, 1, 0.12)).toBe(0);
  });

  it('adds damage with heat and burns only from the threshold up', () => {
    expect(coreDamageMult(0, 0.3)).toBe(1);
    expect(coreDamageMult(1, 0.3)).toBeCloseTo(1.3);
    expect(coreDamageMult(0.5, 0.6)).toBeCloseTo(1.3);
    expect(auraOn(0.49, 0.5)).toBe(false);
    expect(auraOn(0.5, 0.5)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/monsters/golem`
Expected: FAIL. The modules don't exist.

- [ ] **Step 4: Implement**

`src/monsters/golem/knuckleGait.ts`:

```ts
/** Four limbs in planting order: left fist, right foot, right fist, left foot (side 0 = left/+X). */
export const LIMBS: readonly { kind: 'fist' | 'foot'; side: 0 | 1 }[] = [
  { kind: 'fist', side: 0 },
  { kind: 'foot', side: 1 },
  { kind: 'fist', side: 1 },
  { kind: 'foot', side: 0 },
];

/** Fraction of a cycle each limb spends lifted, swinging forward; the rest of the cycle it is planted. */
export const SWING = 0.4;

/** Phase offsets: each limb plants a quarter cycle after the one before it in LIMBS. */
const OFFSET: readonly number[] = [0, 0.75, 0.5, 0.25];

export function limbPhase(cycle: number, i: number): number {
  const p = cycle + OFFSET[i]!;
  return p - Math.floor(p);
}

/**
 * lift: 0..1 height factor. stride: −1 (back) .. 1 (front) along the body axis. A limb swings forward while
 * lifted, plants at the front, then slides back as the body passes over it.
 */
export function limbSwing(cycle: number, i: number): { lift: number; stride: number } {
  const p = limbPhase(cycle, i);
  if (p < SWING) {
    const t = p / SWING;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - SWING) / (1 - SWING);
  return { lift: 0, stride: 1 - 2 * t };
}

/** True when limb i's swing ended between prev and cur (it touched down). */
export function limbPlanted(prev: number, cur: number, i: number): boolean {
  if (cur <= prev) return false;
  const off = OFFSET[i]!;
  return Math.floor(prev + off - SWING) !== Math.floor(cur + off - SWING);
}
```

`src/monsters/golem/fist.ts`:

```ts
import { angleDelta, yawTo, type Vec2 } from '../../util/math';

export type FistKind = 'slam' | 'backhand';

/** Bearing of p from a body at `from` facing `yaw`: 0 dead ahead, + toward the body's left (+X), ±π behind. */
export function bearingTo(from: Vec2, yaw: number, p: Vec2): number {
  return angleDelta(yaw, yawTo(from, p));
}

/** Molten Fist: a target within `frontHalf` of dead ahead takes a slam; anything beside or behind, a backhand. */
export function fistKind(bearing: number, frontHalf: number): FistKind {
  return Math.abs(bearing) <= frontHalf ? 'slam' : 'backhand';
}

/** World yaw the backhand's hit arc is centred on: `centre` rad off the nose, on the target's side. */
export function backhandYaw(yaw: number, bearing: number, centre: number): number {
  return yaw + (bearing >= 0 ? centre : -centre);
}
```

`src/monsters/golem/heat.ts`:

```ts
/** Molten Core heat after taking `damage`: up by the hit's share of max HP × gain, capped at 1. */
export function heatAfterHit(heat: number, damage: number, maxHp: number, gain: number): number {
  return Math.min(1, heat + (Math.max(0, damage) / maxHp) * gain);
}

/** Heat after cooling for dt seconds at `rate` per second. */
export function coolHeat(heat: number, dt: number, rate: number): number {
  return Math.max(0, heat - rate * dt);
}

/** Damage multiplier from heat: 1 when cold, 1 + maxBonus at full heat. */
export function coreDamageMult(heat: number, maxBonus: number): number {
  return 1 + heat * maxBonus;
}

/** Whether the core is hot enough to burn what's close by. */
export function auraOn(heat: number, threshold: number): boolean {
  return heat >= threshold;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters/golem && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/monsters/golem
git commit -m "Golem: knuckle-walk gait, Molten Fist choice and Molten Core heat (pure), CONFIG.golem

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 2: Types, frame heat, magma particles, bombs and the Molten Core passive

**Files:**
- Modify: `src/monsters/types.ts`, `src/monster/Monster.ts`, `src/systems/Particles.ts`, `src/systems/Projectiles.ts`, `src/systems/Projectiles.test.ts`, `src/systems/Passives.ts`, `src/systems/Passives.test.ts`, `src/systems/Progression.ts`, `src/systems/Progression.test.ts`

**Interfaces:**
- Consumes: `CONFIG.golem` and `CONFIG.passives.core` (Task 1).
- Produces:
  - `MeleeShape` gains `{ kind: 'fist' }`
  - `MonsterKind.ranged` gains `'lob'`; `MonsterKind.antiAir` gains `'geyser'`
  - `BodyFrame.heat: number`
  - `MonsterBody.nova?(): void`
  - `Monster.heat: number` (0..1, written by `GameScene`, copied into the frame)
  - `ParticleKind` gains `'magma'`
  - `ShotKind` gains `'bomb'`; `Projectiles.fireBomb(from, to, damage)`
  - `AbilityId` gains `'core'`
  - `Passives.core(): { bonus: number; radius: number; dps: number } | null`

- [ ] **Step 1: Write the failing tests**

In `src/systems/Projectiles.test.ts`, add after the `fireChunk` describe:

```ts
describe('Projectiles.fireBomb', () => {
  it('lobs a magma bomb on a high arc that lands on the target after the lob flight time', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; x: number; z: number; damage: number }[] = [];
    p.onHit = (h) => hits.push({ kind: h.kind, x: h.point.x, z: h.point.z, damage: h.damage });
    p.fireBomb(new THREE.Vector3(0, 380, 0), new THREE.Vector3(0, 0, 1000), 90);
    let peak = 0;
    const steps = Math.ceil(CONFIG.golem.lob.flight / 0.05) + 2;
    for (let i = 0; i < steps; i++) {
      p.update(0.05);
      const s = (p as unknown as { shots: { pos: THREE.Vector3 }[] }).shots[0];
      if (s) peak = Math.max(peak, s.pos.y);
    }
    expect(hits).toEqual([{ kind: 'bomb', x: 0, z: 1000, damage: 90 }]);
    expect(peak).toBeGreaterThan(CONFIG.golem.lob.arc * 0.8);
    expect(p.incoming()).toHaveLength(0);
  });
});
```

In `src/systems/Passives.test.ts`:
- Add `core: 0` to the `ranks` helper's object (after `grip: 0`).
- Append:

```ts
describe('core', () => {
  it('Molten Core: off at rank 0, then a growing damage bonus, aura radius and burn per rank', () => {
    expect(new Passives(ranks({})).core()).toBeNull();
    const c1 = new Passives(ranks({ core: 1 })).core()!;
    const c3 = new Passives(ranks({ core: 3 })).core()!;
    expect(c1).toEqual({ bonus: P.core.bonus[1], radius: P.core.radius[1], dps: P.core.dps[1] });
    expect(c3.bonus).toBeGreaterThan(c1.bonus);
    expect(c3.radius).toBeGreaterThan(c1.radius);
    expect(c3.dps).toBeGreaterThan(c1.dps);
  });
});
```

In `src/systems/Progression.test.ts`, in `Progression.offer(all)` → "lists every upgrade…", change the pool filter to exclude the Golem's signature too (the default pool is the Insect's):

```ts
    const pool = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => id !== 'meltdown' && id !== 'grip' && id !== 'core');
```

Also append to `src/systems/Progression.test.ts`:

```ts
describe('Molten Core ability', () => {
  it('exists with a title, and the Insect\'s default pool never offers it', () => {
    expect(ABILITIES.core.title).toBe('Molten Core');
    const p = new Progression(mulberry32(5));
    expect(p.offer(true).map((o) => o.id)).not.toContain('core');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/systems/Projectiles.test.ts src/systems/Passives.test.ts src/systems/Progression.test.ts`
Expected: FAIL. `fireBomb`, `core()` and `ABILITIES.core` don't exist.

- [ ] **Step 3: Implement**

**`src/monsters/types.ts`:**
- Change `MeleeShape` to:

```ts
/** `multi`: independent tentacle strikes (Kraken), driven by the body's `arms`. `fist`: Molten Fist (Golem) — a slam ahead or a backhand to the side, on the shared melee timeline. */
export type MeleeShape = { kind: 'point' } | { kind: 'arc'; halfAngle: number } | { kind: 'multi' } | { kind: 'fist' };
```

- In `MonsterKind`: `ranged: 'spikes' | 'breath' | 'hurl' | 'lob';` and `antiAir: 'tail' | 'bite' | 'lash' | 'geyser';`
- In `BodyFrame`, after `charge`:

```ts
  /** Molten Core heat 0..1 (Golem seams and core); 0 for every other body. */
  heat: number;
```

- In `MonsterBody`, after `arms?`:

```ts
  /** The nova passive just fired (Golem: both fists slam the ground). Optional. */
  nova?(): void;
```

**`src/monster/Monster.ts`:**
- Add a field after `charge`:

```ts
  /** Molten Core heat 0..1, written by GameScene; the Golem's seams glow with it. */
  heat = 0;
```

- In the `frame` initialiser, add `heat: 0` after `charge: 0`.
- In `reset()`, add `this.heat = 0;` after `this.charge = 0;`.
- In `animate()`, add `f.heat = this.heat;` after `f.charge = this.charge;`.

**`src/systems/Particles.ts`:**
- `ParticleKind` gains `| 'magma'`.
- `PRESETS` gains:

```ts
  magma: { color: CONFIG.golem.colors.magma, life: 0.8, size0: 28, size1: 6, speed: 160, up: 110, gravity: 160, drag: 1 },
```

- `LAYER_OF` gains `magma: 'solid'`.

**`src/systems/Projectiles.ts`:**
- `ShotKind`: `'spike' | 'shell' | 'rocket' | 'glob' | 'chunk' | 'bomb'`.
- `sizes` gains `bomb: [44, 44, 44]`.
- `meshes` gains:

```ts
      bomb: make('shot-bomb', faceted(new THREE.IcosahedronGeometry(0.5, 0)), CONFIG.golem.colors.magma, 32),
```

- After `fireChunk`:

```ts
  /** Golem Magma Lob: a glowing bomb lobbed on a high arc; it splashes and leaves lava where it lands. */
  fireBomb(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('bomb', from, to, damage, null);
    s.dur = CONFIG.golem.lob.flight;
  }
```

- In `update`, after the `chunk` ballistic line:

```ts
        else if (s.kind === 'bomb') ballistic(s.from, s.aim, CONFIG.golem.lob.arc, k, s.pos);
```

- In `draw`, `counts` gains `bomb: 0`.

**`src/systems/Progression.ts`:**
- `AbilityId` gains `| 'core'`.
- `ABILITIES` gains, after `meltdown`:

```ts
  core: { title: 'Molten Core', icon: '❤️‍🔥', desc: (r) => (r === 1 ? 'Hits heat your core: more damage, and a burning aura when hot' : 'Hotter core: more damage, wider aura') },
```

- `emptyRanks` gains `core: 0`.

**`src/systems/Passives.ts`**, after `grip()`:

```ts
  /** Molten Core (Golem): max damage bonus at full heat, burn-aura radius and damage per second, or null if not taken. */
  core(): { bonus: number; radius: number; dps: number } | null {
    const r = this.ranks().core;
    return r > 0 ? { bonus: P.core.bonus[r]!, radius: P.core.radius[r]!, dps: P.core.dps[r]! } : null;
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Insect, Kaiju and Kraken bodies ignore `heat` and don't implement `nova`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Golem plumbing: fist/lob/geyser kinds, frame heat, magma particles, bombs, Molten Core passive

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 3: Golem body, definition, roster, select framing

**Files:**
- Create: `src/monsters/golem/GolemBody.ts`, `src/monsters/golem/kind.ts`, `src/monsters/golem/kind.test.ts`
- Modify: `src/monsters/types.ts` (`MonsterId`), `src/monsters/roster.ts`, `src/monsters/roster.test.ts`, `src/monsters/pick.test.ts`, `src/config.ts` (measured size)

**Interfaces:**
- Consumes: `LIMBS`, `SWING`, `limbSwing`, `limbPlanted` (Task 1); `fistKind` (Task 1); `BodyFrame.heat`, `MonsterBody.nova?` (Task 2); `CONFIG.golem`.
- Produces:
  - `GolemBody implements MonsterBody`, with `nova()`
  - `GOLEM: MonsterKind`
  - `MonsterId` includes `'golem'`
  - `KINDS.golem`

- [ ] **Step 1: Write the failing tests**

`src/monsters/golem/kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { GOLEM } from './kind';
import { KAIJU } from '../kaiju/kind';

describe('GOLEM kind', () => {
  it('uses its config stats: the toughest, hardest-hitting and slowest monster', () => {
    expect(GOLEM.stats).toEqual(CONFIG.golem.stats);
    expect(GOLEM.stats.maxHp).toBeGreaterThan(KAIJU.stats.maxHp);
    expect(GOLEM.stats.damageMult).toBeGreaterThan(KAIJU.stats.damageMult);
    expect(GOLEM.stats.moveSpeed).toBeLessThan(CONFIG.kraken.stats.moveSpeed);
    expect(GOLEM.pips).toEqual({ toughness: 5, power: 4, speed: 2 });
    expect(GOLEM.name).toBe('Magma Golem');
  });
  it('punches, lobs magma and vents at flyers', () => {
    expect(GOLEM.melee).toEqual({ kind: 'fist' });
    expect(GOLEM.ranged).toBe('lob');
    expect(GOLEM.antiAir).toBe('geyser');
    expect(GOLEM.tailSweep).toBe(false);
    expect(GOLEM.moves.map((m) => m.label)).toEqual(['Molten Fist', 'Magma Lob', 'Vent Burst']);
  });
  it('has its own named signatures with Molten Core — never Brood Swarm, Meltdown or Sucker Grip', () => {
    for (const id of ['brood', 'meltdown', 'grip'] as const) expect(GOLEM.signatures).not.toContain(id);
    expect(GOLEM.signatures).toContain('core');
    for (const id of GOLEM.signatures) expect(GOLEM.abilityText[id]?.title).toBeTruthy();
    expect(GOLEM.abilityText.core?.title).toBe('Molten Core');
    expect(GOLEM.abilityText.acid?.title).toBe('Lava Footprints');
    expect(GOLEM.abilityText.spines?.title).toBe('Vent Flak');
    expect(GOLEM.upgradeText.multiShot?.title).toBe('Twin Vents');
    expect(GOLEM.fx.particle).toBe('magma');
    expect(GOLEM.fx.intercept).toBe('magma');
  });
});
```

`src/monsters/roster.test.ts`: replace the first test's expectations so all four are playable, and add the Golem to the id test:

```ts
  it('lists four playable monsters in carousel order', () => {
    const e = rosterEntries();
    expect(e.map((x) => x.id)).toEqual(['insect', 'kaiju', 'kraken', 'golem']);
    expect(e.map((x) => x.available)).toEqual([true, true, true, true]);
    expect(e[0]!.name).toBe('Insect Titan');
    expect(e[3]!.name).toBe('Magma Golem');
    expect(e[0]!.pips).toEqual(KINDS.insect.pips);
    expect(e[2]!.pips).toEqual(KINDS.kraken.pips);
    expect(e[3]!.pips).toEqual(KINDS.golem.pips);
    for (const x of e) expect(x.silhouette.length).toBeGreaterThan(0);
    expect(ROSTER_ORDER).toHaveLength(4);
  });
```

In the second test, add `expect(isMonsterId('golem')).toBe(true);`.

`src/monsters/pick.test.ts`: replace `expect(parsePick('golem')).toBe('insect');` with:

```ts
    expect(parsePick('golem')).toBe('golem');
    expect(parsePick('dragon')).toBe('insect');
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/monsters`
Expected: FAIL. `./kind` doesn't exist, and the Golem isn't playable.

- [ ] **Step 3: `src/monsters/golem/GolemBody.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { fistKind } from './fist';
import { SWING, limbPlanted, limbSwing } from './knuckleGait';

const G = CONFIG.golem;
const C = G.colors;
/** Model units (before CONFIG.monster.scale). The torso pivots here (just behind the hips). */
const PIVOT = new THREE.Vector3(0, 250, -60);
const UPPER = 300;
const FORE = 320;
const THIGH = 160;
const SHIN = 150;
const FIST_R = 70;
/** Torso-space shoulder and hip on the left (+X); the right mirrors x. */
const SHOULDER = new THREE.Vector3(200, 480, 80);
const HIP = new THREE.Vector3(120, 250, -110);
/** Root-space rest spots (left side) of a planted fist (its centre) and foot, and how high each lifts mid-swing. */
const FIST_AT = new THREE.Vector3(250, FIST_R, 230);
const FOOT_AT = new THREE.Vector3(150, 0, -130);
const FIST_LIFT = 130;
const FOOT_LIFT = 70;
/** Slam: where the fist rises (left side) before it drops. Backhand: where it cocks across the chest, and its sweep radius. */
const SLAM_RAISE = new THREE.Vector3(170, 620, 260);
const BACKHAND_COCK = new THREE.Vector3(-60, 280, 320);
const BACKHAND_R = 520;
const ARM_REACH = UPPER + FORE - 30;
/** Eruption: seconds for both fists to rise and slam. */
const NOVA_TIME = 0.6;
/** Back vents (torso space): Magma Lob, Ember Storm and Pyroclast leave from these in turn. */
const BACK_VENTS: readonly (readonly [number, number, number])[] = [
  [85, 640, -70],
  [-85, 640, -70],
  [0, 615, -175],
];
/** Shoulder vent (torso space, left side; mirrored): Vent Burst geysers rise from here. */
const SHOULDER_VENT = new THREE.Vector3(205, 600, 60);
/** Glowing magma seams between the plates (torso space): x, y, z, width, height, depth, roll (rad). */
const SEAMS: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [0, 420, 205, 12, 150, 10, 0],
  [62, 330, 160, 90, 10, 10, 0.4],
  [-62, 330, 160, 90, 10, 10, -0.4],
  [150, 520, 125, 10, 90, 10, 0.3],
  [-150, 520, 125, 10, 90, 10, -0.3],
  [0, 575, 110, 150, 10, 12, 0],
  [105, 530, -150, 10, 120, 12, 0.5],
  [-105, 530, -150, 10, 120, 12, -0.5],
  [0, 470, -205, 170, 10, 12, 0],
];

const _rel = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _fist = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _raise = new THREE.Vector3();
const _end = new THREE.Vector3();
const _vent = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

/** v with x mirrored to side sx (+1 left, −1 right). */
function mirror(v: THREE.Vector3, sx: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * sx, v.y, v.z);
}

type Arm = { upper: THREE.Mesh; fore: THREE.Mesh; fist: THREE.Mesh };
type Leg = { thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };

/**
 * The Magma Golem: a hunched basalt hulk split by glowing magma seams, a molten core in its cracked chest,
 * a small sunk head, huge arms it knuckle-walks on and short thick legs. Back vents lob magma; shoulder vents
 * geyser at flyers. Faces +Z; +X is its left.
 */
export class GolemBody implements MonsterBody {
  readonly root = new THREE.Group();
  /** Pivots at PIVOT; `shell` (offset by −PIVOT) holds the torso parts in root-like coordinates. */
  private body = new THREE.Group();
  private shell = new THREE.Group();
  /** Named `limbArms`: `arms` is MonsterBody's optional tentacle hook (the 4b Kaiju collision). */
  private limbArms: Arm[] = [];
  private legs: Leg[] = [];
  private tintMats: THREE.MeshToonMaterial[];
  private seamMat: THREE.MeshToonMaterial;
  private coreMat: THREE.MeshToonMaterial;
  private eyeMat: THREE.MeshToonMaterial;
  private seams: THREE.InstancedMesh;
  private geyser: THREE.Mesh;
  private geos: THREE.BufferGeometry[] = [];
  private vents: THREE.Object3D[] = [];
  private ventMats: THREE.MeshToonMaterial[] = [];
  private ventFlash: number[] = [];
  private nextVent = 0;
  private novaT = -1;

  constructor() {
    const basalt = toonMat(C.basalt);
    const dark = toonMat(C.basaltDark);
    const rock = toonMat(C.rock);
    this.seamMat = toonMat(C.magma, { emissive: C.magma });
    this.coreMat = toonMat(C.core, { emissive: C.core });
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    this.tintMats = [basalt, dark, rock];
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const boulder = this.keep(faceted(new THREE.IcosahedronGeometry(1, 0)));
    const cone = this.keep(faceted(new THREE.ConeGeometry(0.5, 1, 5)));
    const cyl = this.keep(faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)));
    // Forearms widen toward the fist (placeSegment points +Y from elbow to fist).
    const fore = this.keep(faceted(new THREE.CylinderGeometry(0.6, 0.45, 1, 6)));
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0, rotZ = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.set(rotX, 0, rotZ);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const sh = this.shell;

    // Hips under a heavy hunched torso: a rock hump over the shoulders, a chest split by the core's crack.
    add(sh, blob, dark, [0, 250, -110], [150, 110, 140]);
    add(sh, blob, basalt, [0, 380, 20], [230, 180, 200], 0.3);
    add(sh, blob, basalt, [0, 520, -30], [280, 165, 240], 0.15);
    add(sh, blob, rock, [0, 590, -60], [200, 90, 180], 0.1);
    for (const sx of [1, -1]) {
      add(sh, box, dark, [sx * 72, 410, 185], [120, 180, 55], 0.35, -sx * 0.1);
      add(sh, blob, basalt, [sx * 200, 500, 70], [140, 125, 140]);
      add(sh, boulder, rock, [sx * 225, 570, 40], [80, 60, 80]);
      add(sh, cone, dark, [sx * 120, 600, -110], [60, 110, 60], -0.3, -sx * 0.3);
    }
    add(sh, blob, this.coreMat, [0, 405, 178], [55, 75, 40], 0.35);
    // A small head sunk between the shoulders: heavy brow, slit eyes, a jutting jaw.
    add(sh, box, basalt, [0, 470, 225], [120, 100, 120]);
    add(sh, box, dark, [0, 510, 280], [140, 32, 40]);
    add(sh, box, dark, [0, 425, 262], [104, 44, 96]);
    for (const sx of [1, -1]) add(sh, box, this.eyeMat, [sx * 32, 482, 288], [30, 9, 6]);

    // Magma seams: one instanced mesh.
    this.seams = new THREE.InstancedMesh(box, this.seamMat, SEAMS.length);
    SEAMS.forEach(([x, y, z, w, h, d, roll], i) => {
      _m.compose(_tmp.set(x, y, z), _q.setFromEuler(_e.set(0, 0, roll)), _s.set(w, h, d));
      this.seams.setMatrixAt(i, _m);
    });
    sh.add(this.seams);

    // Back vents: a dark chimney around a glowing throat; `mouth` is where shots leave.
    const collar = this.keep(faceted(new THREE.CylinderGeometry(1, 1.2, 1, 7)));
    const throat = this.keep(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
    for (const [x, y, z] of BACK_VENTS) {
      const vent = new THREE.Object3D();
      vent.position.set(x, y, z);
      vent.rotation.set(-0.35, 0, -Math.sign(x) * 0.3);
      add(vent, collar, dark, [0, 0, 0], [34, 50, 34]);
      const mat = toonMat(C.magma, { emissive: C.magma });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      add(vent, throat, mat, [0, 25.5, 0], [28, 1, 28]);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 45, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      sh.add(vent);
    }
    for (const sx of [1, -1]) add(sh, collar, dark, [SHOULDER_VENT.x * sx, SHOULDER_VENT.y - 15, SHOULDER_VENT.z], [26, 30, 26]);

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame).
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({
        upper: add(this.root, box, basalt, [0, 0, 0], [95, 1, 100]),
        fore: add(this.root, fore, dark, [0, 0, 0], [120, 1, 120]),
        fist: add(this.root, boulder, rock, [0, 0, 0], [FIST_R * 1.15, FIST_R, FIST_R * 1.15]),
      });
      this.legs.push({
        thigh: add(this.root, box, basalt, [0, 0, 0], [90, 1, 95]),
        shin: add(this.root, cyl, dark, [0, 0, 0], [80, 1, 80]),
        foot: add(this.root, box, dark, [0, 0, 0], [100, 44, 130]),
      });
    }

    // Vent Burst geyser: a bright magma column, shown only while it strikes.
    this.geyser = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: C.magma }));
    this.geyser.visible = false;
    this.root.add(this.geyser);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** Eruption: both fists rise and slam the ground. */
  nova(): void {
    this.novaT = 0;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const m = f.motion;
    const S = G.stats.strideLength;
    // Half the distance a planted limb slides back during stance, so it stays still on the ground.
    const A = ((1 - SWING) * S) / 2;
    if (this.novaT >= 0) {
      this.novaT += f.dt;
      if (this.novaT >= NOVA_TIME) this.novaT = -1;
    }
    const nova = this.novaT >= 0 ? this.novaT / NOVA_TIME : -1;
    const slam = nova >= 0 ? Math.sin(Math.PI * nova) : 0;

    // The shoulders roll toward the planting fist; the body bobs twice a cycle and breathes when still.
    const roll = Math.sin(f.cycle * Math.PI * 2) * 0.07 * m;
    const bob = Math.cos(f.cycle * Math.PI * 4) * 10 * m + Math.sin(f.time * 1.1) * 6;
    this.body.position.set(PIVOT.x, PIVOT.y + bob - f.pose.dip - slam * 40 - f.pose.collapse * 230, PIVOT.z);
    this.body.rotation.set(
      f.pose.pitch + (f.roaring ? -0.55 : 0) + (f.dashing ? 0.25 : 0) + slam * 0.25 + f.pose.collapse * 0.4,
      0,
      roll - f.pose.collapse * 0.15,
    );
    this.root.updateMatrixWorld(true);
    _rel.multiplyMatrices(this.body.matrix, this.shell.matrix);

    // Arms: walk on the fists, or strike, slam (Eruption), pound the chest (Roar), reach down (Leap).
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 0 : 2;
      const arm = this.limbArms[side]!;
      const g = limbSwing(f.cycle, limb);
      _gait.set(FIST_AT.x * sx, FIST_AT.y + g.lift * FIST_LIFT * m, FIST_AT.z + g.stride * A * m);
      _fist.copy(_gait);
      const striking = f.melee !== null && f.melee.side === side;
      if (striking) this.strikePose(f.melee!.t, f.melee!.target, sx, _gait, _fist);
      if (nova >= 0) {
        mirror(SLAM_RAISE, sx, _raise);
        if (nova < 0.5) _fist.lerpVectors(_gait, _raise, nova / 0.5);
        else _fist.lerpVectors(_raise, _end.set(sx * 280, FIST_R, 320), Math.min(1, (nova - 0.5) / 0.15));
      }
      if (f.roaring) _fist.set(sx * 90, 430 + Math.sin(f.time * 14 + side * Math.PI) * 45, 250);
      if (f.airborne) _fist.set(sx * 230, -30, 260);
      mirror(SHOULDER, sx, _sh).applyMatrix4(_rel);
      _tmp.subVectors(_fist, _sh);
      if (_tmp.length() > ARM_REACH) _fist.copy(_sh).add(_tmp.setLength(ARM_REACH));
      _pole.copy(_sh).add(_tmp.set(sx * 260, -40, -260)); // elbows out and back
      solveTwoBone(_sh, _fist, UPPER, FORE, _pole, _elbow);
      placeSegment(arm.upper, _sh, _elbow);
      placeSegment(arm.fore, _elbow, _fist);
      arm.fist.position.copy(_fist);
      if (m > 0.3 && !striking && nova < 0 && limbPlanted(f.prevCycle, f.cycle, limb)) {
        onFootLand(_world.copy(_gait).setY(0).applyMatrix4(this.root.matrixWorld));
      }
    }

    // Legs: short and planted, knees forward.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 3 : 1;
      const leg = this.legs[side]!;
      const g = limbSwing(f.cycle, limb);
      _foot.set(FOOT_AT.x * sx, g.lift * FOOT_LIFT * m, FOOT_AT.z + g.stride * A * m);
      if (f.airborne) _foot.set(sx * 150, 60, -60);
      mirror(HIP, sx, _hip).applyMatrix4(_rel);
      _pole.copy(_hip).add(_tmp.set(sx * 30, 0, 300));
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeSegment(leg.thigh, _hip, _knee);
      placeSegment(leg.shin, _knee, _foot);
      leg.foot.position.set(_foot.x, _foot.y + 22, _foot.z + 25);
      if (m > 0.3 && limbPlanted(f.prevCycle, f.cycle, limb)) onFootLand(_world.copy(_foot).setY(0).applyMatrix4(this.root.matrixWorld));
    }

    // Vent Burst: a magma geyser from the shoulder vent on the flyer's side, reaching it at full weight.
    if (f.antiAir && f.antiAir.weight > 0) {
      this.root.worldToLocal(_aim.copy(f.antiAir.target));
      mirror(SHOULDER_VENT, _aim.x >= 0 ? 1 : -1, _vent).applyMatrix4(_rel);
      _tip.lerpVectors(_vent, _aim, Math.min(1, f.antiAir.weight));
      placeSegment(this.geyser, _vent, _tip);
      this.geyser.scale.x = this.geyser.scale.z = 34 + 16 * f.antiAir.weight;
      this.geyser.visible = true;
    } else this.geyser.visible = false;

    // Glow: seams, core and eyes pulse at rest and blaze with Molten Core heat.
    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    const pulse = 0.25 * Math.sin(f.time * 2.2);
    this.seamMat.emissiveIntensity = f.flash ? 3 : 0.9 + pulse + f.heat * 2.2 + (f.roaring ? 1.5 : 0);
    this.coreMat.emissiveIntensity = f.flash ? 3 : 1.2 + pulse + f.heat * 3;
    this.eyeMat.emissiveIntensity = 1 + f.heat * 2 + (f.roaring ? 2 : 0);
    for (let i = 0; i < this.ventMats.length; i++) {
      this.ventFlash[i] = Math.max(0, this.ventFlash[i]! - f.dt * 5);
      this.ventMats[i]!.emissiveIntensity = f.flash ? 3 : 0.8 + f.heat + 3 * this.ventFlash[i]!;
    }
  }

  /**
   * Molten Fist (root space). Slam: rise, then drop onto the target. Backhand: cock across the chest, then sweep
   * out along an arc around the body to the target's side. Both ease back to the gait position.
   */
  private strikePose(t: number, target: THREE.Vector3, sx: number, gait: THREE.Vector3, out: THREE.Vector3): void {
    const T = G.stats.meleeTiming;
    this.root.worldToLocal(_aim.copy(target));
    _aim.y = FIST_R;
    if (fistKind(Math.atan2(_aim.x, _aim.z), G.fist.frontHalf) === 'slam') {
      mirror(SLAM_RAISE, sx, _raise);
      if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
      else if (t < T.impact) {
        const u = (t - T.windup) / (T.impact - T.windup);
        out.lerpVectors(_raise, _aim, u * u);
      } else out.lerpVectors(_aim, gait, Math.min(1, (t - T.impact) / (T.end - T.impact)));
      return;
    }
    mirror(BACKHAND_COCK, sx, _raise);
    const a0 = Math.atan2(_raise.x, _raise.z);
    const r0 = Math.hypot(_raise.x, _raise.z);
    const a1 = sx * G.fist.backhandCenter;
    _end.set(Math.sin(a1) * BACKHAND_R, FIST_R + 30, Math.cos(a1) * BACKHAND_R);
    if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
    else if (t < T.impact) {
      const u = (t - T.windup) / (T.impact - T.windup);
      const a = a0 + (a1 - a0) * u;
      const r = r0 + (BACKHAND_R - r0) * u;
      out.set(Math.sin(a) * r, _raise.y + (_end.y - _raise.y) * u, Math.cos(a) * r);
    } else out.lerpVectors(_end, gait, Math.min(1, (t - T.impact) / (T.end - T.impact)));
  }

  /** Shots leave from the back vents in turn; the one used flares. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const i = this.nextVent++ % this.vents.length;
    this.ventFlash[i] = 1;
    const v = this.vents[i]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first back vent. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.vents[0]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.seams.dispose();
  }
}
```

Notes for the implementer:
- `onFootLand` gets the ground point under each planted fist and foot, so footCrush, dust, Lava Footprints and shake all come from the shared `Monster.onFootLand` path.
- The striking fist and both fists during Eruption never plant (Review Focus 1).

- [ ] **Step 4: `src/monsters/golem/kind.ts`, `MonsterId`, roster**

```ts
import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { GolemBody } from './GolemBody';

const G = CONFIG.golem;

export const GOLEM: MonsterKind = {
  id: 'golem',
  name: 'Magma Golem',
  blurb: 'A mountain with a furnace for a heart. Slow, crushing, and it only gets hotter.',
  pips: { toughness: 5, power: 4, speed: 2 },
  moves: [
    { icon: '👊', label: 'Molten Fist' },
    { icon: '🌋', label: 'Magma Lob' },
    { icon: '♨️', label: 'Vent Burst' },
  ],
  stats: G.stats,
  melee: { kind: 'fist' },
  ranged: 'lob',
  antiAir: 'geyser',
  tailSweep: false,
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar', 'core'],
  abilityText: {
    acid: { title: 'Lava Footprints', icon: '👣', desc: (r) => (r === 1 ? 'Fists and feet leave burning lava' : 'Bigger, longer-lasting lava') },
    storm: { title: 'Ember Storm', icon: '🌠', desc: (r) => (r === 1 ? 'Vents fire homing embers every 6s' : '+3 embers, fires faster') },
    chitin: { title: 'Basalt Skin', icon: '🪨', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Stoke the Fire', icon: '🔥', desc: () => '+6 HP per kill' },
    spines: { title: 'Vent Flak', icon: '💥', desc: (r) => (r === 1 ? 'Vents shoot down incoming shells and missiles' : 'Faster, wider flak') },
    swat: { title: 'Vent Burst+', icon: '♨️', desc: () => 'Geysers hit flyers faster, harder, more at once' },
    nova: { title: 'Eruption', icon: '🌋', desc: (r) => (r === 1 ? 'Fists slam out a magma ring every 7s' : 'Bigger, stronger, more frequent eruptions') },
    mortar: { title: 'Pyroclast', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs magma at artillery, SAMs, trucks' : 'More bombs, bigger splash') },
    core: { title: 'Molten Core', icon: '❤️‍🔥', desc: (r) => (r === 1 ? 'Hits heat your core: more damage, and a burning aura when hot' : 'Hotter core: more damage, wider aura') },
  },
  upgradeText: {
    damage: { title: 'Molten Fury' },
    attackSpeed: { title: 'Open Vents' },
    vitality: { title: 'Bedrock' },
    regen: { title: 'Reforge' },
    stompRadius: { title: 'Tremor', desc: '+20% fist and stomp radius' },
    multiShot: { title: 'Twin Vents', desc: '+1 magma bomb per volley' },
    moveSpeed: { title: 'Landslide' },
  },
  fx: { spike: G.colors.ember, glob: G.colors.magma, pool: G.colors.lava, nova: G.colors.magma, particle: 'magma', intercept: 'magma' },
  createBody: () => new GolemBody(),
};
```

- In `src/monsters/types.ts`, change `MonsterId` to `'insect' | 'kaiju' | 'kraken' | 'golem'`.
- In `src/monsters/roster.ts`:
  - import `GOLEM` and add `golem: GOLEM` to `KINDS`;
  - make `COMING_SOON` an empty object, keeping its type and the unavailable-card branch for future creatures: `const COMING_SOON: Partial<Record<RosterId, { name: string; blurb: string }>> = {};`;
  - change the Golem's silhouette emoji to `'🌋'`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Look at it, measure it, tune it**

With the dev server running (already up at http://localhost:5173; don't start another), write `$SCRATCH/m4c-t3.mjs`. Use Playwright from `node_modules/playwright/index.mjs`, Chromium args `['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']`, at 1440×900 and at phone 390×844 (`isMobile`, `hasTouch`, `deviceScaleFactor: 2`). The script goes to select, calls `g.selectStep(3)` (the Golem) and waits 1.5 s. Then it:

1. **Screenshots** the select diorama at camera angles 0.5 and 2.0. Set `g.menuT` to choose the angle.
2. **Measures** the bounding box: walk every Mesh and the seam `InstancedMesh` under `g.monster.body.root`, transform the geometry bounding-box corners into root space, and multiply by `root.scale.x`. If the result differs from `CONFIG.golem.stats.size` by more than 10%, update the config to the measured `[x, z, y]` extents (rounded) and re-run the tests.
3. **Checks framing:** project the root, the fists and the vent tops each frame for 8 camera angles. The highest and lowest projected points must sit between the header's bottom and the panel's top (`.select-header`, `.select-panel`).
4. **Walks:** `g.playSelected()`, `g.skipIntro()`, then `g.order = { kind: 'move', to: { x: 0, z: 2000 } }`. Over 2.5 s:
   - record z, and count plants by wrapping `g.monster.onFootLand`;
   - record each plant's world position, and for every plant measure how far that limb's ground contact moves while planted (skate). Get the contact from the fist/foot mesh positions via `g.monster.body.limbArms` / `legs`, which are private but reachable at runtime;
   - screenshot mid-walk from the gameplay camera, from high above (`g.rig.orbit.pitch = 1.15`), and from the side (`o.pitch = 0.25; o.yaw += Math.PI / 2; o.distance *= 1.3`).
5. **Draw calls:** log `g.pixel.renderer.info.render.calls`.

**Expected:**
- **Look** (judged from the screenshots):
  - a clear hunched rock ape: dark basalt with bright orange seams and a glowing chest core;
  - a small head between huge shoulders, long arms down onto boulder fists, short legs;
  - chimney vents on the back;
  - plainly different from the Insect, Kaiju and Kraken.
- **Select framing:** the whole Golem is visible on desktop and phone, above the panel.
- **Walk:**
  - about 110 m/s, or about 250 m in 2.5 s allowing for the first turn;
  - four plants per cycle (about 3 cycles in 2.5 s, so at least 9 plants);
  - the side screenshot shows the diagonal sequence (one fist and the opposite foot forward);
  - planted fists and feet don't visibly skate (under 25 model units of drift while planted).
- **Draw calls:** below 150.

Fix anything that looks wrong before committing. Examples:
- fists not reaching the ground or arms over-stretched: adjust `SHOULDER`, `FIST_AT`, `UPPER` / `FORE`;
- the torso floating or sunk: adjust `PIVOT` and the shell parts' y;
- seams invisible at the pixel scale: thicken `SEAMS` widths;
- skating: check `A` against the measured cycle advance;
- the head lost between the shoulders: raise it or enlarge the eye slits.

Ledger every number you change, with old → new and why.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Golem: basalt-and-magma knuckle-walker body with fist, geyser and eruption poses; playable as the Magma Golem

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 4: Golem combat: Molten Fist, Magma Lob, Vent Burst, Molten Core, Eruption, Vent Flak

**Files:**
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes:
  - `bearingTo`, `fistKind`, `backhandYaw` (Task 1)
  - `heatAfterHit`, `coolHeat`, `coreDamageMult`, `auraOn` (Task 1)
  - `Projectiles.fireBomb`, the `'bomb'` hit kind, `Passives.core()`, `Monster.heat`, `MonsterBody.nova?` (Task 2)
  - `GOLEM` (Task 3)
- Produces: the Golem fully playable; `GameScene.heat` (private, read by scripts).

- [ ] **Step 1: Imports and the heat field**

Add the imports:

```ts
import { backhandYaw, bearingTo, fistKind } from './monsters/golem/fist';
import { auraOn, coolHeat, coreDamageMult, heatAfterHit } from './monsters/golem/heat';
```

Add a field after `tailCd`:

```ts
  /** Molten Core heat 0..1 (Golem); always 0 when the passive isn't taken. */
  private heat = 0;
```

In `resetRun()`, after `this.tailCd = 0;`:

```ts
    this.heat = 0;
    this.monster.heat = 0;
```

- [ ] **Step 2: Damage multiplier and heat on hits**

Replace `dmgMult()`:

```ts
  /** All of the monster's damage: upgrades × the creature's own multiplier × Meltdown × Molten Core heat. */
  private dmgMult(): number {
    const m = this.monster;
    const core = this.passives.core();
    const heat = core ? coreDamageMult(this.heat, core.bonus) : 1;
    return this.progression.stats.damageMult * m.kind.stats.damageMult * this.passives.meltdown(m.hp / m.maxHp).damage * heat;
  }
```

In `damageMonster`, after `m.flash();`:

```ts
    if (this.passives.core()) this.heat = heatAfterHit(this.heat, r.damage, m.maxHp, CONFIG.passives.core.gain);
```

- [ ] **Step 3: Molten Core cooling and the burn aura**

Add a method after `tailSwat`:

```ts
  /** Molten Core: heat cools; while hot it burns ground enemies close by. The body's glow follows the heat. */
  private updateCore(dt: number): void {
    const core = this.passives.core();
    const K = CONFIG.passives.core;
    this.heat = core ? coolHeat(this.heat, dt, K.cool) : 0;
    this.monster.heat = this.heat;
    if (!core || !auraOn(this.heat, K.auraAt)) return;
    const p = this.monster.position;
    const dmg = core.dps * dt * this.dmgMult();
    for (const t of footTargets({ x: p.x, z: p.z }, core.radius, this.enemyTargets())) t.applyDamage(dmg);
    if (Math.random() < dt * 10) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * core.radius;
      this.particles.emit('magma', this.tmpV.set(p.x + Math.sin(a) * r, 10, p.z + Math.cos(a) * r), 2, 0.5);
    }
    if (this.heat > 0.9 && Math.random() < dt * 12) this.particles.emit('fire', this.bodyPoint(520), 1, 0.5);
  }
```

In `update()`, in the playing block, right after `this.tailSweep(dt);`, add `this.updateCore(dt);`.

- [ ] **Step 4: Molten Fist**

In `meleeImpact`, at the top, after `const shape = this.monster.kind.melee;`:

```ts
    if (shape.kind === 'fist') {
      this.fistImpact(p);
      return;
    }
```

Add after `meleeImpact`:

```ts
  /**
   * Molten Fist lands at `p` (the clamped strike point). Ahead: a slam splashes ground enemies and buildings
   * around the fist. Beside or behind: a backhand sweeps everything in an arc on that side, within reach.
   */
  private fistImpact(p: THREE.Vector3): void {
    const m = this.monster;
    const F = CONFIG.golem.fist;
    const s = this.progression.stats;
    const from = { x: m.position.x, z: m.position.z };
    const dmg = this.ms.meleeDamage * this.dmgMult();
    const bearing = bearingTo(from, m.yaw, p);
    if (fistKind(bearing, F.frontHalf) === 'slam') {
      const r = this.ms.meleeRadius * s.stompRadiusMult;
      const at = { x: p.x, z: p.z };
      this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(dmg * F.buildingMult));
      for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(dmg);
      this.particles.ring('dust', p, r, 16);
      this.particles.emit('magma', this.tmpV.copy(p).setY(20), 12, 1.2);
      this.particles.emit('debris', this.tmpV.copy(p).setY(10), 8, 1.1);
      this.rig.addTrauma(0.35);
      return;
    }
    const reach = this.ms.meleeRange * s.stompRadiusMult;
    const yaw = backhandYaw(m.yaw, bearing, F.backhandCenter);
    for (const t of arcTargets(from, yaw, reach, F.backhandHalf, this.enemyTargets())) t.applyDamage(dmg);
    const buildings: Target[] = [];
    this.city.forEachStandingInRadius(from, reach, (t) => buildings.push(t));
    for (const t of arcTargets(from, yaw, reach, F.backhandHalf, buildings)) t.applyDamage(dmg * F.buildingMult);
    for (let i = -2; i <= 2; i++) {
      const a = yaw + (i / 2) * F.backhandHalf;
      this.tmpV.set(from.x + Math.sin(a) * reach * 0.7, 0, from.z + Math.cos(a) * reach * 0.7);
      this.particles.ring('dust', this.tmpV, 60, 6);
      this.particles.emit('debris', this.tmpV.setY(15), 3, 1);
    }
    this.rig.addTrauma(0.3);
  }
```

No change to `updateMonster`'s melee start is needed:
- `fist` isn't `'arc'`, so the body never turns for an auto strike;
- `strikePlan` picks the fist on the target's side (`leg` 0 = left) and clamps the point to reach;
- `m.startMelee` runs the shared timeline that the body poses and that fires `onMeleeImpact`.

- [ ] **Step 5: Magma Lob (ground-only)**

In `updateMonster`, replace the `rangedPool` expression's `hurl` case and the flyer-order drop so both apply to every ground-only ranged kind:

```ts
      const groundOnly = m.kind.ranged === 'hurl' || m.kind.ranged === 'lob';
      const rangedPool =
        m.kind.ranged === 'breath' ? this.enemyTargets().filter((t) => this.canBreatheAt(t))
        : groundOnly ? this.enemyTargets().filter((t) => !t.airborne && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) > reach)
        : this.enemyTargets();
```

```ts
      if (this.order?.kind === 'attack' && this.order.target.airborne && groundOnly) {
```

In `onTap`, change the flyer check to:

```ts
    // A hurler or lobber cannot hit flyers, so a tap on one is a plain move tap.
    if (target?.airborne && (this.monster.kind.ranged === 'hurl' || this.monster.kind.ranged === 'lob')) target = null;
```

In `fireRanged`, add the lob branch:

```ts
    else if (this.monster.kind.ranged === 'lob') this.lobAt(target);
```

Add after `hurlAt`:

```ts
  /** Magma Lob: back vents (1 + extra-projectile upgrades) lob bombs at the target and its nearest ground neighbours. */
  private lobAt(target: Target | null): void {
    if (!target || target.airborne) return;
    const m = this.monster;
    const from = { x: m.position.x, z: m.position.z };
    const count = 1 + this.progression.stats.extraSpikes;
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && !t.airborne && Math.hypot(t.position.x - from.x, t.position.z - from.z) <= this.ms.rangedRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const dmg = this.ms.rangedDamage * this.dmgMult();
    for (const t of spikeTargets(target, others, count)) {
      const vent = m.launchOrigin(new THREE.Vector3());
      this.projectiles.fireBomb(vent, t.position.clone().setY(0), dmg);
      this.particles.emit('magma', vent, 5, 0.7);
      this.particles.emit('smoke', vent, 2, 0.4);
    }
    m.consumeRanged(this.rangedCdMult());
  }
```

In `onProjectileHit`, before the `chunk` branch:

```ts
    if (h.kind === 'bomb') {
      const L = CONFIG.golem.lob;
      const at = { x: h.point.x, z: h.point.z };
      this.city.forEachStandingInRadius(at, L.splash, (t) => t.applyDamage(h.damage));
      for (const t of footTargets(at, L.splash, this.enemyTargets())) t.applyDamage(h.damage);
      if (this.state === 'playing') this.acid.add(h.point.clone().setY(0), L.poolRadius, L.poolLife);
      this.particles.ring('magma', h.point, L.splash, 12);
      this.particles.emit('magma', h.point, 10, 1.2);
      this.particles.emit('smoke', h.point, 3, 0.6);
      this.rig.addTrauma(0.15);
      return;
    }
```

- [ ] **Step 6: Eruption, and the Golem's Leap and Roar effects**

In `venomNova`, after `this.monster.body.arms?.spin();`, add `this.monster.body.nova?.();`.

The spec has the Golem land a Leap "fists-first in a magma-splashed crater" and has "every vent erupt" on Roar. Add these Golem-only effects so the other monsters' visuals are unchanged:
- In `leapLand(p)`, at the end: `if (this.monster.kind.id === 'golem') this.particles.ring('magma', p, 220, 18);`
- In `roar()`, at the end: `if (this.monster.kind.id === 'golem') for (let i = 0; i < 3; i++) this.particles.emit('magma', this.monster.launchOrigin(this.tmpV), 8, 1.2);`

Vent Burst needs no code: the shared `tailSwat` drives the timing and damage, and the body draws the geyser from `f.antiAir`. Vent Flak, Ember Storm, Pyroclast, Lava Footprints, Basalt Skin and Stoke the Fire likewise need none: they run on the shared passives with the Golem's `fx` colours.

- [ ] **Step 7: Run the tests and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 8: Scripted combat checks**

Write `$SCRATCH/m4c-t4.mjs` (same Playwright setup). Select the Golem (`selectStep(3)`), play, skip the intro, and set `g.openingDone = true`, `g.startLevelUpMoment = () => {}`, `g.enterLevelUp = () => {}`. Before each section, clear enemies, reset HP, and place the Golem at the origin with yaw 0. Sections:

1. **Fist ahead while walking:**
   - `g.order = { kind: 'move', to: { x: 0, z: 3000 } }`; one tank at (0, 330).
   - Log `{ dead, ms, yawMin, yawMax }`.
   - Wrap `g.monster.onFootLand` and log any plant within 120 m of the struck tank during the strike.
2. **Backhand:**
   - walking forward, one tank at (330, −60) (left, slightly behind);
   - log `{ dead, ms, yawRange }`;
   - screenshot mid-swing (wait for `g.monster.meleeT` to pass the windup).
3. **Magma Lob:**
   - standing; one tank at (0, 1000);
   - log hit kinds (wrap `g.projectiles.onHit`), whether the tank died, and whether an acid pool was added (wrap `g.acid.add`, or count `g.acid` pools);
   - screenshot a bomb in flight.
4. **Lob with Twin Vents:** `g.progression.stats.extraSpikes = 1`, two tanks at (0, 1000) and (200, 1050). Log bombs fired per volley (should be 2) and that both tanks take damage.
5. **Flyer tap:**
   - spawn a jet (`g.enemies.get('jet').spawn(g.ctx)`) and a tank at (0, 1000);
   - project the jet's position with `g.camera` and call `g.onTap(x, y)`;
   - log `order` (must not be an attack on the jet), and that the tank still dies within about 5 s.
6. **Vent Burst:** spawn jets and wait up to 15 s. Log a jet destroyed, and screenshot the geyser (`g.monster.body.geyser.visible`).
7. **Molten Core:**
   - `g.progression.ranks.core = 2`;
   - call `g.damageMonster(150, 'shell')` four times; log `g.heat` (≥ 0.5) and `g.dmgMult()` (> the value before);
   - place a tank at (150, 0) and log that it takes aura damage within 2 s with no melee or ranged (`g.monster.meleeCd = 99`, `g.monster.rangedCd = 99`);
   - wait 6 s with no hits and log `g.heat` falling;
   - screenshot the hot glow.
8. **Eruption:** `g.progression.ranks.nova = 1`; wait one interval; log that `body.novaT` became ≥ 0 and that a ring tank at 400 m died.
9. **Vent Flak:** `g.progression.ranks.spines = 1`; tanks at 800 m on several sides; HP set very high; over 8 s log the intercept count and the `magma` emits.
10. **Errors and draw calls:** collect page and console errors throughout; log max draw calls.

**Expected:**
1. The ahead tank dies within about 1.5 s; yaw doesn't change; no plant lands near the struck tank during the strike.
2. The beside/behind tank dies to a backhand; yaw doesn't change; the screenshot shows the fist sweeping out to the left.
3. `bomb` hits, the tank dies within about 4 s, and a lava pool is added.
4. Two bombs per volley.
5. `order` is a move (or null), and the tank dies within about 5 s.
6. A jet dies; the geyser is visible in the screenshot.
7. Heat ≥ 0.5 after the hits; damage up; the aura kills or damages the tank; heat falls when not hit; the seams visibly blaze.
8. `novaT` ≥ 0 and the ring tank dies.
9. Intercepts > 0, with `magma` emits.
10. `ERRORS none`; maximum draw calls below 150.

Read every screenshot. Fix failures with superpowers:systematic-debugging; pure logic gets a failing unit test first.

- [ ] **Step 9: Commit**

```bash
git add src/GameScene.ts
git commit -m "Golem combat: Molten Fist slams and backhands, Magma Lob with lava pools, Molten Core heat and aura, Eruption

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: End-to-end checks (Golem flows, switching, Insect / Kaiju / Kraken regression)

**Files:**
- Create (scratchpad, not committed): `$SCRATCH/m4ccheck.mjs`
- Modify only if a check fails, in the file that owns the bug. Write a failing unit test first where the logic is pure.

**Interfaces:**
- Consumes `window.__game`:
  - `getState`, `selIndex`, `selectStep`, `playSelected`, `skipIntro`, `changeMonster`, `restart`, `damageMonster`
  - `monster` (`.kind.id`, `.visible`, `.position`, `.yaw`, `.hp`, `.heat`, `.body`)
  - `heat`, `progression`, `projectiles`, `enemies`, `ctx`, `scene`, `acid`
  - `pixel.renderer.info` (`.render.calls`, `.memory.geometries`, `.memory.textures`)

- [ ] **Step 1: Write and run the script**

Run at desktop 1440×900 and phone 390×844 (`isMobile`, `hasTouch`). Sections, each logging labelled JSON lines:

1. **Select:**
   - Browse to the Golem (index 3).
   - Log `{ kind, visible, allAvailable }`, where `allAvailable` means all four roster entries are available.
   - Screenshot the select diorama at both sizes.
2. **Play the Golem:**
   - PLAY, and screenshot the intro at t ≈ 12 (cocoon) and t ≈ 14 (emerging).
   - Skip the intro, then repeat Task 4 sections 1 and 3 (fist ahead while walking, Magma Lob).
3. **Play Again and Change Monster:**
   - With `ranks.core = 2`, heat raised by hits, and a fist strike active, die (`g.damageMonster(1e9, 'shell')`), then Play Again.
   - Log `{ state, kind, heat: g.heat, monsterHeat: g.monster.heat, bombs }`, where `bombs` counts `'bomb'` shots in `g.projectiles.shots`.
   - Then die and Change Monster, and log the same.
4. **Switch loop:**
   - Browse Insect → Kaiju → Kraken → Golem → Insect three times.
   - Log `scene.children.length`, `memory.geometries` and `memory.textures` after each step.
5. **Heat isolation:** play the Kaiju with `ranks.core` forced to 0, take hits, and log `g.heat` (stays 0) and `g.monster.heat` (0).
6. **Regression:**
   - **Insect:** a tank 300 m ahead dies to the leg strike, and spikes are stinger-coloured.
   - **Kaiju:** a side tank dies to a head-aimed breath while walking (yaw unchanged), and a rear tank is hit by the tail sweep.
   - **Kraken:** the ring of four tanks dies to simultaneous slams (yaw unchanged), and a hurl kills a distant tank.
7. **Errors and draw calls:** collect page and console errors throughout, and log the maximum draw calls.

- [ ] **Step 2: Compare against the expected results**

1. **Select:** `kind: 'golem'`, `visible: true`, `allAvailable: true`. The screenshots frame the whole Golem above the panel at both sizes.
2. **Golem run:** the cocoon contains the Golem, and the Task 4 expectations hold.
3. **Resets:** after Play Again and Change Monster, `heat: 0`, `monsterHeat: 0` and `bombs: 0`.
4. **Switch loop:** `scene.children.length` is constant per monster across loops, and the geometry and texture counts are bounded (no steady climb per switch).
5. **Heat isolation:** both values stay 0.
6. **Regression:** the Insect, Kaiju and Kraken behave as described.
7. **Errors and draw calls:** `ERRORS none`, and maximum draw calls below 150.

Read every screenshot and judge the Golem's look and framing.

- [ ] **Step 3: Fix failures**

Use superpowers:systematic-debugging. Pure logic (gait, fist, heat, `Projectiles`, `Passives`) gets a failing unit test first. Re-run Step 1 until every line matches.

- [ ] **Step 4: Full suite and commit any fixes**

Run: `npx tsc --noEmit && npm test`. Expected: all pass. If files changed, commit:

```bash
git add -A src
git commit -m "Milestone 4c: fixes from end-to-end Golem checks

Co-Authored-By: <your model> <noreply@anthropic.com>"
```
