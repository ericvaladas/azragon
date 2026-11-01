# Downtime and Boss Fights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run cycles through 3 min of army, a quiet break while the army retreats, a mech boss fight, and a 10 s breather. The first break adds a meteor cutscene, and the meteor grants the ultimate.

**Architecture:** A pure `Cycle` state machine (`src/systems/cycle.ts`) owns the phases and returns transition events, which `GameScene` acts on. Every enemy system gains a retreat mode, read from a new `WorldContext.retreating` flag. The mech is one more `EnemySystem` (kind `'mech'`) that only the cycle spawns. The meteor is a small class that drives its own fall and cutscene camera blend. The music plan swaps its play-once handoff for calm and fight crossfades.

**Tech Stack:** TypeScript, Three.js, React (HUD only), Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-downtime-and-bosses-design.md`

## Global Constraints

- Assume models are Y-up and face +Z; heading `h` faces `(sin h, 0, cos h)`, `heading = atan2(dx, dz)`. +X is the model's LEFT.
- All tuning numbers and colours go in `CONFIG` (`src/config.ts`): new blocks are `CONFIG.cycle`, `CONFIG.meteor` and `CONFIG.mech`, plus `CONFIG.palette` entries.
- No `useEffect`. No React for game logic. The game class never imports React. HUD animations use CSS on `transform`/`opacity` only.
- Models are built in code from `faceted`/`painted` parts (`src/render/toon.ts`) with vertex colours, drawn with `toonMat(0xffffff, { vertexColors: true })`.
- No on-screen text hints for phases. A boss health bar and an edge arrow to the meteor are allowed.
- Every boss is the same mech. Beating it gives exactly `expToNext(level) − exp` EXP and no other reward.
- `main2` is the calm track for `retreat` and `recover`. `main1` loops during `army` and `boss`.
- Tests are colocated `*.test.ts`. Run them with `npm test`. Build with `npm run build`. Do not deploy.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Restart or Change Monster mid-break, mid-cutscene or mid-boss.** The new run is fully clean: phase `army` at 0 s, no mech, no meteor, ultimate locked, main1 playing, no camera override. Pinned by the `Cycle.reset` test in Task 1 and the reset test in Task 9.
2. **Pause or level-up cards during the cutscene.** The fall and camera blend freeze and then resume, and the camera always comes home. Pinned by the Meteor zero-dt test in Task 8.
3. **The mech takes damage after it's dead** (an ultimate's `bossDamage`, a dash crush, a passive on the same frame). It reports its death exactly once. Pinned in Task 7.
4. **The monster standing on the meteor's landing spot before it lands.** It isn't collected until after impact, and the impact doesn't hurt the monster. Pinned in Task 8.
5. **No reachable open ground for the meteor** (all water or landmarks within the band). It still lands somewhere walkable. Pinned by the `pickLandSite` fallback test in Task 8.

---

### Task 1: The cycle state machine

**Files:**
- Create: `src/systems/cycle.ts`, `src/systems/cycle.test.ts`
- Modify: `src/config.ts` (add `CONFIG.cycle`, `CONFIG.meteor` timing keys)

**Interfaces:**
- Produces:
  - `export type Phase = 'army' | 'retreat' | 'boss' | 'recover'`
  - `export type CycleEvent = 'retreat' | 'cutscene' | 'dismiss' | 'boss' | 'recover' | 'army'`
  - `export class Cycle { constructor(armyTime?: number); readonly phase: Phase; readonly cycles: number; get spawning(): boolean; get retreating(): boolean; reset(): void; update(dt: number): CycleEvent[]; meteorLanded(): void; meteorCollected(): void; bossDefeated(): void }`
  - `export function devArmyTime(search: string): number | null`, which parses `?army=<seconds>` (a positive number) or returns null.

`CONFIG.cycle = { armyTime: 180, breakTime: 20, recoverTime: 10, retreatTimeout: 12, exitDistance: 5000 }`. `exitDistance` sits beyond `CONFIG.fog.far` (4700). Add the timing keys `CONFIG.meteor = { cutsceneDelay: 3, graceTime: 25, bossDelay: 3, … }` here, and Task 8 adds the rest.

The rules are listed here because the tests pin them:
- `army`: the army clock counts `dt`. At `armyTime` it switches to `retreat` and emits `'retreat'`.
- `retreat`: the phase clock counts. It emits `'dismiss'` once at `retreatTimeout`. On the **first** cycle (`cycles === 0`) it emits `'cutscene'` once at `cutsceneDelay`. The boss comes (`'boss'`, phase `boss`) `bossDelay` s after `meteorCollected()`, or `graceTime` s after `meteorLanded()` if the meteor still hasn't been collected. On later cycles the boss comes at `breakTime`.
- `boss`: it waits. After `bossDefeated()`, the next `update` switches to `recover` and emits `'recover'`.
- `recover`: at `recoverTime` it emits `'army'`, phase `army`, resets the army clock to 0, and does `cycles++`.
- `spawning` is `phase === 'army'`. `retreating` is `phase !== 'army'`.
- `meteorCollected()`/`meteorLanded()` outside the first `retreat` only record that they happened. They don't change the phase.

- [ ] **Step 1: Write the failing tests** in `src/systems/cycle.test.ts`, stepping with `dt = 0.1`:
  - `'stays in army for armyTime, then retreats'`: after 179.9 s the phase is `army` and no events have fired. The next steps emit `['retreat']`, and the phase is `retreat`, `spawning === false`, `retreating === true`.
  - `'first break: cutscene at cutsceneDelay, dismiss at retreatTimeout, no boss without the meteor before graceTime'`: run 3 s into retreat → one `'cutscene'`. At 12 s → one `'dismiss'`. With nothing collected, at 60 s into retreat the phase is still `retreat`.
  - `'first break: boss bossDelay after collection'`: `meteorLanded()` at 6 s, `meteorCollected()` at 9 s → `'boss'` at 12 s, not before.
  - `'first break: boss graceTime after landing if never collected'`: `meteorLanded()` at 6 s → `'boss'` at 31 s.
  - `'later breaks: boss at breakTime, no cutscene'`: drive one full cycle, then the second retreat emits `'boss'` at 20 s and never `'cutscene'`.
  - `'boss → recover → army, army clock restarts'`: `bossDefeated()` → the next update emits `'recover'`. After 10 s it emits `'army'`, `cycles === 1`, and the next `'retreat'` comes 180 s later.
  - `'reset returns to army at 0 with no cycles'`: reset mid-boss gives `phase === 'army'`, `cycles === 0`, and the first cycle's cutscene fires again.
  - `'constructor armyTime overrides'`: `new Cycle(10)` retreats at 10 s.
  - `'devArmyTime parses ?army='`: `'?army=15'` → 15, `'?city=x&army=4.5'` → 4.5, `''` → null, `'?army=0'` → null, `'?army=x'` → null.
- [ ] **Step 2: Run** `npx vitest run src/systems/cycle.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `Cycle` and `devArmyTime`** in `src/systems/cycle.ts` and the config blocks. Each event fires at most once per phase entry. Keep "already fired" flags that clear on each transition.
- [ ] **Step 4: Run** `npx vitest run src/systems/cycle.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/systems/cycle.ts src/systems/cycle.test.ts src/config.ts && git commit -m "Cycle: army, retreat, boss and recover phases"`

### Task 2: Music calm and fight crossfades

**Files:**
- Modify: `src/audio/musicPlan.ts`, `src/audio/musicPlan.test.ts`, `src/audio/Music.ts`, `src/config.ts` (`CONFIG.music` comments, new `phaseFade: 2.0`)

**Interfaces:**
- Produces:
  - `MusicEvent = 'unlock' | 'reveal' | 'menu' | 'calm' | 'fight'` (`'main1Ended'` removed)
  - The action union drops `startMain2` and adds `{ kind: 'crossfade'; from: 'main1' | 'main2'; to: 'main1' | 'main2' }`.
  - `Music.calm(): void` and `Music.fight(): void`, both no-ops before the audio graph exists, like `reveal()`.

The rules: `calm` from `main1` → playing `main2` with a crossfade from main1 to main2. `fight` from `main2` → playing `main1` with a crossfade from main2 to main1. Every other source is `none`, so `calm` during the intro or a menu changes nothing. `reveal` and `menu` are unchanged (menu fades from whichever main track is playing). In `Music.setUp`, **both** main tracks loop (`el.loop = true` for every track) and the `onended` handoff is removed. A crossfade uses `fadeOut(from, M.phaseFade)` and `play(to, M.phaseFade)`.

- [ ] **Step 1: Update the tests** in `src/audio/musicPlan.test.ts`. Delete the `main1Ended` cases and add:
  - `'calm crossfades Main 1 into Main 2'`: `musicStep('main1','calm')` equals `{ playing: 'main2', action: { kind: 'crossfade', from: 'main1', to: 'main2' } }`.
  - `'fight crossfades Main 2 into Main 1'`: the mirror of that.
  - `'calm and fight change nothing elsewhere'`: for `null`, `'intro'` and the already-matching track, the action kind is `'none'`.
  - `'menu from Main 2 after a calm returns to the Intro'`: `run(['unlock','reveal','calm','menu'])` ends with `intro`.
- [ ] **Step 2: Run** `npx vitest run src/audio/musicPlan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the plan changes, `Music.calm()`/`fight()`, the looping and the crossfade action, and update the class doc comment on `Music` (Main 1 now loops through the fighting, and Main 2 plays during the breaks).
- [ ] **Step 4: Run** `npx vitest run src/audio`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Music: Main 1 loops for fighting, Main 2 for breaks"`

### Task 3: Ultimate locked until granted

**Files:**
- Modify: `src/systems/abilities.ts`, `src/systems/abilities.test.ts`, `src/config.ts`

**Interfaces:**
- Produces:
  - `Abilities.refill(id: ActiveId): void`, which sets that ability's cooldown to 0.
  - `CONFIG.ultimate.startUnlocked: false`, which replaces `startReady` (removed, along with its use in `freshCooldowns`, which now always starts the ultimate on its full cooldown).

The ultimate is granted with `setRank('ultimate', 1)` followed by `refill('ultimate')`. Task 9 does the GameScene side.

- [ ] **Step 1: Write the failing test** `'a granted ultimate is ready at once'`: a fresh `Abilities` with `setRank('ultimate', 1)` → `ready('ultimate') === false` (full cooldown). After `refill('ultimate')` → `true`. After `trigger('ultimate')` → `false`. Update any existing test that relied on `startReady`.
- [ ] **Step 2: Run** `npx vitest run src/systems/abilities.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `refill` and the config change. Fix the `startReady` references (`grep -rn startReady src`).
- [ ] **Step 4: Run** `npx vitest run src/systems`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Ultimate starts locked; Abilities.refill"`

### Task 4: Retreat contract and ground units (tank, gustav, truck)

**Files:**
- Create: `src/enemies/retreat.ts`, `src/enemies/retreat.test.ts`, `src/enemies/TankFleet.test.ts`
- Modify: `src/enemies/types.ts`, `src/enemies/EnemyRegistry.ts`, `src/enemies/TankFleet.ts`, `src/enemies/GustavFleet.ts`, `src/enemies/LaserTrucks.ts`, `src/enemies/GustavFleet.test.ts`, `src/enemies/LaserTrucks.test.ts`

**Interfaces:**
- Produces:
  - `WorldContext.retreating?: boolean` (absent means false). Doc comment: *the army is falling back: no new attacks; units leave and are removed beyond CONFIG.cycle.exitDistance without being reported destroyed.*
  - `export function fleePoint(from: Vec2, monster: Vec2, dist: number): Vec2` returns the point `dist` m from `monster`, through `from`, on the side away from the monster. If `from` is the monster's position, it goes along +Z.
  - `export function escaped(p: Vec2, monster: Vec2): boolean` returns `dist2(p, monster) >= CONFIG.cycle.exitDistance`.
  - `EnemyRegistry.dismiss(ctx: WorldContext): void`. For every system except kind `'mech'`, it puts a dust ring (`ctx.particles.ring('dust', t.position (y=0), t.radius * 2, 8)`) at each live target, then `clear()`s that system. It doesn't touch the director.
  - `EnemySystem.kind` is widened to `EnemyKind | 'mech'`. The registry `Map` key and `get` take that union. `ENEMY_KINDS` and `counts()` are unchanged, so the mech never enters the spawn table.

The retreat behaviour for ground units, while `ctx.retreating`:
- They fire nothing new: no tank shell, no Gustav shell, no laser-truck charge. A laser truck that's mid-aim or mid-lock stands down. A beam already firing finishes.
- They route by road to `fleePoint(here, monster, CONFIG.cycle.exitDistance + 200)`, re-planning on their usual interval. Their range checks that stop them to fire are ignored.
- They're spliced out once `escaped`. `onDestroyed` is not called for this.
- Damage still applies, and a kill still reports EXP as normal.

- [ ] **Step 1: Write the failing tests:**
  - `retreat.test.ts`: `fleePoint({x:100,z:0},{x:0,z:0},5000)` → `{x:5000,z:0}`. A coincident `from` → `{x:0,z:5000}`. `escaped` is true at exactly `exitDistance` and false 1 m short.
  - For each of `TankFleet.test.ts` (new, modelled on `GustavFleet.test.ts`'s `makeCtx`), `GustavFleet.test.ts` and `LaserTrucks.test.ts`:
    - `'fires nothing while retreating'`: spawn a unit in range, set `retreating: true`, and run 20 s → zero shots or beams.
    - `'drives away and is removed past exitDistance without a kill'`: the unit's distance from the monster grows each second, and eventually `count() === 0` with `destroyed.length === 0`.
  - `'dismiss clears every system but the mech and leaves dust'`: a registry with a stub system (kind `'tank'`, one target) and a stub `'mech'` → after `dismiss`, the tank stub's `clear` was called and the mech stub's wasn't, with one dust ring.
- [ ] **Step 2: Run** `npx vitest run src/enemies`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `retreat.ts`, the `types.ts` and registry changes, and the retreat branch in the three systems.
- [ ] **Step 4: Run** `npx vitest run src/enemies`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Retreat: ground units fall back and leave"` (after `git add` of the new files).

### Task 5: Retreat for aircraft (jet, heli, napalm, osprey, blimp)

**Files:**
- Create: `src/enemies/JetSquadron.test.ts`, `src/enemies/Blimps.test.ts`
- Modify: `src/enemies/JetSquadron.ts`, `src/enemies/Helicopters.ts`, `src/enemies/NapalmBombers.ts`, `src/enemies/OspreyNets.ts`, `src/enemies/Blimps.ts`, and their existing tests

**Interfaces:**
- Consumes: `ctx.retreating`, `fleePoint` and `escaped` from Task 4.

While `ctx.retreating`:
- **Jets** switch to `exit` with a waypoint at `fleePoint`, fire no salvo, and never loop back.
- **Helicopters and napalm bombers** fly at their cruise speed toward `fleePoint`, with no firing and no drops (fires already burning on the ground keep burning).
- **Ospreys** drop no net. One carrying a net flies off with it still slung, and a net already falling still lands.
- **Blimps** turn away at their speed and never trigger their blast.
- Each is spliced out once `escaped`, with no `onDestroyed`. A crash already in progress plays out.

- [ ] **Step 1: Write the failing tests:** in each of the five systems' test files (new ones modelled on `Helicopters.test.ts`'s fake context), `'attacks nothing while retreating'` (no rockets, napalm, nets or blasts over 20 s with the monster in range) and `'flies off and is removed past exitDistance without a kill'`.
- [ ] **Step 2: Run** `npx vitest run src/enemies`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the retreat branch in each system.
- [ ] **Step 4: Run** `npx vitest run src/enemies`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Retreat: aircraft and blimps fly off"`

### Task 6: Retreat for emplacements (sam, artillery, orbital laser)

**Files:**
- Create: `src/enemies/OrbitalLaser.test.ts`
- Modify: `src/enemies/SamSilos.ts`, `src/enemies/Artillery.ts`, `src/enemies/OrbitalLaser.ts`, `src/enemies/SamSilos.test.ts`, `src/enemies/Artillery.test.ts`

These can't leave, so while `ctx.retreating` they **go quiet**:
- SAM silos launch no new missiles. Missiles in flight carry on.
- Artillery paints no new salvo. Strikes already painted still land.
- The orbital laser calls its own `cancel()` if it's charging or firing and starts nothing new.

They're removed by `EnemyRegistry.dismiss` (Task 4), which the cycle calls at `retreatTimeout`.

- [ ] **Step 1: Write the failing tests:**
  - `'launches nothing while retreating'` for SAM and artillery.
  - `'painted strikes still land while retreating'` for artillery: paint a salvo, set retreating, run on → its hits still arrive.
  - `'stands down while retreating'` for the orbital laser: it's mid-charge → after one update with `retreating: true`, there's no beam and no damage over 10 s.
- [ ] **Step 2: Run** `npx vitest run src/enemies`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/enemies`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -am "Retreat: emplacements go quiet"`

### Task 7: The mech: model, brain and system

**Files:**
- Create: `src/enemies/mechModel.ts`, `src/enemies/mechModel.test.ts`, `src/enemies/mechMath.ts`, `src/enemies/mechMath.test.ts`, `src/enemies/Mech.ts`, `src/enemies/Mech.test.ts`
- Modify: `src/config.ts` (`CONFIG.mech`, palette), `src/combat.ts` (`TargetKind` + `'mech'`, `DamageSource` + `'melee'`), `CONFIG.readability.threatKinds` (+ `'mech'`)

**Interfaces:**
- Consumes: `Target.boss`, `WorldContext` (`damageMonster`, `damageBuildings`, `fireRocket`, `shake`, `particles`, `onDestroyed`, `difficulty`), and `strikePoints`/`strikeFill`/`strikeHits` from `src/enemies/artilleryMath.ts`.
- Produces:
  - `mechModel.ts`: `export type MechParts = { pelvis; torso; head; armL; armR; legL; legR: THREE.BufferGeometry }` and `export function mechParts(): MechParts`. These are unit-scale (total standing height 1, ground at y=0, facing +Z). Each limb's geometry has its origin at its pivot (hip or shoulder) so it can be rotated in place. `export const MECH_PIVOTS: { hipY; hipX; shoulderY; shoulderX; … }` gives the pivot positions in the same units.
  - `mechMath.ts`:
    - `export type MechAction = 'walk' | 'punch' | 'slam' | 'dash' | 'rockets' | 'barrage'`
    - `export type MechMind = { dist: number; meleeCd: number; dashCd: number; rocketCd: number; barrageCd: number; roll: number }`
    - `export function chooseAction(m: MechMind): MechAction`, which picks by priority: `dash` if `dist > dashTrigger && dashCd <= 0`; else, within `punchReach`, if `meleeCd <= 0`, `slam` when `roll < slamChance`, otherwise `punch`; else `barrage` if `barrageCd <= 0`; else `rockets` if `rocketCd <= 0 && dist <= rocketRange`; else `walk`.
    - `export function movePhase(action: Exclude<MechAction,'walk'>, t: number): 'windup' | 'strike' | 'recover' | 'done'`, with the durations from `CONFIG.mech.moves[action] = { windup, strike, recover }`.
    - `export function punchHits(mech: Vec2, yaw: number, monster: Vec2, monsterRadius: number): boolean`: inside `punchReach + monsterRadius` and within `punchArc` radians of the facing.
    - `export function slamHits(mech: Vec2, monster: Vec2, monsterRadius: number): boolean`: inside `slamRadius + monsterRadius`.
  - `Mech.ts`:
    - `export class Mech implements EnemySystem`, with `kind = 'mech'`
    - `summon(ctx: WorldContext): void` places it at `monster + dir × CONFIG.mech.spawnDistance` (random direction from `ctx.spawnDir()`), facing the monster, with `hp = CONFIG.mech.hp × ctx.difficulty.hpMult`.
    - `spawn(ctx)` returns false. The director never calls it.
    - `current(): { hp: number; maxHp: number } | null` is null with no live mech.
    - `count()`, `targets()` and `clear()` work like any other system.

`CONFIG.mech` starting values (tuned in Task 11's playtest):
```
height: CONFIG.monster.height (the standard monster height), width ≈ 0.45 × height, radius: 0.3 × height,
hp: 9000, walkSpeed: 60, turnRate: 1.2, stopAt: 0.8 × punchReach,
punchReach: 0.55 × height, punchArc: 0.7, punchDamage: 80,
slamRadius: 0.6 × height, slamDamage: 140, slamChance: 0.35, meleeCooldown: 1.6,
dashTrigger: 1600, dashSpeed: 900, dashCooldown: 9, dashStopShort: 0.5 × height, crushRadius: 0.25 × height, crushDps: 600,
rocketCooldown: 4, rocketsPerVolley: 3, rocketDamage: 10, rocketRange: 2200,
barrageCooldown: 17, barrageCount: 7, barrageSpread: 450, barrageRadius: 130, barrageFill: 1.6, barrageDamage: 45,
spawnDistance: 4200, footfallShake: 0.06, dyingTime: 2.5, wreckTime: 6,
moves: { punch: {windup:0.55,strike:0.15,recover:0.4}, slam: {windup:1.0,strike:0.2,recover:0.7}, dash: {windup:0.6,strike:0,recover:0.4}, rockets: {windup:0.3,strike:0.4,recover:0.3}, barrage: {windup:0.7,strike:0.5,recover:0.5} }
```
Palette: `mech` (military olive, e.g. 0x5f6b48), `mechDark`, `mechMetal` (gunmetal), `mechVisor` (hot amber), `mechLight` (red warning light). Reuse `gustavHazard`/`gustavHazardDark` for its hazard stripes.

The look: chunky bipedal military hardware. Thick armoured legs with big feet, a broad torso with panel lines, a small cockpit head with a glowing visor slit, shoulder missile pods (box launchers with tube faces), and two heavy arms ending in big fists. Hazard stripes on the shins and pods.

Behaviour (`Mech.update`):
- **walk**: it turns toward the monster at `turnRate` and walks straight (off-road) until `stopAt`. Its legs swing sinusoidally with the stride. Each footfall shakes the camera by `footfallShake` (scaled down with distance) and kicks up dust, and every standing building within `crushRadius` of a foot takes `crushDps × dt`.
- **punch/slam**: in `windup` the arm pulls back (slam: both arms rise), the visor brightens and it holds its facing. At the start of `strike` it checks once: if `!ctx.monster.airborne` and `punchHits`/`slamHits`, it calls `ctx.damageMonster(punchDamage | slamDamage, 'melee', this)` with the raw damage (`damageMonster` applies the difficulty `dmgMult` itself). A slam also makes a dust ring and a shake of 0.25. Then `recover`.
- **dash**: in `windup` it crouches as a tell (the pelvis drops 8%). Then it moves at `dashSpeed` toward `monster − dir × dashStopShort`, applying `crushDps` to buildings along its path, until it arrives. It sets `dashCd`.
- **rockets**: in `strike` it fires `rocketsPerVolley` rockets from its pods with `ctx.fireRocket(from, monsterAim, rocketDamage)`, aimed like the jets aim (at the monster's upper body with a little scatter).
- **barrage**: it paints `barrageCount` strike circles at `strikePoints(monster, n, barrageSpread, rng)` (one circle forced on the monster's own position), filling over `barrageFill`. Each one landing hits the monster with `ctx.damageMonster(barrageDamage, 'artillery', this)` when `strikeHits` is true. It draws its own ring and fill meshes, the same way `Artillery` does.
- **Damage taken**: `applyDamage` subtracts HP and sets a flash timer (instance colour or a material tint for the hit flash). It's a no-op once dead.
- **Death**: when HP first reaches ≤ 0, `isAlive()` becomes false and it calls `ctx.onDestroyed(this target, 0)` **once**. GameScene computes the level-up EXP (Task 9). Then for `dyingTime` it gives off sparks and small explosions at random body points and the visor flickers out. A large multi-burst explosion follows (`particles.explosion` × 4 around the body, shake 0.6), then the wreck lies collapsed and sinks over `wreckTime` and is removed.
- The target is `{ kind: 'mech', boss: true, airborne: false, radius: CONFIG.mech.radius }`. Its `position` is at chest height.
- The mesh is one `THREE.Group` hierarchy with a `Mesh` per part on one shared `toonMat(0xffffff, { vertexColors: true })`. Every mesh has `castShadow`. There's only ever one mech.

- [ ] **Step 1: Write the failing tests:**
  - `mechModel.test.ts`:
    - `'parts are vertex-coloured and stand one unit tall'`: the union of the parts, placed at their pivots, has a bounding box of y ∈ [0, 1 ± 0.02].
    - `'fists reach below the hips and in front of the torso'`.
    - `'every part has a color attribute'`.
  - `mechMath.test.ts`:
    - `'dashes when far and ready'`
    - `'never dashes on cooldown'`
    - `'punches or slams in reach by roll'` (`roll` 0.2 → slam, 0.9 → punch)
    - `'barrage before rockets when both ready'`
    - `'walks when nothing is ready'`
    - `'movePhase follows windup, strike, recover, done'` at the boundaries of `moves.punch`
    - `'punchHits needs reach and facing'` (behind it → false)
    - `'slamHits is radial'`
  - `Mech.test.ts` (with a `makeCtx` like `GustavFleet.test.ts`, plus `damageMonster` recorded with its source and `fireRocket` recorded):
    - `'summon places it spawnDistance away facing the monster with scaled HP'`: `current()` equals `{ hp: 9000 × hpMult, maxHp: same }`.
    - `'spawn() refuses'`
    - `'walks in and stops near the monster'`: from 4200 m, after 120 s its distance is ≤ `stopAt + 50`.
    - `'a punch misses an airborne monster'`: monster in reach and airborne during the strike → no `'melee'` damage.
    - `'a punch lands on a grounded monster in front'`: one `'melee'` hit of 80.
    - `'dashes when the monster is far'`: monster 2500 m off → within 6 s its distance is ≤ `dashStopShort + 100`.
    - `'fires rocket volleys and barrages over time'`: 60 s with the monster at 1200 m (dash blocked by a mocked cooldown, or the monster kept inside `dashTrigger`) → at least one `fireRocket` volley and at least one `'artillery'` hit.
    - `'reports its death exactly once'`: `applyDamage(1e9)` twice plus more updates → `destroyed.length === 1`, and `isAlive()` is false.
    - `'removed after dying and the wreck sinking'`: after `dyingTime + wreckTime + 1` s, `count() === 0` and `current() === null`.
    - `'clear removes it at once'`.
- [ ] **Step 2: Run** `npx vitest run src/enemies/mech`. Expected: FAIL.
- [ ] **Step 3: Implement** `mechModel.ts`, then `mechMath.ts`, then `Mech.ts`, with the config, palette and `combat.ts` type additions.
- [ ] **Step 4: Run** `npx vitest run src/enemies && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit**: `git add src/enemies/mech* src/enemies/Mech* && git commit -am "Mech boss: model, brain and system"`

### Task 8: The meteor and its cutscene

**Files:**
- Create: `src/systems/meteorModel.ts`, `src/systems/Meteor.ts`, `src/systems/meteorMath.ts`, `src/systems/meteorMath.test.ts`, `src/systems/Meteor.test.ts`
- Modify: `src/config.ts` (the rest of `CONFIG.meteor`, palette), `src/systems/CameraRig.ts`

**Interfaces:**
- Consumes: `OpenSite` from `src/world/City.ts` and `Vec2`.
- Produces:
  - `meteorMath.ts`:
    - `export function pickLandSite(sites: readonly OpenSite[], blocked: (x: number, z: number) => boolean, rng: () => number): Vec2 | null` picks a random unblocked site, or null.
    - `export function fallbackSite(monster: Vec2, rng: () => number, nearestLand: (p: Vec2) => Vec2): Vec2` is the nearest land road point at `(landMin + landMax) / 2` in a random direction.
    - `export function cutsceneK(t: number): number` is the camera's blend toward the sky (0..1): it eases up over `lookUp`, holds through the fall and `hold`, and eases back over `lookBack` with `easeInOutCubic`. It's 0 before 0 and after the total.
    - `export function fallPosition(to: Vec2, t: number): THREE.Vector3` is a straight slant from `to + slant` at `startHeight` down to `(to.x, 0, to.z)` over `fallTime`, clamped.
  - `meteorModel.ts`: `export function meteorGeometry(): THREE.BufferGeometry`, a cluster of 3–5 faceted crystal spikes (an elongated octahedron for the main gem), unit-sized and vertex-coloured.
  - `Meteor.ts`:
    - `export type MeteorEvent = 'landed' | 'collected'`
    - `export class Meteor { constructor(scene: THREE.Scene, particles: Particles); readonly position: THREE.Vector3; get onGround(): boolean; get cutsceneActive(): boolean; start(landAt: Vec2): void; update(dt: number, monster: Vec2, monsterRadius: number, airborne: boolean): MeteorEvent | null; lookK(): number; lookPoint(): THREE.Vector3; clear(): void }`
  - `CameraRig.lookToward(k: number, point: THREE.Vector3): void` sets an override. While `k > 0`, `update` blends its look target toward `point` by `k` and raises the camera by `k × CONFIG.meteor.cameraLift`. `reset()` clears it.

The rest of `CONFIG.meteor`:
```
landMin: 900, landMax: 1300, startHeight: 3500, slant: 1800, fallTime: 2.2,
lookUp: 1.2, hold: 1.2, lookBack: 1.2, cameraLift: 400,
size: 100, pickupRadius: 120, impactRadius: 160, spin: 0.6, bob: 8, sparkleEvery: 0.15
```
The cutscene timeline (all on the `dt` passed in): `start` sets the camera blend going from 0. The meteor appears at `startHeight` when the blend reaches its hold, after `lookUp`. It falls for `fallTime`. On impact `update` returns `'landed'` once. The blend holds for `hold` and then eases back. The look point follows the falling meteor, then the impact point.

Palette: `meteor` (cyan-violet, e.g. 0x8fe9ff), `meteorCore` (0xd9b8ff), `meteorGlow` (0xffffff), all on vertex colours. Its trail and sparkle use `'spark'`/`'plasma'` particles. On the ground it spins at `spin` rad/s, bobs by `bob` m and sparkles every `sparkleEvery` s.

Collection: only while `onGround` and `!airborne`, when `hypot(monster − position) ≤ pickupRadius + monsterRadius`. Then `update` returns `'collected'` once, plays a burst of particles, and hides the meteor.

- [ ] **Step 1: Write the failing tests:**
  - `meteorMath.test.ts`:
    - `'pickLandSite skips blocked sites'`
    - `'pickLandSite returns null when all are blocked'`
    - `'fallbackSite sits in the land band'`: with `nearestLand` as the identity, the distance is in `[landMin, landMax]`.
    - `'cutsceneK eases 0→1→0 over the total'`: it's 0 at t = 0, 1 through the hold, and 0 after `lookUp + fallTime + hold + lookBack`.
    - `'fallPosition starts high and ends on the ground at the target'`
  - `Meteor.test.ts`:
    - `'reports landed once, after fallTime'`
    - `'not collected while falling, even with the monster underneath'`: the monster at the landing point the whole time → `'landed'` but no `'collected'` until the update after landing.
    - `'collected once when walked onto, not while airborne'`
    - `'zero dt freezes the cutscene'`: `lookK()` is unchanged across 10 updates with dt = 0.
    - `'clear stops the cutscene and hides it'`: `cutsceneActive === false`, `onGround === false`.
- [ ] **Step 2: Run** `npx vitest run src/systems/meteor src/systems/Meteor`. Expected: FAIL.
- [ ] **Step 3: Implement** the model, maths, `Meteor` and `CameraRig.lookToward`.
- [ ] **Step 4: Run** `npx vitest run src/systems && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/systems/meteor* src/systems/Meteor* && git commit -am "Meteor: fall, cutscene camera, pickup"`

### Task 9: Wire the cycle into GameScene

**Files:**
- Modify: `src/GameScene.ts`, `src/GameEvents.ts`, `src/enemies/types.ts` (the doc comment only, if needed)
- Test: `src/systems/cycleWiring.test.ts` (a pure helper, below)

**Interfaces:**
- Consumes: `Cycle`, `devArmyTime` (Task 1); `Music.calm/fight` (Task 2); `Abilities.refill`, `CONFIG.ultimate.startUnlocked` (Task 3); `ctx.retreating`, `EnemyRegistry.dismiss` (Task 4); `Mech` (Task 7); `Meteor`, `pickLandSite`, `fallbackSite`, `CameraRig.lookToward` (Task 8).
- Produces:
  - `GameEventMap.boss: { hp: number; maxHp: number } | null`
  - `ThreatArrow.kind: TargetKind | 'meteor'`
  - `export function bossExp(level: number, exp: number): number` in `src/systems/cycle.ts`, which returns `Math.max(1, expToNext(level) − exp)`.

What changes in `GameScene`:
- **Fields:** `cycle = new Cycle((import.meta.env.DEV ? devArmyTime(location.search) : null) ?? CONFIG.cycle.armyTime)`, `meteor: Meteor`, `mech: Mech` (registered with `this.enemies.add`) and `ultimateUnlocked = CONFIG.ultimate.startUnlocked`.
- **`resetRun`:** call `cycle.reset()`, `meteor.clear()` and `music.fight()`, and set `ultimateUnlocked = CONFIG.ultimate.startUnlocked`, all before the existing `setRank('ultimate', …)`. That line, and the one in `applyKind`, become `kind.ultimate && this.ultimateUnlocked ? 1 : 0`. `enemies.clear()` already clears the mech, and `rig.reset()` clears `lookToward`.
- **The update loop (playing):** `for (const ev of this.cycle.update(dt)) this.onCycle(ev)`. Spawning becomes `this.state === 'playing' && !this.ultimateActive && this.cycle.spawning`. The opening wave and the runaway wave each also require `this.cycle.phase === 'army'`. `this.meteor.update(dt, …)` runs every unfrozen frame (`'landed'` → `onMeteorLanded()`, `'collected'` → `onMeteorCollected()`). Before `rig.update`, call `this.rig.lookToward(this.meteor.lookK(), this.meteor.lookPoint())`.
- **`onCycle(ev)`:**
  - `retreat` → `music.calm()`.
  - `cutscene` → the land spot is `pickLandSite(ctx.openGround(landMin, landMax), blocked, rng) ?? fallbackSite(…)`, then `meteor.start(spot)`, and the order and aim are cleared.
  - `dismiss` → `enemies.dismiss(ctx)`.
  - `boss` → `enemies.dismiss(ctx)`, `mech.summon(ctx)` and `music.fight()`.
  - `recover` → `music.calm()`.
  - `army` → `music.fight()`.
- **`onMeteorLanded`:** `city.blast(spot, impactRadius, false)`, `particles.explosion(at, 1.5)`, a `'spark'` ring, `shockwave` at the spot, `rig.addTrauma(0.5)` and `cycle.meteorLanded()`.
- **`onMeteorCollected`:** `ultimateUnlocked = true`, `abilities.setRank('ultimate', monster.kind.ultimate ? 1 : 0)`, `abilities.refill('ultimate')`, `aura.start()` (the visual only, no level), and `cycle.meteorCollected()`.
- **Control lock during the cutscene:** add `private held(): boolean { return this.ultimateActive || this.meteor.cutsceneActive; }`. Use it in place of `ultimateActive` in the camera drag and zoom guards and in `updateMonster`'s brain guard (`!m.busy && !this.held()`). While `meteor.cutsceneActive`, ignore taps, ability buttons and walking keys (return early from the tap and ability entry points, and treat `drive` as zero), and keep `canUltimate()` false.
- **`onTargetDestroyed`:** if `target.kind === 'mech'`, replace `exp` with `bossExp(progression.level, progression.exp)`, skip the generic explosion (the mech has its own), and call `cycle.bossDefeated()`.
- **The HUD tick:** emit `'boss'` with `this.mech.current()`.
- **`emitThreats`:** while `meteor.onGround`, add an edge arrow for `meteor.position` with kind `'meteor'`, outside the nearest-threat cap.
- **Analytics:** none added.

- [ ] **Step 1: Write the failing test** `src/systems/cycleWiring.test.ts`: `'bossExp tops the bar up to exactly one level'` → for level 4 with exp 10, `addExp(bossExp(4, 10))` on a fresh `Progression` set to level 4 / exp 10 gives exactly one level and `exp === 0`. Also `'bossExp is at least 1'` (exp already at the threshold).
- [ ] **Step 2: Run** `npx vitest run src/systems/cycleWiring.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `bossExp` and all the GameScene wiring above.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit`. Expected: all PASS, no type errors.
- [ ] **Step 5: Manual check** with `npm run dev` and `?army=15`. In order: the army retreats at 0:15 and main2 fades in; the camera looks up, the meteor falls and lands in sight, and the camera comes home; the arrow points to it; walking onto it shows the ultimate button ready; the mech walks in out of the fog and main1 returns; killing it gives exactly one level-up; 10 s of quiet with main2; the army returns. Then **die during the boss and Play Again**: phase army, no mech, no meteor, the ultimate button hidden, main1 playing.
- [ ] **Step 6: Commit**: `git commit -am "GameScene: run the downtime and boss cycle"`

### Task 10: The boss health bar

**Files:**
- Modify: `src/App.tsx`, `src/ui/Hud.tsx`, `src/style.css`, `src/theme.ts` (only if a new token is needed, e.g. `--color-boss`)

**Interfaces:**
- Consumes: `GameEventMap.boss` (Task 9).

`App.tsx` subscribes to `'boss'` in the same `useCallback` ref as `'hud'` and keeps it in state, which only re-renders on the throttled HUD tick. It passes it to `Hud` as `boss: { hp; maxHp } | null`. `Hud` renders, when `boss` is set, a `.boss-bar` centred under `.hud-top`: a small inline SVG mech-head icon (a square head with a visor slit) and a wide bar whose `.bar-fill` uses `transform: scaleX(hp/maxHp)` with a `transition: transform 200ms ease-out`. It has no text label. It uses the existing `.bar` styling with a boss accent colour from a theme token, a 4px radius, and `contain: content`. It appears with one entrance (a 250 ms `opacity` and `translateY` animation).

- [ ] **Step 1: Implement** the bar. There's no unit test (this is the presentation layer).
- [ ] **Step 2: Verify** with `npm run build` (expected: success), then `npm run dev` with `?army=15`. The bar appears when the mech arrives, drains smoothly as it's hit, and disappears when it dies. Check at phone width (`npm run shot` or devtools at 390×844) that it doesn't overlap the level, HP or EXP bars.
- [ ] **Step 3: Commit**: `git commit -am "HUD: boss health bar"`

### Task 11: Playtest tuning pass

**Files:**
- Modify: `src/config.ts` (`CONFIG.mech`, `CONFIG.meteor` and `CONFIG.cycle` values only)

- [ ] **Step 1:** With `npm run dev` and `?army=60`, play a monster to the first boss fight with normal level-ups. Measure the fight time (target 60–90 s fighting head-on), and check that a Leap or Dash in the wind-up avoids the punch and the slam, that the dash triggers when you run off past `dashTrigger`, and that barrage circles are readable before they land. Adjust `hp`, damage, cooldowns and wind-ups to hit the target. Write each change down in the commit message.
- [ ] **Step 2:** Check that the cutscene's total is 5–7 s and that the meteor is clearly visible inside the fog at impact. Adjust `landMin`/`landMax` and the timings if not.
- [ ] **Step 3: Run** `npm test && npm run build`. Expected: all pass, build succeeds.
- [ ] **Step 4: Commit**: `git commit -am "Tune the mech fight and meteor cutscene"`
