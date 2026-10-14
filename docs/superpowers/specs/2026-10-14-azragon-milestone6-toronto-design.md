# AZRAGON — Milestone 6: Toronto

Date: 2026-10-14
Status: Design approved in conversation; pending written-spec review
Builds on: the city system from milestone 5a (`CityStyle`, `pickCity`, `src/cities/tokyo/`). Tokyo's look and
behaviour must not change.

## Goal

A second city, **Toronto**. It must be recognisable from the first seconds and clearly not a recoloured Tokyo:

- **Time of day:** a warm evening (sunset) instead of Tokyo's midday.
- **Housing:** brick houses on leafy streets.
- **Downtown:** glass towers.
- **Landmarks:** the CN Tower dominating the view.
- **Water:** the lake and islands ahead.
- **Ravine:** the Don Valley cutting through.

Buildings and landmarks stay easy to destroy.

**How a city is chosen:** at random at the start of each run (Play, Play Again, Change Monster → Play), using the
existing `pickCity`. There is no new UI.

## Approach

Toronto is a sibling of Tokyo in `src/cities/toronto/`. The shared city code gets only the generalisations Toronto
needs (listed under **Shared code changes**). Toronto maps onto the existing six district types; no new district
types are added.

## Orientation and the opening view

The pod still dives from −Z and crashes at the origin. The play-start camera faces +Z.

**Toronto's +Z is geographic south (toward the lake)**, so:

- +X is east, which is to the player's left at play start.
- −X is west, which is to the player's right.

Positions are world metres from the crash.

**What the player sees at play start: down Yonge Street toward the lake, the skyline in front of the water.**

| Place | Position | What it is |
|---|---|---|
| **Yonge Street** | avenue line x = 0 | runs straight ahead to the lake |
| **Yonge-Dundas Square** | neon block centred at (−100, 900) | the one bright billboard block, close to the crash, just right of Yonge |
| **City Hall and Nathan Phillips Square** | (−500, 1135) | ahead and right; the Square is the paved strip north of the towers |
| **Financial District** | high-rise district centred at (−300, 1500), about 350 m across | dense dark-glass and gold towers |
| **CN Tower** | (−500, 1900) | ahead and right; the dominant shape in the view |
| **Rogers Centre** | (−700, 1891) | at the CN Tower's west foot, by the water; centred in the block just west of the tower's |
| **Lakeshore** | about z = 2200 across the whole view | condo towers along it; waterfront quays (the port district, no container cranes) from x = 0 to x = 1400 |
| **Toronto Islands** | offshore, centred at (−300, 2900) | long, low and green |
| **Don Valley** | north–south ravine centred near x = 1500 | to the left, running down to the lake |
| **Behind the crash and to the sides** | — | leafy residential brick streets (midtown) |

**Rules carried over from Tokyo:**

- Landmarks and hand-placed lots (`keep`) survive the crash blast; the monster can still destroy them.
- No landmark sits in the crater block.
- The CN Tower must be inside the starting camera's view.

## Look

### Time of day: warm evening

Each city now carries an `atmosphere` (see **Shared code changes**). Tokyo's atmosphere is today's exact values.
Toronto's values, as tuned in the visual checks, are below.

| Setting | Toronto |
|---|---|
| Sky zenith | dusky violet-blue `0x4b4a8c` |
| Sky horizon | warm gold `0xf2c08c` |
| Fog colour | the horizon's gold `0xf2c08c`; near 3000 (Tokyo 2200) so the lake and islands read behind the skyline, far 4700 as Tokyo's |
| Ambient light | cool violet sky `0x9c9ad6` over ground `0x4e4466`, intensity 1.1 (as Tokyo's), so shaded faces stay cool against the warm sunlit ones |
| Sun | orange `0xffb468`, intensity 2.4, low in the west (from −X): direction (−0.85, 0.42, −0.35) normalised, so buildings cast long shadows eastward |
| Window glow | warm yellow `0xffc46b`, strength 0.45, lit windows on towers and condos (see the window-glow rule below) |

**Intro:**

- The space scene's sun takes Toronto's sun colour.
- The intro dive uses Toronto's fog.

So the dive never flips from noon to dusk.

### Palette

| Element | Colours |
|---|---|
| Residential facades | red, brown and dark-red brick, some cream stone |
| Office facades | warm grey stone, buff brick |
| High-rise glass | dark blue-black and green-black glass; the Royal Bank Plaza in gold |
| Condos | pale glass and teal |
| Roofs | dark, tinted by each building's colour |
| Paving and roads | as Tokyo's structure, warmer grey |
| Parks and trees | green, slightly deeper than Tokyo's |
| Water | a slightly greener lake blue |

### Signs

- **Billboards:** rare. Only the Yonge-Dundas neon block gets dense billboards and video screens. Other districts
  get almost none (billboard chance 0.02 or less).
- **Lettering:** Latin, not kanji-like. It is drawn from a new `latin` glyph set: blocky capital letters and simple
  logo shapes.

### District sizes

| District | Height (m) | Notes |
|---|---|---|
| High-rise (Financial District) | 200–300 | |
| Neon (Yonge-Dundas) | 40–90 | |
| Office | 40–100 | |
| Residential | 10–22 | small houses, many lots, 6 street trees per block |
| Park | — | |
| Port (waterfront) | 80–160 | condo towers along the shore: the port district's rules have no `yard`, so its lots are ordinary buildings; no cranes (`cranes: false`) |

### Street grid

- Same lattice: avenues every 1000 m, streets between.
- Fewer removed streets than Tokyo, because Toronto's grid is very regular: residential 15%, office 15%,
  high-rise 10%, parks 40%.

## Landmarks

Each is destructible like any building: HP by height, EXP by HP. Each fits inside one block, is not on water, and is
not in the crater.

### CN Tower

- **Size:** 720 m tall (1.3 × life size, like Tokyo Tower), the tallest structure in either city.
- **Look:**
  - A pale warm-grey concrete shaft, three-sided with fins at the base, tapering up.
  - About two-thirds up, the main pod: a wide ring with a dark glass band and a glowing light band.
  - A smaller SkyPod above it.
  - A thin red-and-white antenna to the tip.

### Rogers Centre

- **Size:** 144 m across, about 70 m tall.
- **Look:** a low round drum.
  - Pale walls with dark window bands.
  - A slightly domed roof in pale segmented panels.

### City Hall

- **Size:** 1.3 × life size. Two curved towers, about 130 m and 105 m.
- **Look:**
  - Two pale concrete towers curving toward each other like brackets, with vertical window ribs on the inner faces.
  - A white saucer-shaped council chamber on a low podium between them.
- **Nathan Phillips Square:** in front, a ground decal (overlay) with grey paving, a rectangular reflecting pool,
  and the "TORONTO" letters as a coloured strip.

### Financial District

Hand-placed lots (`specialLots`, `keep`), like Shibuya's corner buildings:

- 8–10 dark glass towers, 200–300 m tall.
- The **Royal Bank Plaza**: two gold-glass towers with stepped, saw-tooth edges.
- **First Canadian Place**: the tallest, a white slab.

These are ordinary buildings and topple like any building.

### Toronto Islands and waterfront

- **Islands:** a long, low island using the existing island system.
  - Park cells with trees, no buildings.
  - Unwalkable, like Tokyo's island.
- **Waterfront:** condo towers along the shore and quay pads, with no container cranes.

## The Don Valley

- **Course:** a river running **north–south**. Its centreline is
  `x = 1500 + 150·sin(z / 1100)`, half-width 130 m.
- **Extent:** it runs through the whole city (the generator is infinite) and meets the lake.
- **Banks:** blocks whose centre lies within one block of the water are park (the ravine's green banks), with
  trees.
- **Bridges:** only on avenue lines crossing the river (here, z a multiple of 1000), so there is a bridge every
  1 km.
- **Monster and units:** the monster wades through it, with splashes. Ground units route over the bridges, like
  Tokyo's river.

## Shared code changes

1. **Atmosphere per city.**
   - `CityStyle` gains `atmosphere`: sky zenith and horizon, fog colour (plus optional near and far), ambient sky
     and ground colours and intensity, sun colour, intensity and direction, and window glow.
   - `Sky`, `Lighting`, the intro fog and the intro space sun read from it.
   - `City.reset(style)` applies it, so switching cities between runs swaps sky, fog and lights.
   - `TOKYO.atmosphere` holds today's `CONFIG.palette` and `CONFIG.fog` values, and Tokyo's rendering is unchanged.
2. **River axis.**
   - `RiverSpec` gains `axis?: 'x' | 'z'`, defaulting to `'x'`, which keeps Tokyo's east–west river unchanged.
   - For `'z'`, the centreline is `x = x0 + amp·sin(z / wavelength)`; the field is renamed from `z0` to `c0`
     (the centreline offset), Tokyo updated.
   - Water cells, bridges (avenues crossing the river, on either axis), shore, splash and pathfinding follow the axis.
   - `RiverSpec` also gains optional `bankPark?: number`: blocks within that many blocks of the water become park.
     Tokyo leaves it unset.
3. **Ground decals by id.** The overlay texture is chosen by `GroundOverlay.id`. Tokyo's Shibuya scramble is
   unchanged, and Nathan Phillips Square gets its own texture.
4. **Sign lettering per city.** `CityStyle` gains `glyphs: 'kanji' | 'latin'`. The sign atlas is built for the
   style's glyph set (Tokyo `'kanji'`, unchanged).
5. **Shared helpers.**
   - `coastDistance` moves from `src/cities/tokyo/layout.ts` to shared code.
   - Crane colours, and whether port blocks get cranes, become per-city: `CityStyle.cranes?: { colors } | false`.
     Tokyo keeps today's.
6. **City list.** `CITIES = [TOKYO, TORONTO]`. `pickCity` is unchanged.

**Window glow rule:**

- Lit windows are added only if they cost no extra draw calls: an emissive tint on the existing facade window
  texels, strength from `atmosphere`.
- If that needs a new material per building, it is dropped from this milestone.

## Files

New, in `src/cities/toronto/`:

| File | Contents |
|---|---|
| `index.ts` | the style |
| `layout.ts` | `districtAt`, positions, the lake, islands and Don |
| `cnTower.ts`, `rogersCentre.ts`, `cityHall.ts` | the landmarks |
| `financial.ts` | the Financial District lots |
| `square.ts` | the Nathan Phillips Square overlay texture |

Changed:

- `src/cities/types.ts`, `src/cities/index.ts`, `src/cities/tokyo/*`
- `src/world/roads.ts`, `src/world/shore.ts`, `src/world/chunks.ts`, `src/world/City.ts`
- `src/world/pixelTextures.ts`, `src/world/crane.ts`
- `src/systems/splash.ts`
- `src/render/Sky.ts`, `src/render/Lighting.ts`
- `src/intro/*` (fog and space sun)

## Testing

TDD throughout.

**Toronto:**

- Every landmark is inside one block, not on water, not in the crater, and survives the crash blast.
- The CN Tower is in the starting camera's view.
- Yonge-Dundas, City Hall and the Financial District are where the layout says.
- The islands are offshore and unwalkable.
- The lake is ahead (+Z).
- The Don runs north–south to the lake, with bridges only on avenue crossings and park banks.
- Lots clear their roads.
- Generation is deterministic.
- No container cranes are generated.

**Generic world tests:**

- The key road, chunk, shore and splash tests run against **both** cities.
- Tokyo's results are unchanged; its existing tests keep passing as they are.

**New units:**

- Points, bridges and shore for a river with `axis: 'z'`.
- Overlay texture chosen by id.
- Atmosphere applied on `City.reset`, and back again when switching Tokyo → Toronto → Tokyo.
- `CITIES` holds both cities, and `pickCity` can return either.

**Visual checks (screenshots):**

- Toronto at play start, in the intro dive, at the CN Tower, at City Hall, over the Don, and in phone portrait.
- A Tokyo → Toronto → Tokyo run sequence, to confirm the lighting resets.

**Performance:** the soak, with Toronto's long shadows. Acceptance: no growth across cycles; CPU frame time within
25% of the Tokyo baseline.

## Out of scope

- Streetcars, the Gardiner Expressway and rail (these belong with milestone 5d, on hold).
- Snow and winter.
- A player-chosen city.
- More cities.
- The Humber ravine.
