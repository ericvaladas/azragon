# AZRAGON — Toronto waterfront, Phase 2: Port Lands, Harbourfront, Exhibition Place, Ontario Place

## Goal

Complete Toronto's waterfront from the approved v3 layout:
- **The Port Lands:** a walkable industrial peninsula pushing into the lake east of the Don, cut by the Ship Channel, with the Hearn power station and its chimney.
- **Cherry Beach:** on the Port Lands' southwest shore.
- **Harbourfront and Queens Quay:** waterfront condos west of Yonge.
- **Exhibition Place:** with BMO Field and the Princes' Gates.
- **Ontario Place:** scenery islets with the Cinesphere and pods.
- **Tommy Thompson Park:** its causeway trimmed to start at the new Port Lands shore.

Phase 1 (the islands and the spit as scenery landforms) is merged. See `2026-10-16-toronto-waterfront-phase1-design.md`.

## Owner decisions (from brainstorming, 2026-10-17)

- **The Port Lands are walkable city land:** roads, destructible buildings and landmarks, enemy spawns and routes. The Ship Channel is water the monster walks around.
- **Approach A:** the shoreline gains `landAreas` and `waterAreas`, block rectangles read by the existing lake and water tests. Its edges follow the city's 200 m blocks, consistent with the rest of the coastline. A second curved coastline (B) was rejected.
- **A new `industrial` district type** for the Port Lands' low warehouses. Toronto's existing waterfront condo district (`port`) fits Harbourfront and Queens Quay.
- **Ontario Place:** scenery landforms like the islands.
- **New landmarks:** the Hearn, BMO Field and the Princes' Gates, all destructible like the city's other landmarks.

Blocks are given as (column i, row j). A block covers x 200i … 200i + 200 and z 200j … 200j + 200.

## Shoreline engine (`src/world/roads.ts`, `src/cities/types.ts`)

- **`Shoreline`** gains `landAreas?: readonly CellRect[]` and `waterAreas?: readonly CellRect[]`, where `CellRect = { ci0, ci1, cj0, cj1 }` with inclusive bounds.
- **`isBay(style, ci, cj)`:**
  - true for a block in a water area;
  - false for a block in a land area;
  - otherwise as today (seaward of the coastline and not an island).
- **Water areas win over land areas.** Everything built on `isBay` and `isWater` follows automatically: roads, chunks, buildings, shore collision, leap landing, `blockedAt`, sea walls, foam, enemy routes and spawns.
- **Tokyo** sets neither list, so it is unchanged.
- **No bridges over water areas:** bridges only cross river-only blocks, as today.

## Toronto layout (`src/cities/toronto/layout.ts`, `index.ts`)

**`landAreas`** (the Port Lands):
- columns 8–23, rows 11–16;
- columns 8–20, row 17;
- columns 9–17, rows 18–19.

**`waterAreas`** (the Ship Channel): columns 8–22, row 14. It is open to the harbour at its west end (column 7 is lake) and closed at the east.

**Districts:**
- **Port Lands:** `industrial`, apart from Cherry Beach and the Hearn's blocks.
- **Cherry Beach:** columns 9–11, row 19. These blocks are `park`, with sand-coloured ground pads (the existing pad mesh, new colour `CONFIG.palette.beach`) and trees only in the north half.
- **Harbourfront / Queens Quay:** columns −9 to −1, row 10. These are `port` (Toronto's waterfront condos) instead of downtown `office`.
- **Exhibition Place:** columns −18 to −13, rows 9–10. These are `park` around the landmarks.

**The `industrial` district** (`DistrictRules`):
- buildings 10–30 m tall (mostly low), with large footprints (0.7–0.95 of their lot), two to three per block;
- facades from the existing office and plain sets;
- colours: brick red, rust, concrete grey, pale green;
- no signs, few trees.

`DistrictId` gains `'industrial'`, and Tokyo's district table gets an entry for it, unused.

## Landmarks (built in code like the CN Tower; destructible, with health by height)

- **The Hearn** (`hearn.ts`), centred on block (18, 15), south of the Ship Channel:
  - a brick hall about 300 × 100 × 50 m, with tall vertical window bands and a stepped roof;
  - the chimney at the hall's east end: a slightly tapering cylinder 215 m tall and 13 m across, concrete grey with a dark band near the top.
  - Its footprint `w` × `d` covers the hall, and its height `h` is the chimney's 215.
- **BMO Field** (`bmoField.ts`), at about (−2900, 2100):
  - an open bowl about 200 × 170 × 30 m with a green pitch and grey stands;
  - a white canopy roof over the east and west sides.
- **The Princes' Gates** (`princesGates.ts`), at about (−2500, 1900):
  - a pale stone arch about 60 m wide and 25 m tall;
  - two low colonnade wings and a statue silhouette on top.

## Ontario Place (landforms, scenery only)

- **Two islets,** clear of the mainland. Its shore blocks reach z 2400 between x −3200 and −1500.
  - **West islet:** an outline within about x −3350 … −2950, z 2470 … 2750, carrying the Cinesphere.
  - **East islet:** an outline within about x −2900 … −2560, z 2480 … 2700, carrying the pods.
- **Beaches and trees:** a 15 m sand rim, and a few trees (one per 4,000 m²).
- **New landform detail `dome`:** a faceted white sphere of radius `r`, sunk a quarter into its base. The Cinesphere is r = 20.
- **The pods:** three dark-glass boxes, about 30 × 30 × 15 m, raised 15 m on slim stilts (boxes with `y: 15` plus thin stilt boxes). They stand at the east islet's edge and may reach out over the water (`water: true`).

## Tommy Thompson Park (Phase 1 data)

`SPIT_CAUSEWAY` becomes a ribbon from (4699, 3460) straight to (3727, 4788), 110 m wide. Its path detail follows it. The leg down Leslie St is dropped, because the Port Lands now lie there.

## Testing

Vitest, colocated:
- **`roads` / `shore` tests:**
  - a land-area block is land, beyond the coastline;
  - a water-area block is water, inside a land area;
  - Tokyo's `isBay` results are unchanged on a sample grid.
- **Toronto layout tests:**
  - every Port Lands block is land, and the blocks just outside its steps are lake;
  - every Ship Channel block is water, and column 7 at row 14 is lake (the channel opens west);
  - the Eastern Gap blocks between Ward's tip and the Port Lands are water;
  - the districts are as listed above, and Cherry Beach's pads are sand-coloured.
- **Landmark tests:**
  - each sits on land in its block;
  - the Hearn's height is about 215 m and is the second highest after the CN Tower;
  - each is listed among Toronto's landmarks, so destruction works as for the others.
- **Waterfront landform tests:**
  - Ontario Place's islets lie over water blocks;
  - the dome sits on grass;
  - the trimmed causeway lies entirely over water;
  - all Phase 1 checks still pass.
- **Gameplay:** a road path exists from downtown (0, 1500) to the Port Lands (3000, 2500). The monster's shore collision stops it at the Ship Channel.
- **In the browser:** the owner checks the look with `?city=toronto`.

## Out of scope

- Bridges over the Ship Channel, the Keating Channel or the inner harbour.
- Animated ferries, boats or stadium crowds.
- The Redpath sugar refinery, the Distillery's surroundings and other east-end districts (the separate districts project).
