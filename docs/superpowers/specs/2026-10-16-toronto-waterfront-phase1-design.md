# AZRAGON — Toronto waterfront, Phase 1: islands and Tommy Thompson Park

## Goal

Replace Toronto's hard-edged rectangular island with a realistic waterfront seen across the lake:
- the **Toronto Islands**: a curved crescent with beaches, lagoons, the island airport, a lighthouse and cottages;
- **Tommy Thompson Park** (the Leslie Street Spit): its long causeway, its lobes with lagoons, and its lighthouse.

Both are scenery only, and gameplay is unchanged.

This is Phase 1 of two. Phase 2, a separate spec, adds the waterfront districts and landmarks:
- the Port Lands with the Hearn chimney and **Cherry Beach**;
- Harbourfront and Queens Quay;
- Ontario Place and Exhibition Place.

## Owner decisions (from brainstorming, 2026-10-16)

- **Scenery only:** the monster can't walk onto the islands or the spit. Collision, shoreline, enemy routes, spawns and blocked ground don't change.
- **Layout:** follow the real geography in the owner's rotated reference map, as approved in mockup v3 (coordinates below).
- **Approach A, landforms drawn as outlines:** smoothed polygons drawn as low land layers over the lake. Two alternatives were rejected: a terrain height map (B) is too heavy, and finer land/water blocks (C) are too invasive.
- **Cherry Beach moves to Phase 2:** it lies on the Port Lands' south shore, which Phase 2 builds.
- **No further mockups:** the look is settled by this spec and checked in the browser.

## Layout (game metres; +x east, +z south; mainland shore near z = 2250)

The outlines below come from the v3 mockup, traced from the owner's map at about 5.4 game metres per screenshot pixel. Scale was set from the game's Rogers Centre (x −700) and Scotiabank Arena (x 109). They are drawn as polygons and smoothed into curves.

**Toronto Islands crescent** (outer outline, clockwise from the airport's northwest corner):
(−2483, 2490) (−1457, 2490) (−1106, 2520) (−1187, 2844) (−1133, 3168) (−485, 3762) (55, 4194) (703, 3978) (1297, 3708) (1459, 3654) (1648, 3978) (1621, 4194) (1135, 4437) (379, 4653) (−701, 4815) (−1673, 4788) (−2105, 4572) (−2375, 3708) (−2618, 2898).

Its holes are the island's inner water:
- **Blockhouse Bay:** an ellipse centred (−250, 4300), radii 380 × 150, turned 38° along the crescent's inner shore. The traced (−215, 3720) lay partly in the Inner Harbour.
- **Hanlan's lagoon channel:** a ribbon along (−1950, 3200) → (−1800, 3500) → (−1800, 3900) → (−1650, 4300), 80 m wide.
- **Centre lagoon channel:** a ribbon along (−1500, 3500) → (−1300, 3700) → (−1000, 3900) → (−800, 4150), 70 m wide.

**Tommy Thompson Park:**
- **Causeway:** a ribbon 110 m wide along (4699, 2260) → (4699, 3168) → (3727, 4788). Its rounded root meets the mainland's block edge (z 2200) at the sea wall.
  - Its first leg runs south down Leslie St from today's shoreline, because in Phase 1 the Port Lands don't exist yet. Without it, the spit would float about 900 m offshore.
  - Phase 2 builds the Port Lands over that leg and trims the causeway to start at their shore, (4699, 3168).
- **Lobes:** a polygon through (3727, 4788) (3600, 5200) (3300, 5700) (2809, 6408) (2323, 5868) (1675, 6030) (1243, 6084) (1135, 5868) (1513, 5328) (2107, 4788) (2485, 4680) (3025, 4788).
- **The arm back toward the Outer Harbour marina:** a ribbon 50 m wide along (3025, 4788) → (3295, 4572) → (3420, 4260). The gap it leaves before the Port Lands is the harbour mouth.
- **Lagoon holes:** ellipses at (2647, 5220), radii 330 × 190, and (2000, 5700), radii 260 × 150.

A ribbon is a polyline thickened to a given width with rounded ends. It is built as a polygon, so ribbons and polygons are drawn the same way.

**Corrections made in review (2026-10-16):**
- **The islands' north edge** is at z 2490, not the traced 2360. The mainland's wavering shore blocks reach z 2400 between x −3200 and −1500, so a narrow Western Gap is kept. The airport's runway (centre z 2700), apron (z 2900) and terminal (z 2850) move south with it.
- **The airport's ground** is a tree-free clearing.

## Content

- **Billy Bishop airport** (the crescent's west end):
  - a runway 1,050 × 70 m along the island's long axis (turned about 14°), grey with white centre-line dashes;
  - a low terminal building about 120 × 60 × 18 m;
  - a paved apron about 500 × 260 m;
  - no trees on the airport's ground.
- **Hanlan's Point:** a wide beach (60 m) on the lake (west and southwest) shore.
- **Centre Island:**
  - a 50 m beach along the south shore;
  - a short pier (about 160 × 12 m) running south from the shore near x = −700;
  - **Gibraltar Point lighthouse** near the southwest corner: a white tapering tower about 25 m tall.
- **Ward's and Algonquin:**
  - 25 small cottages (about 10 × 8 × 7 m, varied pastel colours) among the trees on the east arm;
  - a ferry dock (about 60 × 15 m) on the harbour (north) side near Ward's tip.
- **Tommy Thompson Park:**
  - a pale path down the causeway (about 12 m wide);
  - sparse trees on the causeway, dense trees on the lobes;
  - a 20 m sand rim;
  - a white lighthouse with a red top, about 18 m tall, at the southern tip (2809, 6408).
- **Beaches:**
  - the crescent's default rim is 40 m, widened as above;
  - the spit's rim is 20 m (10 m on the narrow arm).

**Tree density:** about 1 tree per 1,500 m² of grass on the islands and lobes, and 1 per 6,000 m² on the causeway. Every landform scatters its full set, then the total is thinned evenly to the 1,200 cap, so no landform loses its trees to another.

**Colours** (new `CONFIG.palette` entries):
- sand `landSand`;
- grass `landGrass`, varied slightly per tree for variety;
- path and apron `landPath`;
- runway `landRunway` and its marking `landMarking`;
- lighthouse white and red;
- cottage pastels.

Trees reuse the city's tree geometry and colours. Everything is lit by the scene lights, so it follows the city's atmosphere.

## Architecture

- **`src/cities/toronto/waterfront.ts`:** the landform data (outlines, holes, ribbons, beach widths, tree density, details), using the coordinates above.
- **`src/cities/types.ts`:** `CityStyle` gains an optional `landforms?: readonly LandformSpec[]`. Toronto's style sets it.
- **Toronto's `island` setting is removed** (the old rectangle, `TORONTO_ISLANDS`). Its blocks become lake water through the existing bay test. Tokyo's island is unchanged.
- **`src/world/landforms.ts`:** pure, unit-tested functions:
  - `smoothOutline(points, samplesPerEdge)`: closed Catmull-Rom curve through the points;
  - `ribbon(path, width)`: a polyline thickened into a polygon with rounded ends;
  - `insetOutline(points, distance)`: each vertex moved inward along the averaged edge normals;
  - `onLand(spec, x, z)`: inside the outline and in no hole;
  - `onGrass(spec, x, z)`: inside the inset outline, in no hole, and on no detail's footprint;
  - `scatterTrees(spec, seed, density, max)`: seeded positions on grass.
- **`src/world/LandformRenderer.ts`:** the renderer, owned by `City` and rebuilt on construction and every `reset(style)`.
  - **Sand layer:** a `ShapeGeometry` of each smoothed outline, with its holes as `Path`s.
  - **Grass layer:** the inset outline, with the same holes.
  - **Height and depth:** both lie flat a little above the water. They use the city's ground-layer polygon offsets (sand under grass), so nothing flickers.
  - **Trees:** one `InstancedMesh` reusing the city's tree geometry.
  - **Details:** one merged, vertex-coloured mesh.
  - **Cleanup:** `clear()` disposes everything. It's called on reset and before a rebuild.
- **No gameplay hooks:** nothing is added to collision, `blockedAt`, roads, spawns or the enemy context.

## Testing

Vitest, colocated:
- **`landforms.test.ts`:**
  - smoothing passes near every traced point;
  - inset moves edges inward by about the distance and never outside the outline;
  - `onLand` is false in holes and outside, and true between;
  - trees land only on grass;
  - trees are the same for the same seed;
  - the tree count follows the density and the cap.
- **`waterfront.test.ts`:**
  - landforms sit where the layout puts them (the islands' south shore z ≈ 4800, the spit's tip z ≈ 6400);
  - every outline point lies seaward of Toronto's coastline;
  - the islands and the spit don't overlap;
  - the causeway joins today's shoreline at Leslie St;
  - every hole lies inside its landform;
  - every detail sits on grass.
- **`LandformRenderer.test.ts`:**
  - Toronto builds its sand, grass, tree and detail meshes; Tokyo builds none;
  - a style switch and reset twice leave the same mesh count;
  - the layers sit above the water's height.
- **Existing tests:**
  - Toronto's island tests change to "Toronto has no rectangular island; those blocks are lake";
  - Tokyo's island tests pass unchanged.
- **In the browser:** the owner checks the look with `?city=toronto`.

## Out of scope

- Phase 2: the Port Lands and Hearn chimney, Cherry Beach, Harbourfront and Queens Quay, Ontario Place and Exhibition Place.
- Walking on, destroying or spawning enemies on any landform.
- Ferries, boats, or any animation on the landforms.
- Woodbine Beach and Ashbridges Bay further east.
