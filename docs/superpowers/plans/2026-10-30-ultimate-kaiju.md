# Plasma Lance (the Kaiju's ultimate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Kaiju's ultimate on Q: a cyan sky, debris levitating, plates and vents blazing, a rear-back, then a huge mouth beam sweeping its front from right to left, destroying everything in a 1,400 m, 120° wedge.

**Architecture:** As Ink Storm: a pure timeline and geometry module (`plasmaLance.ts`), a sequence class implementing `Ultimate` (`PlasmaLanceSequence.ts`) that talks to the game only through a host type, two pooled visual classes it owns (`LanceBeam`, `LanceDebris`), and GameScene wiring. The Kaiju body learns three inputs: `brace` (rear back, wide stance), `blaze` (plate and vent glow past the normal maximum) and, while carried, a neck that tracks `lookAt` with no turn-rate limit so the real-time sweep can drive it.

**Tech Stack:** TypeScript, Three.js (InstancedMesh, additive MeshBasicMaterial), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-ultimate-kaiju-design.md`

## Global Constraints

- No React; game classes only. The sequence lives under `src/monsters/kaiju/`, owned by `GameScene`, registered in its `ultimates` record through the existing `Ultimate` interface (`src/systems/ultimate.ts`).
- Every number in `CONFIG.kaiju.ultimate`; colours in `CONFIG.kaiju.colors`.
- Pooled, no per-frame allocation in the sequence; about 6 extra draw calls at most.
- Pause freezes it; restart, exit or death mid-sequence ends it cleanly (sky, camera, time scale, glow, pose, debris, beam, scar).
- Devour, Ink Storm and Plasma Breath keep working exactly as before.
- +X is the model's LEFT; a heading `h` faces `(sin h, 0, cos h)`. The Kaiju's right is −X, so the sweep runs from bearing −halfAngle (right) to +halfAngle (left) relative to its facing.

## Review Focus

1. **A target straddling the wedge edge or right next to the Kaiju:** a building whose footprint pokes into the wedge, or a unit 20 m away, must be caught as the beam passes, not skipped because its centre bearing is just outside or swings wildly up close (Task 1 `crossed` widening by the target's angular size; Task 5 test).
2. **A long real-time frame (a hitch, a tab returning):** the beam may move tens of degrees in one update; every target and debris piece between the old and new bearing must still be hit, in order (Task 5 test with a 0.5 s step).
3. **Facing wrap-around:** a Kaiju facing near ±π must still sweep its own front, not the back (Task 1 test at yaw = 3.0).
4. **Q pressed while the neck is turned for Plasma Breath, or mid-breath:** the breath must not fire during the ultimate and the head must follow the sweep from its first frame (Task 6: breath cleared at start; Task 3 carried-neck test).
5. **Cancel mid-sweep:** the body's glow, rear and neck return to normal and no debris stays hanging in the air (Task 5 cancel test).

---

### Task 1: The id, the kind, the config and the pure timeline and wedge

**Files:**
- Modify: `src/systems/ultimate.ts` (`UltimateId` gains `'plasmaLance'`)
- Modify: `src/monsters/kaiju/kind.ts`, `src/monsters/kaiju/kind.test.ts`
- Modify: `src/config.ts` (`CONFIG.kaiju.ultimate`, new `CONFIG.kaiju.colors` entries)
- Create: `src/monsters/kaiju/plasmaLance.ts`, `src/monsters/kaiju/plasmaLance.test.ts`

**Interfaces:**
- Produces:
  - `KAIJU.ultimate = { id: 'plasmaLance', label: 'Plasma Lance' }`
  - `LANCE_ATMOSPHERE: AtmosphereTint`
  - `type LancePhase = { time: number; sky: number; camera: number; lift: number; blaze: number; brace: number; beam: number; sweep: number; done: boolean }`
  - `lancePhase(t: number): LancePhase`. `sweep` is the beam's bearing relative to facing (rad), −halfAngle until `fire`, rising linearly to +halfAngle at `sweepTo`. `beam` is 0..1 strength: 0 before `fire`, 1 through the sweep, 0 by `sweepTo + 0.15`. `brace` rises over rearFrom..fire, then eases to 0.35 within 0.15 s after `fire` (the snap forward, still planted) and to 0 over the outro. `blaze` rises over glowFrom..glowTo, holds, falls over the outro. `lift` rises over liftFrom..fire.
  - `bearingOf(origin: Vec2, yaw: number, p: Vec2): number`: the angle of `p` from the facing, in (−π, π], positive toward the Kaiju's left (+X at yaw 0).
  - `inWedge(origin: Vec2, yaw: number, p: Vec2, radius: number): boolean`: within `range + radius` and within `halfAngle` widened by `angularSize`.
  - `angularSize(dist: number, radius: number): number`: `asin(min(1, radius / max(dist, radius)))`.
  - `crossed(prev: number, cur: number, bearing: number, widen: number): boolean`: true when the interval (prev, cur] overlaps [bearing − widen, bearing + widen].

- [ ] **Step 1: Write the failing tests**

`kind.test.ts`: `expect(KAIJU.ultimate).toEqual({ id: 'plasmaLance', label: 'Plasma Lance' })`.

`plasmaLance.test.ts` (with `U = CONFIG.kaiju.ultimate`, `T = U.t`):
- `'slows the world, turns the sky, then sweeps right to left during the sweep beat'`: `lancePhase(0).time === 1`; `lancePhase(1).time ≈ U.timeScale`; `lancePhase(T.end).time === 1`; `lancePhase(T.sky).sky === 1`; `lancePhase(T.fire - 0.01).beam === 0`; `lancePhase((T.fire + T.sweepTo) / 2).beam === 1`; `lancePhase(T.fire).sweep ≈ -U.halfAngle`; `lancePhase((T.fire + T.sweepTo) / 2).sweep ≈ 0`; `lancePhase(T.sweepTo).sweep ≈ U.halfAngle`; sweep is non-decreasing over 0..T.end in 0.05 s steps; `lancePhase(T.end).done === true`, `lancePhase(T.end - 0.01).done === false`.
- `'rears back before firing, snaps forward on fire, and is upright by the end'`: `brace(T.rearFrom) === 0`; `brace(T.fire - 0.01) > 0.95`; `brace(T.fire + 0.2) ≈ 0.35`; `brace(T.end) === 0`.
- `'blazes through the build-up and lifts the debris before the beam'`: `blaze(T.glowFrom) === 0`, `blaze(T.glowTo) === 1`, `blaze(T.end) === 0`; `lift(T.liftFrom) === 0`, `lift(T.fire) === 1`.
- `'bearings are measured from the facing, positive to its left, and wrap'`: from (0,0) at yaw 0, (−100, 100) has bearing −π/4 (right) and (100, 100) +π/4; at yaw 3.0 a point straight ahead (sin 3, cos 3)×500 has bearing ≈ 0 and a point straight behind has |bearing| ≈ π.
- `'the wedge is the front 120° to its range, widened by a target's size'`: at yaw 0 from (0,0): (0, 1399) inside; (0, 1450) outside with radius 0, inside with radius 60; a point at bearing 1.1 rad, 500 m out, outside with radius 0, inside with radius 60; anything behind outside.
- `'crossed catches a bearing anywhere the beam passed, however big the step'`: `crossed(-1, -0.9, -0.95, 0)` true; `crossed(-1, 0.5, 0.2, 0)` true (one long step); `crossed(-1, -0.9, -0.85, 0)` false; `crossed(-1, -0.9, -0.85, 0.06)` true; `crossed(-0.9, -0.9, -0.9, 0)` false (no movement).

- [ ] **Step 2: Run them**

Run: `npx vitest run src/monsters/kaiju`
Expected: FAIL (`KAIJU.ultimate` undefined; `plasmaLance` module missing).

- [ ] **Step 3: Implement**

- `ultimate.ts`: `export type UltimateId = 'devour' | 'inkStorm' | 'plasmaLance';`
- `kind.ts`: `ultimate: { id: 'plasmaLance', label: 'Plasma Lance' }`.
- `config.ts`, `CONFIG.kaiju.ultimate` (with a doc comment naming each, as `CONFIG.kraken.ultimate` has):
  `{ range: 1400, halfAngle: 1.047, timeScale: 0.25, cameraDistanceMult: 2.0, debris: 90, debrisLift: 60, debrisSize: [6, 18], debrisMargin: 0.3, beamCore: 18, beamEdge: 55, scarWidth: 50, scarLife: 1.5, scars: 64, t: { easeIn: 0.2, sky: 0.8, liftFrom: 0.3, glowFrom: 0.3, glowTo: 2.0, rearFrom: 1.5, fire: 2.0, sweepTo: 4.5, outroFrom: 4.5, end: 6.0 }, hemiIntensity: 1.0, sunIntensity: 1.0 }`.
- `CONFIG.kaiju.colors` gains `lanceZenith: 0x39d6e8, lanceHorizon: 0xbff6fa, lanceFog: 0xa8e8ee, lanceHemiSky: 0xc8faff, lanceHemiGround: 0x2a5a60, lanceSun: 0xe8ffff, beamCore: 0xffffff, scar: 0x6ff6ff, debris: 0x8a8378`.
- `plasmaLance.ts`: `LANCE_ATMOSPHERE` built like `STORM_ATMOSPHERE` (`windowGlow: { color: C.lanceSun, strength: 0.2 }`). `lancePhase` follows `inkPhase`'s style (`smooth`, `ramp`, `easeInOutCubic`, `outro`). The time scale eases in over `easeIn` and out over the last 0.4 s; the camera eases in over 0..`fire` and home over the outro; the sky reaches 1 at `sky` and falls over the outro.

- [ ] **Step 4: Run them**

Run: `npx vitest run src/monsters/kaiju && npx tsc --noEmit -p .`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ultimate.ts src/monsters/kaiju src/config.ts
git commit -m "Plasma Lance: the id, config, timeline and wedge"
```

### Task 2: The camera can swing behind while it pulls back

**Files:**
- Modify: `src/systems/orbit.ts` (`blendOrbit`), `src/systems/orbit.test.ts`
- Modify: `src/systems/CameraRig.ts` (`pull`)

**Interfaces:**
- Produces: `blendOrbit(a, b: Pick<OrbitState, 'pitch' | 'distance'> & { yaw?: number }, k)`, which turns the yaw by `angleDelta(a.yaw, b.yaw) * k` when `b.yaw` is given; `CameraRig.pull(k, pitch, distance, yaw?: number)`. Existing callers pass no yaw and are unchanged.

- [ ] **Step 1: Write the failing test** in `orbit.test.ts`, `describe('blendOrbit')`: `'swings the yaw the short way round to a given yaw'`. With `a.yaw = 3.0`, `b.yaw = -3.0`, k = 0.5, the result's yaw is `3.0 + angleDelta(3.0, -3.0) * 0.5` (just past π, not near 0); with no `b.yaw` the yaw is `a.yaw`.
- [ ] **Step 2: Run it.** `npx vitest run src/systems/orbit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `blendOrbit` as above; `pull` stores the optional yaw in `pullTo` and passes it through.
- [ ] **Step 4: Run it.** Same command. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Camera pull can swing behind a monster"`.

### Task 3: The Kaiju body rears back, blazes and tracks the sweep

**Files:**
- Modify: `src/monsters/types.ts` (`BodyFrame.blaze: number`)
- Modify: `src/monster/Monster.ts` (`hold(height, brace = 0, blaze = 0)`; frame `blaze`, 0 when not held; default frame object)
- Modify: `src/monsters/kaiju/KaijuBody.ts`
- Modify: `src/monster/Monster.test.ts`, `src/monsters/wendigo/WendigoBody.test.ts`, `src/monsters/kraken/KrakenBody.test.ts` (their `base()` frames gain `blaze: 0`)
- Create: `src/monsters/kaiju/KaijuBody.test.ts`

**Interfaces:**
- Consumes: `BodyFrame.carried`, `BodyFrame.brace` (exist).
- Produces: `Monster.hold(height: number | null, brace = 0, blaze = 0): void`; `BodyFrame.blaze` (0..1: an ultimate's glow past the normal maximum).

- [ ] **Step 1: Write the failing tests**

- `Monster.test.ts`, in `describe('Monster.hold')`: `'passes the hold's blaze to the body, and none once set down'`, mirroring the existing brace test: `hold(0, 0, 0.8)` → frame `blaze` 0.8; after `hold(null)` → 0.
- `KaijuBody.test.ts` (a `base()` frame as `WendigoBody.test.ts` has, plus `carried`, `brace`, `blaze`):
  - `'blaze drives the plates and vents past anything Plasma Breath reaches'`: after one animate with `charge: 1`, record `body['plateMat'].emissiveIntensity` and the first vent's; after one with `blaze: 1`, both are at least 1.5× those.
  - `'a carried Kaiju's head follows lookAt at once, with no turn-rate lag'`: carried, `lookAt` at bearing +0.9 rad 1,000 m out; after one 1/60 s animate `body['neckYaw'] ≈ 0.9` (within 0.05). Not carried: after the same frame it is at most `K.neck.turnRate / 60`.
  - `'brace rears it back: the head rises and pitches up'`: the jaws' height (`body.rangedOrigin(out).y`) after 30 frames at `brace: 1, carried: true` is higher than at `brace: 0` by at least 40 m.
- [ ] **Step 2: Run them.** `npx vitest run src/monster src/monsters`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - `Monster`: store blaze beside `braceW`; frame `blaze` is the stored value while held, else 0.
  - `KaijuBody`: the neck's turn rate is unlimited while `f.carried` (`stepNeck` with `Infinity`). `brace` pitches the torso/neck back and raises the head (the roar pose is the reference; scale its pitch by `brace`) and widens the stance by spreading the feet. `blaze` adds to the plate and vent emissive intensity: plates `+ 4 * blaze`, vents `+ 4 * blaze`. The roar and flash paths keep their current behaviour.
- [ ] **Step 4: Run them.** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 5: Commit**: `git commit -m "Kaiju body: rear back, blaze and a carried neck for Plasma Lance"`.

### Task 4: The beam, the scar and the debris

**Files:**
- Create: `src/monsters/kaiju/LanceBeam.ts`, `src/monsters/kaiju/LanceBeam.test.ts`
- Create: `src/monsters/kaiju/LanceDebris.ts`, `src/monsters/kaiju/LanceDebris.test.ts`

**Interfaces:**
- Produces:
  - `class LanceBeam { constructor(scene: THREE.Scene); show(from: THREE.Vector3, to: THREE.Vector3, strength: number, time: number): void; hide(): void; scar(at: THREE.Vector3): void; update(dt: number): void; clear(): void; dispose(): void }`. Two additive cylinders (white `beamCore` core of radius `U.beamCore`, plasma-cyan edge of radius `U.beamEdge`), flickering with `time`. A pooled `InstancedMesh` of `U.scars` flat glowing discs (`C.scar`, radius `U.scarWidth`) that fade over `U.scarLife`; `scar()` reuses the oldest. 3 draw calls.
  - `class LanceDebris { constructor(scene: THREE.Scene, rand?: () => number); scatter(origin: Vec2, yaw: number): void; update(dt: number, lift: number): void; positions(): readonly THREE.Vector3[]; alive(i: number): boolean; vaporize(i: number): void; settle(): void; clear(): void; dispose(): void; readonly count: number }`. `U.debris` pieces in one `InstancedMesh` (`C.debris`, sizes in `U.debrisSize`), scattered unevenly over the wedge widened by `U.debrisMargin` rad each side, out to `U.range`. Each rises toward `U.debrisLift × lift` m (plus a small per-piece variation) while slowly tumbling. `settle()` makes every live piece fall back to the ground over about 1 s and then disappear.

- [ ] **Step 1: Write the failing tests**
  - `LanceBeam.test.ts`: `'adds three meshes, hidden until shown'`; `'shows a beam from the jaws to its end and hides it'` (core and edge visible after `show`, their midpoint between from and to, hidden after `hide`); `'a scar fades away over scarLife'` (instance count 1 after `scar`, 0 after `update(U.scarLife + 0.1)`); `'clear and dispose leave nothing'`.
  - `LanceDebris.test.ts`: `'scatters every piece in front, within range'` (every position's `bearingOf` within halfAngle + debrisMargin and distance ≤ range); `'rises with lift, never past debrisLift plus its variation'` (all y = 0 at lift 0; mean y > 0.8 × debrisLift after `update(2, 1)`; max y < 1.3 × debrisLift); `'a vaporized piece is gone'` (`alive(i)` false and the drawn count drops by one); `'settle brings every live piece down and away'` (after `settle()` and `update(1.5, 1)`, no piece is alive); `'clear resets'`.
- [ ] **Step 2: Run them.** `npx vitest run src/monsters/kaiju`. Expected: FAIL.
- [ ] **Step 3: Implement both classes** as the interfaces say: pooled, with module-scope temp vectors and no per-frame allocation.
- [ ] **Step 4: Run them.** Same command. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Plasma Lance: the beam, its scar and the levitating debris"`.

### Task 5: The sequence

**Files:**
- Create: `src/monsters/kaiju/PlasmaLanceSequence.ts`, `src/monsters/kaiju/PlasmaLanceSequence.test.ts`

**Interfaces:**
- Consumes: Task 1 (`lancePhase`, `bearingOf`, `inWedge`, `angularSize`, `crossed`); Task 4 (`LanceBeam`, `LanceDebris`).
- Produces:

```ts
export type PlasmaLanceHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Hit by the beam: it dies (or collapses) with the usual explosion. */
  destroy(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** The Kaiju's facing (yaw, rad) as Q was pressed. */
  facing(): number;
  /** The jaws, world space. */
  jaws(out: THREE.Vector3): THREE.Vector3;
  /** Turn the head toward this world point (null: free). */
  aim(at: THREE.Vector3 | null): void;
  /** Hold the Kaiju planted, braced (rear) and blazing, 0..1 each. */
  hold(brace: number, blaze: number): void;
  /** Set it down and back to normal control. */
  release(): void;
  sky(k: number): void;
  /** Camera pull 0..1 toward behind `yaw` (0 restores the player's view). */
  camera(k: number, yaw: number): void;
  shake(amount: number): void;
  flash(k: number): void;
  /** Particles: a debris piece vaporized, or the beam's impact on the ground. */
  burst(at: THREE.Vector3, kind: 'vapor' | 'impact'): void;
};
export class PlasmaLance implements Ultimate { constructor(scene: THREE.Scene, host: PlasmaLanceHost, rand?: () => number) }
```

Behaviour per update (real seconds), as Ink Storm's sequence:
- Each frame: `time`, `sky`, `camera(phase.camera, yaw)`, `hold(brace, blaze)`, `debris.update(realDt * phase.time, phase.lift)`, `beam.update(realDt)`.
- At `start`: the facing yaw and the origin are fixed; the debris is scattered; the targets are gathered once at `fire`. That means `enemies()` inside the wedge (any altitude) and `buildingsWithin(origin, range + 200)` filtered by `inWedge`.
- From `fire` to `sweepTo`:
  - The aim point is at the bearing `phase.sweep` from the facing, `U.range × 0.9` out on the ground. `aim(point)` is called each frame.
  - The beam is drawn from `jaws` to that point with `phase.beam`, and `scar` and `burst('impact')` are called there every 0.05 s.
  - Every gathered target whose bearing was `crossed` between last frame's sweep and this frame's (widened by `angularSize`) and is still alive gets `destroy`, or `hurtBoss(t, CONFIG.wendigo.ultimate.bossDamage × damageMult)` for a boss.
  - Every live debris piece likewise is vaporized with `burst('vapor')`.
- Lighting and shake: `flash(0.35 × phase.beam)` and `shake(0.02)` each frame while firing.
- After `sweepTo`: the beam is hidden, `aim(null)`, and `debris.settle()` is called once.
- At the end: release, sky 0, camera 0, flash 0, and clear (scars keep fading).
- `cancel` restores everything at once.

- [ ] **Step 1: Write the failing tests** (a stub-host `rig()` as `InkStormSequence.test.ts` has, facing 0, origin (0, 0))
  - `'destroys what is in the wedge in sweep order, right first, each as the beam passes'`: units at bearings −0.9, −0.3, 0.4, 0.95 (600 m out), one at 1.3 (outside), one behind; destroyed in that order, each at a time within 0.05 s of when `lancePhase(t).sweep` reaches its bearing; the outside and behind ones untouched.
  - `'buildings in the wedge collapse as it passes; outside ones stand'`: the stub `buildingsWithin` returns two inside and one at bearing 1.4; `destroy` called for the two only.
  - `'cuts down aircraft at altitude'`: an airborne unit 800 m up at bearing 0 is destroyed.
  - `'bosses take the heavy ultimate damage instead'`: `hurtBoss(boss, BOSS * 2)` with damageMult 2, no `destroy`.
  - `'a hitch still catches everything it swept past'`: run with 0.5 s steps; all four inside units destroyed.
  - `'a target poking into the wedge edge or right beside the Kaiju is caught'`: a radius-80 building centred at bearing 1.1 rad, 400 m out, is destroyed; a unit 25 m away at bearing 0.2 is destroyed.
  - `'a Kaiju facing near ±π sweeps its own front'`: facing 3.0; a unit straight ahead is destroyed, one straight behind is not.
  - `'vaporizes floating debris in the wedge as the beam passes; the rest settle'`: after the run, no debris piece is alive; vapor bursts ≥ 0.6 × `U.debris`.
  - `'aims the head along the sweep and lets go after'`: the aim point's bearing tracks `phase.sweep` within 0.05 during the sweep; the last aim is null.
  - `'pauses freeze it'`: 100 × `update(0)` mid-sweep changes nothing.
  - `'cancel mid-sweep restores everything'`: `release` called, sky 0, camera 0, flash 0, `timeScale() === 1`, `active` false, the beam hidden, no debris left in the air.
  - `'ends once, with time scale 1, releasing the Kaiju'`: `update` returns true exactly once; afterwards `timeScale() === 1`.
- [ ] **Step 2: Run them.** `npx vitest run src/monsters/kaiju/PlasmaLanceSequence.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `PlasmaLance`** as above.
- [ ] **Step 4: Run them.** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 5: Commit**: `git commit -m "Plasma Lance sequence: build-up, rear, sweep, recover"`.

### Task 6: Wire it into GameScene and check it in the browser

**Files:**
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: Task 2 (`rig.pull` with yaw); Task 3 (`monster.hold(height, brace, blaze)`); Task 5 (`PlasmaLance`, `PlasmaLanceHost`).

- [ ] **Step 1: Register it**: `this.ultimates.plasmaLance = new PlasmaLance(this.scene, { … })`. The host:
  - `enemies`: `enemyTargets()`.
  - `buildingsWithin`: as Ink Storm's.
  - `destroy`: `t.applyDamage(1e9)`, the loud kill.
  - `hurtBoss`: `t.applyDamage(dmg)`.
  - `facing`: `monster.yaw`.
  - `jaws`: `monster.rangedOrigin(out)`.
  - `aim`: sets `monster.lookAt` (a copy into a kept vector, or null).
  - `hold`: `monster.hold(0, brace, blaze)`.
  - `release`: `monster.hold(null)`.
  - `sky`: `city.blendAtmosphere(LANCE_ATMOSPHERE, k)`.
  - `camera`: `rig.pull(k, rig.orbit.pitch, defaultDistance × U.cameraDistanceMult, yaw)`.
  - `shake`, `flash`: as Ink Storm's.
  - `burst`: `'vapor'` emits `spark` and `plasma` particles; `'impact'` emits `fire`, `debris` and `spark`.
- [ ] **Step 2: On start**, stop any Plasma Breath in progress (`this.breath.clear()` and the monster's charge to 0), so it cannot fire during the ultimate. While the ultimate runs, the breath's own aim must not overwrite `monster.lookAt`; guard its per-frame `lookAt` write (`this.monster.lookAt = this.breath.busy ? …`, in the playing update) with `!this.ultimateActive`.
- [ ] **Step 3: Run** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 4: Browser check** (`npm run dev`, Playwright as for Ink Storm), with the Kaiju, tanks and buildings in front and behind, and helicopters in front. Press Q and confirm:
  - the cyan sky, the debris rising, the glow building, the rear-back and the snap forward;
  - the beam sweeping from the Kaiju's right to its left, with the head following;
  - units and buildings in front exploding in sweep order, helicopters cut down;
  - the debris vaporized and the scar fading;
  - everything behind untouched;
  - the camera behind the Kaiju and back afterwards.
  Pause, then exit to the title mid-sweep: everything is restored. Note the draw calls with and without it running.
- [ ] **Step 5: Commit**: `git commit -m "Plasma Lance wired in: the Kaiju's Q"`.
