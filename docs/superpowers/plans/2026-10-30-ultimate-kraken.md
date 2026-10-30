# Ink Storm (the Kraken's Ultimate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Kraken's ultimate, Ink Storm: a dark storm and rain, eight tentacles tearing up debris, a leap, ink flooding the ground below (killing every enemy and building under it), the debris hurled at the aircraft around it, and a landing back where it jumped.

**Architecture:** First the Q slot is generalised from Devour-only to any kind's ultimate behind one `Ultimate` interface, with the shared rules applied once in `GameScene`. Ink Storm is then built like Devour: a pure timeline and target picker (`inkStorm.ts`), a sequence class (`InkStormSequence.ts`) driving the game through a host interface, a pooled `Rain` system, and a small "hold" mode on `Monster` so the sequence can lift the Kraken (the normal leap runs on slowed world time and is too long here).

**Tech Stack:** TypeScript, Three.js (`InstancedMesh`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-ultimate-kraken-design.md`

## Global Constraints

- No React for game logic; every number in `CONFIG.kraken.ultimate`, colours in `CONFIG.kraken.colors`.
- The sequence's timeline runs on **real** seconds and freezes while paused.
- Ink radius 900 m (centred where the Kraken jumped); eight chunks; boss damage `CONFIG.wendigo.ultimate.bossDamage` × the damage multiplier.
- Beats (real s): storm 0–0.8 (rain from 0.3); grab 0.5–1.4; leap 1.4–2.2 (peak ≈ 600 m); ink 2.2–3.0; throw 2.4–3.0; fall 3.0–3.8; outro 3.8–4.8; end 4.8.
- Ink kills are quiet (no explosion); chunk kills on aircraft explode normally.
- No lightning.
- Pooled; no per-frame allocation; about 10 extra draw calls at most.
- Devour's behaviour is unchanged.

## Review Focus

1. **Devour still works exactly as before** after the slot is generalised (start, slow motion, hands, end, cancel). Test: Task 1, the existing Devour tests and `the Wendigo's ultimate is Devour`.
2. **Restart, exit or death mid-Ink-Storm** restores the sky, camera, time scale, rain and the Kraken on the ground. Test: Task 5, `cancel restores everything and lands the Kraken`.
3. **Aircraft beyond eight** are spared, and none gets two chunks. Test: Task 2, `nearest eight aircraft, one chunk each`.
4. **A chunk's aircraft dies before the chunk arrives** (another weapon got it): the chunk flies on to where the aircraft was and nothing breaks. Test: Task 5, `a chunk whose aircraft is already dead lands harmlessly`.
5. **The Kraken's tentacle slams don't fire their normal damage during Ink Storm** (the grab is visual only). Test: Task 6 wiring check in the browser, and a pure guard `armSlamCounts(ultimateRunning)` tested in Task 6.

---

### Task 1: One Q slot for every monster's ultimate

**Files:**
- Create: `src/systems/ultimate.ts`
- Modify: `src/monsters/types.ts` (`ultimate?: { id: UltimateId; label: string }`), `src/monsters/wendigo/kind.ts` (`{ id: 'devour', label: 'Devour' }`), `src/monsters/kraken/kind.ts` (`{ id: 'inkStorm', label: 'Ink Storm' }`), `src/monsters/wendigo/DevourSequence.ts` (`implements Ultimate`), `src/GameScene.ts`
- Test: `src/monsters/kraken/kind.test.ts`, `src/monsters/wendigo/kind.test.ts`

**Interfaces:**
- Produces: `export type UltimateId = 'devour' | 'inkStorm';` `export interface Ultimate { readonly active: boolean; timeScale(): number; start(center: THREE.Vector3, damageMult: number): void; update(realDt: number): boolean; cancel(): void; dispose(): void }`. In `GameScene`: `private ultimates: Partial<Record<UltimateId, Ultimate>>` and `private ultimate(): Ultimate | null` (the current kind's). Every place that used `this.devour` for the shared rules (time scale, update/end, cancel, dispose) goes through `ultimate()`; `startUltimate()` switches on the id (Devour also starts the howl, as now). Until Task 6 the Kraken's entry is absent, so its Q does nothing.
- [ ] **Step 1: Failing tests:** `the Wendigo's ultimate is Devour` (`WENDIGO.ultimate` equals `{ id: 'devour', label: 'Devour' }`); `the Kraken's ultimate is Ink Storm` (`KRAKEN.ultimate` equals `{ id: 'inkStorm', label: 'Ink Storm' }`).
- [ ] **Step 2: Run** `npx vitest run src/monsters`. Expected: FAIL.
- [ ] **Step 3: Implement** the type, the interface and the `GameScene` refactor. Devour's behaviour must not change.
- [ ] **Step 4: Run** `npx tsc --noEmit -p . && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `One Q slot for every monster's ultimate, Devour on it unchanged`.

### Task 2: Ink Storm's timeline, targets and config

**Files:**
- Modify: `src/config.ts` (`CONFIG.kraken.ultimate`, storm colours in `CONFIG.kraken.colors`)
- Create: `src/monsters/kraken/inkStorm.ts`, `src/monsters/kraken/inkStorm.test.ts`

**Interfaces:**
- Produces:
  - `CONFIG.kraken.ultimate = { radius: 900, timeScale: 0.25, chunks: 8, peak: 600, cameraDistanceMult: 2.2, chunkFlight: 0.5, inkJets: 14, t: { easeIn: 0.2, sky: 0.8, rainFrom: 0.3, grabFrom: 0.5, grabTo: 1.4, leapFrom: 1.4, peakAt: 2.2, inkFrom: 2.2, inkTo: 3.0, throwFrom: 2.4, throwTo: 3.0, fallTo: 3.8, outroFrom: 3.8, end: 4.8 }, hemiIntensity: 0.45, sunIntensity: 0.6 }`, plus `CONFIG.kraken.colors.storm*` (zenith, horizon, fog, hemi sky, hemi ground, sun).
  - `STORM_ATMOSPHERE: AtmosphereTint` (no sun direction, so the city's stays).
  - `inkPhase(t: number): { time: number; sky: number; camera: number; rain: number; height: number; ink: number; done: boolean }`:
    - `time` and `camera` behave as Devour's (ease in over `easeIn`; back over the outro).
    - `sky` and `rain` fade in over their beats and out over the outro.
    - `height` is 0 until `leapFrom`, rises to `peak` at `peakAt` (ease-out), holds until `inkTo`, and falls to 0 at `fallTo` (ease-in).
    - `ink` is the cloud's coverage 0..1: rising over `inkFrom`..`inkTo` and thinning over the outro.
  - `inkVictims(center: Vec2, radius: number, targets: readonly Target[]): { ground: Target[]; bosses: Target[] }`: live, not airborne, within `radius` + own radius; ground sorted nearest first.
  - `chunkTargets(center: Vec2, radius: number, targets: readonly Target[], n: number): Target[]`: live airborne targets within `radius` (by ground distance, any altitude), nearest first, at most `n`; bosses excluded (they take boss damage from a chunk instead; see Task 5).
- [ ] **Step 1: Failing tests:**
  - `phases`: time 1 at 0 and at the end; `height` 0 before the leap, `peak` from `peakAt` to `inkTo`, 0 at `fallTo`; `ink` 0 before `inkFrom` and 1 at `inkTo`; `done` at `end`.
  - `ink takes the ground inside, nearest first, never aircraft`.
  - `nearest eight aircraft, one chunk each` (12 aircraft gives 8, nearest first, no repeats; ground targets ignored).
- [ ] **Step 2: Run** `npx vitest run src/monsters/kraken/inkStorm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `Ink Storm timeline, ink victims and chunk targets (pure), its config and storm colours`.

### Task 3: Rain

**Files:**
- Create: `src/systems/Rain.ts`, `src/systems/rainMath.ts`, `src/systems/rainMath.test.ts`

**Interfaces:**
- Produces:
  - `rainDrop(i: number, t: number, box: { size: number; height: number }, speed: number, out: THREE.Vector3): THREE.Vector3`: drop `i`'s offset in a box around the camera at time `t`. Its x/z come from a fixed hash of `i`; its y falls at `speed` and wraps within `height`; it stays inside the box.
  - `class Rain { constructor(scene: THREE.Scene, color: number); update(dt: number, camera: THREE.Camera, intensity: number): void; clear(): void; dispose(): void }`:
    - A pool of thin, slightly slanted streak quads in one `InstancedMesh` (about 1500).
    - The streaks surround the camera's target area, and the number drawn scales with `intensity` (0 hides it).
    - Colour is pale grey-blue (`CONFIG.kraken.colors.rain`).
- [ ] **Step 1: Failing test** `rainMath`: every drop stays within the box at any `t`; a drop's y decreases between two times (wrapping aside); the same `i` and `t` give the same point.
- [ ] **Step 2: Run** `npx vitest run src/systems/rainMath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `rainDrop` and `Rain`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `Rain: a pooled field of falling streaks around the camera`.

### Task 4: Holding the monster in the air

**Files:**
- Modify: `src/monster/Monster.ts`, `src/monster/Monster.test.ts`

**Interfaces:**
- Produces: `Monster.hold(height: number | null): void`:
  - **Held** (a number): the monster is `busy` (the brain does nothing), its `position.y` is set to `height` every tick, and `airborne` is true while `height > 0`. Its feet don't land, so there's no foot crush and no foot pools.
  - **Released** (`null`): it lands back to normal control.
- [ ] **Step 1: Failing test** `a held monster stays where it is put, busy and airborne off the ground, then lands`.
- [ ] **Step 2: Run** `npx vitest run src/monster/Monster.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `Monster.hold: an ultimate can lift the monster and set it down`.

### Task 5: The Ink Storm sequence

**Files:**
- Create: `src/monsters/kraken/InkStormSequence.ts`, `src/monsters/kraken/InkStormSequence.test.ts`
- Modify: `src/monsters/kraken/InkFx.ts` (`burst(at, scale = 1)`), `src/monsters/kraken/InkFx.test.ts`

**Interfaces:**
- Consumes: `inkPhase`, `inkVictims`, `chunkTargets`, `STORM_ATMOSPHERE` (Task 2); `Rain` (Task 3); `Ultimate` (Task 1).
- Produces:
  - **The host:** `type InkStormHost = { enemies(): readonly Target[]; take(t: Target): void; smash(t: Target): void; hurtBoss(t: Target, dmg: number): void; buildingsWithin(c: Vec2, r: number): Target[]; sky(k: number): void; camera(k: number): void; shake(a: number): void; height(y: number | null): void; tips(): readonly THREE.Vector3[] | null; grab(points: THREE.Vector3[]): void; inkJet(from: THREE.Vector3, to: THREE.Vector3): void; inkBurst(at: THREE.Vector3, scale: number): void; siphon(out: THREE.Vector3): THREE.Vector3; dust(at: THREE.Vector3): void }`.
    - `take`: a quiet kill under the ink.
    - `smash`: a chunk's kill, which explodes normally.
    - `height`: lifts the Kraken through `Monster.hold`.
    - `tips`: the tentacle tips, world space.
    - `grab`: plunges the arms to these ground points.
  - **The class:** `class InkStorm implements Ultimate { constructor(scene: THREE.Scene, camera: THREE.Camera, host: InkStormHost, rand?: () => number) }`. It owns the `Rain` and a pooled `InstancedMesh` of chunks (the hurl chunk's look).
  - **Each beat:**
    - **Grab** (at `grabFrom`): it calls `grab` with eight ground points in a ring around the Kraken, and from the middle of the grab a chunk sits on each tip.
    - **Leap and fall:** `height(phase.height)` every frame.
    - **Ink:** from `inkFrom`, `inkJets` jets go from the siphon to points across the circle, bursting as they land (`inkBurst` scaled to cover it). Over the ink beat, it takes the ground victims and destroys the buildings in the radius, nearest first.
    - **Throw:** over the throw beat, chunks leave the tips one by one. Each flies (`chunkFlight` s, an arc) to its aircraft from `chunkTargets` and `smash`es it on arrival; a boss gets `hurtBoss`. Chunks with no aircraft fly into the ink at random points inside it. A chunk whose aircraft is already dead lands where it was aiming.
    - **End:** `height(null)` with a landing `dust` and `shake`, and `sky(0)`/`camera(0)`.
  - `InkFx.burst(at, scale)` scales the cloud's spread and puff size by `scale`.
- [ ] **Step 1: Failing tests:**
  - `InkStormSequence.test.ts`, with a stub host that records calls:
    - `grabs, leaps to the peak, falls and lands`: `grab` is called once with 8 points; `height` reaches `peak`; the last call is `height(null)` after `fallTo`.
    - `takes the ground under the ink nearest first during the ink beat, and the buildings`.
    - `smashes each of the nearest eight aircraft with its own chunk`.
    - `a chunk whose aircraft is already dead lands harmlessly`.
    - `bosses take bossDamage`.
    - `pauses freeze it`.
    - `cancel restores everything and lands the Kraken`.
    - `ends with time scale 1`.
  - `InkFx.test.ts`: `a bigger burst spreads wider`.
- [ ] **Step 2: Run** `npx vitest run src/monsters/kraken`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `Ink Storm sequence: grab, leap, ink, throw, land; the rain and the chunks`.

### Task 6: Wiring Ink Storm in, and the browser check

**Files:**
- Modify: `src/GameScene.ts`, `src/systems/abilities.ts`, `src/systems/abilities.test.ts`

**Interfaces:**
- Consumes: `InkStorm`, `InkStormHost` (Task 5); `Monster.hold` (Task 4); the ultimate registry (Task 1).
- Produces:
  - `armSlamCounts(ultimateRunning: boolean): boolean` in `abilities.ts`. While an ultimate runs, a tentacle slam does no damage (the grab is visual). `onArmImpact` uses it.
  - The `inkStorm` entry in `GameScene`'s ultimates, with its host:
    - `take`: a quiet kill.
    - `smash`: `applyDamage(1e9)`.
    - `sky`: `city.blendAtmosphere(STORM_ATMOSPHERE, k)`.
    - `camera`: the Devour pull.
    - `height`: `monster.hold`.
    - `tips`: `monster.body.arms?.tips`.
    - `grab`: `arms.start(i, 'slam', point, null, 0, CONFIG.kraken.stats.meleeTiming)` for each arm.
    - `inkJet` / `inkBurst`: `this.inkFx`.
    - `siphon`: `monster.siphonOrigin`.
    - `dust`: dust and debris particles.
- [ ] **Step 1: Failing test** `armSlamCounts`: true when no ultimate runs, false while one does.
- [ ] **Step 2: Run** `npx vitest run src/systems/abilities.test.ts`. Expected: FAIL.
- [ ] **Step 3: Wire it.**
- [ ] **Step 4: Run** `npx tsc --noEmit -p . && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Browser check.** Run `npm run dev`, play the Kraken with tanks and helicopters nearby, and press Q. In order, check:
  - the sky darkens and the rain falls
  - the arms plunge and each comes up holding a chunk
  - the Kraken leaps high and ink floods the circle, with the ground units under it and the buildings gone
  - each chunk flies to a helicopter, which explodes
  - it lands and everything clears

  Also check:
  - a restart mid-way restores everything
  - draw calls stay within budget
  - Devour still plays as before
- [ ] **Step 6: Commit** `Ink Storm wired in: the Kraken's Q`.
