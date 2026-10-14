# AZRAGON — Milestone 5a Revision: Tokyo, Recognizable From the First Second

Date: 2026-10-13
Status: Direction approved in conversation (look test + road option 1); pending written-spec review
Revises: `2026-10-13-azragon-milestone5a-design.md`. Everything in it that is already built (Tasks 1–7 on branch
`milestone5a`) stands unless this document changes it.
Reference: the throwaway look test on branch `tokyo-look-spike` (commit 4fbb506), which the user approved as the
direction.

## Why

The first playtest of 5a looked like an industrial wasteland:

- every building was grey or beige;
- neon signs were coloured specks;
- nothing recognizable was in view;
- the road grid read as graph paper.

The look test showed what fixes it:

- a landmark that dominates the opening view;
- a river, parks and trees;
- a brighter palette;
- bold signs.

Two problems remain: too many rooftop billboards, and road grid lines crossing the river.

## What changes

1. **Milestone 5b is folded into 5a.** Tokyo Tower and Skytree are built now. Milestone 5 becomes 5a (Tokyo,
   recognizable), 5c (the bay, sea wall and Rainbow Bridge) and 5d (railways and the Shuto Expressway).
2. **The opening view is staged** around the crash.
3. **The look** moves to the look-test palette and signs, with fewer billboards.
4. **The road network:**
   - Roads become individual pieces on the same 200 m lattice.
   - Some streets are removed, which makes larger, uneven blocks.
   - Roads come in two widths, avenues and streets.
   - A winding river is mostly water, with bridges only on avenues.
   - Ground units find routes over the roads that exist.

## The opening view

North is +Z; facing north, east is −X and west is +X. Positions are world metres from the crash at the origin.

**What the player sees at play start, facing north:**

| Place | Position | Where it shows on screen |
|---|---|---|
| **Tokyo Tower** | in a green park block at (−300, 1500) | a little right of centre, the first thing the eye lands on |
| **The Shibuya Crossing** | at (200, 1000), just beyond the crater | four tall corner buildings with video screens and big vertical signs |
| **The river** | winds across the view between the crossing and Tokyo Tower | |
| **Shinjuku** | glass towers to the north-west (left), with the Metropolitan Government Building at (1100, 2900) | |
| **A second high-rise cluster** | to the north-east (right) | |
| **Skytree** | at (−1900, 3100) | on the right horizon |
| **Large parks** | east of the crash (the Imperial Palace gardens) and around Tokyo Tower (Shiba Park) | |

**What survives the crash:**

- **Landmarks and hand-placed buildings** (`BuildingSpec.keep`) are never toppled by the crash blast. They are still
  destructible by the monster.
- **The topple zone** shrinks from 2 × to 1.3 × the crater radius (`CONFIG.intro.impact.outer` 1.3), so the crater
  isn't ringed by an empty plain.

**Intro dive:** the pod's dive should pass over the river and the dense districts toward the crash, not over pale
low-rise blocks. This is tuned in the verification task by adjusting the approach heading and the crash-site
surroundings; the chase framing itself is unchanged.

## Landmarks

All three are destructible like any building (HP by height, EXP by HP). Each fits inside one block, and none sits
on a water block.

| Landmark | Size | Look |
|---|---|---|
| **Tokyo Tower** | 1.3 × life size: 494 m tall, 130 m footprint | Four splayed orange legs with white braces; an international-orange and white banded lattice shaft; a main deck and a top deck with dark window bands; a banded antenna |
| **Skytree** | 600 m tall, 90 m footprint | A pale steel spire, three-sided at the base and round above; two ringed observation decks; a long mast |
| **Tokyo Metropolitan Government Building** | as built | |

## Look

**Palette:**

| Element | Colours |
|---|---|
| Facades | pale cream, peach, sky blue, pink, mint, butter yellow (neon district); white, pale blue, warm stone (office); cream, blush, mint (residential) |
| High-rise glass | blue-green |
| Roofs | light (0xd4d6d8), tinted by each building's colour |
| Facade windows | mid blue-grey, not near-black |
| Pavement | light cool grey |
| Roads | dark asphalt with white lines |
| Parks | green |
| Trees | deeper green |
| Water | 0x3f8fc9 |

**Haze:** `CONFIG.fog` near 2200, far 4700 (was 1200 / 4600), so nearby colours stay crisp and the far skyline still
fades.

**District sizes** (larger and bolder near the start):

| District | Height (m) |
|---|---|
| High-rise | 170–300 |
| Neon | 55–140 |
| Office | 45–120 |
| Residential | 14–34 |

Street trees per block: 6 residential, 4 office, 2 high-rise.

**Signs** (one atlas texture; one draw call for signs, one for screens):

- **Vertical boards:**
  - **Look:** tall neon-coloured boards with a dark frame and dark, blocky, kanji-like lettering, from three
    lettering variants.
  - **Size:** 14–22 m wide, 50–90 m tall, on the sides of neon and office buildings.
- **Rooftop billboards:**
  - **Look:** full-colour pictures (drink can on yellow, anime face on pink, logo on blue), drawn untinted.
  - **Size:** 30–46 m tall.
  - **How many:** far fewer than in the look test. A neon block gets at most one, and other districts are rarer:
    billboard chance neon 0.15, office 0.05, high-rise 0.1.
  - **Spacing:** no two billboards within 300 m of each other.
- **Shibuya corner buildings:** 70 m footprint, 90–140 m tall, video screens 58 × 36 m facing the crossing,
  14 × 70 m vertical boards.

## The road network (option 1)

**The lattice:** road nodes stay at every multiple of 200 m on both axes. A **segment** is the 200 m stretch of road
between two neighbouring nodes. Each segment either exists or doesn't, and has a width class.

**Widths:**

- **Avenues:** every 5th lattice line on each axis (x or z a multiple of 1000), 56 m wide, lined with trees on both
  sides.
- **Streets:** all other lines, 36 m wide.

**Removed streets:**

- **Which ones:** in the core and beyond it, a seeded fraction of street segments (not avenues) is removed, so
  neighbouring blocks merge into larger, uneven ones.
  - The fraction is 30% in residential and office, 15% in neon and high-rise, and 50% in parks, so parks merge into
    big green spaces.
- **What is left in the gap:** a paved strip. In residential and parks it becomes a lane with trees.
- **Never removed:**
  - segments touching the crash site;
  - segments around the Shibuya Crossing node (all four of its segments stay, so the crossing is a real
    intersection);
  - any segment whose removal would leave a lattice node with no segments.

**The river:**

- **Course:** a smooth, winding centreline across the core, in the look test's position. It crosses the view
  between the crossing and Tokyo Tower: `z = 1300 + 180·sin(x / 900)`.
- **Water blocks:** every block whose centre lies within 130 m of the centreline is water.
- **Roads in the water:** a segment lying between two water blocks is removed, unless it is on an avenue line and
  runs across the river; those are **bridges**, so there is a bridge every 1 km.
- **Bank roads:** segments between a water block and a land block stay, as embankment roads.
- **Water surface:** water blocks are drawn edge to edge (the full 200 m cell, covering any removed road strip), so
  the river reads as continuous water with a few bridges.
- **Beyond the core:** the river continues along the same curve.

**Rendering:**

- The repeating road texture is replaced by geometry.
  - The ground is plain pavement.
  - Each existing segment is a road quad of its width, with lane lines and crosswalks from a small road texture
    tiled along its length.
  - Intersections get a square patch.
- Bridges are road quads drawn above the water, with a thin deck edge.
- Road quads, intersections and water are three instanced meshes, so three draw calls.

**Ground units (tanks, laser trucks, SAM silos, the opening tank ring):**

- **Spawning:** units spawn at the nearest point on an existing road, not snapped to an abstract grid line.
- **Routes:** found by A* over existing segments, within a bounded search window around the start and the goal
  (at most a few thousand nodes). Units never cross water except on bridges.
- **No route:** if A* finds none, the unit falls back to driving to the nearest road point toward the goal.
- **Replanning cadence:** unchanged.

**The monster:**

- **Water:** it walks through the river freely, wading, with splashes optional in 5c.
- **Roads:** it ignores roads, as before.

## Architecture changes

- **`src/world/roads.ts`** becomes the road network:
  - `segmentAt(style, ax, i, j)`: whether a segment exists, plus its width class;
  - `isWater(style, i, j)`;
  - `nearestRoadPoint(style, p)`;
  - `planRoadPath(style, start, goal)` (A*);
  - `ringOnRoads(style, …)`.

  All of these are pure, seeded and deterministic. The river and the removal rules come from the city style
  (`CityStyle.river`, `CityStyle.roadRemoval`).
- **`generateChunk`** emits the chunk's road segments, intersections and water cells, along with buildings.
  - Water blocks get no buildings or trees.
  - Blocks bordered by an avenue keep their lots inside the wider road.
- **`City`:**
  - draws road segments, intersections and water as instanced meshes;
  - the ground becomes plain pavement;
  - `CityTextures` gains `road()`.
- **Enemies:** `TankFleet`, `LaserTrucks`, `SamSilos` and the opening ring use the style-aware road functions through
  the world context (`ctx.roads`), so enemies don't import the city style directly.
- **Landmarks and special lots** are validated never to sit on water or on a removed-road strip.

## Testing

**Road network:**

- deterministic;
- avenues never removed;
- every node keeps at least one segment;
- the crash-site and Shibuya segments exist;
- removal fractions are within ±5% of target over a large sample;
- water segments are removed except avenue bridges;
- a bridge exists on every avenue line crossing the river within the core.

**Pathfinding:**

- a path's waypoints all lie on existing segments;
- a path from south of the river to north of it crosses on a bridge, never through water;
- start equals goal gives an empty path;
- the search stays within its node budget;
- no-path falls back cleanly.

**Generation:**

- no building, tree or landmark on a water block;
- building footprints clear their adjacent road widths (avenues included);
- the existing cap, determinism, special-lot and landmark-ownership tests are kept and updated.

**Landmarks:**

- Tokyo Tower and Skytree exist, sit inside one block, are not on water, and survive the crash blast;
- the tower is in the starting camera's view (its projected position at play start is inside the frame).

**Billboards:** at most one per neon block, and the minimum spacing is respected.

**Visual checks:** screenshots at play start, the intro dive, Shibuya, the river from the gameplay camera, and phone
portrait.

**Performance:** the soak against the 2026-10-13 baseline. Acceptance: no growth across cycles; CPU frame time
within 25% of baseline.

## Out of scope

- Curved or warped streets (option 2) and a free-form road network (option 3).
- The bay, sea wall and Rainbow Bridge (5c); railways and the expressway (5d).
- Water splashes (5c).
