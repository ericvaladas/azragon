# AZRAGON — Milestone 5a Design: City Styles and Tokyo

Date: 2026-10-13
Status: Approved in conversation; pending written-spec review
Builds on: milestones 1–4c and the playtest-tweaks round (all merged to `main`, ba999aa)

## Milestone 5: real cities (the whole picture)

The city should look like a real one. Each run starts in a real city, picked at random once there are two or more.
The first city is **Tokyo**, and it **replaces** today's generic city.

**Decisions that apply to all of Milestone 5:**

- **Look:** recognizable landmarks plus each city's character. The stylized 200 m road grid stays, so tanks, trucks
  and other ground units keep driving on it unchanged.
- **The whole endless city is in the city's style.** Landmarks cluster within a few km of the crash so they are seen
  early, in the intro dive and at play start.
- **Landmarks are destructible like any building.** They are bigger and distinctive, and they use the same damage,
  collapse and EXP rules (scaled by size), with no special callout.
- **Daylight, as now.** Neon and screens glow, but lighting and all effects stay as tuned.
- **No terrain elevation.** The ground stays flat at y = 0. Depth comes from raised structures (railways, expressway,
  sea wall).
- **Everything is low-poly geometry built in code**, in the game's chunky pixel style. No imported models.

**The four parts, each its own spec, plan and merge:**

| Part | Scope |
|---|---|
| **5a** (this spec) | The city-style system and random pick; Tokyo's district layout and buildings; neon signs and screens; the Shibuya Crossing; the landmark type, with the Tokyo Metropolitan Government Building as the first landmark |
| 5b | Tokyo Tower and Skytree |
| 5c | Tokyo Bay: the coastline as a wall the monster cannot cross, the water, a raised sea wall, the Rainbow Bridge, enemies and spawns kept on land |
| 5d | Raised structures: elevated railways with running, smashable trains and breakable track; the elevated Shuto Expressway |

## 5a goal

When a run starts, the player crashes into a city that reads as Tokyo:

- the Shinjuku skyline on the horizon ahead, during the intro dive and at play start;
- dense neon streets and the Shibuya scramble crossing nearby;
- varied Tokyo-flavoured blocks all the way out.

## Compass and layout

**North is +Z.** The pod dives toward +Z and the gameplay camera starts facing +Z, so north is what the player sees
first. Facing north, east is −X and west is +X (the project's +X-is-left convention).

The geography is real Tokyo, compressed so it fits the view. All distances are from the crash at the origin.

```
                        N (+Z): ahead in the intro dive and at play start
                 ┌──────────────────────────────────────┐
                 │        SHINJUKU HIGH-RISE            │  z ≈ 2,500–3,700
                 │   skyscrapers; the Metropolitan Gov't │
                 │   Building at its heart; neon streets │
                 │   along its east edge                 │
                 └──────────────────────────────────────┘
   W (+X)                                                        E (−X)
   residential /     ┌──────────────┐       office / mixed       → Tokyo Tower (5b)
   low-rise, parks   │ SHIBUYA neon  │       mid-rise             ↗ Skytree (5b)
                     │ ✕ crossing at │
                     │  (600, 1600)  │
                     └──────────────┘
                         ● CRASH at (0, 0): crater ~750 m, buildings topple out to 1,500 m
                     parks, residential
                                                  ↘ coast and bay (5c)
                        S (−Z): where the pod comes from
```

- **Core:** the area within about 4 km of the crash is laid out by hand as district regions (rectangles and circles
  in world metres).
  - Shinjuku high-rise: a region centred near (300, 3,100), roughly 2.2 km wide and 1.2 km deep.
  - Neon: Shibuya, around the crossing; and a strip along Shinjuku's east edge.
  - Parks: one large park (the Yoyogi / Meiji Shrine woods) between Shibuya and Shinjuku, west of centre.
  - Residential and office / mixed fill the rest, as in the diagram.
- **Beyond the core:** a smooth, seeded noise field picks each block's district.
  - Mostly residential and office / mixed.
  - Neon clusters around scattered "station" points, and the occasional high-rise cluster.
- **The crash site** (blocks touching the crater radius) is built up like anywhere else, never a park and never a
  landmark. The pod flattens it anyway.
- **Survives the crash:** the Shibuya Crossing and its screen buildings sit beyond the 1,500 m topple radius, so they
  stand when play starts.

## Districts

Every district builds inside the existing 200 m blocks (164 m inside the roads). The heights are first-pass values
to tune in playtest.

| District | Lots per block | Height | Footprint | Facades | Extras |
|---|---|---|---|---|---|
| **High-rise** (Shinjuku) | 1–2 | 150–260 m | large (most of the block or half of it) | glass curtain wall, office bands | rooftop helipad / crown boxes (as plain boxes) |
| **Neon** (Shibuya, east Shinjuku, stations) | 3×3 small lots | 40–110 m, narrow | small | shop fronts, office bands | vertical neon signs on the sides, rooftop billboards |
| **Office / mixed** (default) | 2×2 | 30–90 m | medium | office bands, glass | occasional rooftop billboard |
| **Residential** | 3×3 | 10–25 m | small, packed | balconies, small windows | a few street trees |
| **Park** | none | — | — | — | dense trees (more than today's parks) |

- **Colours:** each district has its own facade colours, Tokyo-like: pale concrete, white tile, grey-blue glass,
  warm beige residential. The shared `CONFIG.palette.buildingFacades` stops being used for buildings.
- **Ground:** mostly paved (grey, not grass). Parks stay green. The roads keep their grid; white crosswalk stripes
  are drawn at intersections.

## The Shibuya Crossing

- **Where:** the intersection at (600, 1600), north-west of the crash.
- **Markings:** a ground overlay of the scramble markings (diagonal and straight zebra stripes) covering the
  intersection.
- **Screen buildings:** the four corner lots get fixed neon-district buildings (hand-specified, not random), several
  carrying **big video screens**: emissive panels whose pixel picture scrolls and changes.
  - They are ordinary destructible buildings; their screens fall with them.

## The Tokyo Metropolitan Government Building (the first landmark)

- **Shape:** twin towers, about 240 m tall, joined by a lower base. Each tower has a stepped crown, with its upper
  part split into the building's recognizable twin peaks, in pale grey with darker window bands.
  - It is a custom low-poly shape, not a box.
- **Where:** the heart of Shinjuku, in one block near (500, 3,100). It fits inside its block, so no road is
  covered.
- **Play:** destructible like any building, with HP and EXP by its size.

## The landmark type

A **landmark** is a destructible structure with its own mesh, for shapes that are not boxes. Tokyo Tower and Skytree
in 5b use it too.

- **Same as a building in every way:**
  - tap to target (picked against its bounds);
  - damaged by attacks, stomps and area effects (`forEachStandingInRadius`);
  - toppled by the crash blast when close enough;
  - the same tilt-and-sink collapse with dust;
  - rubble, and EXP by HP;
  - remembered as destroyed after streaming out and back.
- **Defined by the city style:** a fixed position, a footprint that fits inside one block, a height, HP, and a
  function that builds its mesh. The blocks a landmark claims get no ordinary buildings.
- **Owned by one chunk:** the chunk containing its centre. It loads and unloads with that chunk and is never
  doubled or dropped.
- **One draw call each.**

## Neon signs and screens

- **One new instanced layer** for vertical neon signs, rooftop billboards and the Shibuya screens: emissive,
  Tokyo neon colours (magenta, cyan, warm white, red, yellow), **one draw call**.
- **Each sign belongs to a building:**
  - generated with it, from the same seed;
  - drawn at the building's transform, so it tilts and sinks with the collapse;
  - gone once the building is rubble;
  - not recreated when a destroyed block streams back.
- **Screens** use a small animated texture (a scrolling pixel picture) on the same layer.

## Architecture

**New: `src/cities/`**

- **`types.ts`:** the city-style contract.
  - `CityStyle`: `id`, `name`, colours (ground, road, roof, facades per district, sign colours), `districtAt(x, z)`,
    the per-district building rules, `landmarks` (a list of `LandmarkSpec`), and the special lots (the Shibuya
    corner buildings and screens).
  - `DistrictRules`: lots per block, height range and curve, footprint range, facade types and colours, sign
    density, park chance.
  - `LandmarkSpec`: `id`, position, footprint, height, HP, `build()` returning its geometry and material.
- **`index.ts`:** `CITIES` (just Tokyo) and `pickCity(rng)`. It picks uniformly at random, so with one city it
  always returns Tokyo.
- **`tokyo/`:** the Tokyo style.
  - `layout.ts`: the core regions and the noise beyond.
  - `districts.ts`: the per-district rules and colours.
  - `shibuya.ts`: the crossing markings and the corner buildings.
  - `tmg.ts`: the Metropolitan Government Building mesh.

**Changed: `src/world/`**

- **`chunks.ts`:** `generateChunk(style, seed, cx, cz)` builds each block from the district at its centre, skips
  blocks claimed by landmarks, adds that block's special lots, and emits signs alongside buildings.
  - It stays a pure, seeded function.
  - Each chunk has a building cap and a sign cap.
- **`City.ts`:** `new City(scene, style, seed, onDestroyed)`; `reset(style)` rebuilds in a new style.
  - Owns the landmark targets and the sign layer.
  - Building colours come from the style.
  - The facade texture becomes an atlas of facade types; each building picks one through a per-instance attribute.
    Buildings stay one instanced box mesh, one draw call.
  - The ground texture and crosswalks come from the style.
- **`pixelTextures.ts`:** the facade atlas (glass curtain wall, office bands, balconies, shop fronts), the paved
  ground with crosswalks, the Shibuya scramble overlay, and the screen texture.
- **`roads.ts`:** unchanged.

**Changed: `GameScene.ts`**

- At the start of each run (Play, Play Again and Change Monster → Play), call `pickCity` and rebuild the city in
  that style.
- The title flyover and the select diorama use the current city.

**Budgets:**

- `CONFIG.world.maxBuildings` rises from 7,000 to about 9,000; there is a new `maxSigns` of about 3,000.
- **Per-chunk caps:** the worst case, with every block neon, still fits the pools across all loaded chunks.
- **Draw calls:** buildings 1, signs 1, landmarks 1 each, crossing overlay 1. The target stays within the earlier
  100–200 draw calls for phones.

## Testing

**Unit tests (Vitest):**

- **Layout:**
  - `districtAt` puts high-rise around the Shinjuku centre (north) and neon at the Shibuya Crossing (north-west).
  - The crash site is never a park.
  - The same spot always gives the same district, in the core and beyond it.
  - Beyond the core, every district appears somewhere, and most blocks are residential or office / mixed.
- **Generation:**
  - Each chunk stays within its building and sign caps, including an all-neon worst case.
  - The loaded area fits the pools.
  - Blocks claimed by a landmark get no buildings.
  - Every building and landmark footprint stays inside its block, never on a road.
  - The Shibuya corner buildings are fixed and exist, and every one sits beyond the topple radius
    (`d − radius ≥ outer`).
- **Landmarks:**
  - A landmark takes damage and collapses, giving EXP by HP.
  - It is toppled by the blast inside the radius and untouched outside it.
  - It is picked by a ray.
  - It stays destroyed after its chunk unloads and reloads.
  - It is owned by exactly one chunk.
- **Signs:**
  - A sign follows its building's transform while it collapses.
  - It is gone once the building is rubble.
  - A destroyed block that streams back returns as rubble without signs.
- **Cities:** `pickCity` returns Tokyo; `City.reset(style)` rebuilds with that style.

**Visual checks (screenshots, desktop and phone portrait):**

- the title flyover;
- the intro dive, with the Shinjuku skyline ahead;
- play start;
- close-ups of Shibuya (the crossing, neon, screens) and of Shinjuku (the Metropolitan Government Building, towers);
- a residential edge;
- the crash with each of the four monsters.

**Performance:** re-run the soak (`perf-soak.mjs`) and compare draw calls, frame time and heap against the
2026-10-13 numbers.

## Review focus

- **Spawns:** enemies, pickups and spawn points must never land inside a landmark's footprint. Ground units path
  along roads, so landmarks staying inside their blocks is what keeps routes valid.
- **Streaming churn:** dense neon chunks streaming in during a fast dash or leap must not hitch (keep
  `chunksPerFrame`; each chunk does a bounded amount of work).
- **Change Monster and Play Again:** the city is rebuilt in the picked style, with no leftover signs or landmark
  meshes from the last run.
- **Readability:** neon signs and screens must not be confused with enemy telegraphs or pickups (no red pulsing
  signs near the threat colours).
- **Phones:** the extra buildings and signs must hold frame rate in portrait at the phone render scale.

## Out of scope (5a)

- Tokyo Tower, Skytree (5b); the bay, coastline wall, sea wall and Rainbow Bridge (5c); railways, trains and the
  expressway (5d).
- A second city (the random pick is built, but with one entry).
- Terrain elevation; night or dusk lighting; landmark callouts or special rewards.
- Audio.
