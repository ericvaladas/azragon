# AZRAGON Milestone 3 (Intro Cinematic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 15-second, skippable intro at the start of every run:
- the cocoon pod flies at a pixel-art Earth;
- re-entry burns white-hot, with the scene cut hidden in a flash;
- the pod falls through clouds and crashes into the city, carving the crater;
- the monster bursts out, and the camera settles exactly into the gameplay view.

**Architecture:**
- **Pure timeline:** `intro/timeline.ts` turns elapsed time into the phase, pod position and camera pose. It's fully unit-tested.
- **Space scene:** `SpaceScene` renders the opening.
- **Orchestrator:** `IntroCinematic` drives the in-world effects (clouds, impact, emergence, flash and skip hint).
- **Game state:** `GameScene` gains an `intro` state that renders the space scene before the cut.
- **City:** `City` stops pre-clearing the crater and gains `blast()`.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright with Metal GPU for scripted checks.

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone3-design.md`

## Global Constraints

- All M1 and M2 constraints still apply:
  - no `useEffect`;
  - no `setPixelRatio`;
  - +Z forward and +X is the model's left;
  - instancing for repeated meshes;
  - tunables in `src/config.ts`;
  - draw calls under 150.
- **Timing:** the intro is driven by real time (clamped frame delta), not slowed by anything. `INTRO_LENGTH` = 15 s, and the cut happens at t = 5.5 s.
- **No camera jump:** at t = `INTRO_LENGTH`, the intro camera must equal the gameplay pose `cameraPose(defaultOrbit, origin)`.
- **Skip:** a tap, click or any key skips. After a skip, the game is in the exact end state:
  - crater blasted and decal visible;
  - pod and fragments gone;
  - monster at the origin with y = 0;
  - state `playing`.
- **Crater blast:** destroys buildings without awarding EXP, and they don't count toward the "Buildings" stat.
- **During `intro`:** no enemies spawn, abilities and passives don't run, and the HUD, ability buttons and edge arrows are hidden.
- **Commits:** commit after every task. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Skipping at any moment:** every phase, including during the cut flash and mid-impact, lands cleanly in gameplay, with no lingering clouds, flash overlay or fragments, and the camera in the gameplay pose. Pinned by the scripted random-skip check (Task 5).
2. **Restart during or after the intro:** Play Again resets the world and replays the intro; the crater buildings stand again until the new impact. Pinned by the scripted restart check (Task 5).
3. **Resizing during the intro:** the space camera's aspect ratio updates too, so there's no stretched planet. Pinned by the `SpaceScene.setAspect` wiring (Task 4) and the scripted resize check (Task 5).
4. **Phase-boundary continuity:** the camera never jumps at the descent, impact or emergence boundaries. Pinned by the timeline continuity tests (Task 1).
5. **Crater accounting:** the impact awards no EXP and adds 0 to the "Buildings" stat, but the rubble persists across chunk reloads. Pinned by the `DestroyedLog` test (Task 2) and the scripted unload/reload check (Task 5).

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | `intro` block (phase starts, drop, camera offsets, clouds, sizes) |
| `src/intro/timeline.ts` (+test) | Pure `phaseAt`, `podPath`, `cameraPath`, `gameplayPose`, constants |
| `src/intro/PodModel.ts` | Cocoon mesh (chitin egg + glowing seams), shared by both scenes |
| `src/intro/earthTexture.ts` | Canvas 2D pixel Earth texture |
| `src/intro/SpaceScene.ts` | Space scene: stars, Earth + atmosphere rim, pod, re-entry flames, camera |
| `src/intro/CloudLayer.ts` | Instanced pixel cloud billboards |
| `src/intro/IntroCinematic.ts` | Orchestration, in-world pod, impact, emergence, flash and skip hint (DOM) |
| `src/world/chunks.ts` (+test) | Stop pre-clearing the crater |
| `src/world/City.ts` | `blast()`, crater decal toggle, blast excluded from the destroyed count |
| `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx` | `intro` state, render switching, skip input, HUD hidden |

---

### Task 1: Intro timeline (pure)

**Files:**
- Create: `src/intro/timeline.ts`, `src/intro/timeline.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces:
  - `type IntroPhase = 'space' | 'reentry' | 'clouds' | 'descent' | 'impact' | 'settle' | 'emerge' | 'done'`
  - `INTRO_LENGTH`, `CUT_TIME`, `IMPACT_TIME`, `EMERGE_TIME`
  - `phaseAt(t: number): { phase: IntroPhase; k: number }`
  - `podPath(t: number, out: THREE.Vector3): THREE.Vector3`
  - `gameplayPose(): { pos: THREE.Vector3; look: THREE.Vector3 }`
  - `cameraPath(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): { pos: THREE.Vector3; look: THREE.Vector3 }`
  - `flashAt(t: number): number` (screen-wash opacity, 0..1)
  - `shakeAt(t: number): number` (camera trauma, 0..1)
  - `monsterRiseY(t: number): number` (monster root y during emerge)

- [ ] **Step 1: Add config**

Add to `CONFIG`:

```ts
  intro: {
    /** Phase start times (s); `done` is the intro length. The cut to the game world is at `clouds`. */
    starts: { space: 0, reentry: 3.5, clouds: 5.5, descent: 8.5, impact: 10.5, settle: 11, emerge: 13, done: 15 },
    /** Pod drop in the game world: starts this high and this far behind (-Z), lands at the origin. */
    dropHeight: 4200,
    dropBack: 1400,
    /** Pod rests half-buried after impact (world y). */
    podRestY: -40,
    /** Camera offsets from the pod while falling (start of clouds) and the wide shot at impact (absolute). */
    camFollow: [0, 260, -700] as const,
    camWide: [-900, 650, -1700] as const,
    lookFollow: [0, -300, 600] as const,
    lookImpact: [0, 100, 0] as const,
    /** Monster rises from this depth (× monster scale) over the first riseTime s of emerge. */
    riseDepth: 300,
    riseTime: 1.4,
    clouds: { count: 80, minY: 1500, maxY: 4000, spreadX: 1500, minZ: -2200, maxZ: 900, minSize: 500, maxSize: 1100 },
    /** Fog while inside the cloud band (eases back to CONFIG.fog through the descent). */
    cloudFog: { near: 250, far: 2000 },
    /** Cocoon length (m): about 60% of the standing monster. Tune by eye against the monster. */
    podLength: 190,
    /** Screen wash: builds over `rise` s before the cut, holds, fades; a smaller flash at impact. */
    flash: { rise: 1.0, hold: 0.15, fade: 0.7, impactPeak: 0.8, impactFade: 0.45 },
    /** Camera shake offset (m) at full trauma. */
    shakeAmp: 40,
    /** Space scene (its own units): Earth size, pod-to-Earth distance at t=0 and at the cut, Earth below the path. */
    space: { earthRadius: 1000, earthStart: 9000, earthEnd: 1250, earthDrop: 650, stars: 700, podLength: 60 },
  },
```

- [ ] **Step 2: Write failing tests**

`src/intro/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CUT_TIME, EMERGE_TIME, IMPACT_TIME, INTRO_LENGTH, cameraPath, flashAt, gameplayPose, monsterRiseY, phaseAt, podPath, shakeAt } from './timeline';
import { CONFIG } from '../config';

const S = CONFIG.intro.starts;
const cam = (t: number) => cameraPath(t, { pos: new THREE.Vector3(), look: new THREE.Vector3() });

describe('phaseAt', () => {
  it('maps times to phases with in-phase progress', () => {
    expect(phaseAt(0)).toEqual({ phase: 'space', k: 0 });
    expect(phaseAt(S.reentry)).toEqual({ phase: 'reentry', k: 0 });
    const mid = phaseAt((S.reentry + S.clouds) / 2);
    expect(mid.phase).toBe('reentry');
    expect(mid.k).toBeCloseTo(0.5);
    expect(phaseAt(S.impact + 0.01).phase).toBe('impact');
    expect(phaseAt(INTRO_LENGTH).phase).toBe('done');
    expect(phaseAt(999).phase).toBe('done');
  });
  it('places the cut at the end of re-entry, and impact/emerge at their phase starts', () => {
    expect(CUT_TIME).toBe(S.clouds);
    expect(IMPACT_TIME).toBe(S.impact);
    expect(EMERGE_TIME).toBe(S.emerge);
    expect(INTRO_LENGTH).toBe(S.done);
  });
});

describe('podPath', () => {
  it('starts high and behind at the cut, lands on the origin at impact, then rests half-buried', () => {
    const p = new THREE.Vector3();
    podPath(CUT_TIME, p);
    expect(p.y).toBeCloseTo(CONFIG.intro.dropHeight);
    expect(p.z).toBeCloseTo(-CONFIG.intro.dropBack);
    podPath(IMPACT_TIME, p);
    expect(p.length()).toBeCloseTo(0);
    podPath(IMPACT_TIME + 1, p);
    expect(p.y).toBeCloseTo(CONFIG.intro.podRestY);
  });
  it('falls faster and faster (accelerating descent)', () => {
    const y = (t: number) => podPath(t, new THREE.Vector3()).y;
    const d1 = y(CUT_TIME) - y(CUT_TIME + 1);
    const d2 = y(IMPACT_TIME - 1) - y(IMPACT_TIME);
    expect(d2).toBeGreaterThan(d1);
  });
});

describe('cameraPath', () => {
  it('ends exactly on the gameplay pose (no jump when play starts)', () => {
    const g = gameplayPose();
    for (const t of [INTRO_LENGTH, INTRO_LENGTH + 5]) {
      const c = cam(t);
      expect(c.pos.distanceTo(g.pos)).toBeCloseTo(0);
      expect(c.look.distanceTo(g.look)).toBeCloseTo(0);
    }
  });
  it('is continuous across the descent, impact, and emerge boundaries', () => {
    for (const b of [S.descent, IMPACT_TIME, EMERGE_TIME, INTRO_LENGTH]) {
      const a = cam(b - 1e-4);
      const c = cam(b + 1e-4);
      expect(a.pos.distanceTo(c.pos)).toBeLessThan(1);
      expect(a.look.distanceTo(c.look)).toBeLessThan(1);
    }
  });
  it('follows behind and above the falling pod during the clouds', () => {
    const t = CUT_TIME + 1;
    const pod = podPath(t, new THREE.Vector3());
    const c = cam(t);
    expect(c.pos.y).toBeGreaterThan(pod.y);
    expect(c.pos.z).toBeLessThan(pod.z);
  });
});

describe('flashAt', () => {
  const F = CONFIG.intro.flash;
  it('is clear in space, builds to white at the cut, holds, then fades', () => {
    expect(flashAt(0)).toBe(0);
    expect(flashAt(CUT_TIME - F.rise - 0.01)).toBe(0);
    expect(flashAt(CUT_TIME - 0.001)).toBeGreaterThan(0.95);
    expect(flashAt(CUT_TIME)).toBe(1);
    expect(flashAt(CUT_TIME + F.hold + F.fade / 2)).toBeCloseTo(0.5);
    expect(flashAt(CUT_TIME + F.hold + F.fade + 0.01)).toBe(0);
  });
  it('flashes again at impact and is clear when play starts', () => {
    expect(flashAt(IMPACT_TIME)).toBeCloseTo(F.impactPeak);
    expect(flashAt(IMPACT_TIME + F.impactFade + 0.01)).toBe(0);
    expect(flashAt(INTRO_LENGTH)).toBe(0);
  });
});

describe('shakeAt', () => {
  it('is calm in space, strongest at impact, and zero when play starts', () => {
    expect(shakeAt(1)).toBe(0);
    expect(shakeAt(IMPACT_TIME + 0.1)).toBe(1);
    expect(shakeAt(CUT_TIME - 0.1)).toBeGreaterThan(shakeAt(CONFIG.intro.starts.reentry + 0.2));
    expect(shakeAt(INTRO_LENGTH - 0.01)).toBe(0);
  });
});

describe('monsterRiseY', () => {
  it('rises from below the crater floor to standing within riseTime of the split', () => {
    const depth = CONFIG.intro.riseDepth * CONFIG.monster.scale;
    expect(monsterRiseY(EMERGE_TIME)).toBeCloseTo(-depth);
    expect(monsterRiseY(EMERGE_TIME + CONFIG.intro.riseTime / 2)).toBeGreaterThan(-depth / 2);
    expect(monsterRiseY(EMERGE_TIME + CONFIG.intro.riseTime)).toBeCloseTo(0);
    expect(monsterRiseY(INTRO_LENGTH)).toBe(0);
  });
});
```

Run: `npx vitest run src/intro/timeline.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `timeline.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { cameraPose } from '../systems/orbit';

export type IntroPhase = 'space' | 'reentry' | 'clouds' | 'descent' | 'impact' | 'settle' | 'emerge' | 'done';

const I = CONFIG.intro;
const S = I.starts;
const ORDER: readonly Exclude<IntroPhase, 'done'>[] = ['space', 'reentry', 'clouds', 'descent', 'impact', 'settle', 'emerge'];
const NEXT: Record<Exclude<IntroPhase, 'done'>, keyof typeof S> = {
  space: 'reentry',
  reentry: 'clouds',
  clouds: 'descent',
  descent: 'impact',
  impact: 'settle',
  settle: 'emerge',
  emerge: 'done',
};

export const INTRO_LENGTH = S.done;
/** The space scene is shown before this time; the game world after (hidden under the re-entry flash). */
export const CUT_TIME = S.clouds;
export const IMPACT_TIME = S.impact;
export const EMERGE_TIME = S.emerge;

export function phaseAt(t: number): { phase: IntroPhase; k: number } {
  if (t >= INTRO_LENGTH) return { phase: 'done', k: 1 };
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const p = ORDER[i]!;
    if (t >= S[p]) return { phase: p, k: (t - S[p]) / (S[NEXT[p]] - S[p]) };
  }
  return { phase: 'space', k: 0 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const V = (a: readonly [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Game-world pod position: accelerating fall from high and behind to the origin, then half-buried. */
export function podPath(t: number, out: THREE.Vector3): THREE.Vector3 {
  if (t > IMPACT_TIME) return out.set(0, I.podRestY, 0);
  const u = clamp01((t - CUT_TIME) / (IMPACT_TIME - CUT_TIME));
  return out.set(0, I.dropHeight * (1 - u * u), -I.dropBack * (1 - u));
}

/** The camera pose gameplay starts with (default orbit around the monster at the origin). */
export function gameplayPose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const c = CONFIG.camera;
  const p = cameraPose({ yaw: c.defaultYaw, pitch: c.defaultPitch, distance: c.defaultDistance }, { x: 0, y: 0, z: 0 });
  return { pos: new THREE.Vector3(...p.pos), look: new THREE.Vector3(...p.look) };
}

const _pod = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Game-world camera after the cut: follows behind the falling pod, swings out to a wide shot by
 * impact, holds through the settle, then eases into the gameplay pose, reaching it at INTRO_LENGTH.
 */
export function cameraPath(t: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const wide = V(I.camWide);
  const lookImpact = V(I.lookImpact);
  if (t < IMPACT_TIME) {
    podPath(t, _pod);
    const d = easeInOut(clamp01((t - S.descent) / (IMPACT_TIME - S.descent)));
    // Offset blends from "follow the pod" to the absolute wide shot (pod is at the origin at impact).
    out.pos.copy(_pod).add(_a.copy(V(I.camFollow)).lerp(_b.copy(wide).sub(_pod), d));
    out.look.copy(_pod).add(_a.copy(V(I.lookFollow)).lerp(_b.copy(lookImpact).sub(_pod), d));
    return out;
  }
  if (t < EMERGE_TIME) {
    out.pos.copy(wide);
    out.look.copy(lookImpact);
    return out;
  }
  const g = gameplayPose();
  const e = easeInOut(clamp01((t - EMERGE_TIME) / (INTRO_LENGTH - EMERGE_TIME)));
  out.pos.copy(wide).lerp(g.pos, e);
  out.look.copy(lookImpact).lerp(g.look, e);
  return out;
}

/** White-orange screen wash: builds through late re-entry, peaks at the cut (hiding it), fades; a shorter flash at impact. */
export function flashAt(t: number): number {
  const F = I.flash;
  if (t < CUT_TIME) {
    const u = clamp01((t - (CUT_TIME - F.rise)) / F.rise);
    return u * u;
  }
  if (t < CUT_TIME + F.hold) return 1;
  if (t < CUT_TIME + F.hold + F.fade) return 1 - (t - CUT_TIME - F.hold) / F.fade;
  if (t >= IMPACT_TIME && t < IMPACT_TIME + F.impactFade) return F.impactPeak * (1 - (t - IMPACT_TIME) / F.impactFade);
  return 0;
}

/** Camera trauma 0..1: grows through re-entry, buffets in the clouds, peaks at impact, rumbles as the cocoon splits. */
export function shakeAt(t: number): number {
  const { phase, k } = phaseAt(t);
  switch (phase) {
    case 'reentry':
      return 0.7 * k * k;
    case 'clouds':
      return 0.25;
    case 'descent':
      return 0.25 + 0.25 * k;
    case 'impact':
      return 1;
    case 'settle':
      return 0.6 * Math.max(0, 1 - k * 3);
    case 'emerge':
      return k < 0.3 ? 0.35 : 0;
    default:
      return 0;
  }
}

/** Monster root y while it climbs out: riseDepth (× monster scale) below the crater floor up to 0, eased out. */
export function monsterRiseY(t: number): number {
  const u = clamp01((t - EMERGE_TIME) / I.riseTime);
  const e = 1 - (1 - u) * (1 - u);
  return u >= 1 ? 0 : -I.riseDepth * CONFIG.monster.scale * (1 - e);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/intro/timeline.test.ts`. Expected: PASS (11 tests). Then run `npm test`; all tests should pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add pure intro timeline: phases, pod drop, camera path, flash, shake, rise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The crater is made by the impact (City)

**Files:**
- Modify: `src/world/chunks.ts` (`generateChunk` crater skip, `DestroyedLog.mark`), `src/world/chunks.test.ts`
- Modify: `src/world/City.ts` (`CRATER_RADIUS`, `blast`, crater decal toggle)
- Modify: `src/GameScene.ts` (temporary instant blast; replaced in Task 4)

**Interfaces:**
- Produces:
  - `DestroyedLog.mark(key: string, index: number, counted = true): void`. Uncounted marks persist rubble but don't add to `count`.
  - `export const CRATER_RADIUS: number` (in `City.ts`) = `clearRadius + blockSize * 0.5` (480 m)
  - `City.blast(p: Vec2, r: number, instant: boolean): void`
    - Flattens every non-rubble building whose footprint touches the radius, with no EXP and no stat.
    - `instant` writes rubble immediately, including buildings already mid-collapse.
    - Shows the crater decal.
  - `City.reset()` also hides the crater decal.

- [ ] **Step 1: Write the failing tests**

In `src/world/chunks.test.ts`, replace the test `'keeps the crater clearing at the origin empty'` with:

```ts
  it('builds on the crater site (the impact flattens it) but plants no parks there', () => {
    let inside = 0;
    for (const r of chunksInRadius(0, 0, W.clearRadius + CHUNK_SIZE)) {
      const c = generateChunk(1337, r.cx, r.cz);
      inside += c.buildings.filter((b) => Math.hypot(b.x, b.z) < W.clearRadius).length;
      // Park blocks start one half-block outside the crater; trees scatter at most ~0.6 blocks from their block centre.
      for (const t of c.trees) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(W.clearRadius - W.blockSize * 0.25);
    }
    expect(inside).toBeGreaterThan(4);
  });
```

Add to the `DestroyedLog` tests (create a `describe('DestroyedLog', …)` block if one doesn't exist):

```ts
  it('remembers uncounted marks (the crater blast) without adding to the count', () => {
    const log = new DestroyedLog();
    log.mark('0,0', 3, false);
    expect(log.has('0,0', 3)).toBe(true);
    expect(log.count).toBe(0);
    log.mark('0,0', 3);
    expect(log.count).toBe(0);
    log.mark('0,0', 4);
    expect(log.count).toBe(1);
  });
```

Run: `npx vitest run src/world/chunks.test.ts`. Expected: FAIL. The crater test finds 0 buildings inside, and `mark` ignores the third argument, so the count is 1.

- [ ] **Step 2: Implement in `chunks.ts`**

In `generateChunk`, replace

```ts
      if (Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5) continue;

      if (rng() < w.parkChance) {
```

with

```ts
      // The crater site is built up like anywhere else (the pod's impact flattens it), but never a park.
      const craterSite = Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5;

      if (!craterSite && rng() < w.parkChance) {
```

In `DestroyedLog`, replace `mark`:

```ts
  /** `counted` false records rubble that doesn't count as a player kill (the crater blast). */
  mark(key: string, index: number, counted = true): void {
    let set = this.byChunk.get(key);
    if (!set) {
      set = new Set();
      this.byChunk.set(key, set);
    }
    if (set.has(index)) return;
    set.add(index);
    if (counted) this.count++;
  }
```

Run: `npx vitest run src/world/chunks.test.ts`. Expected: PASS.

- [ ] **Step 3: Add `blast` and the crater toggle to `City.ts`**

Below the module constants (after `const _c = new THREE.Color();`) add:

```ts
/** Radius of the pod's crater (and its ground decal) around the origin. */
export const CRATER_RADIUS = CONFIG.world.clearRadius + CONFIG.world.blockSize * 0.5;
```

Add a field `private crater: THREE.Mesh;`. In the constructor, replace the crater block with:

```ts
    const craterMat = toonMat(0xffffff, { map: craterTexture() });
    craterMat.alphaTest = 0.5;
    craterMat.polygonOffset = true;
    craterMat.polygonOffsetFactor = -2;
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(CRATER_RADIUS, 32).rotateX(-Math.PI / 2), craterMat);
    this.crater.position.y = 0.5;
    this.crater.receiveShadow = true;
    // Hidden until the pod lands.
    this.crater.visible = false;
    scene.add(this.ground, this.crater);
```

In `reset()`, add `this.crater.visible = false;` as the first line.

Split `damage` into a shared `collapse`, and add `blast`:

```ts
  damage(b: Building, amount: number): void {
    if (b.state !== 'standing') return;
    b.hp -= amount;
    if (b.hp > 0) return;
    this.collapse(b, true);
  }

  /** Start a building's collapse. `award` false (the crater blast) gives no EXP and doesn't count in the stats. */
  private collapse(b: Building, award: boolean): void {
    b.state = 'collapsing';
    b.t = 0;
    const rng = mulberry32(b.slot + 99);
    b.tiltAxis.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    this.collapsing.push(b);
    this.destroyed.mark(b.chunk, b.index, award);
    this.onCollapseStart(new THREE.Vector3(b.spec.x, 0, b.spec.z), Math.max(b.spec.w, b.spec.d));
    if (award) this.onDestroyed(b, Math.max(1, Math.round(b.maxHp * CONFIG.world.buildingExpPerHp)));
  }

  /**
   * The pod's impact: flatten every building touching the radius with no EXP and no stat, and show the
   * crater decal. `instant` (a skipped intro) writes rubble now, finishing any collapse already under way.
   */
  blast(p: Vec2, r: number, instant: boolean): void {
    for (const ref of chunksInRadius(p.x, p.z, r + CONFIG.world.blockSize)) {
      const chunk = this.chunks.get(ref.key);
      if (!chunk) continue;
      for (const b of chunk.buildings) {
        if (b.state === 'rubble' || Math.hypot(b.spec.x - p.x, b.spec.z - p.z) > r + b.radius) continue;
        if (!instant) {
          if (b.state === 'standing') this.collapse(b, false);
          continue;
        }
        if (b.state === 'collapsing') this.collapsing.splice(this.collapsing.indexOf(b), 1);
        this.destroyed.mark(b.chunk, b.index, false);
        this.writeRubble(b);
      }
    }
    this.crater.visible = true;
    this.dirty = true;
  }
```

`destroyed.mark` is idempotent, so a building already marked by its collapse is not counted twice.

- [ ] **Step 4: Keep the game consistent until the intro exists (temporary)**

In `GameScene.ts`:
- Import `CRATER_RADIUS` alongside `City`: `import { City, CRATER_RADIUS } from './world/City';`.
- In the constructor, immediately before `this.update();`, add:
  ```ts
  this.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true);
  ```
- In `restart()`, add the same line right after `this.city.reset();`.

Task 4 replaces both lines with the intro.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test`. Expected: no type errors; all tests pass.

Then, with the dev server running, take a scripted desktop screenshot after 2.5 s:

```js
// $SCRATCH/m3t2.mjs, where SCRATCH is this session's scratchpad directory
import { chromium } from '/Users/eric/Developer/azragon/run-template-3d-react/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const g = window.__game;
  let standing = 0;
  g.city.forEachStandingInRadius({ x: 0, z: 0 }, 480, () => standing++);
  return { standing, buildingsStat: g.city.destroyedCount(), exp: g.progression.exp };
}));
await page.screenshot({ path: `${process.env.SCRATCH}/m3t2.png` });
await browser.close();
```

Run: `SCRATCH=<scratchpad> node $SCRATCH/m3t2.mjs`. Expected:
- `{ standing: 0, buildingsStat: 0, exp: 0 }`
- The screenshot shows the crater decal with rubble mounds around the monster.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "City: crater site is built up and flattened by City.blast (no EXP, not counted)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Cocoon pod and the space scene

**Files:**
- Create: `src/intro/spaceMath.ts`, `src/intro/spaceMath.test.ts`, `src/intro/PodModel.ts`, `src/intro/earthTexture.ts`, `src/intro/SpaceScene.ts`

**Interfaces:**
- Consumes: `CUT_TIME`, `shakeAt` (Task 1); `CONFIG.intro.space`, `CONFIG.intro.starts` (Task 1).
- Produces:
  - `earthDistance(t): number`, `heatAt(t): number`, `heatColor(h, out: THREE.Color): THREE.Color`, `starDirections(n, rng): THREE.Vector3[]`
  - `class PodModel { root: THREE.Group; constructor(length: number); setHeat(c: THREE.Color): void; setGlow(k: number): void; dispose(): void }`. The nose is at +Z, and the length runs along Z.
  - `class SpaceScene { scene: THREE.Scene; camera: THREE.PerspectiveCamera; update(t: number, dt: number): void; setAspect(a: number): void; dispose(): void }`

- [ ] **Step 1: Write the failing tests**

`src/intro/spaceMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';
import { earthDistance, heatAt, heatColor, starDirections } from './spaceMath';
import { mulberry32 } from '../util/rng';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;

describe('earthDistance', () => {
  it('rushes in from far away and reaches the atmosphere at the cut', () => {
    expect(earthDistance(0)).toBeCloseTo(SP.earthStart);
    expect(earthDistance(CUT_TIME)).toBeCloseTo(SP.earthEnd);
    expect(earthDistance(CUT_TIME + 3)).toBeCloseTo(SP.earthEnd);
    const early = earthDistance(0) - earthDistance(1);
    const late = earthDistance(CUT_TIME - 1) - earthDistance(CUT_TIME);
    expect(late).toBeGreaterThan(early);
  });
});

describe('heat', () => {
  it('is cold in space and white-hot by the cut', () => {
    expect(heatAt(S.reentry - 0.1)).toBe(0);
    expect(heatAt((S.reentry + S.clouds) / 2)).toBeCloseTo(0.5);
    expect(heatAt(S.clouds)).toBe(1);
  });
  it('maps heat to black, then fire orange, then white', () => {
    const c = new THREE.Color();
    expect(heatColor(0, c).getHex()).toBe(0x000000);
    expect(heatColor(0.5, c).getHex()).toBe(new THREE.Color(CONFIG.palette.fire).getHex());
    expect(heatColor(1, c).getHex()).toBe(0xffffff);
  });
});

describe('starDirections', () => {
  it('gives n deterministic unit vectors', () => {
    const a = starDirections(50, mulberry32(1));
    expect(a).toHaveLength(50);
    for (const v of a) expect(v.length()).toBeCloseTo(1);
    expect(starDirections(50, mulberry32(1))).toEqual(a);
  });
});
```

Run: `npx vitest run src/intro/spaceMath.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `spaceMath.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CUT_TIME } from './timeline';

const SP = CONFIG.intro.space;
const S = CONFIG.intro.starts;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Pod-to-Earth distance: closes slowly at first, then rushes in, reaching earthEnd at the cut. */
export function earthDistance(t: number): number {
  const u = clamp01(t / CUT_TIME);
  return SP.earthStart + (SP.earthEnd - SP.earthStart) * u * u;
}

/** Re-entry heat 0..1: zero in space, rising through re-entry, white-hot at the cut. */
export function heatAt(t: number): number {
  return clamp01((t - S.reentry) / (S.clouds - S.reentry));
}

const BLACK = new THREE.Color(0x000000);
const ORANGE = new THREE.Color(CONFIG.palette.fire);
const WHITE = new THREE.Color(0xffffff);

/** Emissive colour for a heat level: black, then fire orange (at 0.5), then white-hot. */
export function heatColor(h: number, out: THREE.Color): THREE.Color {
  if (h <= 0.5) return out.copy(BLACK).lerp(ORANGE, h / 0.5);
  return out.copy(ORANGE).lerp(WHITE, (h - 0.5) / 0.5);
}

/** Deterministic unit vectors spread uniformly over the sphere. */
export function starDirections(n: number, rng: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
}
```

Run: `npx vitest run src/intro/spaceMath.test.ts`. Expected: PASS (4 tests).

- [ ] **Step 3: `PodModel.ts`**

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';

/** Dark purple-brown chitin. */
const SHELL = 0x3b2433;
const ACID = new THREE.Color(CONFIG.palette.acid);
const WHITE = new THREE.Color(0xffffff);

/** The alien cocoon: a faceted chitin egg (blunt nose at +Z, length along Z) wrapped in glowing acid-green seams. */
export class PodModel {
  readonly root = new THREE.Group();
  private shellMat: THREE.MeshToonMaterial;
  private seamMat: THREE.MeshBasicMaterial;

  constructor(length: number) {
    // Egg profile, revolved around Y and then turned so the axis is Z; the fat end becomes the nose.
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      profile.push(new THREE.Vector2(Math.sin(a) * 0.36 * (1 - 0.22 * Math.cos(a)), -Math.cos(a) * 0.5));
    }
    this.shellMat = toonMat(SHELL);
    const shell = new THREE.Mesh(faceted(new THREE.LatheGeometry(profile, 7).rotateX(Math.PI / 2)), this.shellMat);
    shell.castShadow = true;

    // Three meridian seams around the long axis.
    const rings = [0, 1, 2].map((i) =>
      new THREE.TorusGeometry(1, 0.04, 3, 18)
        .rotateY(Math.PI / 2)
        .scale(1, 0.39, 0.51)
        .rotateZ((i * Math.PI) / 3),
    );
    this.seamMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.acid });
    const seams = new THREE.Mesh(mergeGeometries(rings), this.seamMat);

    this.root.add(shell, seams);
    this.root.scale.setScalar(length);
  }

  /** Re-entry glow on the shell (black = none). */
  setHeat(c: THREE.Color): void {
    this.shellMat.emissive.copy(c);
  }

  /** Seam brightness 0..1: acid green to white as the cocoon is about to split. */
  setGlow(k: number): void {
    this.seamMat.color.copy(ACID).lerp(WHITE, Math.min(1, Math.max(0, k)));
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.shellMat.dispose();
    this.seamMat.dispose();
  }
}
```

- [ ] **Step 4: `earthTexture.ts`**

The texture is a 128×64 equirectangular pixel-art Earth: ocean in two tones; continents from thresholded blob fields, wrapping in x; ochre deserts near the equator; green elsewhere; polar ice; streaky cloud swirls.

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const W = 128;
const H = 64;
const OCEAN = [0x2f, 0x6f, 0xb5];
const OCEAN_DEEP = [0x24, 0x58, 0x9a];
const ICE = [0xf2, 0xf5, 0xf7];
const CLOUD = [0xff, 0xff, 0xff];
const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export function earthTexture(): THREE.CanvasTexture {
  const P = CONFIG.palette;
  const LAND = rgb(P.ground);
  const LAND_DARK = rgb(P.groundDark);
  const DESERT = rgb(P.ochre);
  const rng = mulberry32(CONFIG.world.seed + 31);
  const blobs = Array.from({ length: 9 }, () => ({ x: rng() * W, y: 10 + rng() * (H - 20), r: 6 + rng() * 12 }));
  const swirls = Array.from({ length: 14 }, () => ({ x: rng() * W, y: 4 + rng() * (H - 8), len: 10 + rng() * 22, tilt: (rng() - 0.5) * 0.6 }));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let land = 0;
      for (const b of blobs) {
        const dx = Math.min(Math.abs(x - b.x), W - Math.abs(x - b.x)); // wraps around the globe
        const dy = y - b.y;
        land += Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
      }
      land += (rng() - 0.5) * 0.12; // ragged pixel coastlines
      let col = land > 0.55 ? (Math.abs(y - H / 2) < 7 && land < 0.9 ? DESERT : land > 1.1 ? LAND_DARK : LAND) : land > 0.35 ? OCEAN : OCEAN_DEEP;
      if (y < 4 || y >= H - 4) col = ICE;
      for (const s of swirls) {
        const dx = Math.min(Math.abs(x - s.x), W - Math.abs(x - s.x));
        const along = dx / s.len;
        const off = y - (s.y + dx * s.tilt + Math.sin(dx * 0.5) * 1.5);
        if (along < 1 && Math.abs(off) < 1.2 * (1 - along)) col = CLOUD;
      }
      const o = (y * W + x) * 4;
      img.data[o] = col[0]!;
      img.data[o + 1] = col[1]!;
      img.data[o + 2] = col[2]!;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

- [ ] **Step 5: `SpaceScene.ts`**

The pod sits at the origin, flying toward +Z, with a slow roll. Earth slides toward it from ahead and below. The camera hangs behind and above the pod. Re-entry adds:
- the shell's heat glow;
- an additive flame sheath trailing the pod back past the camera;
- streaming ember points;
- growing shake.

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { fovForAspect } from '../systems/orbit';
import { mulberry32 } from '../util/rng';
import { earthTexture } from './earthTexture';
import { PodModel } from './PodModel';
import { earthDistance, heatAt, heatColor, starDirections } from './spaceMath';
import { shakeAt } from './timeline';

const SP = CONFIG.intro.space;
const L = SP.podLength;
const EMBERS = 90;
const EMBER_SPEED = L * 14;
const _heat = new THREE.Color();
const _look = new THREE.Vector3();

/** The opening shot before the cut: stars, a pixel-art Earth, and the cocoon burning in. */
export class SpaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 5, 30000);
  private earth = new THREE.Group();
  private pod = new PodModel(L);
  private sheath: THREE.Mesh;
  private sheathMat: THREE.MeshBasicMaterial;
  private embers: THREE.Points;
  private emberPos: Float32Array;
  private rng = mulberry32(CONFIG.world.seed + 41);

  constructor() {
    this.scene.background = new THREE.Color(0x05060f);
    const sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.4);
    sun.position.set(1, 0.7, -0.3);
    this.scene.add(sun, new THREE.HemisphereLight(0x4a5f8a, 0x000000, 0.5));

    // Two star layers: many faint single pixels and a few bright 2-px ones.
    const dirs = starDirections(SP.stars, mulberry32(CONFIG.world.seed + 43));
    const layer = (from: number, to: number, size: number, color: number) => {
      const pos = new Float32Array((to - from) * 3);
      for (let i = from; i < to; i++) dirs[i]!.clone().multiplyScalar(20000).toArray(pos, (i - from) * 3);
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
    };
    const bright = Math.floor(SP.stars * 0.1);
    this.scene.add(layer(0, bright, 2, 0xffffff), layer(bright, SP.stars, 1, 0xaab4d6));

    const R = SP.earthRadius;
    const globe = new THREE.Mesh(faceted(new THREE.SphereGeometry(R, 40, 24)), toonMat(0xffffff, { map: earthTexture() }));
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.06, 40, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.4, side: THREE.BackSide, depthWrite: false }),
    );
    globe.rotation.z = 0.35;
    this.earth.add(globe, rim);
    this.scene.add(this.earth, this.pod.root);

    // Open cone trailing back from the nose (+Z) past the camera (-Z).
    const h = L * 3;
    this.sheathMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.fire, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.sheath = new THREE.Mesh(new THREE.ConeGeometry(L * 0.5, h, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, L * 0.45 - h / 2), this.sheathMat);
    this.scene.add(this.sheath);

    this.emberPos = new Float32Array(EMBERS * 3);
    for (let i = 0; i < EMBERS; i++) this.respawnEmber(i, -this.rng() * L * 6);
    const eg = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffd27a, size: 2, sizeAttenuation: false }));
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
  }

  private respawnEmber(i: number, z: number): void {
    const a = this.rng() * Math.PI * 2;
    const r = L * (0.2 + this.rng() * 0.35);
    this.emberPos[i * 3] = Math.cos(a) * r;
    this.emberPos[i * 3 + 1] = Math.sin(a) * r;
    this.emberPos[i * 3 + 2] = z;
  }

  update(t: number, dt: number): void {
    this.earth.position.set(0, -SP.earthDrop, earthDistance(t));
    this.earth.rotation.y = t * 0.04;
    this.pod.root.rotation.z = t * 0.5;

    const h = heatAt(t);
    this.pod.setHeat(heatColor(h, _heat));
    this.sheath.visible = h > 0;
    this.sheathMat.opacity = 0.85 * h;
    this.sheathMat.color.copy(heatColor(0.5 + 0.5 * h, _heat));
    const flicker = 1 + 0.12 * Math.sin(t * 47) + 0.08 * Math.sin(t * 83);
    this.sheath.scale.set(flicker, flicker, 0.6 + 0.6 * h);

    // Embers stream backward, past the camera, and respawn at the nose.
    this.embers.visible = h > 0;
    this.embers.geometry.setDrawRange(0, Math.floor(EMBERS * h));
    for (let i = 0; i < EMBERS; i++) {
      const z = this.emberPos[i * 3 + 2]! - EMBER_SPEED * dt;
      if (z < -L * 6) this.respawnEmber(i, L * 0.4);
      else this.emberPos[i * 3 + 2] = z;
    }
    this.embers.geometry.attributes.position!.needsUpdate = true;

    const s = shakeAt(t);
    const amp = s * s * L * 0.12;
    this.camera.position.set(Math.sin(t * 43) * amp, L * 0.75 + Math.sin(t * 61 + 1) * amp, -L * 4);
    this.camera.lookAt(_look.set(0, -L * 1.4, L * 8));
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect, CONFIG.camera.baseVFovDeg, CONFIG.camera.maxHFovDeg);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.pod.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry || o === this.pod.root) return;
      m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      for (const x of Array.isArray(mat) ? mat : [mat]) {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      }
    });
  }
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test`. Expected: no type errors; all tests pass. The scene is checked visually once it's wired in (Task 4, Step 7).

```bash
git add -A
git commit -m "Add cocoon pod model, pixel Earth texture, and the space scene

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Clouds, the cinematic, and wiring it into the game

**Files:**
- Create: `src/intro/CloudLayer.ts`, `src/intro/CloudLayer.test.ts`, `src/intro/IntroCinematic.ts`
- Modify: `src/systems/tap.ts` (+`tap.test.ts`), `src/systems/Input.ts`, `src/GameEvents.ts`, `src/GameScene.ts`, `src/App.tsx`, `src/style.css`

**Interfaces:**
- Consumes:
  - Task 1: `CUT_TIME`, `IMPACT_TIME`, `EMERGE_TIME`, `INTRO_LENGTH`, `podPath`, `cameraPath`, `flashAt`, `shakeAt`, `monsterRiseY`
  - Task 2: `CRATER_RADIUS`, `City.blast`
  - Task 3: `PodModel`, `SpaceScene`, `heatColor`
- Produces:
  - `cloudSpecs(rng): CloudSpec[]`
  - `class CloudLayer { visible: boolean; update(camera): void; dispose(): void }`
  - `isSkipKey(e): boolean` in `tap.ts`
  - `InputHandlers.skipKey(): boolean`
  - `class IntroCinematic`:
    - `space: SpaceScene`
    - `active: boolean`, `t: number`, `inSpace: boolean`
    - `start(): void`
    - `update(dt): boolean`, which returns true on the frame it finishes
    - `skip(): void`
    - `dispose(): void`
  - `GameState` gains `'intro'`.
  - `GameScene.skipIntro(): void` (public; used by input, scripted checks and M4).

- [ ] **Step 1: Write the failing tests**

`src/intro/CloudLayer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import { cloudSpecs } from './CloudLayer';

const C = CONFIG.intro.clouds;

describe('cloudSpecs', () => {
  it('scatters the configured number of clouds through the band around the drop path', () => {
    const specs = cloudSpecs(mulberry32(5));
    expect(specs).toHaveLength(C.count);
    for (const s of specs) {
      expect(s.y).toBeGreaterThanOrEqual(C.minY);
      expect(s.y).toBeLessThanOrEqual(C.maxY);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(C.spreadX);
      expect(s.z).toBeGreaterThanOrEqual(C.minZ);
      expect(s.z).toBeLessThanOrEqual(C.maxZ);
      expect(s.size).toBeGreaterThanOrEqual(C.minSize);
      expect(s.size).toBeLessThanOrEqual(C.maxSize);
    }
    expect(cloudSpecs(mulberry32(5))).toEqual(specs);
  });
});
```

Add to `src/systems/tap.test.ts` (import `isSkipKey` alongside the existing imports):

```ts
describe('isSkipKey', () => {
  const k = (key: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });
  it('skips on any plain key press', () => {
    expect(isSkipKey(k(' '))).toBe(true);
    expect(isSkipKey(k('a'))).toBe(true);
    expect(isSkipKey(k('Enter'))).toBe(true);
    expect(isSkipKey(k('Escape'))).toBe(true);
  });
  it('ignores browser shortcuts, held-key repeats, and lone modifier keys', () => {
    expect(isSkipKey(k('r', { metaKey: true }))).toBe(false);
    expect(isSkipKey(k('r', { ctrlKey: true }))).toBe(false);
    expect(isSkipKey(k('a', { altKey: true }))).toBe(false);
    expect(isSkipKey(k('a', { repeat: true }))).toBe(false);
    for (const m of ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']) expect(isSkipKey(k(m))).toBe(false);
  });
});
```

Run: `npx vitest run src/intro/CloudLayer.test.ts src/systems/tap.test.ts`. Expected: FAIL (`cloudSpecs` module not found; `isSkipKey` not exported).

- [ ] **Step 2: `isSkipKey` and the Input hook**

In `src/systems/tap.ts`:

```ts
const NOT_SKIP = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']);

/** Any plain key press skips the intro; browser shortcuts (Cmd+R…), repeats, and lone modifiers don't. */
export function isSkipKey(e: { key: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !NOT_SKIP.has(e.key);
}
```

In `src/systems/Input.ts`:
- Import `isSkipKey`.
- Add to `InputHandlers`:
  ```ts
  /** A plain key press; return true when it skipped the intro (then it isn't also an ability key). */
  skipKey(): boolean;
  ```
- Make `onKey`:

```ts
  private onKey = (e: KeyboardEvent) => {
    if (isSkipKey(e) && this.h.skipKey()) {
      e.preventDefault();
      return;
    }
    const id = abilityKey(e);
    if (!id) return;
    if (this.h.key(id)) e.preventDefault();
  };
```

- [ ] **Step 3: `CloudLayer.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

export type CloudSpec = { x: number; y: number; z: number; size: number };

const C = CONFIG.intro.clouds;

/** Deterministic cloud placement in the band the pod falls through. */
export function cloudSpecs(rng: () => number): CloudSpec[] {
  return Array.from({ length: C.count }, () => ({
    x: (rng() * 2 - 1) * C.spreadX,
    y: C.minY + rng() * (C.maxY - C.minY),
    z: C.minZ + rng() * (C.maxZ - C.minZ),
    size: C.minSize + rng() * (C.maxSize - C.minSize),
  }));
}

/** 48×28 puffy pixel cloud: a shaded underside, then white puffs; alpha-tested for hard pixel edges. */
function cloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 28;
  const g = c.getContext('2d')!;
  const puffs: [number, number, number][] = [[14, 17, 9], [24, 12, 11], [34, 16, 9], [20, 19, 8], [30, 20, 7]];
  const draw = (color: string, dy: number) => {
    g.fillStyle = color;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  draw('#c9d3de', 2);
  draw('#ffffff', 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Instanced cloud billboards above the city, turned to face the camera each frame. */
export class CloudLayer {
  private mesh: THREE.InstancedMesh;
  private specs = cloudSpecs(mulberry32(CONFIG.world.seed + 51));

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ map: cloudTexture(), alphaTest: 0.5 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 28 / 48), mat, this.specs.length);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(camera: THREE.Camera): void {
    this.specs.forEach((s, i) => {
      _m.compose(_p.set(s.x, s.y, s.z), camera.quaternion, _s.set(s.size, s.size, 1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
```

Run: `npx vitest run src/intro/CloudLayer.test.ts src/systems/tap.test.ts`. Expected: PASS. (The test imports `CloudLayer.ts`, which only touches `document` inside `cloudTexture()`, so it's safe under node.)

- [ ] **Step 4: `IntroCinematic.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CRATER_RADIUS, type City } from '../world/City';
import type { Monster } from '../monster/Monster';
import type { Particles } from '../systems/Particles';
import type { Shockwave } from '../systems/Shockwave';
import { faceted, toonMat } from '../render/toon';
import { CloudLayer } from './CloudLayer';
import { PodModel } from './PodModel';
import { SpaceScene } from './SpaceScene';
import { heatColor } from './spaceMath';
import { CUT_TIME, EMERGE_TIME, IMPACT_TIME, INTRO_LENGTH, cameraPath, flashAt, monsterRiseY, podPath, shakeAt } from './timeline';

export type IntroHost = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Element the flash overlay is added to (the scene container). */
  overlay: HTMLElement;
  monster: Monster;
  city: City;
  particles: Particles;
  shockwave: Shockwave;
};

const I = CONFIG.intro;
const ORIGIN = new THREE.Vector3();
const FRAGMENTS = 5;
const FRAG_GRAVITY = 600;
type Fragment = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 };
const _pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * The opening cinematic: the space scene until the cut, then the pod's fall, impact, and the
 * monster's emergence in the game world. Drives the game camera itself while active.
 */
export class IntroCinematic {
  readonly space = new SpaceScene();
  active = false;
  t = 0;
  private pod = new PodModel(I.podLength);
  private clouds: CloudLayer;
  private fragments: Fragment[] = [];
  private fragGeo = faceted(new THREE.TetrahedronGeometry(I.podLength * 0.28, 0));
  private fragMat = toonMat(0x3b2433);
  private flashEl: HTMLDivElement;
  private trailT = 0;

  constructor(private host: IntroHost) {
    this.pod.root.visible = false;
    host.scene.add(this.pod.root);
    this.clouds = new CloudLayer(host.scene);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'intro-flash';
    host.overlay.appendChild(this.flashEl);
  }

  /** The space scene is what's on screen (before the cut). */
  get inSpace(): boolean {
    return this.active && this.t < CUT_TIME;
  }

  start(): void {
    this.active = true;
    this.t = 0;
    this.trailT = 0;
    this.clearFragments();
    this.pod.root.visible = false;
    this.pod.setGlow(0);
    this.clouds.visible = false;
    const m = this.host.monster;
    m.position.set(0, monsterRiseY(0), 0);
    m.model.root.visible = false;
    this.flashEl.style.opacity = '0';
    this.space.update(0, 0);
  }

  /** Advance by real seconds. Returns true on the frame the intro finishes. */
  update(dt: number): boolean {
    if (!this.active) return false;
    const prev = this.t;
    const t = (this.t += dt);
    if (t < CUT_TIME) this.space.update(t, dt);
    else this.updateWorld(prev, t, dt);
    this.flashEl.style.opacity = flashAt(t).toFixed(3);
    if (t < INTRO_LENGTH) return false;
    this.finish();
    return true;
  }

  /** Jump to the end state: crater blasted, pod and fragments gone, monster standing at the origin. */
  skip(): void {
    if (!this.active) return;
    this.host.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true);
    this.host.particles.clear();
    this.finish();
  }

  private updateWorld(prev: number, t: number, dt: number): void {
    const h = this.host;
    if (prev < CUT_TIME) this.pod.root.visible = true;
    if (prev < IMPACT_TIME && t >= IMPACT_TIME) this.impact();
    if (prev < EMERGE_TIME && t >= EMERGE_TIME) this.burst();

    const pod = this.pod.root;
    if (t < IMPACT_TIME) {
      // Nose-down (+Z nose turned to -Y), leaning into the fall; white-hot cooling to orange; fire and smoke trail.
      podPath(t, pod.position);
      pod.rotation.set(Math.PI / 2 - 0.25, 0, t * 1.5);
      this.pod.setHeat(heatColor(Math.max(0.5, 1 - (t - CUT_TIME) / 3), _c));
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        h.particles.emit('fire', pod.position, 3, 0.6);
        h.particles.emit('smoke', _p.copy(pod.position).setY(pod.position.y + I.podLength * 0.4), 2, 0.5);
      }
    } else if (t < EMERGE_TIME) {
      // Half-buried and tipped over; cooling, while the seams pulse faster and brighter toward the split.
      podPath(t, pod.position);
      pod.rotation.set(Math.PI / 2 - 0.6, 0.3, 0);
      const k = (t - IMPACT_TIME) / (EMERGE_TIME - IMPACT_TIME);
      this.pod.setHeat(heatColor(0.5 * (1 - k), _c));
      this.pod.setGlow(k * (0.5 + 0.5 * Math.sin(t * (4 + k * 14))));
      if (Math.random() < dt * 8) h.particles.emit('smoke', _p.set(0, 20, 0), 2, 1.5);
    } else {
      h.monster.position.y = monsterRiseY(t);
      this.updateFragments(t, dt);
    }

    this.clouds.visible = t < IMPACT_TIME;
    if (this.clouds.visible) this.clouds.update(h.camera);
    this.updateFog(t);

    cameraPath(t, _pose);
    const s = shakeAt(t);
    const amp = s * s * I.shakeAmp;
    h.camera.position.copy(_pose.pos).add(_p.set(Math.sin(t * 43) * amp, Math.sin(t * 61 + 1) * amp, Math.sin(t * 53 + 2) * amp));
    h.camera.lookAt(_pose.look);
  }

  /** Dense fog inside the cloud band, easing back to the game's fog through the descent. */
  private updateFog(t: number): void {
    const fog = this.host.scene.fog as THREE.Fog;
    const D = I.starts.descent;
    const u = Math.min(1, Math.max(0, (t - D) / (IMPACT_TIME - D)));
    fog.near = I.cloudFog.near + (CONFIG.fog.near - I.cloudFog.near) * u;
    fog.far = I.cloudFog.far + (CONFIG.fog.far - I.cloudFog.far) * u;
  }

  private impact(): void {
    const h = this.host;
    h.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, false);
    h.shockwave.start(ORIGIN, CRATER_RADIUS * 2.5);
    h.particles.ring('dust', ORIGIN, CRATER_RADIUS * 1.2, 48);
    h.particles.explosion(_p.set(0, 40, 0), 4);
    h.particles.emit('debris', _p.set(0, 30, 0), 30, 3);
    h.particles.emit('smoke', _p.set(0, 60, 0), 24, 2.5);
  }

  /** The cocoon splits: shell fragments fly out in a green burst and the monster starts to climb out. */
  private burst(): void {
    const h = this.host;
    this.pod.root.visible = false;
    _p.set(0, I.podLength * 0.3, 0);
    for (let i = 0; i < FRAGMENTS; i++) {
      const a = (i / FRAGMENTS) * Math.PI * 2 + 0.4;
      const mesh = new THREE.Mesh(this.fragGeo, this.fragMat);
      mesh.position.copy(_p);
      mesh.castShadow = true;
      h.scene.add(mesh);
      this.fragments.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * 260, 380 + 120 * (i % 2), Math.sin(a) * 260),
        spin: new THREE.Vector3(3 + i, 2, 4 - i),
      });
    }
    h.particles.emit('acid', _p, 40, 2.5);
    h.particles.ring('dust', ORIGIN, CRATER_RADIUS * 0.6, 24);
    h.monster.model.root.visible = true;
    h.monster.position.y = monsterRiseY(EMERGE_TIME);
  }

  /** Fragments arc out, land, and shrink away over the last 0.6 s so nothing pops at play start. */
  private updateFragments(t: number, dt: number): void {
    const shrink = Math.min(1, Math.max(0, (INTRO_LENGTH - t) / 0.6));
    for (const f of this.fragments) {
      const m = f.mesh;
      if (m.position.y > 0 || f.vel.y > 0) {
        f.vel.y -= FRAG_GRAVITY * dt;
        m.position.addScaledVector(f.vel, dt);
        m.rotation.x += f.spin.x * dt;
        m.rotation.y += f.spin.y * dt;
        m.rotation.z += f.spin.z * dt;
        if (m.position.y <= 0) {
          m.position.y = 0;
          f.vel.set(0, 0, 0);
        }
      }
      m.scale.setScalar(shrink);
    }
  }

  private clearFragments(): void {
    for (const f of this.fragments) f.mesh.removeFromParent();
    this.fragments = [];
  }

  private finish(): void {
    this.active = false;
    this.t = INTRO_LENGTH;
    this.pod.root.visible = false;
    this.clouds.visible = false;
    this.clearFragments();
    this.flashEl.style.opacity = '0';
    const fog = this.host.scene.fog as THREE.Fog;
    fog.near = CONFIG.fog.near;
    fog.far = CONFIG.fog.far;
    const m = this.host.monster;
    m.position.set(0, 0, 0);
    m.model.root.visible = true;
  }

  dispose(): void {
    this.clearFragments();
    this.flashEl.remove();
    this.space.dispose();
    this.pod.dispose();
    this.clouds.dispose();
    this.fragGeo.dispose();
    this.fragMat.dispose();
  }
}
```

- [ ] **Step 5: Wire it into `GameScene` and `GameEvents`**

In `src/GameEvents.ts`:

```ts
export type GameState = 'loading' | 'intro' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';
```

In `src/GameScene.ts`:

1. **Imports and field.** Add `import { IntroCinematic } from './intro/IntroCinematic';` and a field `private intro: IntroCinematic;`. Change the City import back to `import { City } from './world/City';`; `CRATER_RADIUS` is no longer used here.
2. **Constructor.**
   - Directly after `this.ctx = this.buildContext();`, add:
     ```ts
     this.intro = new IntroCinematic({ scene: this.scene, camera: this.camera, overlay: container, monster: this.monster, city: this.city, particles: this.particles, shockwave: this.shockwave });
     ```
   - Delete the temporary `this.city.blast(...)` line from Task 2.
   - Replace the final `this.setState('playing');` with `this.startIntro();`.
3. **Input handlers.** Add to the `new Input(...)` handlers object:
   ```ts
   skipKey: () => {
     if (this.state !== 'intro') return false;
     this.skipIntro();
     return true;
   },
   ```
4. **`restart()`.** Delete the temporary `this.city.blast(...)` line, and replace `this.setState('playing');` with `this.startIntro();`.
5. **New methods.** Add them after `restart()`:

```ts
  private startIntro(): void {
    this.intro.start();
    this.setState('intro');
  }

  /** Skip the rest of the intro (tap, click, or key). Public for scripted checks and the M4 menus. */
  skipIntro(): void {
    if (this.state !== 'intro') return;
    this.intro.skip();
    this.endIntro();
  }

  /** The intro drove the camera; hand it back exactly on the default gameplay pose (no leftover trauma or drag). */
  private endIntro(): void {
    this.rig.reset();
    this.setState('playing');
  }
```

6. **`update`.**
   - As the first statement inside `if (!frozen) {`, add:
     ```ts
     if (this.state === 'intro' && this.intro.update(realDt)) this.endIntro();
     ```
   - Replace `this.rig.update(frozen ? 0 : dt, this.monster.position);` with:
     ```ts
     // While the intro runs (even paused) it owns the camera.
     if (!this.intro.active) this.rig.update(frozen ? 0 : dt, this.monster.position);
     ```
   - Replace `this.pixel.render(this.scene, this.camera);` with:
     ```ts
     if (this.intro.inSpace) this.pixel.render(this.intro.space.scene, this.intro.space.camera);
     else this.pixel.render(this.scene, this.camera);
     ```
7. **`onTap`.** Make the first statement:

```ts
    if (this.state === 'intro') {
      this.skipIntro();
      return;
    }
```

8. **`onResize`.** After `this.rig.setAspect(w / h);`, add `this.intro.space.setAspect(w / h);`.
9. **`dispose()`.** Add `this.intro.dispose();` before `this.pixel.dispose();`.

- [ ] **Step 6: UI (skip hint, flash overlay, HUD hidden)**

In `src/App.tsx`:
- Below the imports, add:
  ```ts
  /** Touch devices tap; desktops click or press a key. */
  const SKIP_HINT = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Tap to skip' : 'Click or press any key to skip';
  ```
- Change the HUD line to `{state !== 'loading' && state !== 'intro' && <Hud hud={hud} expPop={expPop} />}`.
- Add inside `.hud`: `{state === 'intro' && <div className="skip-hint">{SKIP_HINT}</div>}`.
- The comment `// The constructor already entered 'playing' before these subscriptions existed.` becomes `// The constructor already entered 'intro' before these subscriptions existed.`

In `src/style.css`:
- Add `position: relative;` to `.scene-container`, so the flash overlay covers exactly the canvas.
- Append:

```css
/* Intro: full-screen re-entry/impact wash (opacity driven per frame by IntroCinematic) and the skip hint. */
.intro-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: #fff1d6;
  opacity: 0;
}
.skip-hint {
  position: absolute;
  left: 50%;
  bottom: calc(28px + var(--safe-bottom, 0px));
  transform: translateX(-50%);
  pointer-events: none;
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  animation: skip-hint-blink 1.6s steps(2) infinite;
}
@keyframes skip-hint-blink { 50% { opacity: 0.45; } }
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm test`. Expected: no type errors; all tests pass.

Then, with the dev server running, take one scripted look at desktop size: a screenshot at t ≈ 1.75, 4.5, 7, 9.5, 12 and 14, then confirm `playing` after t = 15. This is the script from Task 5 Step 1, restricted to desktop; it's fine to write it now and reuse it.

Look at the screenshots. The intro is still "working" if all of these hold:
- the space shots show stars, the Earth in the lower half and the pod;
- re-entry glows orange to white;
- the clouds shot shows cloud billboards around a burning pod;
- the descent shows the city below;
- the settle shot shows the half-buried cocoon in the crater;
- the emerge shot shows the monster rising.

Fix any of those that fail before committing. Framing tweaks to `CONFIG.intro` values are allowed. Ledger each one as a ruling.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Intro cinematic: space scene, re-entry flash cut, clouds, impact, emergence; skippable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Scripted intro checks (phases, skip, restart, resize, crater, draw calls)

**Files:**
- Create (scratchpad, not committed): `$SCRATCH/m3check.mjs`, where `SCRATCH` is this session's scratchpad directory.
- Modify only if a check fails: whichever file the failure points to, with a ledgered ruling or fix.

**Interfaces:**
- Consumes the dev handle `window.__game` and these runtime fields (TypeScript `private` isn't enforced at runtime):
  - `getState()`, `skipIntro()`
  - `intro.{t, active, inSpace, space.camera, clouds.visible, fragments, pod.root.visible}`
  - `city.{forEachStandingInRadius, destroyedCount}`
  - `progression.exp`, `monster.{position, model.root.visible, hp}`, `camera.position`
  - `pixel.renderer.info.render.calls`, `abilities.aiming`, `order`

- [ ] **Step 1: Write the check script**

```js
// $SCRATCH/m3check.mjs. Run with the dev server up: SCRATCH=<scratchpad> node $SCRATCH/m3check.mjs
import { chromium } from '/Users/eric/Developer/azragon/run-template-3d-react/node_modules/playwright/index.mjs';
const OUT = process.env.SCRATCH;
const URL = 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function open(opts) {
  const page = await browser.newPage(opts);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.getState() === 'intro', null, { timeout: 15000 });
  return page;
}
const snap = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    let standing = 0;
    g.city.forEachStandingInRadius({ x: 0, z: 0 }, 480, () => standing++);
    return {
      state: g.getState(),
      t: +g.intro.t.toFixed(2),
      active: g.intro.active,
      standing,
      buildings: g.city.destroyedCount(),
      exp: g.progression.exp,
      monster: g.monster.position.toArray().map(Math.round),
      monsterVisible: g.monster.model.root.visible,
      pod: g.intro.pod.root.visible,
      clouds: g.intro.clouds.visible,
      frags: g.intro.fragments.length,
      flash: getComputedStyle(document.querySelector('.intro-flash')).opacity,
      cam: g.camera.position.toArray().map(Math.round),
      calls: g.pixel.renderer.info.render.calls,
      hud: !!document.querySelector('.hud-top'),
      hint: !!document.querySelector('.skip-hint'),
      aiming: g.abilities.aiming,
      order: g.order?.kind ?? null,
    };
  });
const waitT = (page, t) => page.waitForFunction((t) => window.__game.intro.t >= t || !window.__game.intro.active, t, { timeout: 30000, polling: 16 });

// 1. Phase midpoints at phone and desktop; the city stands before impact and is rubble after.
const mids = { space: 1.75, reentry: 4.5, clouds: 7, descent: 9.5, impact: 10.75, settle: 12, emerge: 14 };
for (const [name, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  const page = await open(opts);
  for (const [phase, t] of Object.entries(mids)) {
    await waitT(page, t);
    console.log(name, phase, JSON.stringify(await snap(page)));
    await page.screenshot({ path: `${OUT}/m3-${name}-${phase}.png` });
  }
  await page.waitForFunction(() => window.__game.getState() === 'playing', null, { timeout: 30000 });
  await page.waitForTimeout(100);
  console.log(name, 'END', JSON.stringify(await snap(page)));
  await page.screenshot({ path: `${OUT}/m3-${name}-end.png` });
  await page.close();
}

// 2. Skip at many moments (clicks, Space, a phone tap), including inside the cut flash and mid-impact.
const skipAt = [0.5, 3.8, 5.45, 5.6, 7.2, 10.45, 10.6, 12.5, 14.2];
for (const [i, t] of skipAt.entries()) {
  const phone = i === skipAt.length - 1;
  const page = await open(phone ? PHONE : DESKTOP);
  await waitT(page, t);
  if (phone) await page.touchscreen.tap(195, 420);
  else if (i % 2) await page.keyboard.press('Space');
  else await page.mouse.click(720, 450);
  await page.waitForTimeout(300);
  console.log('SKIP@' + t, phone ? 'tap' : i % 2 ? 'space' : 'click', JSON.stringify(await snap(page)));
  if (t === 5.45) await page.screenshot({ path: `${OUT}/m3-skip-in-flash.png` });
  await page.close();
}

// 3. Cmd+R-style shortcuts don't skip.
{
  const page = await open(DESKTOP);
  await page.keyboard.press('Shift');
  await page.keyboard.down('Meta'); await page.keyboard.press('KeyK'); await page.keyboard.up('Meta');
  await page.waitForTimeout(200);
  console.log('MODIFIERS', JSON.stringify(await snap(page)));
  await page.close();
}

// 4. Resize during the space scene: the space camera's aspect follows.
{
  const page = await open(DESKTOP);
  await waitT(page, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  console.log('RESIZE aspect', await page.evaluate(() => window.__game.intro.space.camera.aspect.toFixed(3)), 'expected', (390 / 844).toFixed(3));
  await page.screenshot({ path: `${OUT}/m3-resized-space.png` });
  await page.close();
}

// 5. Rubble persists across a chunk unload/reload; Play Again replays the intro on a rebuilt city.
{
  const page = await open(DESKTOP);
  await page.evaluate(() => window.__game.skipIntro());
  await page.evaluate(() => window.__game.monster.position.set(9000, 0, 0));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.monster.position.set(0, 0, 0));
  await page.waitForTimeout(2500);
  console.log('RELOADED', JSON.stringify(await snap(page)));
  await page.evaluate(() => { window.__game.monster.hp = 0; });
  await page.waitForFunction(() => window.__game.getState() === 'gameover', null, { timeout: 15000 });
  await page.getByRole('button', { name: /play again/i }).click();
  await page.waitForTimeout(300);
  console.log('RESTART', JSON.stringify(await snap(page)));
  await waitT(page, 11.2);
  console.log('RESTART after impact', JSON.stringify(await snap(page)));
  await page.close();
}

console.log('ERRORS', errors.length ? errors : 'none');
await browser.close();
```

- [ ] **Step 2: Run it and compare against the expected results**

Run: `SCRATCH=<scratchpad> node $SCRATCH/m3check.mjs > $SCRATCH/m3check.log 2>&1; cat $SCRATCH/m3check.log`.

Expected:

**1. Phase midpoints (both sizes):**
- `space` and `reentry`:
  - `state: 'intro'`
  - `standing > 0`, `monsterVisible: false`
- `clouds`: `clouds: true`, `pod: true`, `flash: '0'` (the cut wash has faded by t = 6.35)
- `descent`: `standing > 0`
- `impact`: `standing: 0`, `buildings: 0`, `exp: 0`
- `settle`: `pod: true`, `clouds: false`
- `emerge`: `monsterVisible: true`, monster y < 0 or 0, `frags: 5`
- `END`:
  - `state: 'playing'`, `active: false`
  - `monster: [0,0,0]`
  - `pod: false`, `clouds: false`, `frags: 0`, `flash: '0'`
  - `hud: true`, `hint: false`, `buildings: 0`, `exp: 0`
  - `cam` within ±2 of `[0, 803, -677]`. That's the gameplay pose for `MONSTER_SCALE` 0.6; recompute it from `cameraPose` if the camera config differs.
- Every `calls` is below 150.

**2. Every `SKIP@` line:**
- `state: 'playing'`, `active: false`
- `standing: 0`, `buildings: 0`, `exp: 0`
- `monster: [0,0,0]`, `monsterVisible: true`
- `pod: false`, `clouds: false`, `frags: 0`, `flash: '0'`
- `hint: false`, `aiming: null`, `order: null`

**3. `MODIFIERS`:** `state: 'intro'`, so the intro was not skipped.

**4. `RESIZE`:** the aspect equals the expected value, and the screenshot's planet is round.

**5. Rubble and restart:**
- `RELOADED`: `standing: 0`
- `RESTART`: `state: 'intro'`, `t` below 0.5, `standing > 0`
- `RESTART after impact`: `standing: 0`

**Errors:** `ERRORS none`.

Look at every screenshot. They should match the spec's Visuals section. Specifically, `m3-skip-in-flash.png` shows the gameplay view with no white wash.

- [ ] **Step 3: Fix failures**

Any mismatch is a bug in the task that owns the code. Use superpowers:systematic-debugging. Write a failing unit test where the logic is pure (timeline, `cloudSpecs`, `isSkipKey`, `DestroyedLog`), fix it, and re-run Step 2 until every line matches.

- [ ] **Step 4: Full suite and commit any fixes**

Run: `npx tsc --noEmit && npm test`. Expected: all pass. If Step 3 changed files:

```bash
git add -A
git commit -m "Intro: fixes from scripted phase/skip/restart checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
