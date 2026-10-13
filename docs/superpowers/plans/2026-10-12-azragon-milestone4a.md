# AZRAGON Milestone 4a (Title, Monster Select, Monster Architecture, Reptile Kaiju) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start from a title screen, pick a monster on a 3D select screen, and play as either the Insect Titan (unchanged) or the new Reptile Kaiju.

**Architecture:**
- **Shared monster logic:** `Monster` keeps the logic every creature shares: movement, HP, cooldowns, attack timelines, and Leap/Dash/Roar.
- **Per-creature content:** lives in a `MonsterKind` (stats, kit, upgrade names, effect colours) with a `MonsterBody` (model plus animation). Insect and Kaiju each provide one.
- **Upgrade pool:** `Progression` offers the shared abilities plus the kind's signatures.
- **Menus:** `GameScene` gains `title` and `select` states driven by a pure flow reducer. React renders the menu UI.
- **Kaiju combat:** the Kaiju adds a biped gait, an arc melee, a beam ranged attack (`BreathBeam`) and Meltdown.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright with Metal GPU for scripted checks, RUN SDK `appStorage`.

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone4a-design.md`

## Global Constraints

- Project rules still hold:
  - no `useEffect` (use `useCallback` refs and `useRef` only);
  - game logic in classes, React for UI only;
  - no `setPixelRatio`;
  - models face +Z, and +X is the model's left;
  - tunables go in `src/config.ts`;
  - draw calls stay under 150 on every screen.
- **Insect gameplay must not change.** All existing tests keep passing, and the Insect's numbers are pinned by a test (Task 1).
- **Shared actives:** Leap, Dash and Roar have the same mechanics and numbers for every monster. Shield Bubble, Reflect Shield and Overload are shared upgrades.
- **Signature upgrades** are only offered to the monster that owns them.
- **Persistence:** the selected monster is saved under `RundotGameAPI.appStorage` key `azragon.monster`. Every SDK call is wrapped in try/catch, and any failure falls back to the Insect Titan. Never use `localStorage`.
- **Menu states:** `title` and `select` hide the HUD, ability buttons and edge arrows. Enemies, spawning, abilities, passives and the run timer are inactive.
- **Commits:** commit after every task. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Switching monsters back and forth on the select screen**, then playing, dying and choosing Change Monster:
   - the old body is removed (no leftover model or leaked meshes);
   - stats, HP and the upgrade pool match the shown monster;
   - effect colours follow the monster.

   Pinned by `Monster.setKind` tests (Task 1) and the scripted switch loop (Task 8).
2. **Play Again vs Change Monster after a run with upgrades:** ranks, stats and Meltdown reset; the same monster replays; nothing from the previous run leaks. Pinned by the scripted game-over checks (Task 8).
3. **Input in menu states:** taps, keys, drags and pinches never order the monster, fire abilities, skip a non-existent intro or level up. Arrow and Enter keys work only on the select screen. Pinned by `menuKey` tests and the scripted keyboard checks (Tasks 3 and 8).
4. **Kaiju beam aimed at an airborne target or past the range edge:** it hits along the line in XZ only, from the monster, never beyond `rangedRange`, and never at the monster itself. Pinned by `lineTargets` and `beamEnd` tests (Tasks 5 and 7).
5. **Storage unavailable, rejecting, or holding garbage:** the game still boots to the title with the Insect selected. Pinned by `pick` tests (Task 2).

---

## File Map

| File | Responsibility |
|---|---|
| `src/monsters/types.ts` | `MonsterId`, `RosterId`, `MonsterStats`, `MonsterKind`, `MonsterBody`, `BodyFrame` |
| `src/monsters/insect/InsectBody.ts` | Insect model and animation (moved from `Monster.animate`) |
| `src/monsters/insect/kind.ts` | Insect `MonsterKind` (numbers from `CONFIG.monster`) |
| `src/monsters/kaiju/bipedGait.ts` (+test) | Two-leg gait phases and landings |
| `src/monsters/kaiju/KaijuBody.ts` | Kaiju model and animation |
| `src/monsters/kaiju/kind.ts` | Kaiju `MonsterKind` |
| `src/monsters/roster.ts` (+test) | `KINDS`, roster order, coming-soon entries, `rosterEntries()` |
| `src/monsters/pick.ts` (+test) | Remembered pick: parse, load, save |
| `src/monster/Monster.ts` (+test) | Generic monster driven by a kind and body |
| `src/systems/Progression.ts` (+test) | Per-kind pool (`setPool`), `meltdown` ability |
| `src/systems/Passives.ts` (+test) | `meltdown()` |
| `src/systems/sweep.ts` (+test) | `arcTargets`, `lineTargets`, `linePoints` |
| `src/systems/BreathBeam.ts` (+test for `beamEnd`) | Kaiju breath: charge, fire, beam visuals |
| `src/systems/menuCamera.ts` (+test) | Title and select camera poses |
| `src/menuFlow.ts` (+test) | Pure state-transition reducer |
| `src/systems/tap.ts` (+test) | `menuKey` |
| `src/systems/Input.ts` | `menuKey` handler hook |
| `src/systems/Projectiles.ts`, `AcidPools.ts`, `Shockwave.ts` | Theme colours (`setTheme`, `setColor`) |
| `src/world/City.ts` | `setCrater(visible)` |
| `src/intro/timeline.ts`, `IntroCinematic.ts`, `PodModel.ts` | Cocoon sized per monster |
| `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx` | States, menu API, roster event, kind wiring |
| `src/ui/Title.tsx`, `src/ui/MonsterSelect.tsx`, `src/ui/GameOver.tsx`, `src/style.css` | Menu UI |

---

### Task 1: Generic `Monster` driven by a `MonsterKind`; the Insect moves onto it unchanged

**Files:**
- Create: `src/monsters/types.ts`, `src/monsters/insect/InsectBody.ts`, `src/monsters/insect/kind.ts`, `src/monster/Monster.test.ts`
- Modify: `src/monster/Monster.ts` (rewrite), `src/GameScene.ts`, `src/intro/IntroCinematic.ts`

**Interfaces:**
- Produces:
  - `type MonsterId = 'insect'` (widened to include `'kaiju'` in Task 6)
  - `type RosterId = 'insect' | 'kaiju' | 'kraken' | 'golem'`
  - `MonsterStats`, `MonsterKind`, `MonsterBody`, `BodyFrame` (code below)
  - `INSECT: MonsterKind`
  - `class Monster`:
    - `constructor(scene, kind)`
    - `kind`, `body`
    - `setKind(kind)`
    - `visible` (get/set)
    - `rangedOrigin(out)`
    - `charge` (0..1)
    - `rangedReady()`, `consumeRanged(mult)`
    - `startMelee(mult, side, point)`
    - unchanged: `startSwat`, `startRoar`, `startLeap`, `startDash`, `tick`, `animate`, `pose`, `reset`, `onFootLand`, `onMeleeImpact`, `onLeapLand`, `onSwatImpact`

- [ ] **Step 1: Write the failing tests**

`src/monster/Monster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Monster } from './Monster';
import type { MonsterBody, MonsterKind } from '../monsters/types';
import { INSECT } from '../monsters/insect/kind';
import { CONFIG } from '../config';
import { STRIKE_TIMES } from './strike';

function stubBody(): MonsterBody & { frames: number } {
  const root = new THREE.Group();
  return {
    root,
    frames: 0,
    animate() {
      this.frames++;
    },
    rangedOrigin: (out) => out.set(1, 2, 3),
    dispose() {},
  };
}

function kind(over: Partial<MonsterKind['stats']> = {}): MonsterKind {
  return { ...INSECT, stats: { ...INSECT.stats, ...over }, createBody: () => stubBody() };
}

describe('Monster', () => {
  it('takes HP, speed, and cooldowns from its kind', () => {
    const m = new Monster(new THREE.Scene(), kind({ maxHp: 777, moveSpeed: 100, meleeCooldown: 2, rangedCooldown: 3 }));
    expect(m.hp).toBe(777);
    expect(m.maxHp).toBe(777);
    m.yaw = 0;
    for (let i = 0; i < 10; i++) m.moveToward({ x: 0, z: 5000 }, 0.1, 1);
    expect(m.position.z).toBeCloseTo(100, 0);
    m.startMelee(1, 0, { x: 0, z: 200 });
    for (let i = 0; i < 19; i++) m.tick(0.1);
    expect(m.meleeReady()).toBe(false);
    m.tick(0.11);
    expect(m.meleeReady()).toBe(true);
    m.consumeRanged(1);
    m.tick(2.9);
    expect(m.rangedReady()).toBe(false);
    m.tick(0.11);
    expect(m.rangedReady()).toBe(true);
  });

  it('fires the melee impact at the kind\'s impact time, at the strike point', () => {
    const m = new Monster(new THREE.Scene(), kind({ meleeTiming: { windup: 0.2, impact: 0.5, end: 0.9 } }));
    const hits: THREE.Vector3[] = [];
    m.onMeleeImpact = (p) => hits.push(p);
    m.startMelee(1, 1, { x: 30, z: 40 });
    m.tick(0.45);
    expect(hits).toHaveLength(0);
    m.tick(0.1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.x).toBe(30);
    expect(hits[0]!.z).toBe(40);
  });

  it('swaps bodies with setKind: old root leaves the scene, the new one joins, stats reset', () => {
    const scene = new THREE.Scene();
    const m = new Monster(scene, kind({ maxHp: 500 }));
    const oldRoot = m.body.root;
    m.visible = false;
    m.hp = 10;
    m.setKind(kind({ maxHp: 900 }));
    expect(oldRoot.parent).toBeNull();
    expect(m.body.root.parent).toBe(scene);
    expect(m.hp).toBe(900);
    expect(m.visible).toBe(false);
  });

  it('delegates the ranged origin and passes the frame to its body', () => {
    const m = new Monster(new THREE.Scene(), kind());
    expect(m.rangedOrigin(new THREE.Vector3()).toArray()).toEqual([1, 2, 3]);
    m.animate(0.016, 0);
    expect((m.body as ReturnType<typeof stubBody>).frames).toBe(1);
  });
});

describe('INSECT kind', () => {
  it('keeps the Insect Titan\'s milestone-3 numbers', () => {
    const M = CONFIG.monster;
    const s = INSECT.stats;
    expect([s.maxHp, s.moveSpeed, s.turnRate, s.damageMult]).toEqual([M.maxHp, M.moveSpeed, M.turnRate, 1]);
    expect([s.footRadius, s.footDamage, s.bodyRadius, s.strideLength]).toEqual([M.footRadius, M.footDamage, M.bodyRadius, M.strideLength]);
    expect([s.meleeRange, s.meleeRadius, s.meleeDamage, s.meleeCooldown]).toEqual([M.meleeRange, M.meleeRadius, M.meleeDamage, M.meleeCooldown]);
    expect(s.meleeTiming).toEqual({ windup: M.meleeWindup, impact: M.meleeWindup + STRIKE_TIMES.strike, end: M.meleeWindup + STRIKE_TIMES.recover });
    expect([s.rangedRange, s.rangedDamage, s.rangedCooldown]).toEqual([M.spikeRange, M.spikeDamage, M.spikeCooldown]);
    expect(s.headHeight).toBe(CONFIG.passives.swat.headHeight);
    expect([INSECT.melee.kind, INSECT.ranged, INSECT.antiAir]).toEqual(['point', 'spikes', 'tail']);
  });
});
```

Run: `npx vitest run src/monster/Monster.test.ts`. Expected: FAIL (cannot resolve `../monsters/types` / `../monsters/insect/kind`).

- [ ] **Step 2: `src/monsters/types.ts`**

```ts
import type * as THREE from 'three';
import type { PoolSpec } from '../systems/Progression';

/** Playable creatures (widened as each one is built). */
export type MonsterId = 'insect';
/** Everything the select carousel shows, including creatures still to come. */
export type RosterId = 'insect' | 'kaiju' | 'kraken' | 'golem';

export type MonsterStats = {
  maxHp: number;
  moveSpeed: number;
  turnRate: number;
  /** Multiplies all of this monster's damage (on top of upgrades). */
  damageMult: number;
  /** Gait stride, model units (before CONFIG.monster.scale). */
  strideLength: number;
  bodyRadius: number;
  footRadius: number;
  footDamage: number;
  meleeRange: number;
  /** Point melee: splash radius at the strike point (unused by arc melee). */
  meleeRadius: number;
  meleeDamage: number;
  meleeCooldown: number;
  /** Melee timeline, seconds after the strike starts: windup ends, impact lands, strike ends. */
  meleeTiming: { windup: number; impact: number; end: number };
  rangedRange: number;
  rangedDamage: number;
  rangedCooldown: number;
  /** Head height (model units) that anti-air reach and defensive shots are measured from. */
  headHeight: number;
  /** Standing bounding size in world metres; the intro cocoon is sized from it. */
  size: { width: number; length: number; height: number };
};

export type MeleeShape = { kind: 'point' } | { kind: 'arc'; halfAngle: number };

/** Colours the shared effect systems take on for this monster. */
export type FxTheme = { spike: number; glob: number; pool: number; nova: number };

/** One frame of pose input for a body; positions are world space. */
export type BodyFrame = {
  dt: number;
  time: number;
  cycle: number;
  prevCycle: number;
  /** 0..1, how engaged the gait is. */
  motion: number;
  pose: { dip: number; pitch: number; collapse: number };
  /** Active melee strike: seconds since start, which side (0 = left/+X, 1 = right), world target. */
  melee: { t: number; side: number; target: THREE.Vector3 } | null;
  /** Active anti-air strike: reach weight (tailSwat curve) toward the world target. */
  antiAir: { weight: number; target: THREE.Vector3 } | null;
  roaring: boolean;
  /** Ranged charge 0..1 (Kaiju plates). */
  charge: number;
  flash: boolean;
  glow: number;
};

export interface MonsterBody {
  /** Positioned, rotated and scaled by Monster; the body poses everything inside it. */
  readonly root: THREE.Group;
  /** Pose for this frame; call `onFootLand(worldPoint)` for every foot that touches down. */
  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void;
  /** World point ranged attacks leave from. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export type MonsterKind = PoolSpec & {
  id: MonsterId;
  name: string;
  blurb: string;
  /** Select-screen ratings, 1..5. */
  pips: { toughness: number; power: number; speed: number };
  moves: readonly { icon: string; label: string }[];
  stats: MonsterStats;
  melee: MeleeShape;
  ranged: 'spikes' | 'breath';
  antiAir: 'tail' | 'bite';
  fx: FxTheme;
  createBody(): MonsterBody;
};
```

`PoolSpec` is added to `Progression.ts` in this step; Task 2 tests its behaviour. Add it right after `MAX_RANK`/`ROMAN` in `src/systems/Progression.ts`:

```ts
/** What a monster's level-up pool offers beyond the shared abilities, and its display names. */
export type PoolSpec = {
  signatures: readonly AbilityId[];
  abilityText: Partial<Record<AbilityId, { title: string; icon: string; desc(rank: number): string }>>;
  upgradeText: Partial<Record<UpgradeId, { title: string; desc?: string; icon?: string }>>;
};
```

- [ ] **Step 3: `src/monsters/insect/InsectBody.ts`**

This moves the posing half of the old `Monster.animate` into the body. The Insect's look and motion are unchanged.

```ts
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { InsectTitanModel } from '../../monster/InsectTitanModel';
import { didLand, footState } from '../../monster/gait';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import { strikeFootPose } from '../../monster/strike';
import type { BodyFrame, MonsterBody } from '../types';

const FEMUR = 300;
const TIBIA = 400;
const LIFT = 110;
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _target = new THREE.Vector3();
const _swat = new THREE.Vector3();
/** Foot offset (model units) for the cocked leg: high and pulled back. */
const _strikeLift = new THREE.Vector3(0, 420, -80);

/** The Insect Titan: six IK legs on a tripod gait, a leg strike, a swatting tail with the stinger. */
export class InsectBody implements MonsterBody {
  private model = new InsectTitanModel();

  get root(): THREE.Group {
    return this.model.root;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const root = this.model.root;
    const body = this.model.body;
    const bob = Math.sin(f.cycle * Math.PI * 4) * 10 * f.motion;
    const breathe = Math.sin(f.time * 1.6) * 5;
    body.position.y = bob + breathe - f.pose.dip - f.pose.collapse * 230;
    body.rotation.x = f.pose.pitch;
    body.rotation.z = Math.sin(f.cycle * Math.PI * 2) * 0.03 * f.motion;
    root.updateMatrixWorld(true);

    const strikeLeg = f.melee ? f.melee.side : -1;
    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(f.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = 1 + f.pose.collapse * 0.35;
      _foot.set(leg.restFoot.x * splay, fs.lift * LIFT * f.motion, leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * f.motion);
      if (i === strikeLeg && f.melee) {
        _target.copy(f.melee.target);
        root.worldToLocal(_target);
        _target.y = 0;
        _gait.copy(_foot);
        strikeFootPose(f.melee.t, CONFIG.monster.meleeWindup, _gait, _strikeLift, _target, _foot);
      }
      _pole.copy(_hip).add(_knee.set(leg.side * 120, 700, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (f.motion > 0.3 && i !== strikeLeg && didLand(f.prevCycle, f.cycle, i)) {
        onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = f.roaring ? 0.55 : 0.18 + Math.sin(f.time * 7) * 0.08;
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    if (f.antiAir) this.model.updateTail(f.time, body.worldToLocal(_swat.copy(f.antiAir.target)), f.antiAir.weight);
    else this.model.updateTail(f.time);

    for (const m of this.model.materials) {
      if (f.flash) m.emissive.setHex(0xffffff);
      else m.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
  }

  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.model.stingerTip.getWorldPosition(out);
  }

  dispose(): void {
    this.model.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
```

Note: the old `Monster.animate` checked `i === this.strikeLeg && this.meleeT >= 0`. `f.melee` is non-null exactly when `meleeT >= 0`, so the behaviour is the same.

- [ ] **Step 4: `src/monsters/insect/kind.ts`**

```ts
import { CONFIG } from '../../config';
import { STRIKE_TIMES } from '../../monster/strike';
import type { MonsterKind } from '../types';
import { InsectBody } from './InsectBody';

const M = CONFIG.monster;
const P = CONFIG.palette;

export const INSECT: MonsterKind = {
  id: 'insect',
  name: 'Insect Titan',
  blurb: 'Six-legged hive horror. Fast, venomous, relentless.',
  pips: { toughness: 3, power: 3, speed: 4 },
  moves: [
    { icon: '🦵', label: 'Leg Strike' },
    { icon: '🎯', label: 'Stinger Spikes' },
    { icon: '🦂', label: 'Tail Swat' },
  ],
  stats: {
    maxHp: M.maxHp,
    moveSpeed: M.moveSpeed,
    turnRate: M.turnRate,
    damageMult: 1,
    strideLength: M.strideLength,
    bodyRadius: M.bodyRadius,
    footRadius: M.footRadius,
    footDamage: M.footDamage,
    meleeRange: M.meleeRange,
    meleeRadius: M.meleeRadius,
    meleeDamage: M.meleeDamage,
    meleeCooldown: M.meleeCooldown,
    meleeTiming: { windup: M.meleeWindup, impact: M.meleeWindup + STRIKE_TIMES.strike, end: M.meleeWindup + STRIKE_TIMES.recover },
    rangedRange: M.spikeRange,
    rangedDamage: M.spikeDamage,
    rangedCooldown: M.spikeCooldown,
    headHeight: CONFIG.passives.swat.headHeight,
    size: { width: 484, length: 451, height: 344 },
  },
  melee: { kind: 'point' },
  ranged: 'spikes',
  antiAir: 'tail',
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'brood', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {},
  upgradeText: {},
  fx: { spike: P.stinger, glob: P.acid, pool: P.acid, nova: P.acid },
  createBody: () => new InsectBody(),
};
```

- [ ] **Step 5: Rewrite `src/monster/Monster.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDelta, dist2, yawTo, type Vec2 } from '../util/math';
import { leapPosition } from './leap';
import { SWAT_TIMES, swatWeight } from './tailSwat';
import type { BodyFrame, MonsterBody, MonsterKind } from '../monsters/types';

const FACE_BEFORE_WALK = 1.0; // radians of yaw error allowed while walking

/**
 * The player's monster: the logic every creature shares (movement, HP, cooldowns, attack timelines,
 * Leap/Dash/Roar poses). The creature itself — model, gait, stats — comes from its MonsterKind.
 */
export class Monster {
  readonly position = new THREE.Vector3();
  kind: MonsterKind;
  body: MonsterBody;
  yaw = 0;
  hp: number;
  maxHp: number;
  alive = true;
  crouch = false;
  /** Gold level-up glow, 0..1; the hit flash takes priority. */
  glow = 0;
  /** Ranged charge 0..1, shown by bodies that telegraph it (Kaiju plates). */
  charge = 0;
  /** Extra body pose offsets driven by attacks, abilities, the intro, and death. */
  readonly pose = { dip: 0, pitch: 0, collapse: 0 };
  onLeapLand: (p: THREE.Vector3) => void = () => {};
  onFootLand: (p: THREE.Vector3) => void = () => {};
  onMeleeImpact: (p: THREE.Vector3) => void = () => {};
  /** Fires once per anti-air strike, when the tail tip or jaws reach the target. */
  onSwatImpact: () => void = () => {};

  private cycle = 0;
  private lastCycle = 0;
  private motion = 0;
  private flashT = 0;
  private leapT = -1;
  private dashT = -1;
  private dashFrom = { x: 0, z: 0 };
  private dashTo = { x: 0, z: 0 };
  private leapFrom = { x: 0, z: 0 };
  private leapTo = { x: 0, z: 0 };
  private roarT = -1;
  private swatT = -1;
  private swatTarget: THREE.Vector3 | null = null;
  private swatHit = false;
  private meleeCd = 0;
  private rangedCd = 0;
  private meleeT = -1;
  private impactDone = false;
  private meleeSide = 0;
  private strikePoint = new THREE.Vector3();
  private frame: BodyFrame = {
    dt: 0, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: this.pose,
    melee: null, antiAir: null, roaring: false, charge: 0, flash: false, glow: 0,
  };
  private meleeFrame = { t: 0, side: 0, target: this.strikePoint };
  private antiAirFrame = { weight: 0, target: new THREE.Vector3() };

  constructor(
    private scene: THREE.Scene,
    kind: MonsterKind,
  ) {
    this.kind = kind;
    this.hp = this.maxHp = kind.stats.maxHp;
    this.body = this.mount(kind);
  }

  private mount(kind: MonsterKind): MonsterBody {
    const b = kind.createBody();
    b.root.scale.setScalar(CONFIG.monster.scale);
    this.scene.add(b.root);
    return b;
  }

  /** Become another creature (select screen): new body and stats, fresh state, same visibility. */
  setKind(kind: MonsterKind): void {
    if (kind === this.kind) return;
    const visible = this.visible;
    this.scene.remove(this.body.root);
    this.body.dispose();
    this.kind = kind;
    this.body = this.mount(kind);
    this.visible = visible;
    this.reset();
  }

  get visible(): boolean {
    return this.body.root.visible;
  }

  set visible(v: boolean) {
    this.body.root.visible = v;
  }

  /** World point ranged attacks leave from (stinger tip, jaws). */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    return this.body.rangedOrigin(out);
  }

  get airborne(): boolean {
    return this.leapT >= 0;
  }

  /** Leaping, roaring or dashing: the brain must not move or attack. */
  get busy(): boolean {
    return this.leapT >= 0 || this.roarT >= 0 || this.dashT >= 0;
  }

  get dashing(): boolean {
    return this.dashT >= 0;
  }

  get swatting(): boolean {
    return this.swatT >= 0;
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.hp = this.maxHp = this.kind.stats.maxHp;
    this.alive = true;
    this.cycle = this.lastCycle = 0;
    this.motion = 0;
    this.pose.dip = this.pose.pitch = this.pose.collapse = 0;
    this.meleeCd = this.rangedCd = 0;
    this.meleeT = -1;
    this.leapT = -1;
    this.roarT = -1;
    this.swatT = -1;
    this.swatTarget = null;
    this.dashT = -1;
    this.crouch = false;
    this.charge = 0;
  }

  /** Dash: charge in a straight line along the ground to `to`. */
  startDash(to: Vec2): void {
    this.dashFrom = { x: this.position.x, z: this.position.z };
    this.dashTo = { x: to.x, z: to.z };
    this.dashT = 0;
    this.yaw = yawTo(this.dashFrom, this.dashTo);
    this.meleeT = -1;
  }

  startLeap(to: Vec2): void {
    this.leapFrom = { x: this.position.x, z: this.position.z };
    this.leapTo = { x: to.x, z: to.z };
    this.leapT = 0;
    this.yaw = yawTo(this.leapFrom, this.leapTo);
    this.meleeT = -1;
  }

  /** Anti-air strike (Tail Swat / Snap Bite) at `target`, a live world position followed as it moves. */
  startSwat(target: THREE.Vector3): void {
    this.swatT = 0;
    this.swatTarget = target;
    this.swatHit = false;
  }

  startRoar(): void {
    this.roarT = 0;
    this.meleeT = -1;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Rotate toward p at the capped turn rate. Returns remaining |yaw error|. */
  faceToward(p: Vec2, dt: number): number {
    const target = yawTo({ x: this.position.x, z: this.position.z }, p);
    const err = angleDelta(this.yaw, target);
    const step = Math.sign(err) * Math.min(Math.abs(err), this.kind.stats.turnRate * dt);
    this.yaw += step;
    this.cycle += (Math.abs(step) * 160) / this.kind.stats.strideLength;
    this.motion = Math.max(this.motion, Math.min(1, Math.abs(step) * 40));
    return Math.abs(err - step);
  }

  /** Turn, then walk toward goal. Returns true on arrival. */
  moveToward(goal: Vec2, dt: number, speedMult: number): boolean {
    const here = { x: this.position.x, z: this.position.z };
    const d = dist2(here, goal);
    if (d <= CONFIG.monster.arriveRadius) return true;
    const err = this.faceToward(goal, dt);
    if (err < FACE_BEFORE_WALK) {
      const step = Math.min(d, this.kind.stats.moveSpeed * speedMult * dt * (1 - err / FACE_BEFORE_WALK));
      this.position.x += Math.sin(this.yaw) * step;
      this.position.z += Math.cos(this.yaw) * step;
      this.cycle += step / (this.kind.stats.strideLength * CONFIG.monster.scale);
      this.motion = 1;
    }
    return false;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  meleeReady(): boolean {
    return this.alive && this.meleeCd <= 0 && this.meleeT < 0;
  }

  rangedReady(): boolean {
    return this.alive && this.rangedCd <= 0;
  }

  /** Melee strike on `side` (0 = left/+X, 1 = right) at `point` (world XZ, already clamped to reach). */
  startMelee(cooldownMult: number, side: number, point: Vec2): void {
    this.meleeCd = this.kind.stats.meleeCooldown * cooldownMult;
    this.meleeT = 0;
    this.impactDone = false;
    this.meleeSide = side;
    this.strikePoint.set(point.x, 0, point.z);
  }

  consumeRanged(cooldownMult: number): void {
    this.rangedCd = this.kind.stats.rangedCooldown * cooldownMult;
  }

  /** Place the body and pose it. Call once per frame after movement. */
  animate(dt: number, time: number): void {
    const f = this.frame;
    f.prevCycle = this.lastCycle;
    this.lastCycle = this.cycle;
    this.motion = Math.max(0, this.motion - dt * 2);
    if (this.flashT > 0) this.flashT -= dt;
    const root = this.body.root;
    root.position.copy(this.position);
    root.rotation.y = this.yaw;
    f.dt = dt;
    f.time = time;
    f.cycle = this.cycle;
    f.motion = this.motion;
    if (this.meleeT >= 0) {
      this.meleeFrame.t = this.meleeT;
      this.meleeFrame.side = this.meleeSide;
      f.melee = this.meleeFrame;
    } else f.melee = null;
    if (this.swatT >= 0 && this.swatTarget) {
      this.antiAirFrame.weight = swatWeight(this.swatT);
      this.antiAirFrame.target.copy(this.swatTarget);
      f.antiAir = this.antiAirFrame;
    } else f.antiAir = null;
    f.roaring = this.roarT >= 0;
    f.charge = this.charge;
    f.flash = this.flashT > 0;
    f.glow = this.glow;
    this.body.animate(f, this.onFootLand);
  }

  /** Cooldowns, the melee timeline, and leap/dash/roar/anti-air timing. */
  tick(dt: number): void {
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
    if (this.dashT >= 0) {
      const D = CONFIG.abilities.dash;
      this.dashT += dt;
      const p = leapPosition(this.dashFrom, this.dashTo, this.dashT, D.duration, 0);
      const step = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      this.position.set(p.x, 0, p.z);
      this.cycle += step / (this.kind.stats.strideLength * CONFIG.monster.scale);
      this.motion = 1;
      this.pose.pitch = 0.18;
      if (this.dashT >= D.duration) this.dashT = -1;
    }
    if (this.swatT >= 0) {
      this.swatT += dt;
      if (!this.swatHit && this.swatT >= SWAT_TIMES.impact) {
        this.swatHit = true;
        this.onSwatImpact();
      }
      if (this.swatT >= SWAT_TIMES.total) {
        this.swatT = -1;
        this.swatTarget = null;
      }
    }
    if (this.roarT >= 0) {
      this.roarT += dt;
      const k = this.roarT / CONFIG.abilities.roar.duration;
      this.pose.pitch = -0.45 * Math.sin(Math.PI * Math.min(1, k));
      if (k >= 1) this.roarT = -1;
    }
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    if (this.meleeT < 0) {
      if (this.leapT < 0 && this.roarT < 0) this.pose.pitch *= Math.exp(-10 * dt);
      this.pose.dip += ((this.crouch ? 35 : 0) - this.pose.dip) * (1 - Math.exp(-10 * dt));
      return;
    }
    this.meleeT += dt;
    const T = this.kind.stats.meleeTiming;
    if (this.meleeT < T.windup) {
      // Rear back slightly while the strike cocks.
      this.pose.pitch = -0.12 * (this.meleeT / T.windup);
    } else if (this.meleeT >= T.impact && !this.impactDone) {
      this.impactDone = true;
      this.pose.pitch = 0.1;
      this.pose.dip = 25;
      this.onMeleeImpact(this.strikePoint.clone());
    }
    if (this.meleeT > T.end) this.meleeT = -1;
  }
}
```

Note: the old code passed `onFootLand` and other hooks through the model's root position alias. `position` is now its own vector, copied onto `body.root` in `animate`. Anything that read `monster.model.root.position` must read `monster.position` (only `Monster` itself did).

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/monster/Monster.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 7: Switch `GameScene` and `IntroCinematic` to the generic API**

In `src/GameScene.ts`:

1. **Imports and construction.**
   - Add `import { INSECT } from './monsters/insect/kind';`.
   - Change `this.monster = new Monster(this.scene);` to `this.monster = new Monster(this.scene, INSECT);`.
   - Add `this.progression.setPool(this.monster.kind);` on the next line. `setPool` is added in Task 2; until then, skip this line.
2. **Per-kind stats accessor.** Add a private getter below the fields:
   ```ts
   /** The current monster's stats. */
   private get ms() {
     return this.monster.kind.stats;
   }
   ```
3. **Line-by-line replacements** (left-hand text → right-hand text):

| Find | Replace with |
|---|---|
| `Math.round(CONFIG.monster.maxHp * s.maxHpMult)` | `Math.round(this.ms.maxHp * s.maxHpMult)` |
| `this.monster.model.stingerTip.getWorldPosition(new THREE.Vector3())` (brood, line ~348) | `this.monster.rangedOrigin(new THREE.Vector3())` |
| `m.model.stingerTip.getWorldPosition(new THREE.Vector3())` (spikeStorm, fireSpikes) | `m.rangedOrigin(new THREE.Vector3())` |
| `this.monster.model.stingerTip.getWorldPosition(new THREE.Vector3())` (acidMortar) | `this.monster.rangedOrigin(new THREE.Vector3())` |
| every `CONFIG.monster.spikeRange` | `this.ms.rangedRange` |
| every `CONFIG.monster.spikeDamage` | `this.ms.rangedDamage` |
| `CONFIG.monster.footRadius` | `this.ms.footRadius` |
| `CONFIG.monster.footDamage` | `this.ms.footDamage` |
| `CONFIG.monster.meleeRadius` | `this.ms.meleeRadius` |
| `CONFIG.monster.meleeDamage` | `this.ms.meleeDamage` |
| every `CONFIG.monster.meleeRange` | `this.ms.meleeRange` |
| `CONFIG.monster.bodyRadius` | `this.ms.bodyRadius` |
| `spikeReady: m.spikeReady(),` | `spikeReady: m.rangedReady(),` |
| `m.consumeSpike(s.cooldownMult);` | `m.consumeRanged(s.cooldownMult);` |
| `const head = this.bodyPoint(CONFIG.passives.swat.headHeight);` | `const head = this.bodyPoint(this.ms.headHeight);` |

`CONFIG.monster.scale`, `arriveRadius`, `contactDps`, `regenPerSec`, `deathTime`, `spikeSpreadRad` and `spikeSpeed` stay as they are: they are shared.

In `src/intro/IntroCinematic.ts`, replace each `m.model.root.visible` and `h.monster.model.root.visible` with `m.visible` / `h.monster.visible`.

Confirm nothing outside `src/monsters/insect/` reaches into the Insect any more:
```bash
grep -rn "model\.\|stingerTip\|consumeSpike\|spikeReady" src --include=*.ts | grep -v "src/monster/InsectTitanModel.ts\|src/monsters/insect/"
```
Expected: no output.

- [ ] **Step 8: Verify the Insect is unchanged**

Run: `npx tsc --noEmit && npm test`. Expected: no type errors; all tests pass (202 + 5 new).

Browser check with the dev server running:
- Write `$SCRATCH/m4t1.mjs`. It loads the page, waits for state `intro`, skips it, then spawns a tank 300 m ahead:
  ```js
  g.enemies.get('tank').spawnAt(0, 300, g.ctx)
  ```
  After 4 s it prints `{ hp, kills, x, z, legs: g.monster.body.model.legs.length }`, and it takes a desktop screenshot. It uses the `chromium` launch args from the milestone 3 scripts.
- Expected:
  - `kills >= 1`, since the auto leg strike kills the tank;
  - `legs: 6`;
  - no page errors;
  - the screenshot shows the Insect exactly as before, mid-walk with its tail and stinger.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Monster rework: generic Monster driven by MonsterKind/MonsterBody; Insect Titan moves onto it unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Roster, remembered pick, and per-monster level-up pools

**Files:**
- Create: `src/monsters/roster.ts`, `src/monsters/roster.test.ts`, `src/monsters/pick.ts`, `src/monsters/pick.test.ts`
- Modify: `src/systems/Progression.ts`, `src/systems/Progression.test.ts`, `src/GameScene.ts`

**Interfaces:**
- Consumes: `MonsterKind`, `MonsterId`, `RosterId`, `INSECT`, `PoolSpec` (Task 1).
- Produces:
  - `KINDS: Record<MonsterId, MonsterKind>`
  - `ROSTER_ORDER: readonly RosterId[]` = `['insect', 'kaiju', 'kraken', 'golem']`
  - `type RosterEntry = { id: RosterId; name: string; blurb: string; available: boolean; pips: MonsterKind['pips'] | null; moves: MonsterKind['moves']; silhouette: string }`
  - `rosterEntries(): RosterEntry[]`
  - `isMonsterId(x: string): x is MonsterId`
  - `PICK_KEY = 'azragon.monster'`
  - `type PickStore = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }`
  - `parsePick(raw): MonsterId`, `loadPick(store | null): Promise<MonsterId>`, `savePick(store | null, id): Promise<void>`
  - `SHARED_ABILITIES: readonly AbilityId[]`
  - `Progression.setPool(pool: PoolSpec): void`

- [ ] **Step 1: Write the failing tests**

`src/monsters/roster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KINDS, ROSTER_ORDER, isMonsterId, rosterEntries } from './roster';

describe('roster', () => {
  it('lists four monsters in carousel order, the Insect playable and the rest coming soon', () => {
    const e = rosterEntries();
    expect(e.map((x) => x.id)).toEqual(['insect', 'kaiju', 'kraken', 'golem']);
    expect(e.map((x) => x.available)).toEqual([true, false, false, false]);
    expect(e[0]!.name).toBe('Insect Titan');
    expect(e[0]!.pips).toEqual(KINDS.insect.pips);
    expect(e[2]!.pips).toBeNull();
    for (const x of e) expect(x.silhouette.length).toBeGreaterThan(0);
    expect(ROSTER_ORDER).toHaveLength(4);
  });
  it('recognises only playable monster ids', () => {
    expect(isMonsterId('insect')).toBe(true);
    expect(isMonsterId('kraken')).toBe(false);
    expect(isMonsterId('toString')).toBe(false);
    expect(isMonsterId('')).toBe(false);
  });
});
```

`src/monsters/pick.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PICK_KEY, loadPick, parsePick, savePick, type PickStore } from './pick';

const store = (value: string | null, fail = false): PickStore & { saved: Record<string, string> } => {
  const saved: Record<string, string> = {};
  return {
    saved,
    getItem: async () => {
      if (fail) throw new Error('no storage');
      return value;
    },
    setItem: async (k, v) => {
      if (fail) throw new Error('no storage');
      saved[k] = v;
    },
  };
};

describe('pick', () => {
  it('parses a saved monster id and falls back to the Insect on anything else', () => {
    expect(parsePick('insect')).toBe('insect');
    expect(parsePick(null)).toBe('insect');
    expect(parsePick(undefined)).toBe('insect');
    expect(parsePick('kraken')).toBe('insect');
    expect(parsePick('{"x":1}')).toBe('insect');
  });
  it('loads through the store, surviving a missing or failing store', async () => {
    expect(await loadPick(store('insect'))).toBe('insect');
    expect(await loadPick(store('garbage'))).toBe('insect');
    expect(await loadPick(store(null, true))).toBe('insect');
    expect(await loadPick(null)).toBe('insect');
  });
  it('saves under the azragon key and never throws', async () => {
    const s = store(null);
    await savePick(s, 'insect');
    expect(s.saved[PICK_KEY]).toBe('insect');
    await expect(savePick(store(null, true), 'insect')).resolves.toBeUndefined();
    await expect(savePick(null, 'insect')).resolves.toBeUndefined();
  });
});
```

Append to `src/systems/Progression.test.ts`. Add `SHARED_ABILITIES` and `type PoolSpec` to its import from `./Progression`.

```ts
describe('Progression pools', () => {
  const pool: PoolSpec = {
    signatures: ['acid', 'nova'],
    abilityText: { acid: { title: 'Radiant Wake', icon: '☢️', desc: () => 'glow' } },
    upgradeText: { vitality: { title: 'Ironscale Hide' } },
  };

  it('offers only the shared abilities, the pool\'s signatures, and stat upgrades', () => {
    const p = new Progression(mulberry32(11));
    p.setPool(pool);
    const allowed = new Set<string>([...SHARED_ABILITIES, 'acid', 'nova', 'damage', 'attackSpeed', 'vitality', 'regen', 'stompRadius', 'multiShot', 'moveSpeed']);
    for (let i = 0; i < 300; i++) for (const o of p.offer()) expect(allowed.has(o.id)).toBe(true);
  });

  it('uses the pool\'s display names', () => {
    const p = new Progression(mulberry32(12));
    p.setPool(pool);
    const seen = new Map<string, string>();
    for (let i = 0; i < 300; i++) for (const o of p.offer()) seen.set(o.id, o.title);
    expect(seen.get('acid')).toBe('Radiant Wake I');
    expect(seen.get('vitality')).toBe('Ironscale Hide');
    expect(seen.get('nova')).toBe('Venom Nova I');
  });

  it('refuses to rank up a signature outside the pool', () => {
    const p = new Progression(mulberry32(13));
    p.setPool(pool);
    p.addExp(1e6);
    expect(p.choose('brood')).toBe(false);
    expect(p.choose('acid')).toBe(true);
  });
});
```

Run: `npx vitest run src/monsters src/systems/Progression.test.ts`. Expected: FAIL (`./roster` and `./pick` not found; `setPool` / `SHARED_ABILITIES` missing).

- [ ] **Step 2: `src/monsters/roster.ts`**

```ts
import { INSECT } from './insect/kind';
import type { MonsterId, MonsterKind, RosterId } from './types';

export const KINDS: Record<MonsterId, MonsterKind> = { insect: INSECT };

export const ROSTER_ORDER: readonly RosterId[] = ['insect', 'kaiju', 'kraken', 'golem'];

/** Creatures shown in the carousel but not playable yet. */
const COMING_SOON: Partial<Record<RosterId, { name: string; blurb: string }>> = {
  kaiju: { name: 'Reptile Kaiju', blurb: 'Walking extinction. Armoured, unstoppable, breathes plasma.' },
  kraken: { name: 'Kraken', blurb: 'Hauls itself through the streets on a hundred grasping arms.' },
  golem: { name: 'Stone Golem', blurb: 'A mountain that learned to walk. Slow, crushing, nearly unbreakable.' },
};

const SILHOUETTE: Record<RosterId, string> = { insect: '🦂', kaiju: '🦖', kraken: '🐙', golem: '🗿' };

export type RosterEntry = {
  id: RosterId;
  name: string;
  blurb: string;
  available: boolean;
  pips: MonsterKind['pips'] | null;
  moves: MonsterKind['moves'];
  silhouette: string;
};

export function isMonsterId(x: string): x is MonsterId {
  return Object.prototype.hasOwnProperty.call(KINDS, x);
}

export function rosterEntries(): RosterEntry[] {
  return ROSTER_ORDER.map((id) => {
    if (isMonsterId(id)) {
      const k = KINDS[id];
      return { id, name: k.name, blurb: k.blurb, available: true, pips: k.pips, moves: k.moves, silhouette: SILHOUETTE[id] };
    }
    const s = COMING_SOON[id]!;
    return { id, name: s.name, blurb: s.blurb, available: false, pips: null, moves: [], silhouette: SILHOUETTE[id] };
  });
}
```

- [ ] **Step 3: `src/monsters/pick.ts`**

```ts
import { isMonsterId } from './roster';
import type { MonsterId } from './types';

export const PICK_KEY = 'azragon.monster';

/** The subset of RundotGameAPI.appStorage the pick needs (async; may reject). */
export type PickStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function parsePick(raw: string | null | undefined): MonsterId {
  return raw && isMonsterId(raw) ? raw : 'insect';
}

/** The last selected monster, or the Insect when storage is missing, failing, or holds anything else. */
export async function loadPick(store: PickStore | null): Promise<MonsterId> {
  if (!store) return 'insect';
  try {
    return parsePick(await store.getItem(PICK_KEY));
  } catch {
    return 'insect';
  }
}

export async function savePick(store: PickStore | null, id: MonsterId): Promise<void> {
  if (!store) return;
  try {
    await store.setItem(PICK_KEY, id);
  } catch {
    // Remembering the pick is a convenience; a failed save is not an error.
  }
}
```

- [ ] **Step 4: Per-monster pools in `Progression.ts`**

Add below `PoolSpec` (Task 1):

```ts
/** Offered to every monster. */
export const SHARED_ABILITIES: readonly AbilityId[] = ['dash', 'roar', 'bubble', 'reflect', 'overload'];

/** Until a monster is set: the Insect Titan's pool (its signatures, default names). */
const DEFAULT_POOL: PoolSpec = {
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'brood', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {},
  upgradeText: {},
};
```

In `class Progression`:
1. Add a field `private pool: PoolSpec = DEFAULT_POOL;`.
2. Add methods:
   ```ts
   /** The monster whose signatures and display names the level-up offers use. */
   setPool(pool: PoolSpec): void {
     this.pool = pool;
   }

   /** Abilities this monster can take, in ABILITIES order (so offers stay deterministic per seed). */
   private poolAbilities(): AbilityId[] {
     return (Object.keys(ABILITIES) as AbilityId[]).filter((id) => SHARED_ABILITIES.includes(id) || this.pool.signatures.includes(id));
   }
   ```
3. In `offer()`:
   - Replace `const abilities = (Object.keys(ABILITIES) as AbilityId[]).filter((id) => this.ranks[id] < MAX_RANK);` with `const abilities = this.poolAbilities().filter((id) => this.ranks[id] < MAX_RANK);`.
   - Change the mapping to use the pool's names:
     ```ts
     return ids.map((id) => {
       if (id in ABILITIES) {
         const a = this.pool.abilityText[id as AbilityId] ?? ABILITIES[id as AbilityId];
         const next = this.ranks[id as AbilityId] + 1;
         return { id, title: `${a.title} ${ROMAN[next]}`, desc: a.desc(next), icon: a.icon };
       }
       const u = UPGRADES[id as UpgradeId];
       const t = this.pool.upgradeText[id as UpgradeId];
       return { id, title: t?.title ?? u.title, desc: t?.desc ?? u.desc, icon: t?.icon ?? u.icon };
     });
     ```
4. In `choose()`, inside `if (id in ABILITIES) {`, before the rank check, add `if (!this.poolAbilities().includes(a)) return false;` (after `const a = id as AbilityId;`).

The default pool contains every current ability, in `ABILITIES` order, so the Insect's offers are identical to before. The existing seeded tests prove this.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters src/systems/Progression.test.ts`. Expected: PASS. Then `npm test`; all tests pass.

- [ ] **Step 6: Wire the pool**

In `GameScene` constructor, after `this.monster = new Monster(this.scene, INSECT);`, add `this.progression.setPool(this.monster.kind);` (if Task 1 skipped it).

Run: `npx tsc --noEmit && npm test`. Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Roster, remembered pick (appStorage-safe), and per-monster level-up pools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Title and monster select screens, flow, and Game Over choices

**Files:**
- Create:
  - `src/menuFlow.ts`, `src/menuFlow.test.ts`
  - `src/systems/menuCamera.ts`, `src/systems/menuCamera.test.ts`
  - `src/ui/Title.tsx`, `src/ui/MonsterSelect.tsx`
- Modify:
  - `src/systems/tap.ts`, `src/systems/tap.test.ts`, `src/systems/Input.ts`
  - `src/config.ts`
  - `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx`
  - `src/ui/GameOver.tsx`, `src/style.css`

**Interfaces:**
- Consumes:
  - From Task 2: `rosterEntries`, `ROSTER_ORDER`, `KINDS`, `isMonsterId`, `loadPick`, `savePick`, `PickStore`
  - From Task 1: `Monster.setKind`, `Monster.visible`
  - From earlier milestones: `City.blast`, `CRATER_RADIUS`
- Produces:
  - `type FlowEvent = 'start' | 'play' | 'introDone' | 'playAgain' | 'changeMonster'`
  - `flowNext(state: GameState, ev: FlowEvent): GameState | null`
  - `titlePose(t, out)`, `selectPose(t, monsterHeight, out)`, each returning `{ pos: THREE.Vector3; look: THREE.Vector3 }`
  - `menuKey(e): 'left' | 'right' | 'confirm' | null`
  - `InputHandlers.menuKey(k): boolean`
  - `GameState` gains `'title' | 'select'`
  - `GameEventMap.roster: { entries: RosterEntry[]; index: number }`
  - `GameScene` public API:
    - `constructor(container, store?: PickStore | null)`
    - `startFromTitle()`, `selectStep(delta)`, `playSelected()`, `changeMonster()`
    - `restart()`, which becomes Play Again and works only from `gameover`

**Spec deviation (deliberate):**
- The spec says the select diorama shows the crater decal with the city un-blasted.
- Since milestone 3, the crater site is built up and only the impact clears it. Showing the decal on an un-blasted city would put buildings through the monster.
- So entering select runs the same instant blast a skipped intro uses (no EXP, no stat).
- PLAY and Change Monster reset the city, so the intro still crashes into a standing city.

- [ ] **Step 1: Write the failing tests**

`src/menuFlow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flowNext } from './menuFlow';

describe('flowNext', () => {
  it('walks title → select → intro → playing, and game over → intro or select', () => {
    expect(flowNext('title', 'start')).toBe('select');
    expect(flowNext('select', 'play')).toBe('intro');
    expect(flowNext('intro', 'introDone')).toBe('playing');
    expect(flowNext('gameover', 'playAgain')).toBe('intro');
    expect(flowNext('gameover', 'changeMonster')).toBe('select');
  });
  it('rejects events from any other state', () => {
    expect(flowNext('select', 'start')).toBeNull();
    expect(flowNext('title', 'play')).toBeNull();
    expect(flowNext('playing', 'play')).toBeNull();
    expect(flowNext('playing', 'playAgain')).toBeNull();
    expect(flowNext('dying', 'changeMonster')).toBeNull();
    expect(flowNext('paused', 'start')).toBeNull();
    expect(flowNext('levelup', 'introDone')).toBeNull();
  });
});
```

`src/systems/menuCamera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { selectPose, titlePose } from './menuCamera';

const pose = () => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

describe('menu camera', () => {
  it('title: circles the city centre high up, looking at it', () => {
    const T = CONFIG.menu.title;
    const a = titlePose(0, pose());
    const b = titlePose(10, pose());
    expect(Math.hypot(a.pos.x, a.pos.z)).toBeCloseTo(T.radius);
    expect(a.pos.y).toBeCloseTo(T.height);
    expect(a.look.length()).toBeCloseTo(0);
    expect(a.pos.distanceTo(b.pos)).toBeGreaterThan(10);
  });
  it('select: orbits the monster at a distance scaled to its height, aimed at its chest', () => {
    const S = CONFIG.menu.select;
    const small = selectPose(1, 300, pose());
    const big = selectPose(1, 600, pose());
    expect(Math.hypot(small.pos.x, small.pos.z)).toBeCloseTo(300 * S.distance + S.pad);
    expect(Math.hypot(big.pos.x, big.pos.z)).toBeGreaterThan(Math.hypot(small.pos.x, small.pos.z));
    expect(small.look.y).toBeCloseTo(300 * 0.45);
    expect(selectPose(0, 300, pose()).pos.distanceTo(selectPose(2, 300, pose()).pos)).toBeGreaterThan(10);
  });
});
```

Append to `src/systems/tap.test.ts`, importing `menuKey`:

```ts
describe('menuKey', () => {
  const k = (code: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...mods,
  });
  it('maps arrows/A/D to browse and Enter/Space to confirm', () => {
    expect(menuKey(k('ArrowLeft'))).toBe('left');
    expect(menuKey(k('KeyA'))).toBe('left');
    expect(menuKey(k('ArrowRight'))).toBe('right');
    expect(menuKey(k('KeyD'))).toBe('right');
    expect(menuKey(k('Enter'))).toBe('confirm');
    expect(menuKey(k('Space'))).toBe('confirm');
  });
  it('ignores other keys, repeats, and shortcuts', () => {
    expect(menuKey(k('KeyQ'))).toBeNull();
    expect(menuKey(k('ArrowLeft', { repeat: true }))).toBeNull();
    expect(menuKey(k('ArrowRight', { metaKey: true }))).toBeNull();
    expect(menuKey(k('Enter', { ctrlKey: true }))).toBeNull();
  });
});
```

Run: `npx vitest run src/menuFlow.test.ts src/systems/menuCamera.test.ts src/systems/tap.test.ts`. Expected: FAIL (modules or exports missing).

- [ ] **Step 2: Pure modules**

`src/menuFlow.ts`:

```ts
import type { GameState } from './GameEvents';

export type FlowEvent = 'start' | 'play' | 'introDone' | 'playAgain' | 'changeMonster';

/** Menu and run flow: the state an event leads to, or null when it does not apply in `state`. */
export function flowNext(state: GameState, ev: FlowEvent): GameState | null {
  switch (ev) {
    case 'start':
      return state === 'title' ? 'select' : null;
    case 'play':
      return state === 'select' ? 'intro' : null;
    case 'introDone':
      return state === 'intro' ? 'playing' : null;
    case 'playAgain':
      return state === 'gameover' ? 'intro' : null;
    case 'changeMonster':
      return state === 'gameover' ? 'select' : null;
  }
}
```

Add to `CONFIG` in `src/config.ts`:

```ts
  /** Menu cameras: a slow high circle over the city (title), and a turntable orbit of the monster (select). */
  menu: {
    title: { radius: 2400, height: 1300, speed: 0.04, startAngle: 2.4 },
    select: { distance: 2.4, pad: 250, lift: 1.0, speed: 0.25, startAngle: 0.5 },
  },
```

`src/systems/menuCamera.ts`:

```ts
import type * as THREE from 'three';
import { CONFIG } from '../config';

type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };

/** Title: a slow, high circle around the city centre. */
export function titlePose(t: number, out: Pose): Pose {
  const T = CONFIG.menu.title;
  const a = T.startAngle + t * T.speed;
  out.pos.set(Math.sin(a) * T.radius, T.height, Math.cos(a) * T.radius);
  out.look.set(0, 0, 0);
  return out;
}

/** Select: a turntable orbit of the monster at the origin, framed by its height. */
export function selectPose(t: number, monsterHeight: number, out: Pose): Pose {
  const S = CONFIG.menu.select;
  const a = S.startAngle + t * S.speed;
  const r = monsterHeight * S.distance + S.pad;
  out.pos.set(Math.sin(a) * r, monsterHeight * S.lift, Math.cos(a) * r);
  out.look.set(0, monsterHeight * 0.45, 0);
  return out;
}
```

In `src/systems/tap.ts`:

```ts
/** Select-screen keys: browse with arrows (or A/D), confirm with Enter/Space; no repeats or shortcuts. */
export function menuKey(e: { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): 'left' | 'right' | 'confirm' | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') return 'left';
  if (e.code === 'ArrowRight' || e.code === 'KeyD') return 'right';
  if (e.code === 'Enter' || e.code === 'Space') return 'confirm';
  return null;
}
```

In `src/systems/Input.ts`:
- Import `menuKey`.
- Add to `InputHandlers`:
  ```ts
  /** Select-screen browse/confirm key; return true when the menu used it. */
  menuKey(k: 'left' | 'right' | 'confirm'): boolean;
  ```
- Make `onKey` try the menu first:

```ts
  private onKey = (e: KeyboardEvent) => {
    const mk = menuKey(e);
    if (mk && this.h.menuKey(mk)) {
      e.preventDefault();
      return;
    }
    if (isSkipKey(e) && this.h.skipKey()) {
      e.preventDefault();
      return;
    }
    const id = abilityKey(e);
    if (!id) return;
    if (this.h.key(id)) e.preventDefault();
  };
```

Run: `npx vitest run src/menuFlow.test.ts src/systems/menuCamera.test.ts src/systems/tap.test.ts`. Expected: PASS.

- [ ] **Step 3: States and events**

In `src/GameEvents.ts`:
- Change the state type to:
  ```ts
  export type GameState = 'loading' | 'title' | 'select' | 'intro' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';
  ```
- Add `import type { RosterEntry } from './monsters/roster';`.
- Add `roster: { entries: RosterEntry[]; index: number };` to `GameEventMap`.

- [ ] **Step 4: `GameScene` menus**

1. **Imports.**
   ```ts
   import { City, CRATER_RADIUS } from './world/City';
   import { KINDS, ROSTER_ORDER, isMonsterId, rosterEntries } from './monsters/roster';
   import { loadPick, savePick, type PickStore } from './monsters/pick';
   import type { MonsterKind } from './monsters/types';
   import { flowNext } from './menuFlow';
   import { selectPose, titlePose } from './systems/menuCamera';
   ```
2. **Fields.**
   ```ts
   private selIndex = 0;
   private menuT = 0;
   private menuPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
   ```
3. **Constructor signature.** Change it to `constructor(private container: HTMLDivElement, private store: PickStore | null = null)`.
4. **End of the constructor.** Replace `this.update();\n    this.startIntro();` with:
   ```ts
   this.update();
   this.enterTitle();
   // The saved pick arrives asynchronously; it only picks the carousel's starting monster.
   void loadPick(this.store).then((id) => {
     this.selIndex = ROSTER_ORDER.indexOf(id);
     if (this.state === 'select') this.showSelection();
   });
   ```
5. **Input handlers object.**
   - Add a `menuKey` handler:
     ```ts
     menuKey: (k) => {
       if (this.state !== 'select') return false;
       if (k === 'confirm') this.playSelected();
       else this.selectStep(k === 'left' ? -1 : 1);
       return true;
     },
     ```
   - Make `skipKey` begin with:
     ```ts
     if (this.state === 'title') {
       this.startFromTitle();
       return true;
     }
     ```
6. **`onTap`.** Make the first statement:
   ```ts
   if (this.state === 'title') {
     this.startFromTitle();
     return;
   }
   ```
7. **Restart.** Rename the body of `restart()` (everything except `this.startIntro(); this.emitHud();`) into `private resetRun(): void`. Then replace `restart()` and add the menu API:

```ts
  /** Game over → Play Again: same monster, fresh world, the intro replays. */
  restart(): void {
    if (flowNext(this.state, 'playAgain') === null) return;
    this.resetRun();
    this.startIntro();
    this.emitHud();
  }

  /** Game over → Change Monster: fresh world, back to the select screen. */
  changeMonster(): void {
    if (flowNext(this.state, 'changeMonster') === null) return;
    this.resetRun();
    this.enterSelect();
  }

  startFromTitle(): void {
    if (flowNext(this.state, 'start') === null) return;
    this.enterSelect();
  }

  /** Browse the carousel (wraps around). */
  selectStep(delta: number): void {
    if (this.state !== 'select') return;
    const n = ROSTER_ORDER.length;
    this.selIndex = (((this.selIndex + delta) % n) + n) % n;
    this.showSelection();
  }

  /** PLAY: only for a playable monster; the city is rebuilt so the intro crashes into it. */
  playSelected(): void {
    if (flowNext(this.state, 'play') === null) return;
    if (!rosterEntries()[this.selIndex]!.available) return;
    this.resetRun();
    this.startIntro();
    this.emitHud();
  }

  private enterTitle(): void {
    this.monster.visible = false;
    this.menuT = 0;
    this.setState('title');
  }

  private enterSelect(): void {
    this.menuT = 0;
    this.setState('select');
    this.showSelection();
  }

  /** Show the carousel's current entry: the monster in its crater (or an empty crater for coming-soon). */
  private showSelection(): void {
    const entries = rosterEntries();
    const e = entries[this.selIndex]!;
    if (isMonsterId(e.id)) {
      this.applyKind(KINDS[e.id]);
      this.monster.visible = true;
      void savePick(this.store, e.id);
    } else {
      this.monster.visible = false;
    }
    // Diorama crater: the same instant blast a skipped intro applies (no EXP, no stat).
    this.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    this.events.emit('roster', { entries, index: this.selIndex });
  }

  /** Become `kind`: body, stats, and level-up pool. */
  private applyKind(kind: MonsterKind): void {
    this.monster.setKind(kind);
    this.progression.setPool(kind);
  }
```

8. **`update()` camera.** Replace
   ```ts
   // While the intro runs (even paused) it owns the camera.
   if (!this.intro.active) this.rig.update(frozen ? 0 : dt, this.monster.position);
   ```
   with:
   ```ts
   const shown = this.state === 'paused' ? this.stateBeforePause : this.state;
   if (shown === 'title' || shown === 'select') {
     if (!frozen) this.menuT += realDt;
     if (shown === 'title') titlePose(this.menuT, this.menuPose);
     else selectPose(this.menuT, this.ms.size.height, this.menuPose);
     this.camera.position.copy(this.menuPose.pos);
     this.camera.lookAt(this.menuPose.look);
   } else if (!this.intro.active) {
     // While the intro runs (even paused) it owns the camera.
     this.rig.update(frozen ? 0 : dt, this.monster.position);
   }
   ```

`resetRun()` already calls `monster.reset()` and `city.reset()`, so Play Again and Change Monster start clean. The gameplay block runs only in `playing`, so menus have no enemies, abilities, passives or run timer.

- [ ] **Step 5: React UI**

`src/ui/Title.tsx`:

```tsx
const START_HINT = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Tap to start' : 'Click or press any key';

/** Title over the drifting city. Taps fall through to the canvas, which starts the game. */
export function Title() {
  return (
    <div className="title-screen">
      <h1 className="title-logo">AZRAGON</h1>
      <div className="title-hint">{START_HINT}</div>
    </div>
  );
}
```

`src/ui/MonsterSelect.tsx`:

```tsx
import { useRef } from 'react';
import type { RosterEntry } from '../monsters/roster';

type Props = { entries: RosterEntry[]; index: number; onStep(delta: number): void; onPlay(): void };

function Pips({ label, n }: { label: string; n: number }) {
  return (
    <div className="pip-row">
      <span>{label}</span>
      <div className="pips">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < n ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/** Carousel over the 3D diorama: arrows or swipe to browse, stats and moves, PLAY. */
export function MonsterSelect({ entries, index, onStep, onPlay }: Props) {
  const e = entries[index]!;
  const swipeX = useRef<number | null>(null);
  return (
    <div
      className="select-screen"
      onPointerDown={(ev) => {
        swipeX.current = ev.clientX;
      }}
      onPointerUp={(ev) => {
        const x0 = swipeX.current;
        swipeX.current = null;
        if (x0 === null) return;
        const dx = ev.clientX - x0;
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1);
      }}
    >
      <div className="select-header">
        <button className="select-arrow" aria-label="Previous monster" onClick={() => onStep(-1)}>‹</button>
        <div className="select-name" key={e.id}>{e.name}</div>
        <button className="select-arrow" aria-label="Next monster" onClick={() => onStep(1)}>›</button>
      </div>
      {!e.available && <div className="select-silhouette">{e.silhouette}</div>}
      <div className="select-panel" key={`panel-${e.id}`}>
        <div className="select-blurb">{e.blurb}</div>
        {e.available && e.pips ? (
          <>
            <Pips label="Toughness" n={e.pips.toughness} />
            <Pips label="Power" n={e.pips.power} />
            <Pips label="Speed" n={e.pips.speed} />
            <div className="select-moves">
              {e.moves.map((m) => (
                <span key={m.label}>
                  <b>{m.icon}</b> {m.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="select-soon">Coming soon</div>
        )}
        <button className="btn-primary select-play" disabled={!e.available} onClick={onPlay}>
          Play
        </button>
      </div>
      <div className="select-dots">
        {entries.map((x, i) => (
          <span key={x.id} className={i === index ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
```

`src/ui/GameOver.tsx`: add a prop `onChangeMonster: () => void` and, after the Play Again button, add:
```tsx
<button className="btn-secondary" onClick={onChangeMonster}>Change Monster</button>
```

In `src/App.tsx`:
1. **Imports:**
   - `import { Title } from './ui/Title';`
   - `import { MonsterSelect } from './ui/MonsterSelect';`
   - `import type { RosterEntry } from './monsters/roster';`
   - `import type { PickStore } from './monsters/pick';`
2. **Storage helper**, at module level:
   ```ts
   /** RUN app storage for the remembered pick, or null outside the RUN host. */
   function appStore(): PickStore | null {
     try {
       const s = RundotGameAPI.appStorage;
       return { getItem: (k) => s.getItem(k), setItem: (k, v) => s.setItem(k, v) };
     } catch {
       return null;
     }
   }
   ```
3. **Construction:** `new GameScene(container)` becomes `new GameScene(container, appStore())`.
4. **State and subscription:** add `const [roster, setRoster] = useState<{ entries: RosterEntry[]; index: number } | null>(null);` and subscribe with `game.events.on('roster', setRoster);`.
5. **Callbacks:**
   ```ts
   const step = useCallback((d: number) => gameRef.current?.selectStep(d), []);
   const play = useCallback(() => gameRef.current?.playSelected(), []);
   const changeMonster = useCallback(() => {
     setStats(null);
     gameRef.current?.changeMonster();
   }, []);
   ```
6. **HUD visibility:** define `const inMenu = state === 'title' || state === 'select';` and change the HUD line to `{state !== 'loading' && state !== 'intro' && !inMenu && <Hud hud={hud} expPop={expPop} />}`.
7. **Menu screens**, inside `.hud`:
   ```tsx
   {state === 'title' && <Title />}
   {state === 'select' && roster && <MonsterSelect entries={roster.entries} index={roster.index} onStep={step} onPlay={play} />}
   ```
8. **Game over:** pass `onChangeMonster={changeMonster}` to `<GameOver>`.
9. **Comment:** update the comment on `setState(game.getState())` to say the constructor already entered `'title'`.

Append to `src/style.css`:

```css
/* Title: logo over the drifting city; taps fall through to the canvas. */
.title-screen {
  position: absolute; inset: 0; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
  animation: menu-in 350ms ease-out both;
}
.title-logo {
  margin: 0; font-weight: 700; font-size: clamp(56px, 16vw, 128px); letter-spacing: 0.08em; line-height: 1;
  color: #ecffd8;
  text-shadow: 4px 4px 0 #1b2a10, 8px 8px 0 rgba(0, 0, 0, 0.35), 0 0 28px rgba(155, 226, 45, 0.55);
}
.title-hint {
  font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  animation: skip-hint-blink 1.6s steps(2) infinite;
}

/* Select: carousel UI over the 3D diorama. */
.select-screen {
  position: absolute; inset: 0; pointer-events: auto; touch-action: none;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: calc(var(--safe-top, 0px) + 16px) 16px calc(var(--safe-bottom, 0px) + 16px);
  animation: menu-in 350ms ease-out both;
}
.select-header { display: flex; align-items: center; justify-content: center; gap: 12px; }
.select-name {
  min-width: 220px; text-align: center; font-size: 26px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); animation: menu-in 250ms ease-out both;
}
.select-arrow {
  width: 48px; height: 48px; border-radius: 4px; border: 2px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.55); color: var(--color-text); font: inherit; font-size: 30px; line-height: 1; cursor: pointer;
}
.select-arrow:active { transform: scale(0.92); }
.select-silhouette {
  position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%);
  font-size: min(42vw, 260px); filter: brightness(0) opacity(0.55); pointer-events: none;
}
.select-panel {
  align-self: center; width: min(100%, 520px); display: flex; flex-direction: column; gap: 10px;
  padding: 16px; border-radius: 6px; background: rgba(0, 0, 0, 0.62); border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(4px); contain: content; animation: menu-in 250ms ease-out both;
}
.select-blurb { color: var(--color-text-muted); font-size: 14px; }
.pip-row { display: flex; align-items: center; gap: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
.pip-row span { width: 96px; }
.pips { display: flex; gap: 4px; }
.pips i { width: 22px; height: 10px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
.pips i.on { background: var(--color-primary); }
.select-moves { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 13px; }
.select-soon { font-size: 18px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }
.select-play { margin-top: 6px; }
.select-play:disabled { opacity: 0.35; filter: grayscale(0.5); cursor: default; }
.select-dots { display: flex; justify-content: center; gap: 8px; }
.select-dots span { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); }
.select-dots span.on { background: var(--color-primary); }

.btn-secondary {
  min-height: 44px; padding: 10px 24px; border-radius: 4px; border: 2px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.4); color: var(--color-text); font: inherit; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;
}
.btn-secondary:active { transform: scale(0.95); }

@keyframes menu-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

Note: `.select-silhouette` uses `transform` for centring and has no animation, so it doesn't conflict with `menu-in`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test`. Expected: all pass.

Scripted check `$SCRATCH/m4t3.mjs` (desktop 1440×900 and phone 390×844):
1. Load, then wait for `__game.getState() === 'title'`. Screenshot `m4t3-<size>-title.png`.
2. Desktop: press `Enter`. Phone: `touchscreen.tap(195, 420)`. Wait for `select`. Screenshot.
3. Desktop: press `ArrowRight` three times, recording `{ state, idx: g.selIndex, visible: g.monster.visible }` after each. Phone: swipe left on the select screen three times (pointer down at x 300, up at x 100).
4. Expected:
   - indices 1, 2, 3;
   - `visible: false` on all three, since they're all coming soon in Task 3;
   - press `ArrowRight` again: back to index 0, `visible: true`;
   - press `Enter` (desktop) or tap PLAY (phone): state becomes `intro`.
5. Skip the intro (`g.skipIntro()`), set `g.monster.hp = 0`, and wait for `gameover`.
6. Click **Change Monster**. Expected: state `select`, `g.monster.visible === true`, `g.progression.level === 1`.
7. PLAY, skip, die, then **Play Again**. Expected: state `intro`, with `g.monster.kind.id === 'insect'`.
8. Across all screens:
   - `ERRORS none`;
   - `pixel.renderer.info.render.calls` below 150;
   - during title and select, `document.querySelector('.hud-top')` is null.

Look at the screenshots:
- the title logo is readable over the city at both sizes;
- the select panel doesn't cover the monster on phone;
- the arrows are at least 44 px.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Title and monster select screens, menu flow, remembered pick, Change Monster on game over

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Cocoon sized to the chosen monster

**Files:**
- Modify: `src/config.ts`, `src/intro/timeline.ts`, `src/intro/timeline.test.ts`, `src/intro/PodModel.ts`, `src/intro/IntroCinematic.ts`

**Interfaces:**
- Consumes: `MonsterStats.size` (Task 1), `Monster.kind` (Task 1).
- Produces:
  - `podLengthFor(size: { width: number; length: number; height: number }): number`
  - `PodModel.setLength(length: number): void`

- [ ] **Step 1: Write the failing test**

Append to `src/intro/timeline.test.ts`, importing `podLengthFor`:

```ts
describe('podLengthFor', () => {
  it('fits the monster\'s largest dimension with room to spare (the Insect gets the 620 m cocoon)', () => {
    expect(podLengthFor({ width: 484, length: 451, height: 344 })).toBeCloseTo(620, -1);
    const big = podLengthFor({ width: 300, length: 700, height: 400 });
    expect(big).toBeGreaterThan(700);
    expect(big).toBeCloseTo(700 * CONFIG.intro.podFit);
  });
});
```

Run: `npx vitest run src/intro/timeline.test.ts`. Expected: FAIL (`podLengthFor` not exported).

- [ ] **Step 2: Implement**

In `src/config.ts` (`intro` block), replace
```ts
    /** Cocoon length (m): big enough to hold the curled-up monster (about 480 × 450 × 340 m at scale 0.6). */
    podLength: 620,
```
with
```ts
    /** Cocoon length = the monster's largest dimension × podFit (the Insect's 484 m span gets a 620 m cocoon). */
    podFit: 1.28,
```

In `src/intro/timeline.ts` add:

```ts
/** Cocoon length for a monster of this size: its largest dimension with room to spare. */
export function podLengthFor(size: { width: number; length: number; height: number }): number {
  return Math.max(size.width, size.length, size.height) * I.podFit;
}
```

In `src/intro/PodModel.ts`, add:

```ts
  /** Resize the cocoon (its length along Z, in metres). */
  setLength(length: number): void {
    this.root.scale.setScalar(length);
  }
```

In `src/intro/IntroCinematic.ts`:
1. **Import** `podLengthFor` from `./timeline`.
2. **Fields:**
   - Add `private podLength = 1;`.
   - Change `private pod = new PodModel(I.podLength);` to `private pod = new PodModel(1);`.
   - Change `faceted(new THREE.TetrahedronGeometry(I.podLength * 0.17, 0))` to `faceted(new THREE.TetrahedronGeometry(0.17, 0))`. Shell fragments are now unit-sized and scaled by `podLength` when launched.
3. **`start()`**, before the rest of its body:
   ```ts
   this.podLength = podLengthFor(this.host.monster.kind.stats.size);
   this.pod.setLength(this.podLength);
   ```
4. **Remaining uses:**
   - Replace every other `I.podLength` with `this.podLength`. These are the trail offsets in `updateWorld` and the three in `burst()`.
   - In `burst()`, launch fragments with size `this.podLength` instead of `1`:
     ```ts
     this.fragments.push(this.launch(mesh, _p.set(0, this.podLength * 0.3, 0), this.podLength, a, 520, 480 + 160 * (i % 2)));
     ```

Check: `grep -n "I.podLength" src/intro/IntroCinematic.ts` prints nothing.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/intro/timeline.test.ts && npx tsc --noEmit && npm test`. Expected: PASS.

Scripted check:
1. Go to select, PLAY, and wait until intro `t` reaches 12.
2. Read `g.intro.pod.root.scale.x`. Expected: about 620 for the Insect.
3. Screenshot. Expected: the settle shot looks like milestone 3's.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Intro: cocoon sized to the selected monster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Kaiju geometry (pure): two-legged gait, arc rake, beam lines

**Files:**
- Create: `src/monsters/kaiju/bipedGait.ts`, `src/monsters/kaiju/bipedGait.test.ts`, `src/systems/sweep.ts`, `src/systems/sweep.test.ts`

**Interfaces:**
- Produces:
  - `bipedFoot(cycle, leg): { lift: number; stride: number }`, where leg 0 is the left (+X) and leg 1 the right
  - `bipedLanded(prev, cur, leg): boolean`
  - `arcTargets(from: Vec2, yaw, range, halfAngle, cands): T[]`, which skips airborne and dead targets
  - `lineTargets(a: Vec2, b: Vec2, halfWidth, cands): T[]`, which includes airborne targets
  - `linePoints(a, b, step): Vec2[]`
  - `beamEnd(from: XYZ, aim: XYZ, range): XYZ`, where `XYZ = { x: number; y: number; z: number }`

- [ ] **Step 1: Write the failing tests**

`src/monsters/kaiju/bipedGait.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bipedFoot, bipedLanded } from './bipedGait';

describe('biped gait', () => {
  it('alternates: exactly one foot is ever in the air', () => {
    for (let c = 0; c < 3; c += 0.013) {
      const l = bipedFoot(c, 0);
      const r = bipedFoot(c, 1);
      expect(l.lift > 0 && r.lift > 0).toBe(false);
    }
  });
  it('swings each foot forward through the air, then plants and pushes it back', () => {
    expect(bipedFoot(0, 0)).toEqual({ lift: 0, stride: -1 });
    expect(bipedFoot(0.25, 0).lift).toBeCloseTo(1);
    expect(bipedFoot(0.25, 0).stride).toBeCloseTo(0);
    expect(bipedFoot(0.75, 0)).toEqual({ lift: 0, stride: 0 });
    expect(bipedFoot(0, 1)).toEqual({ lift: 0, stride: 1 });
  });
  it('lands each foot once per cycle, half a cycle apart', () => {
    expect(bipedLanded(0.49, 0.51, 0)).toBe(true);
    expect(bipedLanded(0.49, 0.51, 1)).toBe(false);
    expect(bipedLanded(0.99, 1.01, 1)).toBe(true);
    expect(bipedLanded(0.99, 1.01, 0)).toBe(false);
    expect(bipedLanded(0.6, 0.6, 0)).toBe(false);
    let n = 0;
    for (let c = 0; c < 1; c += 0.01) if (bipedLanded(c, c + 0.01, 0)) n++;
    expect(n).toBe(1);
  });
});
```

`src/systems/sweep.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { arcTargets, beamEnd, linePoints, lineTargets } from './sweep';

const t = (x: number, z: number, radius = 10, airborne = false, alive = true) => ({ position: { x, z }, radius, airborne, isAlive: () => alive });

describe('arcTargets', () => {
  const from = { x: 0, z: 0 };
  it('hits ground targets in front within range and angle', () => {
    const ahead = t(0, 300);
    const side = t(300, 0);
    const behind = t(0, -300);
    const far = t(0, 600);
    const flyer = t(0, 200, 10, true);
    const dead = t(0, 200, 10, false, false);
    expect(arcTargets(from, 0, 420, 0.9, [ahead, side, behind, far, flyer, dead])).toEqual([ahead]);
  });
  it('counts a wide target whose edge reaches into the arc, and anything overlapping the monster', () => {
    const wide = t(Math.sin(0.85) * 300, Math.cos(0.85) * 300, 80);
    expect(arcTargets(from, 0, 420, 0.7, [wide])).toHaveLength(1);
    expect(arcTargets(from, 0, 420, 0.7, [t(5, -5, 40)])).toHaveLength(1);
  });
  it('turns with the monster\'s yaw', () => {
    expect(arcTargets(from, Math.PI / 2, 420, 0.5, [t(300, 0), t(0, 300)]).map((x) => x.position.x)).toEqual([300]);
  });
});

describe('lineTargets', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 1000 };
  it('hits everything touching the widened segment, flyers included, nothing past the ends', () => {
    const near = t(30, 500, 20);
    const off = t(100, 500, 20);
    const past = t(0, 1100, 20);
    const behind = t(0, -100, 20);
    const flyer = t(0, 800, 10, true);
    expect(lineTargets(a, b, 20, [near, off, past, behind, flyer])).toEqual([near, flyer]);
  });
});

describe('linePoints', () => {
  it('samples evenly from a to b inclusive', () => {
    const pts = linePoints({ x: 0, z: 0 }, { x: 0, z: 100 }, 30);
    expect(pts.map((p) => p.z)).toEqual([0, 25, 50, 75, 100]);
    expect(linePoints({ x: 5, z: 5 }, { x: 5, z: 5 }, 30)).toHaveLength(2);
  });
});

describe('beamEnd', () => {
  const jaws = { x: 0, y: 300, z: 0 };
  it('stops where the beam meets the ground', () => {
    expect(beamEnd(jaws, { x: 0, y: 0, z: 600 }, 1300)).toEqual({ x: 0, y: 0, z: 600 });
  });
  it('runs on to full range through a target that does not bring it down', () => {
    const e = beamEnd(jaws, { x: 0, y: 300, z: 600 }, 1300);
    expect(e.z).toBeCloseTo(1300);
    expect(e.y).toBeCloseTo(300);
  });
  it('never reaches farther than range horizontally, even aimed upward', () => {
    const e = beamEnd(jaws, { x: 300, y: 500, z: 400 }, 1300);
    expect(Math.hypot(e.x, e.z)).toBeCloseTo(1300);
  });
  it('fires straight down when the aim is directly below', () => {
    expect(beamEnd(jaws, { x: 0, y: 0, z: 0 }, 1300)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
```

Run: `npx vitest run src/monsters/kaiju src/systems/sweep.test.ts`. Expected: FAIL (modules not found).

- [ ] **Step 2: Implement**

`src/monsters/kaiju/bipedGait.ts`:

```ts
/** Two legs half a cycle apart: leg 0 is the left (+X), leg 1 the right. */
function phase(cycle: number, leg: number): number {
  const p = cycle + leg * 0.5;
  return p - Math.floor(p);
}

/**
 * lift: 0..1 foot height factor. stride: -1 (back) .. 1 (front) along the body axis.
 * First half of a leg's phase is swing (lifted, moving forward), second half is stance (planted, pushing back).
 */
export function bipedFoot(cycle: number, leg: number): { lift: number; stride: number } {
  const p = phase(cycle, leg);
  if (p < 0.5) {
    const t = p / 0.5;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - 0.5) / 0.5;
  return { lift: 0, stride: 1 - 2 * t };
}

/** True when the leg's swing ended between prev and cur (the foot touched down). */
export function bipedLanded(prev: number, cur: number, leg: number): boolean {
  if (cur <= prev) return false;
  const off = leg * 0.5;
  return Math.floor(prev + off - 0.5) !== Math.floor(cur + off - 0.5);
}
```

`src/systems/sweep.ts`:

```ts
import type { Vec2 } from '../util/math';

type Cand = { position: { x: number; z: number }; radius: number; isAlive(): boolean };
type XYZ = { x: number; y: number; z: number };

/**
 * Live ground targets a forward swipe reaches: within `range` (plus their radius) and within `halfAngle`
 * of the facing `yaw` (forward = (sin yaw, cos yaw)), widened by each target's angular size.
 */
export function arcTargets<T extends Cand & { airborne: boolean }>(from: Vec2, yaw: number, range: number, halfAngle: number, cands: readonly T[]): T[] {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return cands.filter((c) => {
    if (!c.isAlive() || c.airborne) return false;
    const dx = c.position.x - from.x;
    const dz = c.position.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > range + c.radius) return false;
    if (d <= c.radius) return true;
    const ang = Math.acos(Math.min(1, Math.max(-1, (dx * fx + dz * fz) / d)));
    return ang <= halfAngle + Math.asin(Math.min(1, c.radius / d));
  });
}

/** Distance from p to segment a→b in the XZ plane. */
export function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const u = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * u), p.z - (a.z + abz * u));
}

/** Live targets (ground or air) whose footprint touches segment a→b widened by halfWidth. */
export function lineTargets<T extends Cand>(a: Vec2, b: Vec2, halfWidth: number, cands: readonly T[]): T[] {
  return cands.filter((c) => c.isAlive() && segDist(c.position, a, b) <= halfWidth + c.radius);
}

/** Evenly spaced points from a to b inclusive, no more than `step` apart (for sampling buildings). */
export function linePoints(a: Vec2, b: Vec2, step: number): Vec2[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  return out;
}

/**
 * Where a beam from `from` toward `aim` ends: extended to `range` horizontally, or where it meets the
 * ground first. Aimed straight down, it ends on the ground below.
 */
export function beamEnd(from: XYZ, aim: XYZ, range: number): XYZ {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const dz = aim.z - from.z;
  const h = Math.hypot(dx, dz);
  if (h < 1e-6) return { x: from.x, y: 0, z: from.z };
  let s = range / h;
  if (dy < 0) s = Math.min(s, from.y / -dy);
  return { x: from.x + dx * s, y: Math.max(0, from.y + dy * s), z: from.z + dz * s };
}
```

- [ ] **Step 3: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters/kaiju src/systems/sweep.test.ts`. Expected: PASS. Then `npm test`; all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Kaiju geometry: biped gait, arc rake targets, beam line hits and end point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Reptile Kaiju body and definition (selectable)

**Files:**
- Create:
  - `src/monsters/kaiju/rake.ts`, `src/monsters/kaiju/rake.test.ts`
  - `src/monsters/kaiju/KaijuBody.ts`
  - `src/monsters/kaiju/kind.ts`, `src/monsters/kaiju/kind.test.ts`
- Modify: `src/config.ts`, `src/monsters/types.ts`, `src/monsters/roster.ts`, `src/monsters/roster.test.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `bipedFoot`, `bipedLanded`
  - From Task 1: `MonsterBody`, `BodyFrame`, `MonsterKind`
  - Existing: `solveTwoBone`, `placeSegment`
- Produces:
  - `CONFIG.kaiju`, containing `stats`, `rakeHalfAngle`, `breath` and `colors`
  - `rakeSwing(t, timing): number`
  - `class KaijuBody implements MonsterBody`
  - `KAIJU: MonsterKind`
  - `MonsterId` widened to `'insect' | 'kaiju'`
  - `KINDS.kaiju`

In this task the Kaiju is playable, but `GameScene` still treats every monster's melee as a point strike and its ranged attack as spikes. Task 7 adds the Kaiju's own attacks.

- [ ] **Step 1: Write the failing tests**

`src/monsters/kaiju/rake.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rakeSwing } from './rake';

const T = { windup: 0.25, impact: 0.4, end: 0.8 };

describe('rakeSwing', () => {
  it('raises the arm back through the windup, slashes forward by impact, then returns to rest', () => {
    expect(rakeSwing(0, T)).toBe(0);
    expect(rakeSwing(0.25, T)).toBeCloseTo(1);
    expect(rakeSwing(0.4, T)).toBeCloseTo(-0.9);
    expect(rakeSwing(0.6, T)).toBeCloseTo(-0.45);
    expect(rakeSwing(0.8, T)).toBe(0);
    expect(rakeSwing(2, T)).toBe(0);
  });
});
```

`src/monsters/kaiju/kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { KAIJU } from './kind';
import { INSECT } from '../insect/kind';

describe('KAIJU kind', () => {
  it('is tougher and harder-hitting but slower than the Insect', () => {
    expect(KAIJU.stats).toEqual(CONFIG.kaiju.stats);
    expect(KAIJU.stats.maxHp).toBeGreaterThan(INSECT.stats.maxHp);
    expect(KAIJU.stats.damageMult).toBeGreaterThan(INSECT.stats.damageMult);
    expect(KAIJU.stats.moveSpeed).toBeLessThan(INSECT.stats.moveSpeed);
    expect(KAIJU.stats.turnRate).toBeLessThan(INSECT.stats.turnRate);
    expect(KAIJU.pips).toEqual({ toughness: 4, power: 4, speed: 2 });
  });
  it('rakes, breathes, and bites', () => {
    expect(KAIJU.melee).toEqual({ kind: 'arc', halfAngle: CONFIG.kaiju.rakeHalfAngle });
    expect(KAIJU.ranged).toBe('breath');
    expect(KAIJU.antiAir).toBe('bite');
  });
  it('has its own signatures and names; never the Insect-only Brood Swarm', () => {
    expect(KAIJU.signatures).not.toContain('brood');
    for (const id of KAIJU.signatures) expect(KAIJU.abilityText[id]?.title).toBeTruthy();
    expect(KAIJU.abilityText.acid?.title).toBe('Radiant Wake');
    expect(KAIJU.upgradeText.vitality?.title).toBe('Ironscale Hide');
    expect(KAIJU.upgradeText.multiShot?.title).toBe('Wide Sweep');
  });
});
```

In `src/monsters/roster.test.ts`, change the availability expectation to `[true, true, false, false]`. In the `isMonsterId` test, add `expect(isMonsterId('kaiju')).toBe(true);`.

Run: `npx vitest run src/monsters`. Expected: FAIL (`./rake`, `./kind` not found; Kaiju not available).

- [ ] **Step 2: Config**

Add to `CONFIG` in `src/config.ts`:

```ts
  /** Reptile Kaiju. Stats feed its MonsterKind; breath tunes Plasma Breath; colours its body and effects. */
  kaiju: {
    stats: {
      maxHp: 1250,
      moveSpeed: 110,
      turnRate: 1.9,
      damageMult: 1.15,
      strideLength: 300,
      bodyRadius: 140 * MONSTER_SCALE,
      footRadius: 70,
      footDamage: 150,
      meleeRange: 420,
      meleeRadius: 0,
      meleeDamage: 75,
      meleeCooldown: 0.9,
      meleeTiming: { windup: 0.25, impact: 0.4, end: 0.8 },
      rangedRange: 1300,
      rangedDamage: 70,
      rangedCooldown: 2.2,
      headHeight: 560,
      /** Measured standing bounding box (world m) — re-measure in Step 6 after any model change. */
      size: { width: 320, length: 490, height: 370 },
    },
    /** Claw Rake: half-angle (rad) of the forward arc. */
    rakeHalfAngle: 0.9,
    /** Plasma Breath: charge (s), beam on-screen time (s), beam half-width (m), visual sweep (rad), fan per extra beam (rad), beam cap, building damage per hit. */
    breath: { charge: 0.4, show: 0.35, halfWidth: 45, sweep: 0.1, fan: 0.12, maxLines: 4, buildingDamage: 120 },
    colors: {
      scale: 0x3f5f48,
      scaleDark: 0x2b4234,
      belly: 0x9aa883,
      claw: 0xe6e0cc,
      plate: 0x6ff6ff,
      eye: 0xa8fdff,
      plasma: 0x6ff6ff,
      ember: 0xff9a3c,
    },
  },
```

`MONSTER_SCALE` is the constant at the top of `config.ts`. The stats object's shape must match `MonsterStats` exactly; the type checker enforces this in `kind.ts`.

- [ ] **Step 3: `rake.ts` and the body**

`src/monsters/kaiju/rake.ts`:

```ts
/**
 * Arm swing (rad about the shoulder, + = back) for the Claw Rake at t seconds into the strike:
 * raised back through the windup, slashing forward-down by the impact, then returning to rest.
 */
export function rakeSwing(t: number, T: { windup: number; impact: number; end: number }): number {
  if (t <= 0 || t >= T.end) return 0;
  if (t < T.windup) return t / T.windup;
  if (t < T.impact) return 1 - 1.9 * ((t - T.windup) / (T.impact - T.windup));
  return -0.9 * (1 - (t - T.impact) / (T.end - T.impact));
}
```

`src/monsters/kaiju/KaijuBody.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { placeSegment, solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { bipedFoot, bipedLanded } from './bipedGait';
import { rakeSwing } from './rake';

const K = CONFIG.kaiju;
const C = K.colors;
const THIGH = 170;
const SHIN = 190;
const LIFT = 80;
const FOOT_X = 115;
const NECK_BASE = new THREE.Vector3(0, 470, 110);
const TAIL_BASE: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 300, -90),
  new THREE.Vector3(0, 255, -220),
  new THREE.Vector3(0, 200, -350),
  new THREE.Vector3(0, 140, -470),
  new THREE.Vector3(0, 90, -580),
  new THREE.Vector3(0, 55, -680),
];
/** Back plates along the spine (body space): x, y, z, width, height. */
const PLATES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 545, 95, 30, 70],
  [0, 525, 45, 40, 95],
  [0, 495, -5, 46, 110],
  [0, 455, -55, 46, 105],
  [0, 405, -100, 40, 90],
  [0, 350, -140, 32, 70],
];
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();

type Leg = { side: 1 | -1; hip: THREE.Vector3; thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };
type Arm = { side: 1 | -1; pivot: THREE.Object3D };

/**
 * The Reptile Kaiju: upright on two IK legs with forward knees, a leaning torso, short raking arms,
 * a neck that lunges to bite, glowing back plates, and a heavy counter-swinging tail. Faces +Z; +X is its left.
 */
export class KaijuBody implements MonsterBody {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: Leg[] = [];
  private arms: Arm[] = [];
  private neck = new THREE.Object3D();
  private jaw = new THREE.Object3D();
  private mouth = new THREE.Object3D();
  private tailSegs: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private tintMats: THREE.MeshToonMaterial[];
  private plateMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];

  constructor() {
    const scale = toonMat(C.scale);
    const dark = toonMat(C.scaleDark);
    const belly = toonMat(C.belly);
    const claw = toonMat(C.claw);
    const eye = toonMat(C.eye, { emissive: C.eye });
    this.plateMat = toonMat(C.plate, { emissive: C.plate });
    this.tintMats = [scale, dark, belly];
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const cone = this.keep(faceted(new THREE.ConeGeometry(0.5, 1, 4)));
    const cyl = this.keep(faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6)));
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.x = rotX;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Pelvis and a forward-leaning torso with a lighter belly.
    add(this.body, blob, scale, [0, 300, -40], [120, 105, 140]);
    add(this.body, blob, scale, [0, 410, 30], [125, 150, 115], 0.35);
    add(this.body, box, belly, [0, 380, 100], [90, 150, 30], 0.35);

    // Neck → head → hinged jaw; `mouth` is where the breath leaves.
    this.neck.position.copy(NECK_BASE);
    add(this.neck, box, scale, [0, 35, 30], [72, 80, 100], -0.5);
    const head = new THREE.Object3D();
    head.position.set(0, 85, 75);
    this.neck.add(head);
    add(head, box, scale, [0, 0, 30], [90, 70, 110]);
    add(head, box, dark, [0, -8, 110], [64, 46, 90]);
    add(head, box, eye, [33, 18, 70], [14, 10, 14]);
    add(head, box, eye, [-33, 18, 70], [14, 10, 14]);
    this.jaw.position.set(0, -30, 40);
    head.add(this.jaw);
    add(this.jaw, box, belly, [0, -8, 60], [58, 18, 110]);
    for (const x of [-20, 0, 20]) add(this.jaw, cone, claw, [x, 6, 105], [10, 18, 10]);
    this.mouth.position.set(0, -20, 165);
    head.add(this.mouth);
    this.body.add(this.neck);

    // Short clawed arms, hanging forward-down from the shoulders.
    for (const side of [1, -1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 100, 440, 105);
      add(pivot, box, dark, [0, -30, 35], [30, 30, 90], 0.7);
      add(pivot, box, scale, [0, -80, 85], [26, 26, 80], 1.2);
      for (const dx of [-10, 0, 10]) add(pivot, cone, claw, [dx, -112, 118], [9, 34, 9], 2.0);
      this.body.add(pivot);
      this.arms.push({ side, pivot });
    }

    // Glowing back plates, raked back.
    for (const [x, y, z, w, h] of PLATES) add(this.body, cone, this.plateMat, [x, y, z], [w, h, w * 0.5], -0.25);

    // Tail chain.
    for (let i = 0; i < TAIL_BASE.length - 1; i++) {
      const r = 95 - i * 15;
      this.tailSegs.push(add(this.body, cyl, i % 2 ? dark : scale, [0, 0, 0], [r, 1, r]));
    }

    // Legs (root space; placed by IK each frame).
    for (const side of [1, -1] as const) {
      this.legs.push({
        side,
        hip: new THREE.Vector3(side * 70, 300, -30),
        thigh: add(this.root, box, scale, [0, 0, 0], [70, 1, 75]),
        shin: add(this.root, cyl, dark, [0, 0, 0], [50, 1, 50]),
        foot: add(this.root, box, dark, [0, 0, 0], [70, 30, 110]),
      });
    }
    this.root.add(this.body);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const m = f.motion;
    // Weight shifts over the planted foot once per stride; the tail swings the other way.
    const shift = Math.sin(f.cycle * Math.PI * 2);
    const body = this.body;
    body.position.set(shift * 16 * m, (1 - Math.abs(shift)) * 10 * m + Math.sin(f.time * 1.3) * 6 - f.pose.dip - f.pose.collapse * 230, 0);
    body.rotation.set(f.pose.pitch + f.pose.collapse * 0.5, 0, -shift * 0.05 * m - f.pose.collapse * 0.3);
    this.root.updateMatrixWorld(true);

    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const fs = bipedFoot(f.cycle, i);
      _hip.copy(leg.hip).applyMatrix4(body.matrix);
      _foot.set(leg.side * FOOT_X * (1 + f.pose.collapse * 0.5), fs.lift * LIFT * m, fs.stride * (K.stats.strideLength / 2) * m);
      _pole.copy(_hip).add(_tmp.set(leg.side * 20, 0, 300)); // knees bend forward
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeSegment(leg.thigh, _hip, _knee);
      placeSegment(leg.shin, _knee, _foot);
      leg.foot.position.set(_foot.x, _foot.y + 15, _foot.z + 30);
      if (m > 0.3 && bipedLanded(f.prevCycle, f.cycle, i)) onFootLand(_world.copy(_foot).applyMatrix4(this.root.matrixWorld));
    }

    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      let swing = Math.sin(f.time * 1.3 + i) * 0.06 - shift * arm.side * 0.12 * m;
      if (f.melee && f.melee.side === i) swing = rakeSwing(f.melee.t, K.stats.meleeTiming);
      // While slashing forward (negative swing) the arm also sweeps across the body.
      arm.pivot.rotation.set(swing, 0, -arm.side * Math.max(0, -swing) * 0.5);
    }

    let pitch = Math.sin(f.time * 0.9) * 0.05;
    let turn = 0;
    let reach = 0;
    let jaw = 0.06 + Math.max(0, Math.sin(f.time * 0.7)) * 0.05;
    if (f.roaring) {
      pitch = -0.55;
      jaw = 0.8;
    }
    jaw = Math.max(jaw, f.charge * 0.45);
    if (f.antiAir) {
      // Snap Bite: the neck turns and stretches toward the flyer, jaws wide.
      const w = Math.max(0, f.antiAir.weight);
      body.worldToLocal(_tmp.copy(f.antiAir.target)).sub(NECK_BASE);
      turn = Math.max(-0.9, Math.min(0.9, Math.atan2(_tmp.x, _tmp.z))) * w;
      const up = Math.atan2(_tmp.y, Math.hypot(_tmp.x, _tmp.z));
      pitch = THREE.MathUtils.lerp(pitch, -Math.max(-0.4, Math.min(1.0, up)), w);
      reach = 80 * w;
      jaw = Math.max(jaw, 0.7 * w);
    }
    this.neck.rotation.set(pitch, turn, 0, 'YXZ');
    this.neck.position.set(NECK_BASE.x, NECK_BASE.y, NECK_BASE.z + reach);
    this.jaw.rotation.x = jaw;

    const n = this.tailPts.length;
    for (let i = 1; i < n; i++) {
      const base = TAIL_BASE[i]!;
      const k = i / (n - 1);
      this.tailPts[i]!.set(
        base.x + (Math.sin(f.time * 1.1 - i * 0.6) * 30 - shift * 70 * m) * k,
        base.y + Math.sin(f.time * 1.7 + i) * 8 * k + (f.roaring ? 40 * k : 0),
        base.z,
      );
    }
    for (let i = 0; i < this.tailSegs.length; i++) placeSegment(this.tailSegs[i]!, this.tailPts[i]!, this.tailPts[i + 1]!);

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.plateMat.emissiveIntensity = f.flash ? 3 : 0.35 + 2.2 * f.charge;
  }

  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mouth.updateWorldMatrix(true, false);
    return this.mouth.getWorldPosition(out);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
  }
}
```

- [ ] **Step 4: `src/monsters/kaiju/kind.ts`, widen the id, add to the roster**

```ts
import { CONFIG } from '../../config';
import type { MonsterKind } from '../types';
import { KaijuBody } from './KaijuBody';

const K = CONFIG.kaiju;

export const KAIJU: MonsterKind = {
  id: 'kaiju',
  name: 'Reptile Kaiju',
  blurb: 'Walking extinction. Armoured, unstoppable, breathes plasma.',
  pips: { toughness: 4, power: 4, speed: 2 },
  moves: [
    { icon: '🦖', label: 'Claw Rake' },
    { icon: '🔥', label: 'Plasma Breath' },
    { icon: '🦷', label: 'Snap Bite' },
  ],
  stats: K.stats,
  melee: { kind: 'arc', halfAngle: K.rakeHalfAngle },
  ranged: 'breath',
  antiAir: 'bite',
  signatures: ['acid', 'storm', 'chitin', 'frenzy', 'spines', 'swat', 'nova', 'mortar'],
  abilityText: {
    acid: { title: 'Radiant Wake', icon: '☢️', desc: (r) => (r === 1 ? 'Steps leave glowing radioactive pools' : 'Bigger, longer-lasting pools') },
    storm: { title: 'Plate Barrage', icon: '💠', desc: (r) => (r === 1 ? 'Plates fire homing plasma every 6s' : '+3 bolts, fires faster') },
    chitin: { title: 'Scale Armor', icon: '🛡️', desc: () => '+15% chance to deflect hits' },
    frenzy: { title: 'Primal Hunger', icon: '🍖', desc: () => '+6 HP per kill' },
    spines: { title: 'Thermal Plates', icon: '⚡', desc: (r) => (r === 1 ? 'Plates zap incoming shells and missiles' : 'Faster, wider zapping') },
    swat: { title: 'Snap Bite+', icon: '🦷', desc: () => 'Bites flyers faster, harder, more at once' },
    nova: { title: 'Heat Pulse', icon: '🔆', desc: (r) => (r === 1 ? 'Heat shockwave pulse every 7s' : 'Bigger, stronger, more frequent pulses') },
    mortar: { title: 'Plasma Lob', icon: '☄️', desc: (r) => (r === 1 ? 'Lobs plasma at artillery, SAMs, trucks' : 'More globs, bigger splash') },
  },
  upgradeText: {
    damage: { title: 'Atomic Fury' },
    attackSpeed: { title: 'Rapid Breath' },
    vitality: { title: 'Ironscale Hide' },
    regen: { title: 'Rad Regeneration' },
    stompRadius: { title: 'Earthshaker', desc: '+20% claw rake reach' },
    multiShot: { title: 'Wide Sweep', desc: 'Breath fires +1 extra beam' },
    moveSpeed: { title: 'Long Stride' },
  },
  fx: { spike: K.colors.plasma, glob: K.colors.plasma, pool: 0x4fd8ff, nova: K.colors.ember },
  createBody: () => new KaijuBody(),
};
```

In `src/monsters/types.ts`, change `export type MonsterId = 'insect';` to `export type MonsterId = 'insect' | 'kaiju';`.

In `src/monsters/roster.ts`:
- Import `KAIJU`.
- Change `KINDS` to `{ insect: INSECT, kaiju: KAIJU }`.
- Delete the `kaiju` entry from `COMING_SOON`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/monsters && npx tsc --noEmit && npm test`. Expected: PASS.

- [ ] **Step 6: Look at it, measure it, tune it**

With the dev server running, write `$SCRATCH/m4t6.mjs`. It goes to select, calls `g.selectStep(1)` (Kaiju), and waits 1.5 s. Then it:

1. **Screenshots** the select diorama at camera angles 0.5 and 2.0. To get the second angle, set `g.menuT` so that `startAngle + t * speed` hits it.
2. **Measures** the bounding box with the vertex-walk snippet from milestone 3's `bbox.mjs`, walking `g.monster.body.root` instead of `model.root`.
3. **Walks:** `g.playSelected()`, `g.skipIntro()`, then `g.order = { kind: 'move', to: { x: 0, z: 1500 } }`. Over 2 s, record the monster's z and count foot landings by wrapping `g.monster.onFootLand`.

**Expected:**
- **Look** (judged from the screenshots): upright and two-legged; a dark green body with a lighter belly; cyan back plates; a long tail; short arms; a jaw. Clearly a different creature from the Insect.
- **Size:** if the measured box differs from `CONFIG.kaiju.stats.size` by more than 10%, update the config to the measured `[x, z, y]` extents (rounded) and re-run the tests.
- **Walk:** the monster moves at about 110 m/s (about 220 m in 2 s, allowing for turning); foot landings alternate, at least 2; the walk screenshot shows a planted foot, a lifted foot and the tail swung opposite.

Fix anything that looks broken before committing. Examples: legs that invert or knees that bend backwards (flip the pole's z sign), or arms clipping through the torso (adjust the shoulder x). Ledger every number you change.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Reptile Kaiju: biped body with plates, arms, bite neck and tail; selectable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Kaiju combat: Claw Rake, Plasma Breath, Meltdown, effect colours

**Files:**
- Create: `src/systems/BreathBeam.ts`, `src/systems/BreathBeam.test.ts`, `src/systems/Projectiles.test.ts`
- Modify:
  - `src/config.ts`
  - `src/systems/Progression.ts`
  - `src/systems/Passives.ts`, `src/systems/Passives.test.ts`
  - `src/systems/Projectiles.ts`, `src/systems/AcidPools.ts`, `src/systems/Shockwave.ts`
  - `src/monsters/kaiju/kind.ts`, `src/monsters/kaiju/kind.test.ts`
  - `src/GameScene.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `arcTargets`, `lineTargets`, `linePoints`, `beamEnd`
  - From Task 6: `CONFIG.kaiju.breath`, `CONFIG.kaiju.colors`, `KAIJU`
  - From Task 1: `Monster.charge`, `Monster.rangedOrigin`, `Monster.consumeRanged`
- Produces:
  - `AbilityId` gains `'meltdown'`
  - `Passives.meltdown(hpFrac): { active: boolean; damage: number; cooldown: number }`
  - `class BreathBeam`:
    - `charge`, `busy`
    - `start(aim, lines)`
    - `update(dt, from, range, onFire)`
    - `clear()`
  - `Projectiles.setTheme(spike, glob)`, `AcidPools.setColor(c)`, `Shockwave.setColor(c)`

- [ ] **Step 1: Write the failing tests**

Append to `src/systems/Passives.test.ts`. First add `meltdown: 0` to the record inside the file's `ranks` helper, which spells out every ability.

```ts
describe('meltdown', () => {
  it('kicks in below the rank\'s HP threshold only', () => {
    const r1 = new Passives(ranks({ meltdown: 1 }));
    expect(r1.meltdown(0.29)).toEqual({ active: true, damage: CONFIG.passives.meltdown.damageMult, cooldown: CONFIG.passives.meltdown.cooldownMult });
    expect(r1.meltdown(0.31).active).toBe(false);
    expect(r1.meltdown(0).active).toBe(false);
    expect(new Passives(ranks({})).meltdown(0.1)).toEqual({ active: false, damage: 1, cooldown: 1 });
    expect(new Passives(ranks({ meltdown: 3 })).meltdown(0.45).active).toBe(true);
  });
});
```

(Import `CONFIG` in that file if it isn't already.)

`src/systems/Projectiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Projectiles } from './Projectiles';

describe('Projectiles.setTheme', () => {
  it('recolours the monster\'s spikes and globs only', () => {
    const scene = new THREE.Scene();
    const p = new Projectiles(scene);
    const colorOf = (name: string) => ((scene.children.find((c) => c.name === name) as THREE.InstancedMesh).material as THREE.MeshBasicMaterial).color.getHex();
    const shellBefore = colorOf('shot-shell');
    p.setTheme(0x112233, 0x445566);
    expect(colorOf('shot-spike')).toBe(0x112233);
    expect(colorOf('shot-glob')).toBe(0x445566);
    expect(colorOf('shot-shell')).toBe(shellBefore);
  });
});
```

`src/systems/BreathBeam.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { BreathBeam } from './BreathBeam';

const B = CONFIG.kaiju.breath;

describe('BreathBeam', () => {
  it('charges, fires once with one end per beam, lingers, then is free again', () => {
    const beam = new BreathBeam(new THREE.Scene());
    const jaws = new THREE.Vector3(0, 300, 0);
    const fired: THREE.Vector3[][] = [];
    beam.start(new THREE.Vector3(0, 0, 600), 3);
    expect(beam.busy).toBe(true);
    let t = 0;
    while (t < B.charge - 0.05) {
      beam.update(0.05, jaws, 1300, (_f, ends) => fired.push(ends.map((e) => e.clone())));
      t += 0.05;
    }
    expect(fired).toHaveLength(0);
    expect(beam.charge).toBeGreaterThan(0.5);
    beam.update(0.1, jaws, 1300, (_f, ends) => fired.push(ends.map((e) => e.clone())));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toHaveLength(3);
    for (const e of fired[0]!) expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(1300 + 1e-6);
    // The middle beam goes straight through the aim and stops at the ground there.
    expect(fired[0]![1]!.z).toBeCloseTo(600);
    beam.start(new THREE.Vector3(500, 0, 0), 1);
    for (let i = 0; i < 20; i++) beam.update(0.05, jaws, 1300, () => fired.push([]));
    expect(fired).toHaveLength(1);
    expect(beam.busy).toBe(false);
  });
  it('caps the fan at maxLines and clear() cancels', () => {
    const beam = new BreathBeam(new THREE.Scene());
    let n = 0;
    beam.start(new THREE.Vector3(0, 0, 500), 99);
    for (let i = 0; i < 20; i++) beam.update(0.05, new THREE.Vector3(0, 300, 0), 1300, (_f, ends) => (n = ends.length));
    expect(n).toBe(B.maxLines);
    beam.start(new THREE.Vector3(0, 0, 500), 1);
    beam.clear();
    expect(beam.busy).toBe(false);
    expect(beam.charge).toBe(0);
  });
});
```

In `src/monsters/kaiju/kind.test.ts`, add `expect(KAIJU.signatures).toContain('meltdown');` to the signatures test.

Run: `npx vitest run src/systems/Passives.test.ts src/systems/Projectiles.test.ts src/systems/BreathBeam.test.ts src/monsters/kaiju`. Expected: FAIL (`meltdown` missing; `setTheme` and mesh names missing; `./BreathBeam` not found).

- [ ] **Step 2: Meltdown**

1. **`src/config.ts`**, inside `passives`:
   ```ts
   /** Meltdown (Kaiju): below threshold[rank] of max HP, damage × damageMult and ranged cooldown × cooldownMult. */
   meltdown: { threshold: [0, 0.3, 0.4, 0.5], damageMult: 1.5, cooldownMult: 0.5 },
   ```
2. **`src/systems/Progression.ts`:**
   - Add `| 'meltdown'` to `AbilityId`.
   - Add to `ABILITIES`:
     ```ts
     meltdown: { title: 'Meltdown', icon: '🌋', desc: (r) => (r === 1 ? 'Below 30% HP: +50% damage, ranged recharges 2x' : 'Meltdown kicks in at higher HP') },
     ```
   - Add `meltdown: 0` to `emptyRanks()`.
   - `DEFAULT_POOL` does not include `meltdown`, so the Insect never sees it.
3. **`src/systems/Passives.ts`:**

```ts
const MELTDOWN_OFF = { active: false, damage: 1, cooldown: 1 } as const;
const MELTDOWN_ON = { active: true, damage: P.meltdown.damageMult, cooldown: P.meltdown.cooldownMult } as const;
```
(place after `const P = CONFIG.passives;`) and the method:
```ts
  /** Meltdown (Kaiju): below the rank's HP fraction (and still alive), damage up and the ranged attack recharges faster. */
  meltdown(hpFrac: number): { active: boolean; damage: number; cooldown: number } {
    const r = this.ranks().meltdown;
    return r > 0 && hpFrac > 0 && hpFrac < P.meltdown.threshold[r]! ? MELTDOWN_ON : MELTDOWN_OFF;
  }
```
4. **`src/monsters/kaiju/kind.ts`:** add `'meltdown'` to `signatures`, and to `abilityText`:
   ```ts
   meltdown: { title: 'Meltdown', icon: '🌋', desc: (r) => (r === 1 ? 'Below 30% HP: +50% damage, breath recharges 2x' : 'Meltdown kicks in at higher HP') },
   ```

- [ ] **Step 3: Effect colours**

1. **`Projectiles.ts`:** in `make`, name each mesh. Give `make` a `name: string` first parameter and set `m.name = name;`. Pass `'shot-spike'`, `'shot-shell'`, `'shot-rocket'` and `'shot-glob'`. Then add:
   ```ts
   /** The monster's own shots take its colours (spikes / storm bolts, mortar globs). */
   setTheme(spike: number, glob: number): void {
     (this.meshes.spike.material as THREE.MeshBasicMaterial).color.setHex(spike);
     (this.meshes.glob.material as THREE.MeshBasicMaterial).color.setHex(glob);
   }
   ```
2. **`AcidPools.ts`:** add
   ```ts
   setColor(c: number): void {
     (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(c);
   }
   ```
3. **`Shockwave.ts`:** add
   ```ts
   setColor(c: number): void {
     this.mat.color.setHex(c);
   }
   ```

- [ ] **Step 4: `src/systems/BreathBeam.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { placeSegment } from '../monster/ik';
import { beamEnd } from './sweep';

const B = CONFIG.kaiju.breath;
const _jaws = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _end = new THREE.Vector3();

/** Rotate (dx, dz) about the vertical axis by `a` and add it back to (ox, oz). */
function turned(ox: number, oz: number, dx: number, dz: number, a: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return out.set(ox + dx * c + dz * s, y, oz - dx * s + dz * c);
}

/**
 * Plasma Breath: a short charge (the plates light up through `charge`), then one or more beams from the
 * jaws. The caller applies hits once, in `onFire`; the beams then linger briefly with a small sweep.
 */
export class BreathBeam {
  /** 0..1 while charging; decays after. */
  charge = 0;
  private phase: 'idle' | 'charge' | 'fire' = 'idle';
  private t = 0;
  private aim = new THREE.Vector3();
  private lines = 1;
  private from = new THREE.Vector3();
  private ends: THREE.Vector3[] = [];
  private meshes: THREE.Mesh[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: CONFIG.kaiju.colors.plasma, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (let i = 0; i < B.maxLines; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
      this.ends.push(new THREE.Vector3());
    }
  }

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Begin charging at `aim` (world) with `lines` fanned beams (capped at maxLines). Ignored while busy. */
  start(aim: THREE.Vector3, lines: number): void {
    if (this.busy) return;
    this.phase = 'charge';
    this.t = 0;
    this.aim.copy(aim);
    this.lines = Math.max(1, Math.min(B.maxLines, Math.floor(lines)));
  }

  /**
   * Advance by dt. `from` is the jaws this frame. On the frame the charge completes, `onFire` gets the jaws
   * and each beam's end: fanned around the aim, at most `range` away horizontally, stopping at the ground.
   */
  update(dt: number, from: THREE.Vector3, range: number, onFire: (from: THREE.Vector3, ends: readonly THREE.Vector3[]) => void): void {
    if (this.phase === 'idle') {
      this.charge = Math.max(0, this.charge - dt * 4);
      return;
    }
    this.t += dt;
    if (this.phase === 'charge') {
      this.charge = Math.min(1, this.t / B.charge);
      if (this.t < B.charge) return;
      this.phase = 'fire';
      this.t = 0;
      this.from.copy(from);
      const dx = this.aim.x - from.x;
      const dz = this.aim.z - from.z;
      for (let i = 0; i < this.lines; i++) {
        turned(from.x, from.z, dx, dz, (i - (this.lines - 1) / 2) * B.fan, this.aim.y, _aim);
        const e = beamEnd(from, _aim, range);
        this.ends[i]!.set(e.x, e.y, e.z);
      }
      onFire(this.from, this.ends.slice(0, this.lines));
    }
    const k = Math.min(1, this.t / B.show);
    const sweep = (k - 0.5) * B.sweep;
    _jaws.copy(from);
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i]!;
      m.visible = i < this.lines && k < 1;
      if (!m.visible) continue;
      const e = this.ends[i]!;
      turned(this.from.x, this.from.z, e.x - this.from.x, e.z - this.from.z, sweep, e.y, _end);
      placeSegment(m, _jaws, _end);
      m.scale.x = m.scale.z = B.halfWidth * 0.6 * (1 - 0.6 * k);
    }
    this.mat.opacity = 0.9 * (1 - 0.7 * k);
    if (k >= 1) this.clear();
  }

  clear(): void {
    this.phase = 'idle';
    this.charge = 0;
    for (const m of this.meshes) m.visible = false;
  }
}
```

Run the Step 1 tests. Expected: PASS.

- [ ] **Step 5: Wire it into `GameScene`**

1. **Imports:**
   ```ts
   import { BreathBeam } from './systems/BreathBeam';
   import { arcTargets, linePoints, lineTargets } from './systems/sweep';
   ```
2. **Field and construction:** add `private breath: BreathBeam;`, constructed next to the other effects with `this.breath = new BreathBeam(this.scene);`. Add a scratch field `private jaws = new THREE.Vector3();`.
3. **Damage and cooldown multipliers:**

```ts
  /** All of the monster's damage: upgrades × the creature's own multiplier × Meltdown. */
  private dmgMult(): number {
    const m = this.monster;
    return this.progression.stats.damageMult * m.kind.stats.damageMult * this.passives.meltdown(m.hp / m.maxHp).damage;
  }

  /** Ranged recharge: upgrades × Meltdown. */
  private rangedCdMult(): number {
    const m = this.monster;
    return this.progression.stats.cooldownMult * this.passives.meltdown(m.hp / m.maxHp).cooldown;
  }
```

   Then replace every damage-multiplier use with `this.dmgMult()`:
   - every `this.progression.stats.damageMult` in `GameScene.ts`, including `const dm = …`, `leapLand`, `roar`, `spikeStorm`, `tailSwat`, `overload`, `venomNova`, `acidMortar`, `footCrush` and the reflect damage;
   - `s.damageMult` in `meleeImpact` and `fireSpikes`.

   In `fireSpikes`, change `m.consumeRanged(s.cooldownMult);` to `m.consumeRanged(this.rangedCdMult());`.

   For the Insect, both new multipliers are exactly 1 (its `damageMult` is 1 and it can never take Meltdown), so its numbers are unchanged.
4. **Kind switching:** `applyKind` also applies the effect colours and cancels any breath:

```ts
  private applyKind(kind: MonsterKind): void {
    this.monster.setKind(kind);
    this.progression.setPool(kind);
    this.projectiles.setTheme(kind.fx.spike, kind.fx.glob);
    this.acid.setColor(kind.fx.pool);
    this.novaWave.setColor(kind.fx.nova);
    this.breath.clear();
  }
```

5. **Melee dispatch.** Make `meleeImpact` start with:
   ```ts
   const shape = this.monster.kind.melee;
   if (shape.kind === 'arc') {
     this.clawRake(shape.halfAngle);
     return;
   }
   ```
   and add:

```ts
  /** Claw Rake: everything on the ground in a forward arc within reach; buildings take triple damage. */
  private clawRake(halfAngle: number): void {
    const m = this.monster;
    const from = { x: m.position.x, z: m.position.z };
    const range = this.ms.meleeRange * this.progression.stats.stompRadiusMult;
    const dmg = this.ms.meleeDamage * this.dmgMult();
    for (const t of arcTargets(from, m.yaw, range, halfAngle, this.enemyTargets())) t.applyDamage(dmg);
    const buildings: Target[] = [];
    this.city.forEachStandingInRadius(from, range, (t) => buildings.push(t));
    for (const t of arcTargets(from, m.yaw, range, halfAngle, buildings)) t.applyDamage(dmg * 3);
    for (let i = -2; i <= 2; i++) {
      const a = m.yaw + (i / 2) * halfAngle;
      this.tmpV.set(from.x + Math.sin(a) * range * 0.7, 0, from.z + Math.cos(a) * range * 0.7);
      this.particles.ring('dust', this.tmpV, 60, 6);
      this.particles.emit('debris', this.tmpV.setY(15), 4, 1);
    }
    this.rig.addTrauma(0.3);
  }
```

6. **Ranged dispatch.** In `updateMonster`, change
   `if (d.attack === 'ranged') this.fireSpikes(...)`
   to call `this.fireRanged(...)` with the same argument, and add:

```ts
  private fireRanged(target: Target | null): void {
    if (this.monster.kind.ranged === 'breath') this.breathAt(target);
    else this.fireSpikes(target);
  }

  /** Plasma Breath: start charging at the target; hits land when it fires (onBreathFire). */
  private breathAt(target: Target | null): void {
    if (!target || this.breath.busy) return;
    this.breath.start(target.position, 1 + this.progression.stats.extraSpikes);
    this.monster.consumeRanged(this.rangedCdMult());
  }

  /** Each beam hits every enemy (ground or air) and building along its line, from the monster to the beam's end. */
  private onBreathFire = (_from: THREE.Vector3, ends: readonly THREE.Vector3[]): void => {
    const B = CONFIG.kaiju.breath;
    const a = { x: this.monster.position.x, z: this.monster.position.z };
    const mult = this.dmgMult();
    const enemies = new Set<Target>();
    const buildings = new Set<Target>();
    for (const e of ends) {
      const b = { x: e.x, z: e.z };
      for (const t of lineTargets(a, b, B.halfWidth, this.enemyTargets())) enemies.add(t);
      for (const p of linePoints(a, b, B.halfWidth * 1.5)) this.city.forEachStandingInRadius(p, B.halfWidth, (t) => buildings.add(t));
      for (let k = 1; k <= 8; k++) this.particles.emit('fire', this.tmpV.set(a.x + (b.x - a.x) * (k / 8), 20, a.z + (b.z - a.z) * (k / 8)), 2, 0.5);
      this.particles.explosion(e, 0.8);
    }
    for (const t of enemies) t.applyDamage(this.ms.rangedDamage * mult);
    for (const t of buildings) t.applyDamage(B.buildingDamage * mult);
    this.rig.addTrauma(0.25);
  };
```

7. **Breath every frame.** In the `playing` block, right after `this.updateMonster(dt);`:
   ```ts
   this.breath.update(dt, this.monster.rangedOrigin(this.jaws), this.ms.rangedRange, this.onBreathFire);
   const melting = this.passives.meltdown(this.monster.hp / this.monster.maxHp).active;
   this.monster.charge = Math.max(this.breath.charge, melting ? 0.5 : 0);
   ```
8. **Clearing the breath:** add `this.breath.clear();` in `resetRun()` (next to `this.projectiles.clear();`) and at the start of `startDying()`.

Anti-air needs no change. Snap Bite uses the same anti-air timing and damage path as Tail Swat, the `KaijuBody` animates the lunge, and its reach is measured from the Kaiju's `headHeight` (Task 1's `bodyPoint(this.ms.headHeight)`).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test`. Expected: all pass.

Scripted check `$SCRATCH/m4t7.mjs` (desktop):
1. Go to select, then `g.selectStep(1)` (Kaiju), `g.playSelected()`, `g.skipIntro()`. Wait 0.3 s.
2. **Breath line:** spawn tanks in a line ahead:
   ```js
   for (const z of [520, 760, 1000]) g.enemies.get('tank').spawnAt(0, z, g.ctx)
   ```
   - Record the tank targets.
   - Over 1.5 s, sample `g.breath.charge` and `g.monster.body.root`'s plate glow every 0.1 s.
   - Expected: all three tanks are dead within 1.5 s (one breath kills a whole line; tank HP is 30); `charge` rose above 0.9 before the hits.
   - Take a screenshot mid-beam: a cyan beam from the jaws to the ground beyond the far tank.
3. **Claw Rake:** move the monster beside a block of standing buildings:
   ```js
   g.monster.position.set(<a building x>, 0, <z - 300>)
   ```
   Then force a strike:
   ```js
   g.monster.startMelee(1, 0, { x: …, z: … })
   ```
   Expected: buildings in the forward arc collapse, and buildings behind the monster stay standing (count standing buildings in front and behind before and after).
4. **Meltdown:**
   - Set `g.progression.ranks.meltdown = 1` and `g.monster.hp = g.monster.maxHp * 0.2`.
   - Read `g['dmgMult']()`. Expected: about `1.15 × 1.5`.
   - Restore HP to max. Expected: `dmgMult` about 1.15.
5. **Colours:**
   - Expected: `g.projectiles.meshes.spike.material.color.getHex() === 0x6ff6ff`.
   - Switch back to the Insect via game over and Change Monster. Expected: it is `CONFIG.palette.stinger` again.
6. **General:** `ERRORS none`, and draw calls below 150.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Kaiju combat: Claw Rake arc, Plasma Breath beam, Meltdown, Kaiju effect colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: End-to-end scripted checks (flows, switching, input in menus, storage, draw calls)

**Files:**
- Create (scratchpad, not committed): `$SCRATCH/m4check.mjs`
- Modify only if a check fails, in the file that owns the bug, with a failing unit test first where the logic is pure.

**Interfaces:**
- Consumes the dev handle `window.__game`:
  - `getState`, `selIndex`, `selectStep`, `playSelected`, `skipIntro`, `changeMonster`, `restart`, `startFromTitle`
  - `monster` (kind, visible, hp, position, body), `progression` (ranks, level, stats), `breath`, `projectiles`, `scene`
  - `pixel.renderer.info.render.calls`

- [ ] **Step 1: Write the script**

`$SCRATCH/m4check.mjs` reuses the milestone 3 `open()` and `snap()` helpers. `open()` now waits for state `title`. Add these fields to `snap()`:
- `kind: g.monster.kind.id`
- `visible: g.monster.visible`
- `bodies: g.scene.children.filter((c) => c.type === 'Group' && c.children.length > 10).length`
- `ranks: Object.values(g.progression.ranks).reduce((a, b) => a + b, 0)`
- `level: g.progression.level`
- `hud: !!document.querySelector('.hud-top')`
- `calls`

Sections, each logging labelled JSON lines:

1. **Title and select, both sizes.**
   - Desktop: load (state `title`, `hud: false`), press `Enter` (state `select`), press `ArrowRight` 8 times, logging `{ idx, kind, visible, bodies }` after each.
   - Phone: load, `touchscreen.tap(195, 420)` (state `select`), swipe left 8 times, logging the same.
   - Screenshot title and select for both monsters at both sizes.
2. **Menu input is inert.**
   - On the title (fresh page) and on select:
     - tap the canvas centre (select: on the 3D area above the panel);
     - press `Space`, `E`, `R`;
     - drag;
     - wheel.
   - Then log `{ state, order: g.order?.kind ?? null, aiming: g.abilities.aiming, x, z, enemies: g.enemyTargets().length }`.
   - In select, `Space` is confirm. Run this section with a "coming soon" entry selected, so the press must be a no-op.
3. **Play each monster.** For the Insect and the Kaiju:
   - select, PLAY, skip the intro;
   - level up via `g.progression.addExp(500)` and pick the first offer each time (`g.chooseUpgrade(offer.id, seq)` from the `levelUpOffer` event, or call `g.progression.choose` directly);
   - log `{ kind, maxHp, ranks }`;
   - die (`g.monster.hp = 0`) and wait for `gameover`.
4. **Play Again** (`g.restart()`): log a snapshot once state is `intro`.
5. **Change Monster** (`g.changeMonster()`): log a snapshot once state is `select`.
6. **Storage.**
   - Select the Kaiju and reload the page.
   - Press `Enter` to reach select, and log `idx`.
   - If `RundotGameAPI.appStorage` rejects in the dev host (check with `page.evaluate` against `window`'s module-level store), log `storage: 'unavailable'` instead and expect `idx 0` (Insect fallback).
7. **Errors:** collect `pageerror` and console errors throughout, and print `ERRORS none` or the list.

- [ ] **Step 2: Run it and compare against the expected results**

Run: `SCRATCH=<scratchpad> node $SCRATCH/m4check.mjs > $SCRATCH/m4check.log 2>&1; cat $SCRATCH/m4check.log`.

Expected:

1. **Browsing:** indices cycle `1, 2, 3, 0, 1, 2, 3, 0`.
   - `visible` is true only at indices 0 and 1.
   - `kind` is `kaiju` at index 1 and `insect` at index 0.
   - `bodies` stays at **1** on every line, so there's no leaked monster model.
2. **Inert input:** every line has `order: null`, `aiming: null`, the monster at `[0, 0]`, `enemies: 0`, and the state unchanged.
   - Exception: on the title, the canvas tap moves to `select`. Run the title line on a fresh page with only the non-tap inputs; `Space` there also starts the game, which is intended ("any key"), so log that it went to `select`.
3. **Per-monster runs:**
   - The Insect's `maxHp` is 1000 × its vitality picks and the Kaiju's is 1250 × its picks.
   - The Kaiju's offers never include `Brood Swarm`, and the Insect's never include `Meltdown`. Log every offer title to check this.
4. **Play Again:** state `intro`, the same `kind`, `ranks: 0`, `level: 1`, `hp == maxHp` (the kind's base).
5. **Change Monster:** state `select`, `ranks: 0`, `level: 1`, `visible: true`, `bodies: 1`.
6. **Storage:** `idx 1` after the reload, or `storage: 'unavailable'` with `idx 0`.
7. **Draw calls and errors:** every `calls` is below 150, and `ERRORS none`.

Look at all the screenshots:
- **Title:** the logo is crisp and legible over the city.
- **Select:** each monster is framed whole and turning, and the panel doesn't cover it on phone.
- **Coming soon:** the cards show a dark silhouette and a disabled PLAY.
- **Kaiju:** its intro cocoon contains it.

- [ ] **Step 3: Fix failures**

Any mismatch is a bug in the task that owns the code. Use superpowers:systematic-debugging. Write a failing unit test where the logic is pure (`menuFlow`, `roster`, `pick`, `Progression` pools, `sweep`, `BreathBeam`), fix it, and re-run Step 2 until every line matches.

- [ ] **Step 4: Full suite and commit any fixes**

Run: `npx tsc --noEmit && npm test`. Expected: all pass. If Step 3 changed files:

```bash
git add -A
git commit -m "Milestone 4a: fixes from end-to-end menu/monster checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
