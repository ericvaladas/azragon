# Toronto Waterfront Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the walkable Port Lands (with the Ship Channel, industrial blocks, Cherry Beach and the Hearn), Harbourfront condos, Exhibition Place (BMO Field and the Princes' Gates), the Ontario Place scenery islets (Cinesphere and pods), and trim the spit's causeway to start at the new shore.

**Architecture:**
- **Shoreline:** it gains block rectangles that override the coastline: `landAreas` and `waterAreas`, read in `isBay`, so everything built on the water tests follows.
- **Toronto data:** it sets those areas, new named areas (districts), a new `industrial` district type, beach blocks (sand ground pads) and three new landmarks.
- **Landforms:** they gain a `dome` detail for the Cinesphere.

**Tech Stack:** TypeScript, Three.js r170, Vitest (`npx vitest run <file>`, `npx tsc --noEmit -p .`).

**Spec:** `docs/superpowers/specs/2026-10-17-toronto-waterfront-phase2-design.md`

## Global Constraints

- **Blocks:** (column i, row j) covers x 200i … 200i + 200 and z 200j … 200j + 200. +x is east, +z is south.
- **Water areas win over land areas.** Tokyo sets neither, and its behaviour must not change.
- **Landmarks:** each must fit inside its block's interior (about 150–160 m across). So the Hearn's hall is about 150 × 80 m (the chimney still 215 m), and BMO Field about 160 × 140 m. The spec gave larger footprints before block interiors were checked; that is a ruling.
- **No bridges over water areas.** Comments state behaviour and constraints, never history. Don't push or deploy.

## Review Focus

1. **Port Lands reachable by road:** the road network must reach them from downtown (Task 2: "a road route reaches the Port Lands from downtown").
2. **Ship Channel at the shoreline:** it must stop the monster (Task 2: "the monster can't walk into the Ship Channel").
3. **Landforms over the new land:** the islands, spit and Ontario Place must not overlap the new land or the mainland's wavering shore (Task 4: Phase 1's "over water blocks" test, re-run against the new land).
4. **Unchanged districts:** the Don's bank parks and the downtown and lakeshore districts west of the Port Lands must not change (Task 2: "keeps downtown's districts").
5. **Tokyo unchanged:** no shoreline or district change there (Task 1, plus the existing Tokyo tests).

---

### Task 1: Shoreline land and water areas

**Files:**
- Modify: `src/cities/types.ts`. Add `CellRect`; `Shoreline` gains `landAreas?` and `waterAreas?`.
- Modify: `src/world/roads.ts` (`isBay`).
- Test: `src/world/shore.test.ts` (append a `describe`).

**Interfaces:**
- Produces: `type CellRect = { ci0: number; ci1: number; cj0: number; cj1: number }`, `Shoreline = { bay?; island?; landAreas?: readonly CellRect[]; waterAreas?: readonly CellRect[] }`, and `inCellRect(r, ci, cj): boolean` (exported from `roads.ts`).

- [ ] **Step 1: Add the types.** In `src/cities/types.ts`, replace

```ts
/** Shape of the coast and island only (what the water tests read). */
export type Shoreline = { bay?: BaySpec; island?: IslandSpec };
```

with

```ts
/** Blocks ci0..ci1 × cj0..cj1 (inclusive). */
export type CellRect = { ci0: number; ci1: number; cj0: number; cj1: number };
/**
 * Shape of the coast only (what the water tests read): the coastline, an island, and blocks overriding the coastline:
 * `landAreas` are land though seaward of it (a peninsula), `waterAreas` are water though inland (a channel). Water
 * areas win over land areas.
 */
export type Shoreline = { bay?: BaySpec; island?: IslandSpec; landAreas?: readonly CellRect[]; waterAreas?: readonly CellRect[] };
```

  Then make sure `CityStyle` carries the two fields. If `CityStyle` lists `bay?` and `island?` itself instead of extending `Shoreline`, add after `island?`:

```ts
  landAreas?: readonly CellRect[];
  waterAreas?: readonly CellRect[];
```

- [ ] **Step 2: Write the failing test.** Append to `src/world/shore.test.ts`:

```ts
describe('shoreline land and water areas', () => {
  const lake = { dir: { x: 0, z: 1 }, offset: 2250, amp: 0, wavelength: 1000 };
  const style = { bay: lake, landAreas: [{ ci0: 5, ci1: 8, cj0: 11, cj1: 14 }], waterAreas: [{ ci0: 5, ci1: 8, cj0: 13, cj1: 13 }, { ci0: 0, ci1: 0, cj0: 3, cj1: 3 }] };

  it('a land area is land beyond the coastline; around it the lake is unchanged', () => {
    expect(isBay(style, 6, 12)).toBe(false);
    expect(isBay(style, 9, 12)).toBe(true);
    expect(isBay(style, 6, 15)).toBe(true);
  });

  it('a water area is water, inside a land area and inland', () => {
    expect(isBay(style, 6, 13)).toBe(true);
    expect(isBay(style, 0, 3)).toBe(true);
    expect(isBay(style, 1, 3)).toBe(false);
    expect(isWater(style, 6, 13)).toBe(true);
  });

  it('a style without areas is unchanged', () => {
    for (let i = -10; i <= 10; i++) for (let j = 5; j <= 15; j++) expect(isBay({ bay: lake }, i, j)).toBe((j + 0.5) * 200 > 2250);
  });
});
```

  Add `isBay` and `isWater` to the file's `../world/roads` (or `./roads`) import if they aren't there.

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/world/shore.test.ts`. Expected: FAIL, because the land-area block reads as bay and the inland water area as land.

- [ ] **Step 4: Implement.** In `src/world/roads.ts`, export a helper and rewrite `isBay`:

```ts
/** Whether block (ci, cj) lies in r. */
export function inCellRect(r: CellRect, ci: number, cj: number): boolean {
  return ci >= r.ci0 && ci <= r.ci1 && cj >= r.cj0 && cj <= r.cj1;
}

/**
 * True when block (ci, cj) is bay: in a water area; else not in a land area, seaward of the coastline and not an island.
 */
export function isBay(style: Shoreline, ci: number, cj: number): boolean {
  if (style.waterAreas?.some((r) => inCellRect(r, ci, cj))) return true;
  if (style.landAreas?.some((r) => inCellRect(r, ci, cj))) return false;
  const bay = style.bay;
  if (!bay) return false;
  const { x, z } = cellCentre(ci, cj);
  const along = x * bay.dir.x + z * bay.dir.z;
  const across = -x * bay.dir.z + z * bay.dir.x;
  return along > bay.offset + bay.amp * Math.sin(across / bay.wavelength) && !isIsland(style, ci, cj);
}
```

  Import `CellRect` (type) from `../cities/types`. Keep the existing behaviour for everything else.

- [ ] **Step 5: Run the tests.** Run: `npx tsc --noEmit -p . && npx vitest run src/world src/cities`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/cities/types.ts src/world/roads.ts src/world/shore.test.ts
git commit -m "Shoreline land and water areas: blocks overriding the coastline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Toronto's Port Lands, Ship Channel, districts and Cherry Beach

**Files:**
- Modify: `src/cities/types.ts`. `DistrictId` gains `'industrial'`; `CityStyle` gains `beaches?: readonly CellRect[]`; `CityStyle.colors` gains `beach?: number`.
- Modify: `src/cities/toronto/districts.ts`, `src/cities/tokyo/districts.ts` (an `industrial` entry).
- Modify: `src/cities/toronto/layout.ts`. Add `PORT_LANDS`, `SHIP_CHANNEL`, `CHERRY_BEACH`, and new `AREAS` entries.
- Modify: `src/cities/toronto/index.ts`. Add `landAreas`, `waterAreas`, `beaches`, and `colors.beach`.
- Modify: `src/world/chunks.ts`. `ChunkContent.beaches`; beach blocks push a sand pad (not a park pad), and their trees go in the north half.
- Modify: `src/world/City.ts` (colour the beach pads).
- Test: `src/cities/toronto/portLands.test.ts` (new).

**Interfaces:**
- Consumes: `inCellRect`, `isBay`, `isWater` (Task 1).
- Produces: `PORT_LANDS: readonly CellRect[]`, `SHIP_CHANNEL: CellRect`, `CHERRY_BEACH: CellRect` exported from `layout.ts`, and `ChunkContent.beaches: ParkSpec[]`.

- [ ] **Step 1: Types and districts.**
  - In `src/cities/types.ts`:
    - change `DistrictId` to `'highrise' | 'neon' | 'office' | 'residential' | 'park' | 'port' | 'industrial'`;
    - add to `CityStyle`, after `waterAreas?`:

```ts
  /** Park blocks that are beaches: sand pads instead of grass, their trees only in the inland (north, −z) half. */
  beaches?: readonly CellRect[];
```

    - add `beach?: number;` to `CityStyle.colors` with the doc `/** Sand pads of beach blocks (absent: the park colour). */`.
  - In `src/cities/toronto/districts.ts`, add to `TORONTO_DISTRICTS`:

```ts
  // The Port Lands: low brick sheds and wide warehouses in brick, rust, concrete and pale corrugated green.
  industrial: {
    lots: 2, fill: 0.9, minPerBlock: 2, height: [10, 30], heightCurve: 1.6, footprint: [0.7, 0.95],
    facades: [FACADE.office, FACADE.office, FACADE.shop], colors: [0xa8553e, 0x8a5a44, 0x9a9690, 0xb5b0a6, 0x8fae98],
    signs: 0, billboard: 0, trees: 1,
  },
```

  - In `src/cities/tokyo/districts.ts`, add the same entry to `TOKYO_DISTRICTS`, with the comment `// Unused in Tokyo (every city defines every district).`.
  - If `tsc` reports a `Record<DistrictId, …>` elsewhere (for example `roadRemoval`) missing `industrial`, add `industrial: 0.15` to each city's map.

- [ ] **Step 2: Write the failing test** `src/cities/toronto/portLands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { TORONTO } from '.';
import { CHERRY_BEACH, PORT_LANDS, SHIP_CHANNEL, districtAt } from './layout';
import { inCellRect, isBay, isWater, planRoadPath, PITCH } from '../../world/roads';
import { chunksInRadius, generateChunk } from '../../world/chunks';
import { shoreStep } from '../../world/shore';

const centre = (c: number) => (c + 0.5) * PITCH;
const inPortLands = (i: number, j: number) => PORT_LANDS.some((r) => inCellRect(r, i, j));

describe('the Port Lands', () => {
  it('are land in their stepped outline, lake just outside it', () => {
    for (let i = 8; i <= 23; i++) for (let j = 11; j <= 16; j++) if (!inCellRect(SHIP_CHANNEL, i, j)) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(false);
    for (let i = 9; i <= 17; i++) expect(isBay(TORONTO, i, 19), `${i},19`).toBe(false);
    expect(isBay(TORONTO, 21, 17)).toBe(true);
    expect(isBay(TORONTO, 18, 18)).toBe(true);
    expect(isBay(TORONTO, 8, 18)).toBe(true);
    expect(isBay(TORONTO, 10, 20)).toBe(true);
    expect(isBay(TORONTO, 24, 12)).toBe(true);
  });

  it('are cut by the Ship Channel, open to the harbour at its west end', () => {
    for (let i = SHIP_CHANNEL.ci0; i <= SHIP_CHANNEL.ci1; i++) expect(isWater(TORONTO, i, 14), `${i},14`).toBe(true);
    expect(isBay(TORONTO, SHIP_CHANNEL.ci0 - 1, 14)).toBe(true);
    expect(isBay(TORONTO, SHIP_CHANNEL.ci1 + 1, 14)).toBe(false);
  });

  it('leave the Eastern Gap open between Ward\'s tip and their west edge', () => {
    expect(isBay(TORONTO, 7, 17)).toBe(true);
    expect(isBay(TORONTO, 7, 18)).toBe(true);
  });

  it('are industrial, with Cherry Beach a park; Harbourfront is waterfront condos; Exhibition Place is park', () => {
    expect(districtAt(centre(14), centre(12))).toBe('industrial');
    expect(districtAt(centre(20), centre(16))).toBe('industrial');
    for (let i = CHERRY_BEACH.ci0; i <= CHERRY_BEACH.ci1; i++) expect(districtAt(centre(i), centre(19))).toBe('park');
    for (let i = -9; i <= -1; i++) expect(districtAt(centre(i), centre(10)), `${i},10`).toBe('port');
    for (let i = -18; i <= -13; i++) for (const j of [9, 10]) expect(districtAt(centre(i), centre(j)), `${i},${j}`).toBe('park');
  });

  it('keeps downtown\'s districts north of the shore row', () => {
    expect(districtAt(centre(-3), centre(8))).toBe('office');
    expect(districtAt(centre(3), centre(9))).not.toBe('industrial');
  });

  it('gives Cherry Beach sand pads (no grass pads) and trees only in their inland half', () => {
    let sand = 0;
    for (const c of chunksInRadius(centre(10), centre(19), 600)) {
      const ch = generateChunk(TORONTO, CONFIG.world.seed, c.cx, c.cz);
      for (const b of ch.beaches) {
        const bi = Math.floor(b.x / PITCH);
        const bj = Math.floor(b.z / PITCH);
        expect(inCellRect(CHERRY_BEACH, bi, bj)).toBe(true);
        sand++;
      }
      for (const p of ch.parks) expect(inCellRect(CHERRY_BEACH, Math.floor(p.x / PITCH), Math.floor(p.z / PITCH))).toBe(false);
      for (const t of ch.trees) if (inCellRect(CHERRY_BEACH, Math.floor(t.x / PITCH), Math.floor(t.z / PITCH))) expect(t.z).toBeLessThanOrEqual(centre(19) + 1);
    }
    expect(sand).toBe(CHERRY_BEACH.ci1 - CHERRY_BEACH.ci0 + 1);
    expect(TORONTO.colors.beach).toBeDefined();
  });

  it('a road route reaches the Port Lands from downtown', () => {
    const path = planRoadPath(TORONTO, { x: 0, z: 1500 }, { x: 3000, z: 2500 });
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1]!;
    expect(inPortLands(Math.floor(end.x / PITCH), Math.floor(end.z / PITCH))).toBe(true);
  });

  it('the monster can\'t walk into the Ship Channel', () => {
    const step = shoreStep(TORONTO, { x: 3100, z: 2700 }, { x: 3100, z: 2900 }, 60);
    expect(step.pos.z).toBeLessThan(2800);
  });
});
```

  If `planRoadPath` or `shoreStep` live in different modules or take different arguments, adapt the imports and calls to their real signatures (check with `grep -n "export function planRoadPath\|export function shoreStep" -r src/world`), keeping each test's intent. Log a ruling if you do.

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/portLands.test.ts`. Expected: FAIL, because `PORT_LANDS` and the others aren't exported yet.

- [ ] **Step 4: Layout.** In `src/cities/toronto/layout.ts`, after `TORONTO_LAKE`, add:

```ts
/** The Port Lands: a peninsula south into the lake east of the Don, stepped narrower toward its southern tip. */
export const PORT_LANDS: readonly CellRect[] = [
  { ci0: 8, ci1: 23, cj0: 11, cj1: 16 },
  { ci0: 8, ci1: 20, cj0: 17, cj1: 17 },
  { ci0: 9, ci1: 17, cj0: 18, cj1: 19 },
];
/** The Ship Channel: one block wide across the Port Lands, open to the harbour at its west end. */
export const SHIP_CHANNEL: CellRect = { ci0: 8, ci1: 22, cj0: 14, cj1: 14 };
/** Cherry Beach: the Port Lands' southwest shore. */
export const CHERRY_BEACH: CellRect = { ci0: 9, ci1: 11, cj0: 19, cj1: 19 };
```

  Import `CellRect` (type). Then add these areas at the **start** of `AREAS`; the first match wins:

```ts
  // Cherry Beach: sand and trees on the Port Lands' southwest shore.
  { name: 'Cherry Beach', district: 'park', ...CHERRY_BEACH },
  // The Port Lands: low industry on the peninsula.
  ...PORT_LANDS.map((r) => ({ name: 'Port Lands', district: 'industrial' as const, ...r })),
  // Harbourfront and Queens Quay: waterfront condos along the shore row west of Yonge.
  { name: 'Harbourfront', district: 'port', ci0: -9, ci1: -1, cj0: 10, cj1: 10 },
  // Exhibition Place: grounds around BMO Field and the Princes' Gates.
  { name: 'Exhibition Place', district: 'park', ci0: -18, ci1: -13, cj0: 9, cj1: 10 },
```

  The `Area` type's block form uses `ci0, ci1, cj0, cj1`, so spreading a `CellRect` fits.

- [ ] **Step 5: Style.** In `src/cities/toronto/index.ts`:
  - import `PORT_LANDS`, `SHIP_CHANNEL` and `CHERRY_BEACH` from `./layout`;
  - after `bay: TORONTO_LAKE,` add:

```ts
  landAreas: PORT_LANDS,
  waterAreas: [SHIP_CHANNEL],
  beaches: [CHERRY_BEACH],
```

  - in `colors` add `beach: 0xe3d3a1,`.

- [ ] **Step 6: Beach pads in chunks and City.** In `src/world/chunks.ts`:
  - `ChunkContent` gains `beaches: ParkSpec[];` with the doc `/** Beach blocks, by centre: sand pads under their trees. */`;
  - declare `const beaches: ParkSpec[] = [];` beside `parks`;
  - include `beaches` in the returned object;
  - in the `if (district === 'park') {` branch, replace `parks.push({ x: bx, z: bz });` and the tree `z` with:

```ts
        const beach = style.beaches?.some((r) => inCellRect(r, bi, bj)) ?? false;
        (beach ? beaches : parks).push({ x: bx, z: bz });
```

    and in the tree line use `z: beach ? iz + range(rng, -id / 2, 0) : iz + range(rng, -id / 2, id / 2)`, with the comment `// A beach's trees stand on its inland (north, −z) half; the sand runs to the water.`;
  - import `inCellRect` from `./roads`.

  In `src/world/City.ts`, in the pad list beside `...content.lawns.map(...)`, add:

```ts
      ...content.beaches.map((b) => ({ ...b, color: colors.beach ?? colors.park })),
```

  Any other code constructing a `ChunkContent` literal (tests or helpers) gets `beaches: []`. `tsc` will list them.

- [ ] **Step 7: Run everything.** Run: `npx tsc --noEmit -p . && npx vitest run`. Expected: PASS.
  - If an existing Toronto test assumed the Port Lands' blocks were lake, update it to the new land and log a ruling. Example: a Phase 1 landform test, or a lakeshore-band test that counted bay blocks east of the Don.
  - Phase 1's "lays every landform over water blocks" must still pass. If the causeway now overlaps Port Lands blocks, leave it failing for Task 4, which trims it, and note it in the ledger.

- [ ] **Step 8: Commit.**

```bash
git add -A src
git commit -m "Toronto Port Lands: peninsula, Ship Channel, industrial blocks, Cherry Beach; Harbourfront and Exhibition Place districts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Hearn, BMO Field and the Princes' Gates

**Files:**
- Create: `src/cities/toronto/hearn.ts`, `src/cities/toronto/bmoField.ts`, `src/cities/toronto/princesGates.ts`
- Modify: `src/cities/toronto/layout.ts` (sites), `src/cities/toronto/index.ts` (landmarks list)
- Test: `src/cities/toronto/waterfrontLandmarks.test.ts`

**Interfaces:**
- Consumes: `box`, `ring`, `merge` from `../shapes` (`box(x0,y0,z0,x1,y1,z1,color)`, `ring(r0,r1,y0,y1,color,sides)`); `blockInterior(ci, cj)` from `./layout`.
- Produces: `HEARN`, `hearnGeometry()`, `BMO_FIELD`, `bmoFieldGeometry()`, `PRINCES_GATES`, `princesGatesGeometry()`; sites `HEARN_SITE`, `BMO_FIELD_SITE`, `PRINCES_GATES_SITE`.

- [ ] **Step 1: Write the failing test** `src/cities/toronto/waterfrontLandmarks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TORONTO } from '.';
import { BMO_FIELD_SITE, HEARN_SITE, PRINCES_GATES_SITE, blockInterior } from './layout';
import { isWater, PITCH } from '../../world/roads';

const ids = ['hearn', 'bmo-field', 'princes-gates'] as const;
const lm = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;

describe('waterfront landmarks', () => {
  it('lists the Hearn, BMO Field and the Princes\' Gates on Toronto, at their sites', () => {
    expect(lm('hearn')).toMatchObject(HEARN_SITE);
    expect(lm('bmo-field')).toMatchObject(BMO_FIELD_SITE);
    expect(lm('princes-gates')).toMatchObject(PRINCES_GATES_SITE);
  });

  it('stands each inside its block\'s interior, on land', () => {
    for (const id of ids) {
      const l = lm(id);
      const ci = Math.floor(l.x / PITCH);
      const cj = Math.floor(l.z / PITCH);
      expect(isWater(TORONTO, ci, cj), id).toBe(false);
      const r = blockInterior(ci, cj);
      expect(l.x - l.w / 2, id).toBeGreaterThanOrEqual(r.x0 - 1);
      expect(l.x + l.w / 2, id).toBeLessThanOrEqual(r.x1 + 1);
      expect(l.z - l.d / 2, id).toBeGreaterThanOrEqual(r.z0 - 1);
      expect(l.z + l.d / 2, id).toBeLessThanOrEqual(r.z1 + 1);
    }
  });

  it('builds each to its stated size, vertex-coloured, standing on the ground', () => {
    for (const id of ids) {
      const l = lm(id);
      const g = l.build();
      expect(g.getAttribute('color'), id).toBeDefined();
      const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      expect(b.min.y, id).toBeCloseTo(0, 0);
      expect(b.max.y, id).toBeCloseTo(l.h, -1);
      expect(b.max.x - b.min.x, id).toBeLessThanOrEqual(l.w + 1);
      expect(b.max.z - b.min.z, id).toBeLessThanOrEqual(l.d + 1);
    }
  });

  it('makes the Hearn\'s chimney the skyline\'s second-tallest structure after the CN Tower', () => {
    const heights = [...TORONTO.landmarks].sort((a, b) => b.h - a.h).map((l) => l.id);
    expect(heights[0]).toBe('cn-tower');
    expect(heights[1]).toBe('hearn');
    expect(lm('hearn').h).toBeGreaterThan(200);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/waterfrontLandmarks.test.ts`. Expected: FAIL, because the sites aren't exported yet.

- [ ] **Step 3: Sites.** In `src/cities/toronto/layout.ts`, add after `SCOTIABANK_ARENA_SITE` (note that `blockInterior` is defined lower in the file; move these lines below it, or compute with a local function that does the same):

```ts
const interiorCentre = (ci: number, cj: number) => {
  const r = blockInterior(ci, cj);
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
};
/** The Hearn generating station: the interior centre of Port Lands block (18, 15), south of the Ship Channel. */
export const HEARN_SITE = interiorCentre(18, 15);
/** BMO Field: the interior centre of Exhibition Place block (−15, 10). */
export const BMO_FIELD_SITE = interiorCentre(-15, 10);
/** The Princes' Gates: the interior centre of Exhibition Place block (−13, 9), its east entrance. */
export const PRINCES_GATES_SITE = interiorCentre(-13, 9);
```

  Place them after `blockInterior`'s definition, because `const` functions aren't hoisted.

- [ ] **Step 4: Models.**

  `src/cities/toronto/hearn.ts`:

```ts
import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** The Hearn: a brick hall 150 × 80 × 50 m, its chimney 215 m tall at the east end. */
export const HEARN = { w: 150, d: 80, h: 215 } as const;
const BRICK = 0x8a4a36;
const BRICK_DARK = 0x6a3828;
const WINDOW = 0x2e3a44;
const CONCRETE = 0xb3ada3;
const BAND = 0x3a3634;

/**
 * The Hearn generating station: a long brick hall with tall vertical window bands and a stepped roof, and its
 * chimney (a slightly tapering concrete cylinder with a dark band near the top) at the hall's east (+x) end. Base
 * centre at the origin, +Y up, vertex-coloured.
 */
export function hearnGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-75, 0, -40, 45, 50, 40, BRICK),
    box(-70, 50, -32, 40, 58, 32, BRICK_DARK),
  ];
  // Tall window bands down both long faces.
  for (let x = -65; x <= 35; x += 20) {
    parts.push(box(x, 8, -40.6, x + 8, 44, -40, WINDOW));
    parts.push(box(x, 8, 40, x + 8, 44, 40.6, WINDOW));
  }
  // The chimney on a low plinth at the east end.
  parts.push(box(45, 0, -20, 75, 12, 20, BRICK_DARK));
  parts.push(ring(6.5, 5.5, 12, 195, CONCRETE, 16).translate(60, 0, 0));
  parts.push(ring(5.5, 5.5, 195, 205, BAND, 16).translate(60, 0, 0));
  parts.push(ring(5.5, 5.4, 205, 215, CONCRETE, 16).translate(60, 0, 0));
  return merge(parts);
}
```

  If `ring(r0, r1, …)` treats r0 and r1 differently from "bottom radius, top radius", read `src/cities/shapes.ts` and swap the arguments so the chimney narrows upward.

  `src/cities/toronto/bmoField.ts`:

```ts
import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** BMO Field: an open bowl 160 × 140 m, 30 m to the canopy tops. */
export const BMO_FIELD = { w: 160, d: 140, h: 30 } as const;
const PITCH_GREEN = 0x4f9a46;
const STAND = 0x8f9499;
const STAND_DARK = 0x6c7176;
const CANOPY = 0xf0f0ec;

/**
 * BMO Field: a green pitch in a ring of grey stands rising outward, with white canopy roofs over the east and west
 * stands. Base centre at the origin, +Y up, vertex-coloured.
 */
export function bmoFieldGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(-55, 0, -40, 55, 1, 40, PITCH_GREEN)];
  // Stands: three tiers on each side, stepping up and out.
  for (let k = 0; k < 3; k++) {
    const o = 55 + k * 8;
    const p = 40 + k * 8;
    const y = 4 + k * 6;
    parts.push(box(-o - 8, 0, -p - 8, o + 8, y, -p, k % 2 ? STAND_DARK : STAND));
    parts.push(box(-o - 8, 0, p, o + 8, y, p + 8, k % 2 ? STAND_DARK : STAND));
    parts.push(box(-o - 8, 0, -p, -o, y, p, k % 2 ? STAND_DARK : STAND));
    parts.push(box(o, 0, -p, o + 8, y, p, k % 2 ? STAND_DARK : STAND));
  }
  // Canopies over the east and west stands, on posts.
  for (const sx of [-1, 1]) {
    parts.push(box(sx > 0 ? 62 : -80, 26, -60, sx > 0 ? 80 : -62, 30, 60, CANOPY));
    for (const z of [-55, 0, 55]) parts.push(box(sx * 79 - 1, 16, z - 1, sx * 79 + 1, 26, z + 1, STAND_DARK));
  }
  return merge(parts);
}
```

  `src/cities/toronto/princesGates.ts`:

```ts
import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** The Princes' Gates: a stone arch 60 m wide, 25 m to the statue's head. */
export const PRINCES_GATES = { w: 60, d: 14, h: 25 } as const;
const STONE = 0xe6dfcf;
const STONE_DARK = 0xc9c0ad;
const STATUE = 0xb8b0a0;

/**
 * The Princes' Gates: a central triumphal arch (two piers, an entablature, a statue on top) between two low
 * colonnade wings. Base centre at the origin, +Y up, vertex-coloured.
 */
export function princesGatesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-9, 0, -6, -4, 16, 6, STONE),
    box(4, 0, -6, 9, 16, 6, STONE),
    box(-10, 16, -7, 10, 20, 7, STONE_DARK),
    box(-2, 20, -2, 2, 25, 2, STATUE),
  ];
  // Colonnade wings: columns under a beam, either side.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const x = sx * (13 + k * 3.2);
      parts.push(box(x - 0.6, 0, -1, x + 0.6, 9, 1, STONE));
    }
    parts.push(box(sx > 0 ? 11 : -30, 9, -1.5, sx > 0 ? 30 : -11, 11, 1.5, STONE_DARK));
  }
  return merge(parts);
}
```

- [ ] **Step 5: Register them.** In `src/cities/toronto/index.ts`, import the three models and sites, and add to `landmarks`:

```ts
    { id: 'hearn', x: HEARN_SITE.x, z: HEARN_SITE.z, w: HEARN.w, d: HEARN.d, h: HEARN.h, build: hearnGeometry },
    { id: 'bmo-field', x: BMO_FIELD_SITE.x, z: BMO_FIELD_SITE.z, w: BMO_FIELD.w, d: BMO_FIELD.d, h: BMO_FIELD.h, build: bmoFieldGeometry },
    { id: 'princes-gates', x: PRINCES_GATES_SITE.x, z: PRINCES_GATES_SITE.z, w: PRINCES_GATES.w, d: PRINCES_GATES.d, h: PRINCES_GATES.h, build: princesGatesGeometry },
```

  If Toronto keeps a list of landmark blocks for the Don-bank or pocket tests (`LANDMARK_BLOCKS` in `layout.ts`), add the three sites to it.

- [ ] **Step 6: Run everything.** Run: `npx tsc --noEmit -p . && npx vitest run`. Expected: PASS. If a model's measured width or depth exceeds its `w`/`d`, shrink the offending parts to fit and log a ruling.

- [ ] **Step 7: Commit.**

```bash
git add -A src
git commit -m "Add the Hearn, BMO Field and the Princes' Gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ontario Place islets, the dome detail, and the trimmed causeway

**Files:**
- Modify: `src/cities/types.ts` (`LandformDetail` gains `{ kind: 'dome'; x; z; r; color }`)
- Modify: `src/world/landforms.ts` (`onDetail` handles `dome`)
- Modify: `src/world/LandformRenderer.ts` (`detailGeometry` handles `dome`)
- Modify: `src/cities/toronto/waterfront.ts` (`ONTARIO_PLACE_WEST`, `ONTARIO_PLACE_EAST`, trimmed `SPIT_CAUSEWAY`, `TORONTO_LANDFORMS`)
- Modify tests: `src/cities/toronto/waterfront.test.ts`

**Interfaces:**
- Produces: `ONTARIO_PLACE_WEST`, `ONTARIO_PLACE_EAST` (exported `LandformSpec`s), included in `TORONTO_LANDFORMS`, plus the `dome` detail.

- [ ] **Step 1: Update the tests first.** In `src/cities/toronto/waterfront.test.ts`:
  - import `ONTARIO_PLACE_EAST` and `ONTARIO_PLACE_WEST` from `./waterfront`;
  - change the list test's expectation to `[ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM, ONTARIO_PLACE_WEST, ONTARIO_PLACE_EAST]`;
  - replace the causeway-root assertions in "keeps the islands, lobes and arm out in the lake…" (the `cz` lines) with:

```ts
    // The causeway now leaves the Port Lands' southeast corner, out in the lake.
    for (const p of prep(SPIT_CAUSEWAY).outline) expect(coastDistance(TORONTO.bay!, p.x, p.z)).toBeLessThan(0);
    expect(Math.min(...prep(SPIT_CAUSEWAY).outline.map((p) => p.z))).toBeGreaterThan(3400);
```

  - add `ONTARIO_PLACE_WEST, ONTARIO_PLACE_EAST` to the "out in the lake" loop list;
  - change the detail count test to expect `tower` 2, `dome` 1, and `water` boxes 2 + 6 (the three pods and their three stilts):

```ts
    expect(d.filter((x) => x.kind === 'tower')).toHaveLength(2);
    expect(d.filter((x) => x.kind === 'dome')).toHaveLength(1);
    expect(d.filter((x) => x.kind === 'box' && x.water)).toHaveLength(8);
```

  - in "stands every detail on grass", treat a dome like a tower (corners at ±r).

- [ ] **Step 2: Run them to make sure they fail.** Run: `npx vitest run src/cities/toronto/waterfront.test.ts`. Expected: FAIL, because the Ontario Place exports don't exist yet.

- [ ] **Step 3: The dome detail.**
  - In `src/cities/types.ts`, add a member to `LandformDetail`: `| { kind: 'dome'; x: number; z: number; r: number; color: number }`, and extend the doc with: `A dome is a faceted sphere of radius r sunk a quarter into the ground.`.
  - In `src/world/landforms.ts` `onDetail`, change `if (d.kind === 'tower')` to `if (d.kind === 'tower' || d.kind === 'dome')`.
  - In `src/world/LandformRenderer.ts` `detailGeometry`, add before the tower branch:

```ts
  if (d.kind === 'dome') return painted(faceted(new THREE.IcosahedronGeometry(d.r, 1)), d.color).translate(d.x, LANDFORM_Y.grass + d.r * 0.5, d.z);
```

- [ ] **Step 4: Ontario Place and the causeway.** In `src/cities/toronto/waterfront.ts`:
  - replace the `LESLIE_SHORE` and `CAUSEWAY_KNEE` constants and the `SPIT_CAUSEWAY` definition with:

```ts
/** The causeway's root: just off the Port Lands' southeast corner. */
const CAUSEWAY_ROOT = { x: 4699, z: 3460 };

/** The spit's causeway: from the Port Lands' southeast corner diagonally southwest to the lobes, a pale path along it. */
export const SPIT_CAUSEWAY: LandformSpec = {
  name: 'Tommy Thompson Park causeway',
  outline: ribbon([CAUSEWAY_ROOT, CAUSEWAY_END], 110),
  sharp: true,
  holes: [],
  beach: 20,
  treeEvery: 6000,
  details: [strip({ x: 4680, z: 3500 }, { x: 3760, z: 4730 }, 12, 0.3, P.landPath)],
};
```

  (Keep `CAUSEWAY_END` declared before it.)
  - add, before `TORONTO_LANDFORMS`:

```ts
const POD = 0x2a3440;

/** Ontario Place's west islet, carrying the Cinesphere. */
export const ONTARIO_PLACE_WEST: LandformSpec = {
  name: 'Ontario Place west islet',
  outline: [{ x: -3350, z: 2520 }, { x: -3150, z: 2475 }, { x: -2955, z: 2540 }, { x: -2960, z: 2700 }, { x: -3150, z: 2750 }, { x: -3330, z: 2680 }],
  holes: [],
  beach: 15,
  treeEvery: 4000,
  details: [{ kind: 'dome', x: -3150, z: 2610, r: 20, color: P.lighthouseWhite }],
};

/** Ontario Place's east islet, with the three pods raised on stilts out over its south shore. */
export const ONTARIO_PLACE_EAST: LandformSpec = {
  name: 'Ontario Place east islet',
  outline: [{ x: -2900, z: 2515 }, { x: -2700, z: 2485 }, { x: -2565, z: 2540 }, { x: -2580, z: 2660 }, { x: -2750, z: 2700 }, { x: -2880, z: 2640 }],
  holes: [],
  beach: 15,
  treeEvery: 4000,
  details: [-2790, -2730, -2670].flatMap((x): LandformDetail[] => [
    { kind: 'box', x, z: 2715, w: 30, d: 30, h: 15, yaw: 0, color: POD, y: 15, water: true },
    { kind: 'box', x, z: 2715, w: 3, d: 3, h: 15, yaw: 0, color: P.landPath, water: true },
  ]),
};

export const TORONTO_LANDFORMS: readonly LandformSpec[] = [ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM, ONTARIO_PLACE_WEST, ONTARIO_PLACE_EAST];
```

  Delete the old `TORONTO_LANDFORMS` line.

- [ ] **Step 5: Run everything.** Run: `npx tsc --noEmit -p . && npx vitest run && npm run build`. Expected: PASS and `✓ built`.
  - If "lays every landform over water blocks" fails for an Ontario Place point, move that islet 40 m south and log a ruling. The mainland's shore blocks reach z 2400 there.
  - If it fails for the dome on grass, move the dome toward the islet's centre.

- [ ] **Step 6: Commit.**

```bash
git add -A src
git commit -m "Ontario Place islets (Cinesphere, pods) and the causeway leaving the Port Lands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser check with the owner

- [ ] **Hand over for playtesting:** `npm run dev` with `?city=toronto`. Things to check:
  - **The Port Lands:** they read as an industrial peninsula, cut by the Ship Channel, with Cherry Beach's sand.
  - **The Hearn's chimney:** it stands out on the skyline.
  - **Harbourfront and Exhibition Place:** the condos, BMO Field and the Princes' Gates read clearly.
  - **The waterfront:** Ontario Place and the trimmed spit look right.
  - **Gameplay:** the monster can walk out onto the Port Lands, and enemies reach it.
- [ ] **Tune:** apply requested tuning. Commit only when the owner says so; never push or deploy unasked.
