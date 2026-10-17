# Toronto Districts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten named Toronto areas, some with their own building rules (St. Lawrence / Old Town, the Entertainment District, the Annex, Trinity Bellwoods, Little Italy, Cabbagetown, Regent Park, Riverside, Leslieville, Greektown), and three landmarks (St. Lawrence Market, the Gooderham Building, Roy Thomson Hall).

**Architecture:**
- **Area rules:** named areas gain an optional `rules`. Toronto's existing `blockRules` hook returns the area's rules first, then the pocket rules.
- **Data:** the new areas are entries in `AREAS`.
- **Landmarks:** they're built in code from `box` and `ring` (`src/cities/shapes.ts`), like the Hearn.

**Tech Stack:** TypeScript, Three.js r170, Vitest (`npx vitest run <file>`, `npx tsc --noEmit -p .`).

**Spec:** `docs/superpowers/specs/2026-10-17-toronto-districts-design.md`

## Global Constraints

- **Blocks:** (column i, row j) covers x 200i … 200i + 200 and z 200j … 200j + 200. +z is south.
- **Placement:** no new area overlaps an existing area or a landmark block, and landmarks fit their block's interior.
- **Toronto chunks are 4 × 4 blocks and share one random sequence.** Changing a block's district shifts later blocks in that chunk. Existing tests whose samples move get updated to their intent, with a ruling.
- Comments state behaviour and constraints, never history. Don't push or deploy.

## Review Focus

1. **Rules scope:** area rules must not leak to neighbouring blocks (Task 1: "rules apply only inside their areas").
2. **No overlaps:** new areas must not overlap existing areas, the Yonge corridor or landmark blocks (Task 1: "each new block belongs to its own area").
3. **Water in ranges:** river blocks inside an area range must stay water (Task 1).
4. **Fit:** landmarks must fit their block interiors (Task 2).

---

### Task 1: Area rules and the ten areas

**Files:**
- Modify: `src/cities/toronto/layout.ts` (`Area` gains `rules?`; new `AREAS` entries; palettes)
- Modify: `src/cities/toronto/districts.ts` (new rule sets)
- Modify: `src/cities/toronto/index.ts` (`blockRules`)
- Test: `src/cities/toronto/districts.test.ts` (new)

- [ ] **Step 1: Write the failing test** `src/cities/toronto/districts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { TORONTO } from '.';
import { AREAS, areaAt, districtAt } from './layout';
import { COTTAGE_RULES, MAIN_STREET_RULES, MIDRISE_RULES, OLD_TOWN_RULES, POCKET_RULES, VICTORIAN_RULES } from './districts';
import { isWater, PITCH } from '../../world/roads';
import { generateChunk } from '../../world/chunks';

const centre = (c: number) => (c + 0.5) * PITCH;
const NEW = [
  ['St. Lawrence / Old Town', 'office', OLD_TOWN_RULES],
  ['Entertainment District', 'highrise', undefined],
  ['The Annex', 'residential', VICTORIAN_RULES],
  ['Trinity Bellwoods', 'park', undefined],
  ['Little Italy', 'neon', MAIN_STREET_RULES],
  ['Cabbagetown', 'residential', COTTAGE_RULES],
  ['Regent Park', 'highrise', MIDRISE_RULES],
  ['Riverside', 'neon', undefined],
  ['Leslieville', 'neon', MAIN_STREET_RULES],
  ['Greektown', 'neon', MAIN_STREET_RULES],
] as const;
const area = (name: string) => {
  const a = AREAS.find((x) => x.name === name);
  if (!a || !('ci0' in a)) throw new Error(name);
  return a;
};
const blocks = (name: string) => {
  const a = area(name);
  const out: [number, number][] = [];
  for (let i = a.ci0; i <= a.ci1; i++) for (let j = a.cj0; j <= a.cj1; j++) if (!isWater(TORONTO, i, j)) out.push([i, j]);
  return out;
};

describe('Toronto districts', () => {
  it('gives each new area its district on every land block, and each new block belongs to its own area', () => {
    for (const [name, district] of NEW) {
      expect(blocks(name).length, name).toBeGreaterThan(0);
      for (const [i, j] of blocks(name)) {
        expect(areaAt(centre(i), centre(j))?.name, `${name} ${i},${j}`).toBe(name);
        expect(districtAt(centre(i), centre(j)), `${name} ${i},${j}`).toBe(district);
      }
    }
  });

  it('applies area rules only inside their areas', () => {
    for (const [name, , rules] of NEW) {
      if (!rules && name !== 'Riverside') continue;
      for (const [i, j] of blocks(name)) expect(TORONTO.blockRules!(centre(i), centre(j)), `${name} ${i},${j}`).toBe(area(name).rules);
    }
    // Just west of the Annex: midtown again (no area rules; a pocket at most).
    const r = TORONTO.blockRules!(centre(-14), centre(-9));
    expect(r === undefined || r === POCKET_RULES).toBe(true);
    expect(area('Riverside').rules!.signs).toBeLessThan(MAIN_STREET_RULES.signs);
  });

  it('builds each ruled area within its height range and palette', () => {
    for (const [name, , rules] of NEW) {
      const ar = area(name);
      const r = ar.rules ?? rules;
      if (!r) continue;
      const palette = ar.colors ?? r.colors;
      const seen = new Set<string>();
      let n = 0;
      for (const [i, j] of blocks(name)) {
        const key = `${Math.floor(i / 4)},${Math.floor(j / 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const b of generateChunk(TORONTO, CONFIG.world.seed, Math.floor(i / 4), Math.floor(j / 4)).buildings) {
          const bi = Math.floor(b.x / PITCH);
          const bj = Math.floor(b.z / PITCH);
          if (b.keep || areaAt(centre(bi), centre(bj))?.name !== name) continue;
          n++;
          expect(b.h, name).toBeGreaterThanOrEqual(r.height[0] - 1e-6);
          expect(b.h, name).toBeLessThanOrEqual(r.height[1] + 1e-6);
          expect(palette, name).toContain(b.color);
        }
      }
      expect(n, name).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/districts.test.ts`. Expected: FAIL, because the new rule exports don't exist.

- [ ] **Step 3: Rule sets.** Append to `src/cities/toronto/districts.ts`:

```ts
/** St. Lawrence / Old Town: low 1800s red and buff brick, shopfronts below. */
export const OLD_TOWN_RULES: DistrictRules = {
  lots: 2, fill: 0.9, minPerBlock: 2, height: [15, 30], heightCurve: 1.2, footprint: [0.75, 0.95],
  facades: [FACADE.shop, FACADE.office], colors: [0xa8553a, 0x9c4430, 0xc9a77a, 0xb98a5e, 0x8a3b2b],
  signs: 0.2, billboard: 0, trees: 2,
};

/** The Annex: big Victorian houses in dark red brick with cream trim. */
export const VICTORIAN_RULES: DistrictRules = {
  lots: 3, fill: 0.75, minPerBlock: 4, height: [14, 24], heightCurve: 1.2, footprint: [0.7, 0.85],
  facades: [FACADE.balcony], colors: [0x7a2e24, 0x8a3828, 0x6a2a22, 0xe2d3b2, 0x9a4030],
  signs: 0, billboard: 0, trees: 6,
};

/** Cabbagetown: smaller Victorian rows in red brick and cream. */
export const COTTAGE_RULES: DistrictRules = {
  ...VICTORIAN_RULES, lots: 4, height: [10, 18], footprint: [0.65, 0.8], colors: [0xb84d35, 0xa04632, 0xe2d3b2, 0xd9c8a0, 0x8e3a2c],
};

/** Main streets (Little Italy, Riverside, Leslieville, the Danforth): low shops shoulder to shoulder, about a sign each. */
export const MAIN_STREET_RULES: DistrictRules = {
  lots: 4, fill: 0.85, minPerBlock: 8, height: [10, 20], heightCurve: 1.2, footprint: [0.78, 0.92],
  facades: [FACADE.shop, FACADE.shop, FACADE.office], colors: [0xb05a3c, 0xe8dcc0, 0x8a3b2b],
  signs: 1, billboard: 0, trees: 2,
};

/** Regent Park: new mid-rise condos in pale glass and brick. */
export const MIDRISE_RULES: DistrictRules = {
  lots: 2, fill: 0.8, minPerBlock: 2, height: [30, 90], heightCurve: 1.3, footprint: [0.6, 0.85],
  facades: [FACADE.glass, FACADE.balcony], colors: [0xcfe3e6, 0xb7d3dc, 0xa8553a, 0xe2ecec, 0x9a9690],
  signs: 0, billboard: 0, trees: 4,
};
```

- [ ] **Step 4: Areas.** In `src/cities/toronto/layout.ts`:
  - import `DistrictRules` (type) from `../types`, and the five rule sets from `./districts`. If that creates an import cycle that `tsc` or tests reject, move the five rule sets into a new `src/cities/toronto/areaRules.ts` and import from there; update the test import to match, and log a ruling.
  - Change `Area` to `export type Area = { name: string; district: DistrictId; colors?: readonly number[]; rules?: DistrictRules } & (…)` and extend its doc: `` `rules`, when set, replaces the district's building rules on the area's random buildings. ``
  - Add palettes after `KENSINGTON_COLORS`:

```ts
/** Little Italy: terracotta, cream, green and ochre shopfronts. */
export const LITTLE_ITALY_COLORS = [0xc86a43, 0xe8dcc0, 0x5f8a4a, 0xd9a441] as const;
/** Leslieville: brick and pastel shopfronts. */
export const LESLIEVILLE_COLORS = [0xa8553a, 0xd9a3a0, 0xa9c4d4, 0xe8d9a8, 0x8fae98] as const;
/** Greektown on the Danforth: white, Aegean blue and pale stone. */
export const GREEKTOWN_COLORS = [0xf2f0ea, 0x2f6fb5, 0xd8d2c0, 0x4f8fc9] as const;
```

  - Append to `AREAS`:

```ts
  // St. Lawrence / Old Town: low brick east of Yonge, south of King, beside the Distillery.
  { name: 'St. Lawrence / Old Town', district: 'office', rules: OLD_TOWN_RULES, ci0: 1, ci1: 3, cj0: 7, cj1: 8 },
  // The Entertainment District: condo towers round King and John.
  { name: 'Entertainment District', district: 'highrise', colors: CONDO_COLORS, ci0: -8, ci1: -7, cj0: 6, cj1: 7 },
  // The Annex: big Victorian houses north of Bloor, west of Spadina.
  { name: 'The Annex', district: 'residential', rules: VICTORIAN_RULES, ci0: -13, ci1: -10, cj0: -11, cj1: -7 },
  // Trinity Bellwoods: the park at Queen and Strachan.
  { name: 'Trinity Bellwoods', district: 'park', ci0: -16, ci1: -15, cj0: 4, cj1: 5 },
  // Little Italy: low shops with signs along College.
  { name: 'Little Italy', district: 'neon', rules: MAIN_STREET_RULES, colors: LITTLE_ITALY_COLORS, ci0: -17, ci1: -14, cj0: -1, cj1: 0 },
  // Cabbagetown: small Victorian rows west of the Don.
  { name: 'Cabbagetown', district: 'residential', rules: COTTAGE_RULES, ci0: 5, ci1: 6, cj0: -2, cj1: 1 },
  // Regent Park: new mid-rise condos.
  { name: 'Regent Park', district: 'highrise', rules: MIDRISE_RULES, ci0: 5, ci1: 6, cj0: 2, cj1: 3 },
  // Riverside: low brick shops along Queen East past the Don, a few signs.
  { name: 'Riverside', district: 'neon', rules: { ...MAIN_STREET_RULES, signs: 0.5 }, colors: [0xa8553a, 0x8a3b2b, 0xe8dcc0], ci0: 9, ci1: 12, cj0: 5, cj1: 5 },
  // Leslieville: shops and cafés along Queen East.
  { name: 'Leslieville', district: 'neon', rules: MAIN_STREET_RULES, colors: LESLIEVILLE_COLORS, ci0: 13, ci1: 19, cj0: 5, cj1: 5 },
  // Greektown: the Danforth's white and blue shops.
  { name: 'Greektown', district: 'neon', rules: MAIN_STREET_RULES, colors: GREEKTOWN_COLORS, ci0: 9, ci1: 19, cj0: -6, cj1: -6 },
```

- [ ] **Step 5: blockRules.** In `src/cities/toronto/index.ts`, import `areaAt` from `./layout`, and change `blockRules` to:

```ts
  // A named area's own rules, else a tower pocket's (areas never hold pockets).
  blockRules: (x, z) => areaAt(x, z)?.rules ?? (pocketAt(x, z) ? POCKET_RULES : undefined),
```

- [ ] **Step 6: Run everything.** Run: `npx tsc --noEmit -p . && npx vitest run`. Expected: the new test passes.
  - If an existing Toronto test now fails because its sample landed in a new area, or a chunk's random sequence moved (a parkette ratio, a tower count, an area-name list), update it to its intent and log a ruling. Examples: skip named areas when counting parkettes; add the new names to a list.
  - If "each new block belongs to its own area" fails because an earlier area covers a block, narrow the new area's range to skip that block and log a ruling.

- [ ] **Step 7: Commit.**

```bash
git add -A src
git commit -m "Toronto districts: Old Town, Entertainment District, the Annex, west and east end areas, with area building rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: St. Lawrence Market, the Gooderham Building, Roy Thomson Hall

**Files:**
- Create: `src/cities/toronto/stLawrenceMarket.ts`, `gooderham.ts`, `royThomsonHall.ts`
- Modify: `src/cities/toronto/layout.ts` (sites, `LANDMARK_BLOCKS`), `src/cities/toronto/index.ts` (`landmarks`)
- Test: `src/cities/toronto/districtLandmarks.test.ts`, and the landmark id list in `toronto.test.ts`

- [ ] **Step 1: Write the failing test** `src/cities/toronto/districtLandmarks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TORONTO } from '.';
import { GOODERHAM_SITE, ROY_THOMSON_HALL_SITE, ST_LAWRENCE_MARKET_SITE, blockInterior } from './layout';
import { isWater, PITCH } from '../../world/roads';

const ids = ['st-lawrence-market', 'gooderham', 'roy-thomson-hall'] as const;
const lm = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;

describe('district landmarks', () => {
  it('lists St. Lawrence Market, the Gooderham Building and Roy Thomson Hall at their sites', () => {
    expect(lm('st-lawrence-market')).toMatchObject(ST_LAWRENCE_MARKET_SITE);
    expect(lm('gooderham')).toMatchObject(GOODERHAM_SITE);
    expect(lm('roy-thomson-hall')).toMatchObject(ROY_THOMSON_HALL_SITE);
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

  it('builds each to its stated size, vertex-coloured, on the ground', () => {
    for (const id of ids) {
      const l = lm(id);
      const g = l.build();
      expect(g.getAttribute('color'), id).toBeDefined();
      const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      expect(b.min.y, id).toBeCloseTo(0, 0);
      expect(b.max.y, id).toBeCloseTo(l.h, 0);
      expect(b.max.x - b.min.x, id).toBeLessThanOrEqual(l.w + 1);
      expect(b.max.z - b.min.z, id).toBeLessThanOrEqual(l.d + 1);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/districtLandmarks.test.ts`. Expected: FAIL, because the sites don't exist.

- [ ] **Step 3: Sites.** In `src/cities/toronto/layout.ts`, beside `HEARN_SITE` (which uses `interiorCentre`), add:

```ts
/** St. Lawrence Market: the interior centre of Old Town block (2, 8). */
export const ST_LAWRENCE_MARKET_SITE = interiorCentre(2, 8);
/** The Gooderham (Flatiron) Building: the interior centre of Old Town block (1, 8). */
export const GOODERHAM_SITE = interiorCentre(1, 8);
/** Roy Thomson Hall: the interior centre of block (−6, 7), beside the Entertainment District. */
export const ROY_THOMSON_HALL_SITE = interiorCentre(-6, 7);
```

  Then add the three sites to `LANDMARK_BLOCKS`.

- [ ] **Step 4: Models.**

  `src/cities/toronto/stLawrenceMarket.ts`:

```ts
import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** St. Lawrence Market: a brick hall 140 × 60 m, 22 m to its ridge. */
export const ST_LAWRENCE_MARKET = { w: 140, d: 60, h: 22 } as const;
const BRICK = 0x9c4430;
const ROOF = 0x5a3a30;
const STONE = 0xd9cfbc;
const WINDOW = 0x2e3a44;

/**
 * St. Lawrence Market: a long red-brick hall with arched window bands down both long sides, a pale stone end facade
 * (east, +x), and a long pitched roof built as three stepped ridges. Base centre at the origin, +Y up, vertex-coloured.
 */
export function stLawrenceMarketGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(-70, 0, -30, 64, 14, 30, BRICK),
    box(64, 0, -30, 70, 17, 30, STONE),
    box(-70, 14, -26, 70, 18, 26, ROOF),
    box(-70, 18, -16, 70, 20, 16, ROOF),
    box(-70, 20, -6, 70, 22, 6, ROOF),
  ];
  for (let x = -62; x <= 54; x += 14) {
    parts.push(box(x, 4, -30.3, x + 6, 11, -30, WINDOW));
    parts.push(box(x, 4, 30, x + 6, 11, 30.3, WINDOW));
  }
  return merge(parts);
}
```

  `src/cities/toronto/gooderham.ts`:

```ts
import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** The Gooderham (Flatiron) Building: a 22 m brick wedge about 40 m across. */
export const GOODERHAM = { w: 40, d: 40, h: 22 } as const;
const BRICK = 0xa8553a;
const COPPER = 0x5f9a83;
const WINDOW = 0x2e3a44;

/**
 * The Gooderham Building: a triangular five-storey brick prism with its point toward the west (−x), a band of
 * windows round each storey, and a green copper roof band. Base centre at the origin, +Y up, vertex-coloured.
 */
export function gooderhamGeometry(): THREE.BufferGeometry {
  // A 3-sided ring is a triangular prism with a corner at +z; turning it −90° about Y puts that corner at −x.
  const tri = (r: number, y0: number, y1: number, color: number) => ring(r, r, y0, y1, color, 3).rotateY(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    parts.push(tri(20, k * 4, k * 4 + 2.6, BRICK));
    parts.push(tri(19.6, k * 4 + 2.6, k * 4 + 4, WINDOW));
  }
  parts.push(tri(20, 20, 22, COPPER));
  return merge(parts);
}
```

  `src/cities/toronto/royThomsonHall.ts`:

```ts
import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** Roy Thomson Hall: a round glass dome 90 m across, 30 m tall. */
export const ROY_THOMSON_HALL = { w: 90, d: 90, h: 30 } as const;
const PLINTH = 0xd8d2c4;
const GLASS = 0x6f8ea6;
const GLASS_DARK = 0x3c5468;

/**
 * Roy Thomson Hall: a pale round plinth under a low, many-sided glass dome stepping in to its crown, its middle band
 * darker (the lattice). Base centre at the origin, +Y up, vertex-coloured.
 */
export function royThomsonHallGeometry(): THREE.BufferGeometry {
  return merge([
    ring(45, 44, 0, 6, PLINTH, 24),
    ring(42, 36, 6, 16, GLASS, 24),
    ring(36, 26, 16, 24, GLASS_DARK, 24),
    ring(26, 10, 24, 30, GLASS, 24),
  ]);
}
```

- [ ] **Step 5: Register them.** In `src/cities/toronto/index.ts`, import the models and sites, and append to `landmarks`:

```ts
    { id: 'st-lawrence-market', x: ST_LAWRENCE_MARKET_SITE.x, z: ST_LAWRENCE_MARKET_SITE.z, w: ST_LAWRENCE_MARKET.w, d: ST_LAWRENCE_MARKET.d, h: ST_LAWRENCE_MARKET.h, build: stLawrenceMarketGeometry },
    { id: 'gooderham', x: GOODERHAM_SITE.x, z: GOODERHAM_SITE.z, w: GOODERHAM.w, d: GOODERHAM.d, h: GOODERHAM.h, build: gooderhamGeometry },
    { id: 'roy-thomson-hall', x: ROY_THOMSON_HALL_SITE.x, z: ROY_THOMSON_HALL_SITE.z, w: ROY_THOMSON_HALL.w, d: ROY_THOMSON_HALL.d, h: ROY_THOMSON_HALL.h, build: royThomsonHallGeometry },
```

  In `toronto.test.ts`, append `'st-lawrence-market', 'gooderham', 'roy-thomson-hall'` to the expected landmark id list.

- [ ] **Step 6: Run everything.** Run: `npx tsc --noEmit -p . && npx vitest run && npm run build`. Expected: PASS and `✓ built`. If a model overflows its block interior, shrink it and log a ruling.

- [ ] **Step 7: Commit.**

```bash
git add -A src
git commit -m "Add St. Lawrence Market, the Gooderham Building and Roy Thomson Hall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Browser check with the owner

- [ ] **Hand over:** `npm run dev` with `?city=toronto`. Check that each district reads differently and that the three landmarks look right.
- [ ] **Tune:** apply requested tuning. Commit only on the owner's word; never push or deploy unasked.
