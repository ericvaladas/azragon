# Spike Rain (the Insect's ultimate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Insect's ultimate on Q: a purple sky and closing fog. The Insect rears up and beats its chest with its four front legs while its tail fires a volley of spikes that rain down on a 100° area in front, from 250 to 1,400 m, destroying everything under them.

**Architecture:** As Plasma Lance:
- a pure timeline and geometry module (`spikeRain.ts`);
- a pooled visual it owns (`RainSpikes`: spikes flying ballistic arcs on real time);
- a sequence implementing `Ultimate` (`SpikeRainSequence.ts`), talking to the game through a host type;
- GameScene wiring.

The body's rear-up rides on the existing `Monster.hold(…, roar)` amount; the Insect body reads it as "reared up and beating its chest". The tail aims through `lookAt`, which the Insect's tail already follows.

**Tech Stack:** TypeScript, Three.js (InstancedMesh), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-ultimate-insect-design.md`

## Global Constraints

- No React; game classes only. The sequence lives under `src/monsters/insect/`, owned by `GameScene` and registered in its `ultimates` record through `Ultimate` (`src/systems/ultimate.ts`).
- Every number in `CONFIG.insect.ultimate` (a new `CONFIG.insect` block); colours in `CONFIG.insect.colors`.
- Pooled, no per-frame allocation in the sequence; about 4 extra draw calls at most.
- Pause freezes it; restart, exit or death mid-sequence ends it cleanly (sky, fog, camera, time scale, pose, spikes).
- Devour, Ink Storm, Plasma Lance and the Insect's Stinger Spikes keep working exactly as before.
- +X is the model's LEFT; a heading `h` faces `(sin h, 0, cos h)`. The area is ±halfAngle about the facing at Q.

## Review Focus

1. **More targets in the area than the spike pool holds:** every one is still destroyed (Task 4 test with pool + 40 targets).
2. **A target that moves during the rain** (a helicopter flying, a tank driving): its spike follows it and hits it where it is, and something that drives into the area after the targets are gathered is still caught by the end of the rain (Task 4 tests).
3. **Facing wrap-around:** an Insect facing near ±π rains on its own front (Task 1 and Task 4 tests at yaw 3.0).
4. **A big building straddling the area's edge or near band:** caught when its footprint pokes into the area (Task 1 `inArea` with radius).
5. **Cancel mid-volley:** no spike is left hanging in the air, and the pose, fog and camera are restored (Task 4 cancel test).

---

### Task 1: The id, the kind, the config, the timeline and the area

**Files:**
- Modify: `src/systems/ultimate.ts` (`UltimateId` gains `'spikeRain'`)
- Modify: `src/monsters/insect/kind.ts`; create `src/monsters/insect/kind.test.ts`
- Modify: `src/config.ts` (new `CONFIG.insect`)
- Create: `src/monsters/insect/spikeRain.ts`, `src/monsters/insect/spikeRain.test.ts`

**Interfaces:**
- Produces:
  - `INSECT.ultimate = { id: 'spikeRain', label: 'Spike Rain' }`
  - `RAIN_ATMOSPHERE: AtmosphereTint` (with `fogNear`/`fogFar` from config)
  - `type RainPhase = { time: number; sky: number; camera: number; roar: number; aim: boolean; done: boolean }`
    - `roar` is the rear-up 0..1: it rises over 0..`rearUp`, holds, and falls over `outroFrom`..`outroFrom + 1`.
    - `aim` is true from `volleyFrom − 0.3` until `volleyTo`, while the tail points high in front.
  - `rainPhase(t: number): RainPhase`
  - `inArea(origin: Vec2, yaw: number, p: Vec2, radius: number): boolean`: true for distance in [near − radius, far + radius] and |bearing| ≤ halfAngle + `angularSize(dist, radius)`. It reuses `bearingOf` and `angularSize` from `src/monsters/kaiju/plasmaLance.ts`.
  - `scatterPoints(origin: Vec2, yaw: number, n: number, rand: () => number, out: Vec2[]): Vec2[]`: n points over the area, stratified. The area is split into a grid of about n cells in angle × distance², and one point is jittered in each, so the points cover it unevenly but with no big gaps.
  - `landingTimes(n: number, rand: () => number, out: number[]): number[]`: n times in [rainFrom, rainTo], sorted, jittered evenly.

- [ ] **Step 1: Write the failing tests**

`kind.test.ts`: `expect(INSECT.ultimate).toEqual({ id: 'spikeRain', label: 'Spike Rain' })`.

`spikeRain.test.ts` (`U = CONFIG.insect.ultimate`, `T = U.t`, origin (0,0)):
- `'slows the world, turns the sky and closes the fog'`:
  - time is 1 at 0, ≈ `U.timeScale` at 1, and 1 at `T.end`;
  - sky is 1 at `T.sky` and 0 at `T.end`;
  - `RAIN_ATMOSPHERE.fogFar` is less than `CONFIG.fog.far / 1.5`;
  - done is false at `T.end − 0.01` and true at `T.end`.
- `'rears up slowly, holds through the volley and the rain, then drops back'`:
  - roar is 0 at 0, < 0.2 at 0.25, 1 at `T.rearUp`, 1 at `T.rainTo`, and 0 at `T.end`;
  - `T.rearUp` ≥ 1.2.
- `'aims the tail high from just before the volley until it ends'`: aim is false at `T.volleyFrom − 0.4`, true at `T.volleyFrom` and true at `T.volleyTo − 0.01`, and false at `T.volleyTo + 0.1`.
- `'the area is the band in front, 100° across, widened by a target's size'`, at yaw 0:
  - (0, 800) is inside; (0, 200) and (0, 1450) are outside;
  - (0, 1450) is inside with radius 60;
  - a point at bearing 0.95 rad, 600 m out, is outside with radius 0 and inside with radius 80;
  - (0, −600) is outside.
- `'faces wrap: an Insect facing near ±π rains on its own front'`: at yaw 3.0, `(sin 3, cos 3) × 800` is inside and its opposite is outside.
- `'scatters landing points over the whole area, inside it, with no big gaps'`: 160 points, all `inArea(…, 0)`. Splitting the area into 4 × 4 equal angle/distance bins, every bin holds at least 3 points.
- `'spreads the landings over the rain beat'`: 160 times, all in [rainFrom, rainTo], sorted. The first quarter of the beat holds between 20% and 30% of them.

- [ ] **Step 2: Run them.** `npx vitest run src/monsters/insect`. Expected: FAIL (`INSECT.ultimate` undefined; `spikeRain` module missing).

- [ ] **Step 3: Implement**
  - `ultimate.ts`: add `'spikeRain'` to `UltimateId`.
  - `kind.ts`: `ultimate: { id: 'spikeRain', label: 'Spike Rain' }`.
  - `CONFIG.insect` (with doc comments naming each, as `CONFIG.kaiju.ultimate` has):
    - `ultimate`: `{ near: 250, far: 1400, halfAngle: 0.873, timeScale: 0.25, cameraDistanceMult: 2.0, pool: 256, spikes: 160, flight: 1.0, arc: 600, spikeLength: 45, spikeWidth: 7, aimHeight: 1500, fogNear: 250, fogFar: 1400, hemiIntensity: 0.45, sunIntensity: 0.4, t: { easeIn: 0.2, sky: 1.5, rearUp: 1.5, volleyFrom: 1.0, volleyTo: 3.0, rainFrom: 2.0, rainTo: 4.0, outroFrom: 4.0, end: 5.5 } }`;
    - `colors`: `{ rainZenith: 0x1c0a2e, rainHorizon: 0x5a2a7a, rainFog: 0x3e1f56, rainHemiSky: 0x9a6ac8, rainHemiGround: 0x1a0c24, rainSun: 0xc8a0f0 }`.
  - `spikeRain.ts` follows `plasmaLance.ts`'s style.

- [ ] **Step 4: Run them.** `npx vitest run src/monsters/insect && npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Spike Rain: the id, config, timeline and area"`.

### Task 2: The Insect rears up and beats its chest

**Files:**
- Modify: `src/monsters/insect/InsectBody.ts`
- Create: `src/monsters/insect/InsectBody.test.ts`

**Interfaces:**
- Consumes: `BodyFrame.carried` and `BodyFrame.roar` (exist; `Monster.hold(height, brace, blaze, roar)` already passes the roar and leans the body back by 0.45 × roar).
- Produces: `InsectBody.feet: readonly THREE.Vector3[]` (each leg's foot as last posed, root space). The Insect body, while `f.carried`, reads `f.roar` (0..1) as:
  - **Rear-up:** the body pitches up about its rear hips by up to `REAR_PITCH` (≈ 1.0 rad including the Monster's lean) and lifts, standing on legs 4 and 5 (the back pair).
  - **Arms:** legs 0–3 leave the ground and become arms. Their feet swing in toward a point at the chest and back out, alternating left/right (0 with 3, 1 with 2), at `BEAT_RATE` rad/s of world time, scaled by roar.

- [ ] **Step 1: Write the failing tests** (`InsectBody.test.ts`, with a `base()` frame as `KaijuBody.test.ts` has):
  - `'reared up, it stands on its back legs: the head rises and the front four feet leave the ground'`: after 30 frames at `carried: true, roar: 1`, versus 30 at roar 0:
    - `body['model'].body.rotation.x` is at least 0.5 rad more negative (pitched up);
    - `body.feet[0..3]` are each ≥ 150 above the ground (root space);
    - `body.feet[4]` and `body.feet[5]` are still on it (|y| < 10).
  - `'the front four beat at the chest, alternating sides'`: over 2 s of world time at roar 1, the distance from `feet[0]` to the chest point varies by ≥ 60. Leg 0 and leg 1 are at their closest at different times, more than 0.15 s apart.
  - `'not carried, nothing changes'`: with `roar: 1, carried: false`, `feet[0..3]` are on the ground (|y| < 10).
- [ ] **Step 2: Run them.** `npx vitest run src/monsters/insect/InsectBody.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `InsectBody.animate`:
  - The rear-up pitch and lift are applied to `body` before the legs. The arm feet are set in root space toward a chest point in front of the head, swinging with `Math.sin(f.time × BEAT_RATE + phase)`.
  - Constants at the top with a doc comment: `REAR_PITCH = 0.6` (added to the Monster's 0.45 lean), `REAR_LIFT = 140`, `BEAT_RATE = 9`, `CHEST = (0, 520, 260)` body space.
  - Nothing changes when `!f.carried`.
- [ ] **Step 4: Run them.** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 5: Commit**: `git commit -m "Insect body: rear up and beat its chest for Spike Rain"`.

### Task 3: The spikes in flight

**Files:**
- Create: `src/monsters/insect/RainSpikes.ts`, `src/monsters/insect/RainSpikes.test.ts`

**Interfaces:**
- Produces: `class RainSpikes { constructor(scene: THREE.Scene, color: number); launch(from: THREE.Vector3, to: THREE.Vector3): number; aimAt(i: number, to: THREE.Vector3): void; update(dt: number, onLand: (i: number, at: THREE.Vector3) => void): void; readonly flying: number; clear(): void; dispose(): void }`.
  - `U.pool` spikes in one `InstancedMesh`: a thin faceted cone, `U.spikeLength` × `U.spikeWidth`, in the given colour (the Insect's `kind.fx.spike`), unlit.
  - Each flies `ballistic(from, to, U.arc, k, out)` (`src/systems/projectileMath.ts`) over `U.flight` real seconds, pointing along its velocity.
  - `launch` returns its slot, or −1 when the pool is full.
  - `aimAt` moves a flying spike's landing point (to follow a moving target).
  - `onLand` fires once per spike as it arrives; the spike is then free.

- [ ] **Step 1: Write the failing tests**
  - `'adds one mesh, empty until a launch'`.
  - `'a spike flies a high arc and lands once, at its point, after the flight time'`:
    - from (0, 400, 0) to (0, 0, 900): mid-flight Y is > 400 + 0.5 × `U.arc`;
    - `onLand` is called once, near `U.flight` (± one frame), at (0, 0, 900);
    - `flying` is 0 afterwards.
  - `'points along its flight: nose up rising, nose down falling'`: the instance's +Y axis has a positive Y component early in the flight and a negative one late.
  - `'aimAt moves where it lands'`.
  - `'a full pool refuses further launches'` (returns −1).
  - `'clear empties it; dispose removes it'`.
- [ ] **Step 2: Run them.** `npx vitest run src/monsters/insect/RainSpikes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as the interface says, with module-scope temp vectors and no per-frame allocation.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Spike Rain: the spikes in flight"`.

### Task 4: The sequence

**Files:**
- Create: `src/monsters/insect/SpikeRainSequence.ts`, `src/monsters/insect/SpikeRainSequence.test.ts`

**Interfaces:**
- Consumes: Task 1 (`rainPhase`, `inArea`, `scatterPoints`, `landingTimes`, `RAIN_ATMOSPHERE`); Task 3 (`RainSpikes`).
- Produces:

```ts
export type SpikeRainHost = {
  enemies(): readonly Target[];
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Hit by a spike: it dies (or collapses) with the usual explosion. */
  destroy(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** The Insect's facing (yaw, rad) as Q was pressed. */
  facing(): number;
  /** The stinger tip, world space. */
  stinger(out: THREE.Vector3): THREE.Vector3;
  /** Point the tail at this world point (null: free). */
  aim(at: THREE.Vector3 | null): void;
  /** Hold the Insect in place, reared up by `roar` (0..1). */
  hold(roar: number): void;
  release(): void;
  sky(k: number): void;
  /** Camera pull-back 0..1, keeping the player's angle. */
  camera(k: number): void;
  shake(amount: number): void;
  /** A spike's impact on the ground. */
  burst(at: THREE.Vector3): void;
};
export class SpikeRain implements Ultimate { constructor(scene: THREE.Scene, host: SpikeRainHost, spikeColor: number, rand?: () => number) }
```

Behaviour (real seconds):
- **Every frame:** set `time`, `sky`, `camera`, `hold(roar)`. While `aim` is true, point the tail at the point `aimHeight` up and 400 m in front.
- **At `volleyFrom`, gather the targets:** enemies (any altitude) and buildings (`buildingsWithin(origin, far + 200)`) that are `inArea`. Plan one spike per target, then filler spikes at `scatterPoints` until there are `U.spikes` spikes in all, or the number of targets if that's more. Give them `landingTimes` and shuffle which target gets which time.
- **Launching:** each spike leaves the stinger at its landing time − `U.flight`. When the pool is full, a planned spike's target is added to the nearest earlier spike's list instead, so it's hit when that one lands.
- **In flight:** a spike with a live target follows it (`aimAt`).
- **On landing:**
  - `burst` and a small `shake` at the point;
  - each of its targets still alive is destroyed, or a boss gets `hurtBoss(bossDamage × damageMult)`;
  - each target is hit only once.
- **At `rainTo`:** anything alive and `inArea` is destroyed (it moved in after the gather).
- **At the end:** release, sky 0, camera 0, aim null, clear.
- **`cancel`:** restores everything at once, with no spikes left in the air.

- [ ] **Step 1: Write the failing tests** (a stub-host `rig()` as `PlasmaLanceSequence.test.ts` has, facing 0)
  - `'destroys everything in the area during the rain; nothing outside is touched'`:
    - 6 units inside at assorted bearings and distances, 2 buildings inside;
    - outside: one at 150 m, one at 1,600 m, one at bearing 1.3, one behind;
    - every inside one is destroyed at a time in [rainFrom, rainTo + 0.05];
    - the outside ones are untouched.
  - `'cuts down aircraft over the area'`: an airborne unit 600 m up at bearing 0.2 is destroyed.
  - `'bosses take the heavy ultimate damage instead'`.
  - `'more targets than the pool: every one is still destroyed'`: `U.pool + 40` units inside.
  - `'a moving target is hit where it is'`: a unit moved 200 m after the volley starts (staying inside) is destroyed. Its spike's landing point is within 30 m of its new position.
  - `'something that drives in after the gather is caught by the end of the rain'`.
  - `'an Insect facing near ±π rains on its own front'`.
  - `'launches spikes from the stinger through the volley, and lands them through the rain'`: the first launch is within one frame of `rainFrom − U.flight`; no launch is after `volleyTo`; lands are counted with a stub-`burst`, and at least `U.spikes` land.
  - `'rears up and aims the tail high, then lets go'`: the hold log tracks `rainPhase(t).roar`; the aims are high (y ≥ `aimHeight − 1`) while `aim` is true; the last aim is null.
  - `'pauses freeze it'`; `'cancel mid-volley restores everything'` (released, sky 0, camera 0, aim null, `timeScale() === 1`, inactive, `spikes.flying === 0`); `'ends once, with time scale 1'`.
- [ ] **Step 2: Run them.** `npx vitest run src/monsters/insect/SpikeRainSequence.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `SpikeRain`** as above.
- [ ] **Step 4: Run them.** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 5: Commit**: `git commit -m "Spike Rain sequence: rear, volley, rain, recover"`.

### Task 5: Wire it into GameScene and check it in the browser

**Files:**
- Modify: `src/GameScene.ts`

- [ ] **Step 1: Register it**: `this.ultimates.spikeRain = new SpikeRain(this.scene, { … }, INSECT spike colour)`. Use the Insect kind's `fx.spike`; the spike colour is `CONFIG.palette.stinger`. The host:
  - `enemies`, `buildingsWithin`, `destroy`, `hurtBoss`, `facing`, `shake`: as Plasma Lance's.
  - `stinger`: `monster.rangedOrigin(out)`.
  - `aim`: sets `monster.lookAt` (a kept vector, or null).
  - `hold`: `monster.hold(0, 0, 0, roar)`; `release`: `monster.hold(null)`.
  - `sky`: `city.blendAtmosphere(RAIN_ATMOSPHERE, k)`.
  - `camera`: `rig.pull(k, rig.orbit.pitch, defaultDistance × U.cameraDistanceMult)`.
  - `burst`: `particles.emit('dust', at, 4, 1)` and `particles.emit('debris', at, 3, 1)`.
- [ ] **Step 2: Run** `npx vitest run && npx tsc --noEmit -p .`. Expected: all PASS.
- [ ] **Step 3: Browser check** (the Plasma Lance harness, choosing the Insect), with tanks in front and behind and helicopters circling in front. Press Q and confirm:
  - the purple sky and the fog closing in;
  - the rear-up and chest-beating;
  - the tail firing up;
  - the spikes raining across the area;
  - everything in front destroyed during the rain, and everything behind untouched.

  Pause, then exit to the title mid-rain: everything is restored. Note the draw calls.
- [ ] **Step 4: Commit**: `git commit -m "Spike Rain wired in: the Insect's Q"`.
