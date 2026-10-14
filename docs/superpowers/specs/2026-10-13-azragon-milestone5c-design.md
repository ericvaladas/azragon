# AZRAGON — Milestone 5c Design: Tokyo Bay and the Waterfront

Date: 2026-10-13
Status: Approved in conversation; pending written-spec review
Builds on: Milestone 5a (merged to `main`, 0b5388f): the city-style system, Tokyo, the landmark type, the road network on
the 200 m lattice, and the river with avenue bridges.
Split: Milestone 5c is the bay and waterfront (this spec). **5c-2** adds bay life: moored and moving ships you can
wreck from the shore, and patrol boats as a new enemy type.

## Goal

Tokyo gets its bay.

- **Placement:** a coastline to the south-east, about 2 km from the crash, with the river emptying into it.
- **The wall:** a raised sea wall that the monster cannot cross.
- **Rainbow Bridge:** a destructible bridge out to an unreachable Odaiba-style island.
- **Harbour:** cranes, container stacks and warehouses along the shore.
- **Water life:** splashes and foam, so the water feels alive.

## Decisions (from the conversation)

- **Placement:** the bay is south-east, about 2 km from the crash, and the river flows into it.
- **The wall:**
  - The sea wall is a solid edge for all four monsters.
  - Walking into it slides along it.
  - A dash stops at it.
  - A leap aimed over the bay lands on the last land along its line.
- **Rainbow Bridge:**
  - A white suspension bridge from the shore to an Odaiba-style island.
  - The island is scenery and unreachable.
  - The bridge is a destructible landmark, attacked from the shore end.
- **Harbour:** cranes (scenery), container stacks and warehouses (destructible), and quay paving.
- **Splashes:** anything landing in water (bay or river) sprays and ripples. There is foam along the sea wall, and the
  monster wading through the river kicks up spray.
- **Enemies stay on land.** Ships and naval enemies are 5c-2.

## Coordinates and shape

North is +Z; facing north, east is −X and west is +X. The lattice is unchanged (200 m cells, nodes at multiples of
200).

**The coast:** the city style gains a `bay`:

```
bay: { dir: (−√½, −√½), offset: 2000, amp: 150, wavelength: 1400 }
```

- A cell is **bay** iff its centre `c` satisfies `dot(c, dir) > offset + amp · sin(dot(c, perp) / wavelength)`.
- `perp = (−dir.z, dir.x)`, which is the along-coast axis.
- `dir` points south-east, out to sea.

**The river mouth:** the river (`z = 1300 + 180·sin(x/900)`) runs east and meets the coast at x ≈ −4100. River
water and bay water join, so the mouth reads as one body of water.

**The island:**

- **Shape:** the city style gains `island: { center, halfAlong, halfAcross }`. Island cells are those inside a rounded
  rectangle centred at (−2613, −1913): 3200 m out along `dir`, offset −495 m along `perp`, 350 m half-depth along `dir`,
  450 m half-width along `perp`.
- **Bay rule:** island cells are land, never bay.
- **What it holds:** offices and a park (its own small district rule: office heights 40–110, one park block).
- **Roads:** none.

**Water test:** `isWater = isRiver || isBay`. The existing `isWater(style, ci, cj)` keeps its name and meaning
(any water), with `isBay` and `isIsland` added.

**Dive check:** the intro dive comes from the south along x ≈ 0. The `offset` is tuned between 1600 and 2000 in
verification so the bay and the coast are in view during the dive, without changing the camera work.

## Roads, units, spawns

**Road rules** (in `segmentAt`):

- A segment with the **bay** on both sides does not exist; there are no bay bridges.
- A segment touching an **island** cell does not exist.
- Bank segments between land and the bay stay. They form the waterfront drive along the sea wall.
- River rules are unchanged.

**What follows from that:**

- Ground units never enter the bay or the island: routes and spawns use only existing segments.
- `City.blockedAt` already covers water. It must also cover the island, so artillery never spawns there.

## Monster collision

New pure module `src/world/shore.ts`:

- `inBay(style, x, z)`: true if the point's cell is bay.
- `blockedAt(style, x, z, radius)`: true if any of the point and its four compass offsets at `radius` is in the bay.
- `slideAlongShore(style, prev, next, radius)`: returns `next` if not blocked; else `(next.x, prev.z)` if not
  blocked; else `(prev.x, next.z)` if not blocked; else `prev`.
- `landingSpot(style, from, to, radius)`: returns `to` if not blocked; otherwise walks back from `to` toward `from` in
  20 m steps and returns the first unblocked point (or `from`).
- `shoreStep(style, prev, next, radius)`: `slideAlongShore` plus whether the shore changed the move.
- `shoreStopped(prev, next, pos)`: true when the shore held a frame's move dead at `prev`.

**How GameScene uses it** (radius = the monster's body radius, `CONFIG.monster.bodyRadius`):

- **Walking:** after each `moveToward` step, apply `slideAlongShore` from the previous position.
- **Tap to move:** the tapped ground point passes through `landingSpot` (from the monster) at tap time, so a tap on
  the bay walks to the last land on the line back to the monster; the tap marker shows the clamped point. As a safety
  net, a move order is dropped on any frame where `shoreStopped` holds, so the monster never walks on the spot at the
  water's edge.
- **Dash:** each frame of the dash, apply `slideAlongShore`. A dash into the wall stops at it.
- **Leap:** the target from `leapTarget` passes through `landingSpot` before `startLeap`. The leap flies over water;
  only the landing is constrained.
- **Any other code that moves the monster on foot** goes through `slideAlongShore`.
- **The river is never blocking.**

## Rainbow Bridge (a long landmark)

**Shape** (built in code, low-poly):

- two white towers about 160 m tall, with cross beams;
- main cables (thin boxes) drooping between and beyond the towers;
- a road deck about 50 m above the water;
- a concrete shore anchorage and an island anchorage. The span is about 1000 m.

**Placement:** from a shore anchorage at (−1658, −958) (1850 m along `dir`, −495 along `perp`; the wavy coastline there sits at about 1948 m, so the anchorage is on land) to the island's near edge at 2850 m: a span of about 1000 m.

**Long-landmark support:**

- `LandmarkSpec` gains an optional `span: { from; to; halfWidth; deckY; towers? }` (`towers`: metres along the span).
  For a long landmark:
  - **Damage:** `forEachStandingInRadius` and the radius-based damage measure the distance to the segment `from → to`
    (minus `halfWidth`), not to the centre. In practice the monster hits it from the shore end; ranged attacks and the
    leap or Roar shockwave reach further.
  - **Picking:** `pickBuilding` intersects oriented boxes in the span's frame: the deck from the ground to 10 m over
    its top, and each tower (±15 m along) up to the landmark's full height.
  - **Placement:** the "inside one block" rule is replaced by "the anchorages are on land (shore and island)". The
    deck may cross water and roads.
- **Ownership:** owned by the chunk containing its `from` point. It loads and unloads with that chunk, and while
  loaded it is drawn whole (one mesh).

**Destruction:**

- HP and EXP by height, as for any landmark.
- The collapse tilts and drops the deck and cables into the bay, with large splashes along the span: one every 80 m
  over water, each `t` m out queued for `t / length × collapseTime` and fired from `City.update`, so the spray runs
  from the shore end out to the island while the deck falls and the per-frame splash budget reaches the whole span.
- It stays destroyed after streaming out and back.

**Crash blast:** it is exempt from the crash blast (it is a landmark and far away).

## Harbour (port district)

**The district:** new `DistrictId 'port'`. In Tokyo, it is every land cell within 600 m of the coast (distance along
`dir` from the coastline), except the island and the core crash site.

**What's in it:**

- **Container stacks:** destructible buildings.
  - 2 × 2 lots per block, some lots left open as yard.
  - Footprint about 30 × 12 m; height in container multiples (2.6 m × 2–4).
  - Colours from {0xc9402a red, 0x2d6fb5 blue, 0xe88a2a orange, 0x3f9a4f green, 0x2aa3a3 teal}.
  - A new facade atlas cell: **ribbed container sides**.
- **Warehouses:** destructible buildings.
  - Low and wide: 12–22 m tall, most of the lot.
  - Pale grey and cream, with an office-band facade.
- **Ground:** quay paving, a lighter, warmer concrete tint drawn as per-cell pads like parks.
- **Gantry cranes:** scenery.
  - Red-and-white portal cranes about 70 m tall, with a jib reaching over the water, placed along land cells that
    border the bay, every 2–3 cells.
  - One instanced mesh. Indestructible; the monster walks through their legs.
  - The crane positions come from the chunk generator, so they are seeded and stream with chunks.
- **Signs:** none; no billboards.

## Sea wall, foam and splashes

- **Sea wall:**
  - For every land cell edge that borders a bay cell, a concrete wall box: 200 m long, 14 m tall, 8 m thick, just
    outside the waterfront road on the bay side of the edge (the coast road straddles the edge).
  - A pale cap over a dark face that darkens to a wet waterline band, so it reads from the gameplay camera.
  - Corners overlap cleanly.
  - One instanced mesh, pooled per chunk like roads.
- **Foam:**
  - Along each sea-wall edge, a strip of white foam on the water just outside the wall, 12 m wide.
  - Its opacity pulses slowly (shader time uniform), and it is drawn as one instanced mesh.
- **Splashes** (new particle style `splash`): white spray up, plus a flat expanding ring (the existing `ring` helper).
  - `Splasher` (`src/systems/splash.ts`): `at(p, size)` emits a splash when `p` is open water (`openWater`: a water
    cell, and clear of the paved strip — half the edge line's road width plus the 8 m sea wall — along every land
    edge, river banks included); `footprint(x, z, size)` splashes at the first open-water sample of a square
    footprint. At most `SPLASH_PER_FRAME` (40) particles a frame. It is called from:
    - debris and rubble impacts from collapses whose building borders water;
    - projectile and shell misses that land in water;
    - swatted or downed flyers that fall into water;
    - the Rainbow Bridge collapse, along the span;
    - the monster's footfalls while it wades in the river.

## Architecture changes

| File | Change |
|---|---|
| `src/cities/types.ts` | `CityStyle.bay?`, `CityStyle.island?`, `DistrictId 'port'`, `LandmarkSpec.span?` |
| `src/cities/tokyo/` | Bay and island values; port district rules; `rainbowBridge.ts` geometry; island district rule |
| `src/world/roads.ts` | `isBay`, `isIsland`; `isWater` covers both; `segmentAt` bay/island rules |
| `src/world/shore.ts` (new) | `inBay`, `blockedAt`, `slideAlongShore`, `landingSpot`, `shoreStep`, `shoreStopped` |
| `src/world/chunks.ts` | Port lots; crane spots; sea-wall and foam edges; island buildings without roads; quay pads |
| `src/world/City.ts` | Sea-wall, foam and crane instanced meshes; quay pads (reusing the per-instance park pad colour); long-landmark targeting and picking; `blockedAt` covers the island; collapse of the bridge with splashes |
| `src/world/pixelTextures.ts` | The container facade cell (the atlas grows by one cell) |
| `src/systems/Particles.ts` | The `splash` preset, drawn in its own 200-particle layer |
| `src/systems/splash.ts` (new) | `Splasher` (`at`, `footprint`, per-frame budget) and `openWater` |
| `src/GameScene.ts` | Shore collision for walking, dash and leap; tap targets clamped to land; `Splasher` hooks |

**Draw calls added:** main pass: sea wall 1, foam 1, cranes 1, Rainbow Bridge 1 (when in view). Shadow pass: sea
wall 1, cranes 1, Rainbow Bridge 1 (shadow casters; foam casts none). So +5 at play start (bridge out of view) and
+7 with the bridge in view. The splash particle layer adds 1 only while splashes are alive. Quay pads ride the
park-pad mesh.

## Testing

**Unit tests (Vitest):**

- **Coast:**
  - the coastline lies about 2000 m along `dir` (±amp);
  - the cell containing the origin is land;
  - the river and the bay meet: water connects along the river's line beyond x ≈ −4000;
  - every island cell is land and is not bay, and island cells form one connected group;
  - no segment exists with the bay on both sides or touching an island cell.
- **Routes and spawns:**
  - `nearestRoadPoint` never returns a point in the bay or on the island;
  - a route between two land points never passes over bay water.
- **Collision:**
  - walking into the bay from several angles slides along the wall (the final point is unblocked, and progress along
    the wall is above zero);
  - a dash toward the bay stops before the wall;
  - `landingSpot` for a leap over the bay returns the last land along the line;
  - a leap over a narrow inlet to land on the far shore is allowed;
  - the river never blocks.
- **Rainbow Bridge:**
  - its anchorages are on land;
  - it is hit by attacks near the shore end and not by attacks 400 m away from its line;
  - it is picked by a ray at the deck and at a tower top;
  - it collapses, with splashes along the span staggered from the shore out, and a real `Splasher` under its 40-a-frame
    budget still emits over the island half;
  - it stays destroyed after streaming out and back;
  - it survives the crash blast;
  - it is owned by exactly one chunk.
- **Harbour:**
  - port cells exist along the coast;
  - container stacks have container colours, the container facade and heights in container multiples;
  - cranes stand only on land cells bordering the bay;
  - no signs or billboards in the port.
- **Sea wall:** every land and bay edge has a wall piece; no wall stands inland; pools fit a full load.
- **Splashes:** `Splasher.at` emits only for open-water points (not land, not the bank road or sea wall);
  `footprint` splashes only when it touches open water; the per-frame budget holds.
- **Tap to move:** a bay tap clamped with `landingSpot` is on land and reachable; an unclamped one is stopped dead by
  the shore (`shoreStopped`).

**Visual checks:**

- the intro dive with the bay in view;
- the waterfront from the gameplay camera;
- the Rainbow Bridge and the island;
- a splash;
- phone portrait.

**Performance:** the soak against the post-5a numbers. Acceptance: no growth across cycles; CPU frame time within
15% of post-5a.

## Out of scope (5c)

- Ships and patrol boats (5c-2).
- Night lighting.
- Bay bridges other than the Rainbow Bridge.
- A reachable island.
