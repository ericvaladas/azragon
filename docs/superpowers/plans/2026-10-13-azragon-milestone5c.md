# Milestone 5c: Tokyo Bay and the Waterfront — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tokyo Bay: a south-east coastline the monster can't cross (it slides along a sea wall), the river
emptying into it, an unreachable island reached by a destructible Rainbow Bridge, a harbour district, and splashes and
foam.

**Architecture:**
- **Coast and island:** the bay and island are style data that drive the existing pure road and water functions
  (`isWater` gains `isBay` and `isIsland`).
- **Collision:** a new pure `shore.ts` handles monster collision, applied in GameScene around each monster update.
- **Generation:** the chunk generator adds port lots, crane spots, sea-wall and foam edges, and quay pads.
- **Rendering:** City draws them as instanced meshes.
- **Rainbow Bridge:** uses a new "long landmark" (`LandmarkSpec.span`) for targeting and picking.
- **Splashes:** a new particle preset, triggered by `splashIfWater`.

**Tech Stack:** Three.js 0.170, TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`), Vitest
(environment `node`, no DOM), Vite.

**Spec:** `docs/superpowers/specs/2026-10-13-azragon-milestone5c-design.md`

## Global Constraints

- North is +Z; facing north, east is −X and west is +X. Lattice cells are 200 m, nodes at multiples of 200.
- **Bay (TOKYO):** `bay: { dir: (−√½, −√½), offset: 2000, amp: 150, wavelength: 1400 }`.
  - A cell is bay iff `dot(centre, dir) > offset + amp·sin(dot(centre, perp) / wavelength)`, where
    `perp = (−dir.z, dir.x)`.
  - Island cells are never bay.
- **Island (TOKYO):** a rounded rectangle centred at (−2613, −1913), half 350 m along `dir`, half 450 m along `perp`.
  - Island cells are land with buildings (office 40–110 m and one park block) and no roads.
- **`isWater` = river or bay.**
- **Roads:**
  - A segment with bay on both sides does not exist.
  - A segment touching an island cell does not exist.
  - River rules are unchanged.
- **Collision:**
  - Uses `CONFIG.monster.bodyRadius`.
  - The river never blocks.
  - Leaps fly over water; only the landing is constrained.
  - The monster is never left standing in a bay cell.
- **Rainbow Bridge:**
  - Shore anchorage at (−1658, −958), to the island's near edge at 2850 m along `dir` (a span of about 1000 m).
  - Towers about 160 m, deck about 50 m above the water.
  - Destructible landmark, exempt from the crash blast.
- **Port district:** land cells within 600 m (along `dir`) of the coastline, excluding the island and the crash site.
  - **Container stacks:** heights of 2.6 m × 2–4.
  - **Container colours:** 0xc9402a, 0x2d6fb5, 0xe88a2a, 0x3f9a4f, 0x2aa3a3.
  - **Warehouses:** 12–22 m tall.
  - **Signs:** none.
  - **Cranes:** scenery only, about 70 m tall, on land cells bordering the bay, every 2–3 cells.
- **Sea wall:** on every land-cell edge bordering a bay cell, a wall 200 m long, 10 m tall and 6 m thick, on the land
  side. Foam is a strip 12 m wide on the water side.
- **Draw calls added:** sea wall 1, foam 1, cranes 1, Rainbow Bridge 1. Quay pads use the existing park-pad mesh.
- **Commits:** branch `milestone5c`. Each commit trailer names the model that wrote it. Never push, deploy or merge.

## Review Focus

1. **Monster ends in the bay:** no code path (walk, dash, leap landing, knockback) leaves the monster's position in a
   bay cell. Tested in Task 2 by a randomized walk and dash sweep along the coast.
2. **Island leaks into gameplay:** no spawn, route or artillery placement on the island. Tested in Task 1.
3. **Long-landmark damage reach:** the bridge can't be damaged from 400 m off its line, but can be hit from its shore
   end. Tested in Task 5.
4. **Pool exhaustion:** sea wall, foam, cranes and quay pads fit their pools across a full load anywhere along the
   coast. Tested in Tasks 3 and 4.
5. **Splash spam:** `splashIfWater` never emits on land. Mass collapses near water stay within the particle budget.
   Tested in Task 6.

---

### Task 1: Coast and island in the road network

**Files:**
- Modify: `src/cities/types.ts`, `src/cities/tokyo/index.ts`, `src/world/roads.ts`, `src/world/City.ts`
  (`blockedAt`)
- Test: `src/world/roads.test.ts`, `src/world/City.test.ts`

**Interfaces (produces):**
```ts
// types.ts
export type BaySpec = { dir: { x: number; z: number }; offset: number; amp: number; wavelength: number };
export type IslandSpec = { center: { x: number; z: number }; halfAlong: number; halfAcross: number };
// CityStyle gains: bay?: BaySpec; island?: IslandSpec;
// roads.ts
export function isBay(style: CityStyle, ci: number, cj: number): boolean;
export function isIsland(style: CityStyle, ci: number, cj: number): boolean;
export function isRiver(style: CityStyle, ci: number, cj: number): boolean; // the current river test, renamed
// isWater(style, ci, cj) = isRiver || isBay (island cells are never bay)
```
**Island shape:** a cell is island iff its centre `c` has `|dot(c − center, dir)| ≤ halfAlong` and
`|dot(c − center, perp)| ≤ halfAcross`, with corners rounded by excluding the cells whose centre is more than
`halfAcross` from the centre in both axes combined (use the rounded-rectangle distance with corner radius 150).

- [ ] **Step 1: Failing tests.** In `roads.test.ts`:
  - the origin cell is land;
  - the coast lies at 2000 ± 160 m along `dir`: for 20 sample `perp` offsets in ±4000, the first bay cell walking out
    along `dir` from the origin side is between 1800 and 2200 m;
  - water is continuous from the river at x = −4000 into the bay (a 4-connected path of water cells from
    (−4000, river z) to a bay cell);
  - all island cells are land, not water, and form one 4-connected group with more than 6 cells;
  - for i, j in [−40, 20] × [−40, 20]: no segment exists with bay on both sides, and none touching an island cell;
  - `nearestRoadPoint` from 200 seeded points in the bay and on the island never returns a point inside a bay or
    island cell;
  - a route between two land points 3 km apart along the coast never samples a bay cell.

  In `City.test.ts`: `blockedAt` is true at the island centre.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add the TOKYO values. Island district buildings: generation is unchanged in this task
  (Task 3 handles island lots), but island cells must already have no roads. Make sure every existing caller of
  `isWater` still means "any water".
- [ ] **Step 4:** `npx tsc --noEmit`, full `npx vitest run`: green.
- [ ] **Step 5: Commit** "Bay and island: the south-east coast and an unreachable island in the road network".

---

### Task 2: Shore collision for the monster

**Files:**
- Create: `src/world/shore.ts`, `src/world/shore.test.ts`
- Modify: `src/GameScene.ts`

**Interfaces (produces):**
```ts
export function inBay(style: CityStyle, x: number, z: number): boolean;
export function blockedAt(style: CityStyle, x: number, z: number, radius: number): boolean; // the point or any of 4 compass offsets at radius in bay
export function slideAlongShore(style: CityStyle, prev: Vec2, next: Vec2, radius: number): Vec2;
export function landingSpot(style: CityStyle, from: Vec2, to: Vec2, radius: number): Vec2; // 20 m steps back toward `from`
```

**GameScene wiring:**
- **Ground movement:** record the monster's (x, z) before the monster's per-frame update (brain move plus `tick`).
  After it, if the monster is not airborne, set the position to `slideAlongShore(style, prev, now, bodyRadius)`.
  This covers walking, dashing and any knockback in one place. Find the actual call sites; `updateMonster` and
  `m.tick` are the likely ones.
- **Leap:** the target from `leapTarget` (both call sites) passes through `landingSpot` before `startLeap`.

- [ ] **Step 1: Failing tests** (`shore.test.ts`, with TOKYO):
  - `blockedAt` is false at the origin and true 300 m into the bay;
  - `slideAlongShore` from land into the bay keeps a land point;
  - moving diagonally into a straight stretch of the stepped coast slides, with non-zero progress along the coast;
  - `landingSpot` toward a point in the bay returns the last unblocked point on the line, within 20 m of the shore;
  - `landingSpot` across a narrow water inlet to land on the far side returns the far point unchanged;
  - river points are never blocked;
  - **sweep:** from 50 seeded land points within 600 m of the coast, take 200 steps of 60 m toward random targets in
    the bay through `slideAlongShore`. No step ever ends blocked.

  In `src/monster/Monster.test.ts` or a new GameScene-free test: a dash's per-frame positions, passed through
  `slideAlongShore`, stop at the wall.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement and wire.**
- [ ] **Step 4:** tsc and the full suite green.
  - **Smoke:** Playwright on :5173. `startFromTitle(); playSelected(); skipIntro()`, then put the monster at
    (−1300, 0, −1300) and order it to walk to (−2500, 0, −2500) (`g.order = { kind: 'move', to: {x, z} }`, or the
    equivalent API in `src/monster/brain.ts`). After 8 s its cell is not bay. No console errors.
- [ ] **Step 5: Commit** "The monster can't enter the bay: it slides along the shore, dashes stop at it, leaps land on
  the last land".

---

### Task 3: Port district, container facade, quay pads, cranes, island buildings

**Files:**
- Modify: `src/cities/types.ts` (`DistrictId 'port'`; `FACADE.container` = 4; `FACADE_COUNT` = 5),
  `src/cities/tokyo/districts.ts`, `src/cities/tokyo/layout.ts` (or `index.ts`: port and island district
  assignment), `src/world/chunks.ts`, `src/world/City.ts`, `src/world/pixelTextures.ts`, `src/config.ts`
  (`maxCranes`)
- Test: `src/world/chunks.test.ts`, `src/world/City.test.ts`, `src/world/pixelTextures.test.ts`

**Rules:**
- **District assignment:** `districtAt` returns `'port'` for land cells within 600 m of the coastline (distance
  `offset + amp·sin(...) − dot(c, dir)` between 0 and 600), excluding the island and the crash site.
  - Island cells: office, except one park block at the island's centre cell.
  - Island heights: 40–110 m (`DistrictRules` for an `'island'` usage). Simplest: island cells use `'office'` with a
    special height override, or add a tiny `islandRules` on the style. Pick the simpler one and document it.
- **Port rules:**
  - **Lots:** 2 × 2 lots; fill 0.7; footprint 30 × 12 m (w × d, randomly rotated 0 or 90° by swapping w and d).
  - **Container stacks** (70%): height `2.6 × (2 + floor(rng·3))`, colour from the container palette, facade
    `FACADE.container`.
  - **Warehouses** (30%): one per lot, footprint 0.9 of the lot, 12–22 m, pale grey or cream, office facade.
  - **Signs and billboards:** none.
  - **Trees:** none.
- **Quay pads:** every port cell gets a full-cell pad in the quay colour (0xb9b2a4) through the park-pad mesh
  (per-instance colour).
- **Cranes:**
  - `ChunkContent.cranes: { x: number; z: number; yaw: number }[]`, on land cells bordering a bay cell.
  - One crane every 2–3 cells along the coast, chosen by `hash2` on the cell so it's deterministic.
  - Placed on the cell's water-side edge, inside the land cell, with the jib pointing over the water (`yaw` from the
    edge normal).
- **Facade atlas:** add a 5th cell, "container": vertical ribs (alternating light and dark 1 px columns) and a top and
  bottom rail. Update `FACADE_COUNT`, the atlas width and `patchFacadeShader` (via `FACADE_COUNT`).
- **City:** a crane instanced mesh, one draw call.
  - **Geometry:** a portal crane about 70 m tall: two leg frames, a top girder and a jib about 50 m reaching over the
    water.
  - **Look:** red and white bands, vertex coloured.
  - **Pooling:** like trees.
  - **Interaction:** not targetable or destructible; the monster walks through it.

- [ ] **Step 1: Failing tests:**
  - port cells exist along the coast;
  - container stacks have container colours, `facade === FACADE.container` and heights in container multiples;
  - no signs or trees in port cells;
  - cranes stand only on land cells with a bay neighbour, and none inland;
  - crane, pad and building pools fit a full load at three coast positions;
  - island cells have buildings, but no segments and no signs;
  - the facade atlas cell count is 5 (test `FACADE_COUNT` and the shader patch divisor).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** tsc and the full suite green. Smoke screenshot at the waterfront: `spike-street.mjs port -1100 -900 3.93`
  (yaw toward the bay), from the scratchpad.
- [ ] **Step 5: Commit** "Harbour district: container stacks, warehouses, quay paving and gantry cranes; island
  buildings".

---

### Task 4: Sea wall and foam

**Files:** Modify `src/world/chunks.ts`, `src/world/City.ts`, `src/config.ts` (`maxSeaWall`, `maxFoam`). Test
`src/world/chunks.test.ts`, `src/world/City.test.ts`.

**Rules:**
- **Wall data:** `ChunkContent.seaWall: { x: number; z: number; axis: 'x' | 'z'; side: 1 | -1 }[]`, one per land-cell
  edge that borders a bay cell, emitted by the chunk that owns the land cell. `side` is the direction from the land
  cell to the bay.
- **Sea wall:** instanced boxes 200 × 10 × 6 m, placed on the land side of the edge (inset 3 m), concrete colour
  0xcfcac0, with a darker top cap.
- **Foam:** instanced flat quads 200 × 12 m on the water side of each wall edge, at y 0.15, white.
  - The material is transparent, and its opacity pulses `0.35 + 0.2·sin(time·1.3 + phase)`.
  - The phase comes from the instance position, through a tiny shader patch or per-instance colour alpha. Choose the
    simpler; one draw call.
- **Layering:** the polygon-offset layering keeps the foam above the water.

- [ ] **Step 1: Failing tests:**
  - every land/bay edge in a 6 km stretch has exactly one wall entry, and no wall exists where both sides are land or
    on river edges;
  - walls stay on the land side;
  - pools fit a full load along the coast;
  - City: wall and foam mesh counts are non-zero near the coast and zero inland, and stay equal after `reset` twice
    and after streaming 30 km away and back.
- [ ] **Step 2–4:** FAIL, implement, green. Smoke screenshot of the sea wall from the gameplay camera.
- [ ] **Step 5: Commit** "Sea wall along the bay with pulsing foam".

---

### Task 5: Rainbow Bridge (a long landmark)

**Files:**
- Create: `src/cities/tokyo/rainbowBridge.ts`
- Modify: `src/cities/types.ts` (`LandmarkSpec.span?`), `src/cities/tokyo/index.ts`, `src/world/chunks.ts`
  (ownership by the `from` point's chunk; the "inside one block" rule is skipped for span landmarks),
  `src/world/City.ts` (distance-to-segment targeting, oriented picking, collapse along the span and a splash request
  hook)
- Test: `src/cities/tokyo/tokyo.test.ts`, `src/world/City.test.ts`, `src/world/chunks.test.ts`

**Interfaces:**
```ts
// LandmarkSpec gains:
span?: { from: { x: number; z: number }; to: { x: number; z: number }; halfWidth: number };
// City gains:
onSplash: (p: THREE.Vector3, size: number) => void = () => {}; // called along the span when a span landmark collapses
```

**Geometry:**
- **Built in the bridge's own frame:** the deck runs along local +Z from the shore anchorage at local z = 0 to the
  island end at local z = length. The mesh is rotated to the span's bearing.
- **Towers:** two white towers about 160 m (two legs and three cross beams each), at 30% and 70% of the length.
- **Deck:** 50 m above the water, 30 m wide, with a darker roadway.
- **Cables:** main cables as chains of thin boxes along catenaries from the anchorages over the tower tops.
- **Anchorages:** concrete blocks at both ends.

**Behaviour:**
- **Damage:** for span landmarks, `forEachStandingInRadius(p, r)` includes the bridge when the distance from `p` to the
  segment `from → to` is `≤ r + halfWidth`.
- **Picking:** `pickBuilding` intersects a ray with an oriented box along the span (from 0 to deck height + 10 m).
- **Collapse:** the deck and towers tilt and sink as one mesh (existing collapse). On collapse start, `onSplash` is
  called every 80 m along the span.
- **Ownership:** the chunk containing `from`.
- **Crash blast:** exempt (it is a landmark).

- [ ] **Step 1: Failing tests:**
  - the bridge exists in `TOKYO.landmarks` with its span, and both anchorages are on land cells (shore and island);
  - it is owned by exactly one chunk;
  - `forEachStandingInRadius` from a shore point 40 m off its line with r = 60 hits it, and from 400 m off the line
    misses;
  - a ray aimed down at mid-deck picks it;
  - destroying it calls `onSplash` more than 8 times along the span and leaves it destroyed after streaming out and
    back;
  - the crash blast leaves it standing;
  - the geometry's height is about 160 m, with the deck at about 50 m.
- [ ] **Step 2–4:** FAIL, implement, green. Smoke screenshot from the shore near (−1500, 0, −800), facing the bridge.
- [ ] **Step 5: Commit** "Rainbow Bridge: a long destructible landmark to the island, collapsing into the bay".

---

### Task 6: Splashes

**Files:** Modify `src/systems/Particles.ts` (the `splash` preset) and `src/GameScene.ts` (`splashIfWater` and its
hooks). Test `src/systems/Particles.test.ts` and a pure helper test.

**Behaviour:**
- **Preset:** `splash`, white 0xf4f8fb, short life (0.9 s), fast upward speed, gravity pulling it back down, sizes
  18 → 6.
- **Helper:** `splashIfWater(p: Vec3, size = 1)` checks `isWater` on `p`'s cell. If it is water, it emits `splash`
  particles (count scaled by size, capped) plus `particles.ring('splash', ...)`.
  - Expose it through a small pure helper `waterSplashPoints(style, points)`, or test it through a stub particles
    object.
- **Hooks:**
  - `city.onSplash` (the bridge collapse);
  - `city.onCollapseStart`, when the building's footprint touches water;
  - projectile and shell impacts at ground level;
  - downed aircraft impacts, if they currently explode at ground level (find the hook; if they explode in the air,
    skip and note it);
  - monster footfalls (`onFootLand`) in river cells.
- **Budget:** at most 40 splash particles per frame (a per-frame counter in `splashIfWater`, reset each frame).

- [ ] **Step 1: Failing tests:**
  - `splashIfWater` emits for a water point and not for a land point;
  - the per-frame cap holds when called 100 times in one frame.
- [ ] **Step 2–4:** FAIL, implement, green. Smoke: destroy the bridge from the shore and screenshot the splashes.
- [ ] **Step 5: Commit** "Splashes: spray and ripples where things hit water; spray when wading the river".

---

### Task 7: Verification, intro-dive coast, performance

**Files:** tuning only (`src/cities/tokyo/index.ts` bay `offset`; colours and sizes in the 5c files; `src/config.ts`).

- [ ] **Step 1: Screenshots** (desktop and phone):
  - the intro dive at t 6.0, 6.6 and 7.2 (`SLOW=1 node intro-sheet.mjs 5173 bay 6.0 6.6 7.2`);
  - play start;
  - the waterfront: `spike-street.mjs bay-front -1100 -900 3.93`;
  - the bridge: `spike-street.mjs bay-bridge -1400 -700 3.93`;
  - a splash.
  - **Check:** the bay is visible in the dive; the sea wall reads; cranes over the water; container colours; the
    island across the water; the bridge white and prominent; foam pulses; no z-fighting.
- [ ] **Step 2: Coast offset.** If the bay isn't visible during the dive, lower `bay.offset` (between 1600 and 2000).
  Re-check the anchorage-on-land and the island tests, adjusting the island centre and anchorage along `dir` by the
  same amount if needed, and re-run the full suite.
- [ ] **Step 3: Performance soak** against the post-5a numbers (`perf-soak-5a.json` if present in the scratchpad,
  otherwise run the soak on `main` first).
  - **Acceptance:** no growth across cycles; CPU frame time within 15% of post-5a.
  - **If not:** reduce the crane count and foam size, and record it.
- [ ] **Step 4: Commit** "Tokyo Bay: tuning from screenshots and the perf soak". The report lists every check with
  its screenshot path, the perf table, and every tuned value.

---

## Self-review

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | Coast, river mouth, island | 1 |
  | Roads and spawns kept on land | 1 |
  | Collision | 2 |
  | Rainbow Bridge | 5 |
  | Harbour | 3 |
  | Sea wall and foam | 4 |
  | Splashes | 6 |
  | Intro dive and performance | 7 |
  | Out-of-scope items | none built |

- **Type consistency:**
  - `isBay`, `isIsland` and `isRiver` are used by Tasks 2–4 and 6.
  - `ChunkContent.cranes` and `seaWall` (Tasks 3 and 4) are consumed by City.
  - `LandmarkSpec.span` and `City.onSplash` (Task 5) are hooked in Task 6.
  - `FACADE.container` and `FACADE_COUNT` = 5 (Task 3).
- **Review Focus:**
  1. Task 2 sweep.
  2. Task 1 island tests.
  3. Task 5 reach tests.
  4. Tasks 3 and 4 pool tests.
  5. Task 6 cap test.
