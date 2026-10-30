# Ultimate Slot (Q) and the Wendigo's Devour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Q-key ultimate ability slot shared by every monster, and the Wendigo's ultimate, Devour: slow motion, the camera pulling back, a blood-red sky, lightning, a black circle and demonic figures that drag every enemy inside it into the ground and bring the buildings down.

**Architecture:** The slot is a fifth `ActiveId` (`'ultimate'`) in `Abilities`, with its own button and key, owned when the monster kind declares an `ultimate`. Devour is a game-side orchestrator class (`src/monsters/wendigo/Devour.ts`) driven by a pure timeline (`devour.ts`). It owns the circle, the lightning (`src/systems/Lightning.ts`) and the figures (`DemonFigures.ts`), and acts on the game through a small host interface that `GameScene` implements. Sky, camera and time scale are blended by factors the timeline returns.

**Tech Stack:** TypeScript, Three.js (`InstancedMesh`, code-built faceted geometry), React (button only), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-ultimate-wendigo-design.md`

## Global Constraints

- No `useEffect`, no React state or hooks for game logic; React renders only the button.
- Every number in `CONFIG`: `CONFIG.ultimate` (slot), `CONFIG.wendigo.ultimate` (Devour); colours in `CONFIG.wendigo.colors`.
- `CONFIG.ultimate = { cooldown: 100, startReady: true }`.
- The ultimate's cooldown ticks on plain game time: Haste When Hurt and Attack Speed never shorten it.
- Devour's timeline runs on **real** seconds; it freezes while paused.
- Devour radius 900 m, fixed at the press point; `timeScale` 0.25; `maxFigures` 24; `bossDamage` 2000 × damage multiplier; `cameraDistance` 2.2 × `CONFIG.camera.defaultDistance`.
- Beat times (s, real): ease in 0–0.2; sky 0–0.6; lightning 0.3–3.8 (a bolt every 0.15–0.35 s within 1.3 × radius); circle 0.5–1.3; emerge 1.2–1.9; grasp 1.9; drag 2.4–3.4; outro 3.4–4.4; end 4.4.
- At most ~10 extra draw calls at peak; no per-frame allocation (pool everything).
- Models are built in code (`faceted`, `painted`, vertex colours, `toonMat(0xffffff, { vertexColors: true })`) as `InstancedMesh`es.
- Assume Y-up, +Z forward, +X is a model's left.

## Review Focus

1. **Pause mid-Devour** must freeze it and resume it where it was (the timeline is on real time, so it must not advance while `frozen`). Test: Task 7, Step 1, `pauses freeze the timeline`.
2. **Restart or exit to title mid-Devour** must restore the city's own sky and lights exactly, the camera, and the time scale. Test: Task 2, `blend 0 restores the style exactly`, and Task 7, `cancel restores everything`.
3. **Q pressed again while Devour runs,** or Q mashed during the level-up moment, must do nothing and spend no cooldown. Test: Task 1, `ultimate guards`.
4. **Enemies killed by Devour level the monster up mid-sequence:** the level-up moment must wait until the sequence ends, then start. Test: Task 7, `banks the level-up until the end`.
5. **More enemies in the circle than `maxFigures`:** all are still taken, the nearest 24 with figures. Test: Task 3, `caps figures but takes everyone`.

---

### Task 1: The ultimate slot (Q key, button, cooldown)

**Files:**
- Modify: `src/config.ts` (add `ultimate: { cooldown: 100, startReady: true }` beside `abilities`)
- Modify: `src/systems/abilities.ts`, `src/systems/abilities.test.ts`
- Modify: `src/systems/tap.ts`, `src/systems/tap.test.ts`, `src/systems/Input.ts`
- Modify: `src/monsters/types.ts` (`MonsterKind.ultimate?: { label: string }`), `src/monsters/wendigo/kind.ts` (`ultimate: { label: 'Devour' }`)
- Modify: `src/ui/AbilityButtons.tsx`, `src/style.css`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Produces: `ActiveId` includes `'ultimate'`. `Abilities.tick(cdDt: number, dt: number = cdDt)`: every cooldown but the ultimate's runs on `cdDt`, the ultimate's on `dt`. `Abilities.reset()` sets the ultimate's cooldown to 0 if `CONFIG.ultimate.startReady`, else to `CONFIG.ultimate.cooldown`, and its rank to 0. `AbilityView` gains `label?: string`. `abilityKey` maps `KeyQ` → `'ultimate'`. `GameScene.canUltimate(): boolean` (the guards) and `private startUltimate(): void` (Task 7 fills it in; here it only starts the howl and a shake).

- [ ] **Step 1: Write the failing tests**

In `abilities.test.ts`:
```ts
it('ultimate: owned only once ranked, recharges on plain time, ignoring the cooldown rate', () => {
  const a = new Abilities();
  expect(a.unlocked('ultimate')).toBe(false);
  a.setRank('ultimate', 1);
  expect(a.ready('ultimate')).toBe(CONFIG.ultimate.startReady);
  expect(a.trigger('ultimate')).toBe(true);
  a.tick(1000, CONFIG.ultimate.cooldown - 1); // cdDt is huge (Haste), plain time is not
  expect(a.ready('ultimate')).toBe(false);
  a.tick(0, 1.1);
  expect(a.ready('ultimate')).toBe(true);
});
it('views list the ultimate last', () => {
  const a = new Abilities();
  a.setRank('ultimate', 1);
  a.setRank('dash', 1);
  expect(a.view().map((v) => v.id)).toEqual(['leap', 'dash', 'ultimate']);
});
```
In `tap.test.ts`: `expect(k('KeyQ')).toBe('ultimate');`

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/systems/abilities.test.ts src/systems/tap.test.ts`
Expected: FAIL (`'ultimate'` unknown).

- [ ] **Step 3: Implement the slot**

- `abilities.ts`: add `'ultimate'` last in `IDS`. `cooldown('ultimate')` = `CONFIG.ultimate.cooldown` (no rank multiplier). The constructor's initial state is the same as `reset()`.
- `tap.ts`/`Input.ts`: `KeyQ` → `'ultimate'`; widen the key union (use `ActiveId`).
- `AbilityButtons.tsx`: `META.ultimate = { key: 'Q', label: 'Ultimate' }`, overridden by `v.label`. Render the ultimate button separately, **above** the row and right-aligned, with class `ability-btn ultimate`.
- `style.css`: `.ability-btn.ultimate` is 76 px, a 2 px accent border, and `box-shadow: 0 0 14px var(--color-primary)` only with `.ready`. The ability bar becomes a column (ultimate on top, the row below), so the row width is unchanged and fits 360 px.
- `GameScene`:
  - In `abilityView()`, the ultimate's view carries `label: kind.ultimate.label`.
  - On every monster set and on `resetRun()`, call `this.abilities.setRank('ultimate', kind.ultimate ? 1 : 0)` (after `abilities.reset()`).
  - Pass `(cdDt, dt)` to `abilities.tick`.
  - In `pressAbility('ultimate')`: `if (this.canUltimate() && this.abilities.trigger('ultimate')) this.startUltimate();`.
  - `canUltimate()` is false when: the state isn't `playing`, the monster is dead, `airborne` or `dashing`, `snare.blocksMobility`, `moment.active`, or an ultimate is already running (a `private ultimateActive = false` flag until Task 7).

- [ ] **Step 4: Add the guard test and run everything**

The guard logic is on `GameScene`, so pin it through a pure helper. Add `ultimateBlocked(s: { playing: boolean; alive: boolean; airborne: boolean; dashing: boolean; snared: boolean; leveling: boolean; running: boolean }): boolean` in `src/systems/abilities.ts`, used by `canUltimate()`. Test `ultimate guards`: false only when `playing && alive` and every other field is false; true for each field flipped on its own.

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Check it in the browser and commit**

Run `npm run dev`, pick the Wendigo: a larger "Devour" button with a Q hint sits above the ability row, ready (glowing). Q starts the howl and greys the button with a 100 s sweep. Other monsters show no ultimate button.

```bash
git add -A && git commit -m "Ultimate slot: Q key and its own button, owned per monster, 100 s cooldown on plain time"
```

---

### Task 2: Blending the sky and lights to another atmosphere

**Files:**
- Modify: `src/render/atmosphere.ts`, `src/render/atmosphere.test.ts`
- Modify: `src/world/City.ts`

**Interfaces:**
- Produces: `lerpAtmosphere(a: Atmosphere, b: Atmosphere, k: number, out: Atmosphere): Atmosphere` (colours lerped in linear RGB through `THREE.Color.lerp`, numbers and `sunDir` lerped; `fogNear`/`fogFar` from `fogDistances`; `k` clamped to 0..1). `City.blendAtmosphere(to: Atmosphere, k: number): void` applies `lerpAtmosphere(style.atmosphere, to, k)` to the attached targets; `k === 0` applies the style's own atmosphere through the existing `applyAtmosphere` path.

- [ ] **Step 1: Failing tests** in `atmosphere.test.ts`: `blend 0 restores the style exactly` (`lerpAtmosphere(a, b, 0, out)` deep-equals `a` with fog distances filled in), `blend 1 is the target` (equals `b`), `blend 0.5 is halfway` (`hemiIntensity` is the mean; `skyZenith` lies between the two hexes per channel).
- [ ] **Step 2: Run** `npx vitest run src/render/atmosphere.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lerpAtmosphere` and `City.blendAtmosphere`. Reuse one scratch `Atmosphere` in `City` (no per-frame allocation).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Atmosphere blend: lerp the sky, fog and lights toward another atmosphere"`

---

### Task 3: Devour's timeline, victims and config

**Files:**
- Modify: `src/config.ts` (`CONFIG.wendigo.ultimate`, blood colours in `CONFIG.wendigo.colors`)
- Create: `src/monsters/wendigo/devour.ts`, `src/monsters/wendigo/devour.test.ts`
- Modify: `src/combat.ts` (`Target.boss?: boolean`)

**Interfaces:**
- Produces:
  - `CONFIG.wendigo.ultimate = { radius: 900, timeScale: 0.25, maxFigures: 24, bossDamage: 2000, cameraDistanceMult: 2.2, cameraPitch: 1.05, boltEvery: [0.15, 0.35], boltSpread: 1.3, t: { easeIn: 0.2, sky: 0.6, boltsFrom: 0.3, boltsTo: 3.8, circleFrom: 0.5, circleTo: 1.3, emergeFrom: 1.2, grasp: 1.9, dragFrom: 2.4, dragTo: 3.4, outroFrom: 3.4, end: 4.4 }, blood: Atmosphere }`. `blood` is an `Atmosphere` built from the spec's colours (zenith `0x2a0306`, horizon `0x8a0e10`, a dark red fog, dimmed red hemisphere and sun). The colours live in `CONFIG.wendigo.colors` (`bloodZenith`, `bloodHorizon`, `bloodFog`, …).
  - `devourPhase(t: number): { time: number; sky: number; camera: number; circle: number; bolts: boolean; emerge: number; drag: number; done: boolean }`. All fields are 0..1 (`time` is the world time scale, between `timeScale` and 1): eased in over 0–0.2, held, eased out over the last 0.4 s. `sky` goes 0→1 over 0–0.6 and 1→0 over the outro. `camera` uses `easeInOutCubic`: 0→1 over 0–0.8 and 1→0 over the outro.
  - `devourVictims(center: Vec2, radius: number, targets: readonly Target[], maxFigures: number): { held: Target[]; extra: Target[]; bosses: Target[] }`. Takes the live targets with `hypot ≤ radius + t.radius`, at any altitude. Bosses are separated out. The non-boss victims are sorted nearest first: the first `maxFigures` are `held`, the rest are `extra`.

- [ ] **Step 1: Failing tests** in `devour.test.ts`:
  - `phases`: `devourPhase(0).time === 1`; at 1.0 `time` is `timeScale` and `sky` is 1; at 4.4 `done` and `time` 1 and `sky` 0; `bolts` true at 2, false at 0.1 and 4.
  - `takes ground and air inside the circle, nothing outside`: a tank at 800 m, a jet at 850 m with y 400, a tank at 1000 m → the two inside are taken.
  - `bosses take damage, not the drag`: a target with `boss: true` inside lands in `bosses`, not `held`.
  - `caps figures but takes everyone`: 30 tanks inside → `held` has 24 (the nearest), `extra` has 6.
- [ ] **Step 2: Run** `npx vitest run src/monsters/wendigo/devour.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `devour.ts` and the config.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Devour timeline and victims (pure), its config and the boss flag on targets"`

---

### Task 4: Camera pull-back

**Files:**
- Modify: `src/systems/orbit.ts`, `src/systems/orbit.test.ts`, `src/systems/CameraRig.ts`, `src/GameScene.ts` (ignore drag and zoom while an ultimate runs)

**Interfaces:**
- Produces: `blendOrbit(a: OrbitState, b: Pick<OrbitState, 'pitch' | 'distance'>, k: number): OrbitState` (yaw kept, pitch and distance lerped). `CameraRig.pull(k: number, pitch: number, distance: number): void` sets an override used in `update()` (`cameraPose(blendOrbit(this.orbit, …, k), …)`). The player's own `orbit` is never overwritten, so `k = 0` returns exactly to it.

- [ ] **Step 1: Failing test** in `orbit.test.ts`, `blend 0 keeps the player's orbit, 1 is the pull-back`: endpoints exact; yaw unchanged at every `k`.
- [ ] **Step 2: Run** `npx vitest run src/systems/orbit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `blendOrbit` and `CameraRig.pull`. The distance may exceed `maxDistance` (the cinematic goes beyond the player's zoom); check that `camera.far` still covers it. In `GameScene`'s input handlers, `drag` and `wheel` do nothing while `ultimateActive`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Camera pull-back override that returns exactly to the player's orbit"`

---

### Task 5: Lightning

**Files:**
- Create: `src/systems/Lightning.ts`, `src/systems/lightningMath.ts`, `src/systems/lightningMath.test.ts`

**Interfaces:**
- Produces: `boltPath(from: THREE.Vector3, to: THREE.Vector3, segments: number, jitter: number, rand: () => number, out: THREE.Vector3[]): THREE.Vector3[]` (the end points are exact; inner points are offset sideways by up to `jitter`). `class Lightning { constructor(scene: THREE.Scene, colors: { core: number; edge: number }); strike(ground: THREE.Vector3): void; update(dt: number): number /* returns the flash 0..1 to add to the scene light */; clear(): void; dispose(): void }`. It is pooled: at most 4 bolts, each a main path of 6–10 segments plus up to 2 short forks. It's drawn as thin camera-facing quads (two meshes: a white core and a red edge, additive). Each bolt is visible about 0.12 s, then fades. Each strike leaves a scorch decal (pooled, 8) that fades over 2 s.

- [ ] **Step 1: Failing test** in `lightningMath.test.ts`, `bolt path`: first point equals `from`, last equals `to`, length `segments + 1`, every inner point within `jitter` of the straight line.
- [ ] **Step 2: Run** `npx vitest run src/systems/lightningMath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `boltPath` and `Lightning`. Bolts start 3000 m up, above the strike point.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Lightning: pooled jagged bolts with forks, a flash value and scorch marks"`

---

### Task 6: Demonic figures

**Files:**
- Create: `src/monsters/wendigo/demonModel.ts`, `src/monsters/wendigo/demonModel.test.ts`, `src/monsters/wendigo/DemonFigures.ts`

**Interfaces:**
- Produces:
  - `demonGeometry(): THREE.BufferGeometry`: one merged, faceted, vertex-coloured figure. It's a hunched, emaciated humanoid: a horned or antlered head with two eye points, a torso, and two long arms ending in claws. It's near-black with a faint violet-red rim colour. It is 1 unit tall standing, with its feet at y 0, facing +Z, and its arms reaching forward and up.
  - `demonPose(u: number): { rise: number; reach: number; clutch: number; sink: number }`: the pose over one figure's life `u` 0..1 (emerge → grasp → drag).
  - `class DemonFigures { constructor(scene: THREE.Scene); spawn(at: THREE.Vector3, victim: { radius: number; height: number }): number; update(emerge: number, drag: number): void; clear(): void; dispose(): void }`. It's pooled for `maxFigures`, in at most 3 `InstancedMesh`es: the body, a smoky `BackSide` shell, and the husks. Each figure stands under its victim, scaled to the victim's size, and taller for aircraft so it reaches the victim's height. **The victim is shown as a husk:** a dark, faceted block sized to the victim's radius, held in the figure's claws from the grasp onward and sunk with it below the ground. (This is the spec's husk option; the real unit is removed at the grasp, see Task 7.)
- [ ] **Step 1: Failing tests** in `demonModel.test.ts`: `stands 1 tall on the ground facing +Z` (bounds: min.y ≈ 0, max.y ≈ 1, the claws are the most +Z part), `is vertex coloured`; `pose`: `rise` 0 at u 0 and 1 by the grasp, `sink` 0 before the drag and 1 at u 1.
- [ ] **Step 2: Run** `npx vitest run src/monsters/wendigo/demonModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the model, the pose and `DemonFigures`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Demonic figures: code-built model, pose curve and a pooled instanced system with husks"`

---

### Task 7: Devour orchestration and wiring

**Files:**
- Create: `src/monsters/wendigo/Devour.ts`, `src/monsters/wendigo/Devour.test.ts`
- Modify: `src/monster/Monster.ts`, `src/monster/Monster.test.ts`, `src/GameScene.ts`

**Interfaces:**
- Consumes: `devourPhase`, `devourVictims` (Task 3); `Lightning` (Task 5); `DemonFigures` (Task 6); `City.blendAtmosphere` (Task 2); `CameraRig.pull` (Task 4).
- Produces:
  - `type DevourHost = { enemies(): readonly Target[]; take(t: Target): void; hurtBoss(t: Target, dmg: number): void; buildingsWithin(c: Vec2, r: number): Target[]; sky(k: number): void; camera(k: number): void; shake(a: number): void; particles: Particles; flash(k: number): void }`.
  - `class Devour { constructor(scene: THREE.Scene, host: DevourHost, rand?: () => number); readonly active: boolean; timeScale(): number; start(center: THREE.Vector3, damageMult: number): void; update(realDt: number): boolean /* true on the frame it ends */; cancel(): void; dispose(): void }`. It owns the black circle mesh (ragged rim, slow turn, deep-red glow, polygon offset like the old aura).
  - `Monster.startRoar(duration: number = CONFIG.abilities.roar.duration)`: the roar (and so the howl pose and `busy`) lasts `duration`.
- [ ] **Step 1: Failing tests**
  - `Devour.test.ts` (the host is a stub recording calls; the scene is a plain `THREE.Scene`):
    - `takes victims at the grasp, buildings over the drag, nearest first`: `take` is called for every victim exactly once at t = 1.9. `buildingsWithin` results are each given full damage between 2.4 and 3.4, nearer ones earlier.
    - `bosses take bossDamage × damageMult and are not taken`.
    - `pauses freeze the timeline`: with no `update` calls, nothing advances; `update(0)` changes nothing.
    - `ends at 4.4 with sky(0), camera(0) and time scale 1`.
    - `cancel restores everything`: `sky(0)` and `camera(0)` are called, figures and lightning are cleared, `active` is false.
  - `Monster.test.ts`, `a long roar holds busy for its duration`.
- [ ] **Step 2: Run** `npx vitest run src/monsters/wendigo/Devour.test.ts src/monster/Monster.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `Devour`.** `update` advances `t` by `realDt` and reads `devourPhase(t)`. It calls `host.sky`/`host.camera`, fades the circle and strikes bolts on their random interval while `bolts` is on, passing the flash to `host.flash`. When `emerge` starts it calls `devourVictims` and spawns figures for `held`. At the grasp it calls `devourVictims` again: the figured victims still alive, plus everyone else now inside (as `extra`), are `take`n, with a shadow burst for each `extra`. Bosses get `hurtBoss`. Anyone entering after the grasp is not taken. It brings buildings down over the drag, then clears at the end.
- [ ] **Step 4: Wire it into `GameScene`:**
  - Create `Devour` only for the Wendigo (`kind.ultimate`); dispose of it on a monster change.
  - `startUltimate()`: `ultimateActive = true`; `devour.start(monster.position, dmgMult())`; `monster.startRoar(CONFIG.wendigo.ultimate.t.end)`.
  - **Time scale:** `const dt = realDt * (this.devour?.active ? this.devour.timeScale() : this.moment.timeScale());`. While not `frozen`, call `devour.update(realDt)`. On the frame it ends, set `ultimateActive = false`; if `progression.pendingLevels > 0`, start the level-up moment.
  - **Level-up wait:** where kills start the level-up moment (`onTargetDestroyed`), skip it while `ultimateActive`.
  - **Invulnerable:** pass `invulnerable: this.passives.bubbleActive() || this.ultimateActive` to `resolveHit`.
  - **Quiet kills:** `host.take(t)` sets a `quietKill` flag around `t.applyDamage(1e9)`, so `onTargetDestroyed` skips its explosion (shadow smoke and mist instead). EXP is still given.
  - **Host methods:**
    - `sky(k)` → `city.blendAtmosphere(CONFIG.wendigo.ultimate.blood, k)`.
    - `camera(k)` → `rig.pull(k, cameraPitch, defaultDistance × cameraDistanceMult)`.
    - `flash(k)` → add `k × 1.5` to `lighting.hemi.intensity` after the blend.
    - `buildingsWithin` collects from `city.forEachStandingInRadius`.
  - **No other actions:** `pressAbility` returns early for every ability while `ultimateActive`.
  - **Resets:** `resetRun()`, a monster change and `startDying()` call `devour.cancel()`, and `ultimateActive = false`.
- [ ] **Step 5: Add the level-up wait test and run everything.** Pin the wait through a pure helper, `levelUpNow(pending: number, playing: boolean, ultimateRunning: boolean): boolean` in `src/systems/levelUpMoment.ts`, used at both call sites. Test `banks the level-up until the end`: `levelUpNow(1, true, true) === false`, `levelUpNow(1, true, false) === true`.

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: all pass.

- [ ] **Step 6: Check it in the browser and commit**

Run `npm run dev` and play the Wendigo with a crowded field, using the `?debug` overlay to watch draw calls. Press Q:
- Everything slows and the camera pulls back over the whole circle.
- The sky goes blood red and lightning strikes around.
- The black circle fades in and figures rise under every enemy, aircraft included.
- They grasp and drag dark husks under, and the buildings in the circle fall nearest first.
- It all drains away, and the camera and sky return exactly.

Also check:
- Pause mid-sequence freezes it.
- Restarting mid-sequence restores the sky.
- At peak, draw calls rise by about 10 at most.

```bash
git add -A && git commit -m "Devour: the Wendigo's ultimate, wired into the slow motion, sky, camera, kills and level-ups"
```
