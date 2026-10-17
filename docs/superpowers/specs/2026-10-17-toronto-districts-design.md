# AZRAGON — Toronto districts: Old Town, Entertainment District, the Annex, west end, east end

## Goal

Flesh out more of Toronto with recognisable neighbourhoods, each giving its blocks a building type, size and palette:
- **Downtown:** St. Lawrence / Old Town and the Entertainment District.
- **North:** the Annex.
- **West end:** Trinity Bellwoods and Little Italy.
- **East end:** Cabbagetown, Regent Park, Riverside, Leslieville and Greektown.

Three hand-placed landmarks are added: St. Lawrence Market, the Gooderham (Flatiron) Building and Roy Thomson Hall.

## Owner decisions (from brainstorming, 2026-10-17)

- **All the proposed districts**, plus the Entertainment District with Roy Thomson Hall.
- **Built on the existing named-area system** (like Kensington Market and CityPlace). The one engine change is that a named area may set its own building rules (height, footprint, signs) as well as colours, through the existing `blockRules` hook.

## Areas

Blocks are (column i, row j). A block covers x 200i … 200i + 200 and z 200j … 200j + 200; +x is east, +z is south (the lake). Each area is added to `AREAS` in `src/cities/toronto/layout.ts`. None overlaps an existing area, the Yonge corridor (|x| ≤ 300, north of z 1000), a landmark's block or the lake; river blocks inside a range stay water.

| Area | Blocks | District | Rules / colours |
|---|---|---|---|
| St. Lawrence / Old Town | i 1–3, j 7–8 | office | `OLD_TOWN_RULES`: 15–30 m, 2 × 2 lots, shop/office facades. Red and buff brick. |
| Entertainment District | i −8 to −7, j 6–7 | highrise | Condo glass (`CONDO_COLORS`). |
| The Annex | i −13 to −10, j −11 to −7 | residential | `VICTORIAN_RULES`: 14–24 m, footprint 0.7–0.85, 3 × 3 lots. Dark red brick, cream. |
| Trinity Bellwoods | i −16 to −15, j 4–5 | park | — |
| Little Italy | i −17 to −14, j −1 to 0 | neon | `MAIN_STREET_RULES`: low shops 10–20 m, 1 sign per building. Terracotta, cream, green, ochre. |
| Cabbagetown | i 5–6, j −2 to 1 | residential | `VICTORIAN_RULES` with smaller houses (10–18 m), via `COTTAGE_RULES`. Red brick, cream. |
| Regent Park | i 5–6, j 2–3 | highrise | `MIDRISE_RULES`: 30–90 m. Pale glass and brick. |
| Riverside | i 9–12, j 5 | neon | `MAIN_STREET_RULES`, 0.5 signs. Brick and cream. |
| Leslieville | i 13–19, j 5 | neon | `MAIN_STREET_RULES`. Brick and pastels. |
| Greektown (the Danforth) | i 9–19, j −6 | neon | `MAIN_STREET_RULES`. White, Aegean blue, pale stone. |

## Engine change

- **`Area` gains `rules?: DistrictRules`.**
- **Toronto's `blockRules`** becomes `(x, z) => areaAt(x, z)?.rules ?? (pocketAt(x, z) ? POCKET_RULES : undefined)`. Named areas already rule out pockets, so the two never conflict.
- **Colours:** an area's `colors` (through `blockColors`) still sets the palette when present. Otherwise the rules' own colours apply.

## Landmarks (built in code; destructible, with health by height)

- **St. Lawrence Market** (`stLawrenceMarket.ts`, the interior centre of block (2, 8)):
  - a red-brick hall about 140 × 60 m, 14 m to the eaves and 22 m to the ridge of a long pitched roof;
  - arched window bands and a pale stone end facade.
- **The Gooderham Building** (`gooderham.ts`, block (1, 8)):
  - a five-storey brick wedge about 22 m tall: a triangle 40 m across the base, its point facing west, with a rounded tip;
  - a green copper roof band.
- **Roy Thomson Hall** (`royThomsonHall.ts`, block (−6, 7)): a round, low glass dome about 90 m across and 30 m tall, on a pale plinth, with a dark glass lattice.

**Placement:** each sits inside its block's interior. Its block is added to `LANDMARK_BLOCKS`, so pockets and bank parks treat it as built.

## Testing

Vitest:
- **Areas** (`districts.test.ts`, new):
  - each area's sample blocks get its district;
  - its buildings use its palette;
  - an area with `rules` builds within its height range.
- **Rules scope:** blocks just outside each area keep their previous district and rules (for example a midtown block beside the Annex still uses midtown rules).
- **No overlaps:** no new area overlaps an existing one or a landmark block, and no new area's land blocks are water.
- **Landmarks:**
  - each sits on land inside its block's interior;
  - each is vertex-coloured, stands at y 0 and fits its stated size;
  - each is listed among Toronto's landmarks.
- **Existing tests:** the Toronto tests still pass. Any whose assumptions change (counts of residential or parkette blocks, district samples) are updated to their intent, and the change is logged as a ruling.
- **In the browser:** the owner checks with `?city=toronto`.

## Out of scope

- New facade textures (existing facade cells are reused).
- Streetcars, street furniture, signage text.
- Tokyo.
