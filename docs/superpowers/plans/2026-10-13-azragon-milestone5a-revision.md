# Milestone 5a Revision: Tokyo Recognizable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the starting city read as Tokyo instantly: land the approved look test (Tokyo Tower, Skytree, the
staged opening, palette, bold signs, fewer billboards), and replace the repeating road texture with a real road
network on the 200 m lattice (avenues, removed streets, a winding river with bridges), with ground units routing
over it.

**Architecture:**

- **Look:** port the approved look test (branch `tokyo-look-spike`, commit 4fbb506) onto `milestone5a`, with tests.
- **Road network:** `src/world/roads.ts` becomes a pure, seeded road network.
  - It decides which lattice segments exist (and their width class), where the river's water cells are, the
    nearest road point, and A* routes.
  - The river and removal rules come from the city style.
- **Generation and rendering:** `generateChunk` emits each chunk's segments, intersections and water cells.
  `City` draws them as three instanced meshes over a plain paved ground.
- **Enemies:** they reach the network through `WorldContext.roads`.

**Tech Stack:** Three.js 0.170, TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`), Vitest
(environment `node`, no DOM), Vite.

**Spec:** `docs/superpowers/specs/2026-10-13-azragon-milestone5a-revision-design.md`, which revises
`docs/superpowers/specs/2026-10-13-azragon-milestone5a-design.md`.

## Global Constraints

- North is +Z; facing north, east is −X and west is +X.
- **Lattice:** nodes at every multiple of 200 m (`CONFIG.world.blockSize`) on both axes; cell (block) `(i, j)`
  spans x `[200i, 200i+200]`, z `[200j, 200j+200]`.
- **Avenues and streets:**
  - Avenues are the lattice lines with index divisible by 5 (x or z a multiple of 1000): width 56 m, never removed.
  - Streets: width 36 m (`CONFIG.world.roadWidth`).
- **Removal fractions:** residential 0.30, office 0.30, neon 0.15, high-rise 0.15, park 0.50.
- **Never removed:**
  - segments with a midpoint within `clearRadius + blockSize` of the origin;
  - the four segments at the Shibuya node (200, 1000);
  - any segment whose removal could leave a land node with no segments (enforced by the removable-parity rule in
    Task 2).
- **River:**
  - Centreline `z = 1300 + 180·sin(x / 900)`; a cell is water if its centre is within 130 m of it (vertical
    distance).
  - A segment with water on both sides exists only if it is a north–south (z-axis) avenue segment, which makes it a
    bridge.
  - Segments with water on one side stay (bank roads).
- **Opening view positions:**

  | Feature | Position |
  |---|---|
  | Tokyo Tower | (−300, 1500), 130 × 130 × 494 (1.3 × life) |
  | Skytree | (−1900, 3100), 90 × 90 × 600 |
  | Metropolitan Government Building | (1300, 2900): moved from 1100 so its 150 m width clears the avenue at x = 1000 |
  | Shibuya Crossing | (200, 1000) |

  None is on water or straddles a road.
- **Crash blast:** never topples landmarks or `BuildingSpec.keep` lots; `CONFIG.intro.impact.outer` is 1.3.
- **Fog:** `CONFIG.fog` near 2200, far 4700 (`loadRadius` 4800 must exceed far).
- **Billboards:** at most one per chunk, only on a building within the chunk's central 400 × 400 m; chance per
  eligible building is `rules.billboard` (neon 0.15, office 0.05, high-rise 0.1, residential 0).
- **Draw calls:** roads 1, intersections 1, water 1 (in addition to the 5a budget).
- **Commits:** branch `milestone5a`. Each commit's trailer names the model that actually wrote it. Never push,
  deploy or merge.

## Review Focus

1. **Ground units and water:** a tank routing from south of the river to north of it drives on a bridge, never on
   water. Tested in Task 3.
2. **Spawns on removed streets:** units must spawn on an existing segment, not on a removed strip or in water.
   Tested in Task 3.
3. **Landmarks and special lots:** none on water or straddling a road (the river curve moved). Tested in Task 2.
4. **Pool exhaustion:** roads, intersections and water must fit their pools across a full load. Tested in Task 4.
5. **The opening view:** Tokyo Tower projects inside the starting camera's frame. Tested in Task 1.

---

## File structure

| File | Responsibility |
|---|---|
| `src/cities/tokyo/towers.ts` (from the look test) | Tokyo Tower and Skytree geometry |
| `src/cities/tokyo/{layout,districts,shibuya,index}.ts` (modify) | Opening positions, palette, signs, landmarks, river and removal rules |
| `src/cities/types.ts` (modify) | `DistrictId` adds `'water'` (unused by `districtAt` after Task 4; see the note there); `SignDef.cell`; `BuildingSpec.keep`; `CityStyle.river`, `CityStyle.roadRemoval`, `CityStyle.keepNodes` |
| `src/world/roads.ts` (rewrite) | The pure road network: `segmentAt`, `isWater`, `nearestRoadPoint`, `planRoadPath`, `ringOnRoads` |
| `src/world/chunks.ts` (modify) | Chunk segments, intersections and water cells; lots clear the road widths; lanes and trees in removed strips; billboard rule |
| `src/world/pixelTextures.ts` (modify) | Sign atlas (from the look test); `roadTexture`; paved ground without roads |
| `src/world/City.ts` (modify) | Road, intersection and water instanced meshes; paved ground; blast exemptions; sign atlas |
| `src/enemies/types.ts`, `TankFleet.ts`, `LaserTrucks.ts`, `SamSilos.ts`, `src/GameScene.ts` (modify) | `WorldContext.roads` |

---

### Task 1: Land the look test (towers, opening layout, palette, signs, blast exemptions), with tests

**Files:**
- Modify: everything in look-test commit 4fbb506: `src/cities/tokyo/{towers,layout,districts,shibuya,index}.ts`,
  `src/cities/types.ts`, `src/config.ts`, `src/world/{City,chunks,pixelTextures}.ts`.
- Tests: `src/cities/tokyo/tokyo.test.ts`, `src/cities/tokyo/layout.test.ts`, `src/world/chunks.test.ts`,
  `src/world/City.test.ts`.

**Interfaces:**
- Produces:
  - `TOKYO_TOWER`, `tokyoTowerGeometry()`, `SKYTREE`, `skytreeGeometry()` (`towers.ts`)
  - `TOKYO_TOWER_SITE`, `SKYTREE_SITE` (`layout.ts`)
  - `SignDef.cell?: number`
  - `BuildingSpec.keep?: boolean`
  - `SIGN_RECTS`, `signAtlas()` (`pixelTextures.ts`)
  - blast exemptions in `City.blast`

- [ ] **Step 1: Bring the look test over.**
  - Run `git cherry-pick 4fbb506`, then amend nothing yet.
  - The commit includes a temporary water hack: `'water'` district, `RIVER` constant, `ParkSpec.water`, park mesh
    instance colours. **Remove that hack in this task:**
    - delete the `water` region from `CORE_REGIONS` and the `RIVER` export;
    - drop `ParkSpec.water` and the water branch in `generateChunk`;
    - in `City.loadChunk`, restore park pads to plain park colour (keep the per-instance colour mechanism; Task 4
      reuses it);
    - remove the `'water'` key from `TOKYO_DISTRICTS` and `DISTRICTS`, and the `'water'` member of `DistrictId`.
  - The river is rebuilt properly in Tasks 2 and 4.
- [ ] **Step 2: Fewer billboards.**
  - **Rates:** set the `billboard` rates in `src/cities/tokyo/districts.ts`: high-rise 0.1, neon 0.15, office 0.05,
    residential 0.
  - **Placement:** in `generateChunk`, allow at most one billboard per chunk, only on a building whose centre is
    inside the chunk's central 400 × 400 m square.
    - Implementation: `makeSigns` receives `allowBillboard: boolean`. `generateChunk` passes `true` only while no
      billboard has been placed yet in this chunk and the lot centre is inside the central square, and it sets a
      flag once a billboard is emitted.
    - Shibuya special lots never carry billboards.
- [ ] **Step 2b: Clear the avenue lines.**
  - Set `TMG_SITE` to (1300, 2900); `SHINJUKU` stays (1100, 2900) inside the high-rise region.
  - **Shibuya corner offsets:** the crossing node (200, 1000) sits on the avenue line z = 1000 (56 m wide) and on the
    street line x = 200 (36 m). Use separate offsets: `OFF_X = 36/2 + 6 + SIZE/2` and `OFF_Z = 56/2 + 6 + SIZE/2`.
    Hardcode the widths with a comment pointing at Task 2's `lineWidth`.
- [ ] **Step 3: Write the failing and updated tests.**
  - **`layout.test.ts`:** update the positions to the new constants: crossing (200, 1000) north-west and on an
    intersection; Shinjuku (1100, 2900) and the Metropolitan Government Building (1300, 2900) in high-rise; the park assertion
    becomes `districtAt(-500, 1500)` is `'park'` (Shiba Park). Remove any `'water'` expectation.
  - **`tokyo.test.ts`:**
    - Tokyo Tower geometry: `bbox.min.y ≈ 0`, `max.y ≈ 494`, width ≤ 130.
    - Skytree: `max.y ≈ 600`.
    - Each landmark fits inside one block.
    - All three landmarks are in `TOKYO.landmarks`.
    - The Shibuya lots have `keep: true`.
  - **`City.test.ts`:**
    - **(a)** After `city.blast({x:0,z:0}, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer)`, every
      landmark target and every Shibuya corner building is still alive. Find them via `forEachStandingInRadius` at
      their positions.
    - **(b) The opening view.** Build the gameplay camera with `gameplayPose()` from `src/intro/timeline.ts`:
      - a `THREE.PerspectiveCamera` with fov `CONFIG.camera.baseVFovDeg`, aspect 16/10, `position.copy(pose.pos)`,
        `lookAt(pose.look)`, `updateMatrixWorld()`;
      - project Tokyo Tower's point at half its height;
      - expect |x| < 0.9 and |y| < 0.9 in NDC, and z < 1.
  - **`chunks.test.ts`:**
    - **(c)** Across all chunks within 4 km of the origin, each chunk has at most one sign of kind `'billboard'`,
      and every billboard's building centre lies within 200 m (on both axes) of its chunk's centre.
    - **(d)** Every vertical sign has a `cell` in 0–2; every billboard has a `cell` in 3–5.
    - Update the existing Shibuya and topple test values to the new positions and sizes. The topple bound is now
      `outer = 1.3 × CRATER_RADIUS`, and `keep` lots are exempt from it. Replace the "beyond the topple radius"
      assertion with "has `keep: true`".
- [ ] **Step 4: Run, see the new tests fail where expected, fix, run green.**
  - Run `npx vitest run src/cities src/world` and then the full `npx vitest run`.
  - `npx tsc --noEmit` must be clean (the look test left `layout.test.ts` type errors; fix them).
- [ ] **Step 5: Commit**
  - Message: "Tokyo look: Tokyo Tower and Skytree in the opening view, brighter palette, bold glyph signs and rare
    billboards, landmarks and Shibuya ride out the crash". Squash the cherry-pick and fixes into this one commit
    (`git reset --soft` back to the pre-task HEAD, then commit).

---

### Task 2: The road network (pure)

**Files:**
- Rewrite: `src/world/roads.ts`
- Modify: `src/cities/types.ts` (style fields), `src/cities/tokyo/index.ts`
- Test: `src/world/roads.test.ts` (rewrite)

**Interfaces:**
- Produces, in `src/cities/types.ts`:
  ```ts
  /** A winding river: centreline z = z0 + amp · sin(x / wavelength); cells within halfWidth (vertical) are water. */
  export type RiverSpec = { z0: number; amp: number; wavelength: number; halfWidth: number };
  // CityStyle gains:
  river?: RiverSpec;
  /** Fraction of removable street segments removed, by the district at the segment's midpoint. */
  roadRemoval: Readonly<Record<DistrictId, number>>;
  /** Lattice nodes (world x, z) whose four segments always exist (e.g. the Shibuya Crossing). */
  keepNodes: readonly { x: number; z: number }[];
  ```
  TOKYO sets:
  - `river: { z0: 1300, amp: 180, wavelength: 900, halfWidth: 130 }`
  - `roadRemoval: { highrise: 0.15, neon: 0.15, office: 0.3, residential: 0.3, park: 0.5 }`
  - `keepNodes: [SHIBUYA_CROSSING]`
- Produces, in `src/world/roads.ts`:
  ```ts
  export const PITCH = 200; // CONFIG.world.blockSize
  export const AVENUE_EVERY = 5;
  export const AVENUE_WIDTH = 56;
  export type Axis = 'x' | 'z';
  /** 'x': from node (i, j) to (i+1, j) along z = 200j. 'z': from node (i, j) to (i, j+1) along x = 200i. */
  export type Segment = { axis: Axis; i: number; j: number; avenue: boolean; width: number; bridge: boolean };
  export function isWater(style: CityStyle, ci: number, cj: number): boolean;
  export function segmentAt(style: CityStyle, axis: Axis, i: number, j: number): Segment | null;
  export function lineWidth(index: number): number; // AVENUE_WIDTH if index % 5 === 0 else CONFIG.world.roadWidth
  ```

**Rules (exact):**

1. **Cells either side of a segment:**
   - `'x'` segment (i, j) lies between cells (i, j−1) and (i, j).
   - `'z'` segment (i, j) lies between cells (i−1, j) and (i, j).
2. **Avenue:** an `'x'` segment is an avenue iff `j % 5 === 0`; a `'z'` segment iff `i % 5 === 0` (use
   `((n % 5) + 5) % 5` for negatives).
3. **Water:** `isWater(ci, cj)` is true iff `style.river` exists and
   `|zc − (z0 + amp·sin(xc / wavelength))| < halfWidth`, where (xc, zc) is the cell centre.
4. **Both sides water:** the segment exists iff it is an avenue on the `'z'` axis, with `bridge: true`.
5. **Exactly one side water:** the segment exists (a bank road), `bridge: false`.
6. **Both sides land:** the segment exists if any of these holds:
   - it is an avenue;
   - its midpoint is within `clearRadius + PITCH` of the origin;
   - it touches a `keepNodes` node;
   - it is not *removable*.

   **Removable** means:
   - `'x'` with `j` odd, or `'z'` with `i` odd and `j` even. This parity rule guarantees every land node keeps at
     least one segment.

   Otherwise it is removed when `hash2(i * 2 + (axis === 'x' ? 0 : 1), j, seed) < roadRemoval[district]`, where
   `district = style.districtAt(midpoint)` and `seed = CONFIG.world.seed + 907`.
7. **Width:** `lineWidth` of the segment's line index.

- [ ] **Step 1: Write the failing tests** in `src/world/roads.test.ts`, replacing the old file. Test with `TOKYO`:
  - **Deterministic:** the same arguments give equal results.
  - **Avenues:** every `'x'` segment with `j % 5 === 0` and every `'z'` segment with `i % 5 === 0` over i, j in
    [−30, 30] exists, unless both sides are water and it is not a `'z'` avenue.
  - **Land nodes:** for nodes (i, j) in [−30, 30]² with at least one land cell around them, at least one of the four
    incident segments exists.
  - **Crash site:** every segment with a midpoint within `clearRadius + 200` exists.
  - **Shibuya:** the four segments at node (1, 5), i.e. (200, 1000), exist.
  - **Removal fractions:** over i, j in [−60, 60], restricted to removable land-land segments outside the forced set,
    the removed fraction per district is within ±0.05 of `roadRemoval[district]`. Skip districts with fewer than 200
    samples.
  - **River:** for x-cells ci in [−20, 20], at least one cell in that column is water.
    - Every segment with water on both sides is a `'z'` avenue bridge.
    - For each `'z'` avenue line i (i % 5 === 0) in [−20, 20], the cells' water column is crossed by a contiguous run
      of bridge segments, so a route across exists.
  - **Landmarks and special lots:** for every `TOKYO.landmarks` and `TOKYO.specialLots` entry, `isWater` of its cell
    is false, and its footprint stays inside its cell inset by half the `lineWidth` of each bordering line.
- [ ] **Step 2: Run, expect FAIL** (the new exports are missing).
- [ ] **Step 3: Implement** `roads.ts` (pure; imports `CONFIG`, `hash2` from `src/cities/noise`, and the
  `CityStyle` type) and the style fields. Keep the old `snapToRoad`, `planRoadPath` and `ringOnRoads` exports for
  now; Task 3 replaces them.
- [ ] **Step 4: Run, expect PASS.** Run `npx tsc --noEmit` and the full `npx vitest run`.
- [ ] **Step 5: Commit** "Roads: a seeded road network on the lattice — avenues, removed streets, a winding river
  with avenue bridges".

---

### Task 3: Routes and spawns over the network

**Files:**
- Modify: `src/world/roads.ts`, `src/enemies/types.ts`, `src/enemies/TankFleet.ts`, `src/enemies/LaserTrucks.ts`,
  `src/enemies/SamSilos.ts`, `src/GameScene.ts`
- Test: `src/world/roads.test.ts` (extend), the existing enemy tests (keep passing)

**Interfaces:**
- Produces in `roads.ts` (replacing the old grid helpers; delete `snapToRoad`, the old `planRoadPath` and the old
  `ringOnRoads`):
  ```ts
  /** Closest point on any existing segment's centreline to p, searching outward up to maxR (default 3000). */
  export function nearestRoadPoint(style: CityStyle, p: Vec2, maxR?: number): Vec2;
  /**
   * Waypoints from `start` to the road point nearest `goal`, over existing segments (A*, Manhattan heuristic,
   * at most maxNodes expansions, default 4000). Excludes the start; ends at the goal's road point. Empty if
   * start and goal snap to the same point. If no route is found within budget: [nearestRoadPoint(goal)].
   */
  export function planRoadPath(style: CityStyle, start: Vec2, goal: Vec2, maxNodes?: number): Vec2[];
  /** n points about r from center, each moved to its nearest road point. */
  export function ringOnRoads(style: CityStyle, center: Vec2, n: number, r: number): Vec2[];
  ```
- In `WorldContext`:
  ```ts
  readonly roads: { nearest(p: Vec2): Vec2; path(from: Vec2, to: Vec2): Vec2[] };
  ```
  GameScene wires these to `this.city.style`. Test contexts that build a `WorldContext` literal must add a `roads`
  stub (`{ nearest: (p) => p, path: (_a, b) => [b] }`).

**Behaviour:**

- **Routing:** `planRoadPath` snaps the start to its segment (the nodes at both ends are A* entry points, with cost
  equal to the distance along the segment). It snaps the goal to its segment (both end nodes are exits; the final
  waypoint is the goal's road point). Neighbours are nodes joined by existing segments, with cost 200.
- **Units:**
  - **Tanks** spawn at `ctx.roads.nearest(ring point)`; routes use `ctx.roads.path(here, goal)`.
  - **Laser trucks** behave the same way.
  - **SAM silos** spawn at `ctx.roads.nearest(point)`.
  - **The opening ring** uses `ringOnRoads(this.city.style, …)`.

- [ ] **Step 1: Write the failing tests** (`roads.test.ts`, with `TOKYO`):
  - `nearestRoadPoint` returns a point on an existing segment's centreline (within 1e-6 of the line, and between its
    ends).
  - For random points in a 6 km square (seeded), the returned point is never inside a water cell unless it is on a
    bridge segment.
  - `planRoadPath` from (0, 400) to (0, 2400) (south to north of the river):
    - consecutive waypoints are axis-aligned and each leg lies along existing segments;
    - every waypoint inside a water cell lies on a bridge (a `'z'` avenue line, x % 1000 === 0);
    - the route ends at `nearestRoadPoint(goal)`.
  - Start equal to goal gives `[]`.
  - With `maxNodes` 5 and a far goal, the result is `[nearestRoadPoint(style, goal)]`.
  - `ringOnRoads` returns n points, each on an existing segment.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `nearestRoadPoint` (scan the cells around p in growing rings, check their 4 bordering
  segments, keep the best) and `planRoadPath` (A* over node keys `i,j` with a binary-heap or simple array open set;
  the expansion budget bounds the cost). Then switch the enemy call sites and GameScene to `ctx.roads` and the new
  `ringOnRoads`, and remove the `ROAD_ORIGIN`/`snapToRoad` imports.
- [ ] **Step 4: Run** `npx vitest run src/world src/enemies`, `npx tsc --noEmit`, and the full suite: all green.
- [ ] **Step 5: Commit** "Ground units route over the road network (A*), spawn on real roads, and cross the river
  only on bridges".

---

### Task 4: Generate and draw the road network, water and lanes

**Files:**
- Modify: `src/world/chunks.ts`, `src/world/City.ts`, `src/world/pixelTextures.ts`, `src/config.ts`
- Test: `src/world/chunks.test.ts`, `src/world/City.test.ts`

**Interfaces:**
- `ChunkContent` gains:
  - `roads: Segment[]`: segments whose start node (i, j) lies in this chunk; nodes `i ∈ [4cx, 4cx+3]`,
    `j ∈ [4cz, 4cz+3]`, both axes.
  - `nodes: { x: number; z: number; size: number }[]`: intersections in this chunk with at least one incident
    segment; `size` is the largest incident width.
  - `water: { x: number; z: number }[]`: water cell centres in this chunk.
- `CityTextures` gains `road(): THREE.Texture`.
- New config:
  - `world.maxRoads` = ceil(32 × `maxLoadedChunks`) rounded up to 6000;
  - `world.maxNodes` 3000;
  - `world.maxWater` 800.

**Generation rules:**

- **Water cells:** no buildings, trees, parks or landmarks.
- **Lots** sit inside the cell inset by half the `lineWidth` of each of its four bordering lines, whether or not
  the segment exists. Removed-street strips stay unbuilt.
- **Removed strips:**
  - **Residential and park cells:** each removed segment between two land cells plants 3 trees along its centreline,
    from the chunk that owns the segment.
  - **Parks:** pads cover the full 200 m cell, so merged parks read as one green space.

**Rendering (`City`):**

- **Ground:** `textures.ground(style)` becomes plain pavement: the same function without the road lines and
  crosswalks.
- **Road texture:** `roadTexture()` is 8 × 64 px: asphalt, white edge lines, a dashed centre line, and crosswalk
  stripes in the last 6 px at each end.
- **Three instanced meshes:**
  - **Roads:** a `PlaneGeometry(1, 1)` rotated flat, `toonMat(0xffffff, { map: roadTexture })`, y 0.3. Scale
    (width, 1, 200) for `'z'` segments; rotate 90° about Y for `'x'`. Bridges sit at y 2.5.
  - **Intersections:** a plain asphalt square at y 0.32, scaled to `size`. Each bridge segment also gets a slab
    (width + 8) × 200 in grey at y 2.0, as the deck edge; slabs come from the same pool.
  - **Water:** full 200 m cell quads, colour 0x3f8fc9, y 0.1.
- **Pools and lifetime:** roads, intersections and water allocate and release with their chunk, like trees and parks.
  The Shibuya scramble overlay stays above its intersection (y 0.35).

- [ ] **Step 1: Write the failing tests.**
  - **`chunks.test.ts`:**
    - each chunk's `roads` are exactly the existing segments with start nodes in the chunk (compare against
      `segmentAt`);
    - no building, tree or park sits in a water cell;
    - every building footprint clears its cell's bordering line half-widths;
    - removed strips in residential cells carry trees;
    - totals over all loaded chunks fit `maxRoads`, `maxNodes` and `maxWater`.
  - **`City.test.ts`:**
    - after construction, the road mesh `count` > 0 and the water mesh `count` > 0;
    - after `reset(TOKYO)` twice, the counts are unchanged (no leak);
    - after streaming 30 km away and back, the counts return to the same values.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, as above. Delete the old road-line drawing from the ground texture.
- [ ] **Step 4: Run** the full suite and `npx tsc --noEmit`: green.
  - **Smoke check:** load :5173 with Playwright (chromium args `--use-angle=metal --enable-gpu
    --ignore-gpu-blocklist`), `startFromTitle(); playSelected(); skipIntro()`. Expect no console errors.
- [ ] **Step 5: Commit** "City draws the road network: avenues, lanes, a winding river with avenue bridges".

---

### Task 5: Verification, intro-dive approach, performance, tuning

**Files:** tuning only (Tokyo style data, `pixelTextures.ts`, `config.ts`, and the intro dive's approach in
`src/config.ts` `intro` / `src/intro/timeline.ts` if needed).

**Scripts (scratchpad):** `intro-sheet.mjs` (use `SLOW=1`), `spike-street.mjs <name> <x> <z> <yaw>`,
`perf-soak.mjs`, all in `/private/tmp/claude-501/-Users-eric-Developer-azragon/cf6289c6-12f2-45ae-8375-d49490c90a88/scratchpad/`.

- [ ] **Step 1: Screenshots** (desktop 1440 × 900 and phone 390 × 844):
  - play start;
  - the intro dive at t 6.6 and 7.2;
  - Shibuya (`spike-street.mjs shibuya 200 650 0`);
  - the river from the gameplay camera (`river 0 900 0`);
  - a merged-block residential area (`res 2500 -2500 0`).

  Check against the spec:
  - Tokyo Tower prominent;
  - the river mostly water with bridges only every 1 km;
  - uneven blocks;
  - few billboards;
  - signs bold;
  - no road over water except bridges;
  - no z-fighting.
- [ ] **Step 2: Intro dive approach.** If the dive still crosses pale low-rise blocks, change only the dive's
  approach. Two options:
  - rotate `FALL_Q` about Y by an approach heading (new `CONFIG.intro.approachYaw`) so the pod comes in over the
    river from the north-east, and keep the chase framing relative to the travel frame (the cut stays seamless
    because space uses the same local frame);
  - or densify the cells on the dive line.

  Re-run the intro timeline tests (update any that pin the old straight-north travel, keeping their intent).
- [ ] **Step 3: Performance soak** (`perf-soak.mjs`) against `perf-soak-before.json`.
  - **Acceptance:** no growth across cycles, and CPU frame time within 25% of baseline.
  - **If not:** lower `maxBuildings` and the district fills, and record the ruling.
- [ ] **Step 4: Tune** data values until the screenshots read as Tokyo, then run the full suite and `tsc`.
- [ ] **Step 5: Commit** "Tokyo: tuning from screenshots and the perf soak". The report lists every check with its
  screenshot path, the perf table, and every tuned value (before → after).

---

## Self-review

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | Landmarks folded in | 1 |
  | Opening view | 1, 5 |
  | Look and palette | 1 |
  | Billboards rare | 1 |
  | Road network: widths, removal, keeps | 2 |
  | River and bridges | 2, 4 |
  | Rendering | 4 |
  | Ground units | 3 |
  | Monster wades | unchanged; the monster ignores roads and water |
  | Intro dive | 5 |
  | Tests | 1–4 |
  | Performance | 5 |

- **Type consistency:** `Segment` and `segmentAt` (Task 2) are used in Tasks 3 and 4. `WorldContext.roads`
  (Task 3) is wired in GameScene. `ChunkContent.roads`, `nodes` and `water` (Task 4) match the City consumers.
  `CityStyle.river`, `roadRemoval` and `keepNodes` (Task 2) are set on TOKYO.
- **Review Focus:**
  1. Task 3, the path test across the river.
  2. Task 3, the `nearestRoadPoint` water test.
  3. Task 2, landmarks and lots not on water.
  4. Task 4, the pool totals.
  5. Task 1, the opening-view projection.
