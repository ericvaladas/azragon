# Milestone 5a: City Styles and Tokyo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic city with a pluggable city-style system and a Tokyo style. Tokyo has a hand-laid core
(Shinjuku high-rise, Shibuya neon and the scramble crossing, parks, residential), endless noise-driven districts
beyond it, neon signs and screens, and the Tokyo Metropolitan Government Building as the first destructible landmark.

**Architecture:**

- **`src/cities/`** holds the city-style contract (`CityStyle`), a seeded noise helper, the Tokyo style, and
  `pickCity`.
- **Generation:** `generateChunk(style, seed, cx, cz)` stays a pure, seeded generator. It now emits buildings with a
  facade and colour, signs in each building's frame, park blocks and the landmarks the chunk owns, under per-chunk
  caps.
- **Rendering (`City`):**
  - Buildings stay one instanced box mesh; a per-instance facade index picks a cell of a facade atlas.
  - Signs and screens are two more instanced meshes that follow their building's collapse.
  - Landmarks are `Building`s with their own mesh.
- **Textures:** they come through an injectable factory (`CityTextures`), so `City` can be unit-tested in Node.

**Tech Stack:** Three.js 0.170, TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`), Vitest
(environment `node`, no DOM), Vite. React is UI only; `useEffect` is banned.

**Spec:** `docs/superpowers/specs/2026-10-13-azragon-milestone5a-design.md`

## Global Constraints

- North is +Z; facing north, east is −X and west is +X (the project's +X-is-left convention).
- The 200 m road grid (`CONFIG.world.blockSize` 200, `roadWidth` 36) and `src/world/roads.ts` are unchanged.
  Ground units keep driving on road lines.
- Every building, special lot and landmark footprint stays inside its own block (inside the roads).
- Flat ground at y = 0. Daylight lighting unchanged. All geometry is built in code (no imported models).
- Landmarks are destructible like any building:
  - `kind: 'building'`;
  - HP = height × `CONFIG.world.buildingHpPerMetre`;
  - EXP = HP × `buildingExpPerHp`;
  - the same collapse, rubble and destroyed-log rules.
- The crash site (blocks whose centre is within `clearRadius + blockSize/2` of the origin) is never a park and never
  a landmark.
- The Shibuya Crossing is at road intersection (600, 1600). Every Shibuya corner building satisfies
  `hypot(x, z) − radius ≥ 2 × CRATER_RADIUS` (1,500 m), the outer topple radius.
- The Metropolitan Government Building: centre (500, 3100), footprint 150 × 90 m, height 243 m.
- Draw calls added:
  - buildings: still 1;
  - signs: 1;
  - screens: 1;
  - park pads: 1;
  - each overlay: 1;
  - each landmark: 1.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch
  `milestone5a`. Never push or deploy.

**Rulings against the spec, made while planning (cost if wrong in brackets):**

- **Building pool: `maxBuildings` 12,000, not "about 9,000".** The per-chunk cap is
  `floor(maxBuildings / maxLoadedChunks)` with about 187 loadable chunks, and 9,000 would cap chunks at 48 buildings
  (about 3 per block), too thin for neon and residential. [If phones choke, lower it and the district fills in
  Task 8.]
- **Screens are their own instanced mesh** (they need a texture; signs are flat colour), so +1 draw call over the
  spec's "one layer". [One draw call.]
- **No red among the sign colours:** the spec's review focus forbids colours near the threat red (chevrons
  `0xff3b2f`), which overrides the spec's example list. [Slightly less varied neon.]
- **Only buildings get a hard per-chunk cap.** Trees, park pads and signs drop gracefully when their pool is full
  (they are decoration); signs also get a per-chunk cap, so near chunks never starve. [Far park chunks may look
  sparser.]

## Review Focus

1. **Landmark footprints at spawn:** artillery guns spawned at a point inside a landmark footprint must be moved out.
   Test in Task 7.
2. **Change Monster / Play Again:** `City.reset(style)` run twice must leave exactly one mesh per loaded landmark and
   one mesh per overlay in the scene (no leftovers). Test in Task 5.
3. **Readability:** no sign colour may be within distance 0.25 (RGB, 0..1) of the chevron red `0xff3b2f` or the
   strike colour. Test in Task 2.
4. **Pool exhaustion near the player:** after streaming from the origin to 20 km away and back, the chunk under the
   monster still has all its generated buildings. Test in Task 5.
5. **Rubble returns without signs:** a destroyed building whose chunk streams out and back in comes back as rubble
   with no sign or screen slots. Test in Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `src/cities/noise.ts` (new) | `hash2`, `valueNoise`: seeded, deterministic 2D noise |
| `src/cities/types.ts` (new) | The city-style contract: `DistrictId`, `DistrictRules`, `FACADE`, `SignDef`, `BuildingSpec`, `LandmarkSpec`, `GroundOverlay`, `CityStyle` |
| `src/cities/tokyo/layout.ts` (new) | Tokyo `districtAt`: core regions plus the noise beyond; named spots |
| `src/cities/tokyo/districts.ts` (new) | Tokyo per-district rules and colours |
| `src/cities/tokyo/tmg.ts` (new) | Metropolitan Government Building geometry |
| `src/cities/tokyo/shibuya.ts` (new) | Shibuya corner buildings (special lots) and the scramble overlay entry |
| `src/cities/tokyo/index.ts` (new) | The `TOKYO` style object |
| `src/cities/index.ts` (new) | `CITIES`, `pickCity` |
| `src/world/chunks.ts` (modify) | `generateChunk(style, …)`, caps, `maxLoadedChunks` |
| `src/world/pixelTextures.ts` (modify) | Facade atlas, style ground, scramble, screen textures; `CityTextures`, `canvasCityTextures`; `patchFacadeShader` |
| `src/world/City.ts` (modify) | Style-driven city: facades, colours, parks, overlays, landmarks, signs, screens, `reset(style)`, `landmarkAt` |
| `src/GameScene.ts` (modify) | Pick the city at construction and on each run reset; `blocked` in the world context |
| `src/enemies/types.ts`, `src/enemies/Artillery.ts` (modify) | Optional `blocked(x, z)`; artillery spawns avoid landmarks |
| `src/config.ts` (modify) | Pool sizes; remove the generic-city knobs |

---

### Task 1: Noise, the city-style contract, and Tokyo's layout

**Files:**
- Create: `src/cities/noise.ts`, `src/cities/types.ts`, `src/cities/tokyo/layout.ts`
- Test: `src/cities/noise.test.ts`, `src/cities/tokyo/layout.test.ts`

**Interfaces:**
- Produces:
  - `hash2(ix: number, iz: number, seed: number): number` (in [0, 1))
  - `valueNoise(x: number, z: number, scale: number, seed: number): number` (in [0, 1))
  - All the types in `types.ts` exactly as written below.
  - `districtAt(x: number, z: number): DistrictId`
  - `SHIBUYA_CROSSING`, `SHINJUKU`, `TMG_SITE`, `CORE_RADIUS`

- [ ] **Step 1: Write the failing noise tests**

`src/cities/noise.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hash2, valueNoise } from './noise';

describe('hash2', () => {
  it('is deterministic, in [0, 1), and differs between cells and seeds', () => {
    expect(hash2(3, -7, 11)).toBe(hash2(3, -7, 11));
    expect(hash2(3, -7, 11)).not.toBe(hash2(4, -7, 11));
    expect(hash2(3, -7, 11)).not.toBe(hash2(3, -7, 12));
    for (let i = -50; i < 50; i++) {
      const h = hash2(i, i * 3, 5);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('valueNoise', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(valueNoise(1234, -987, 900, 3)).toBe(valueNoise(1234, -987, 900, 3));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 137, -i * 91, 900, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('is smooth: a step of 1% of the scale changes it by little', () => {
    for (let i = 0; i < 100; i++) {
      const x = i * 311;
      const z = -i * 173;
      expect(Math.abs(valueNoise(x + 9, z, 900, 3) - valueNoise(x, z, 900, 3))).toBeLessThan(0.05);
    }
  });
  it('varies across the world', () => {
    const vs = new Set<number>();
    for (let i = 0; i < 50; i++) vs.add(Math.round(valueNoise(i * 2000, i * 1500, 900, 3) * 10));
    expect(vs.size).toBeGreaterThan(4);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `npx vitest run src/cities/noise.test.ts`
Expected: FAIL, "Failed to load url ./noise".

- [ ] **Step 3: Implement `src/cities/noise.ts`**

```ts
/** Hash of an integer cell and a seed, in [0, 1). */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) at world (x, z), with features about `scale` metres across. */
export function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run src/cities/noise.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Create `src/cities/types.ts`** (types only, no test of its own)

```ts
import type * as THREE from 'three';

export type DistrictId = 'highrise' | 'neon' | 'office' | 'residential' | 'park';
export const DISTRICTS: readonly DistrictId[] = ['highrise', 'neon', 'office', 'residential', 'park'];

/** Facade atlas cells (see pixelTextures.facadeAtlas): left to right. */
export const FACADE = { glass: 0, office: 1, balcony: 2, shop: 3 } as const;
export const FACADE_COUNT = 4;

/** How one district fills a block (164 m inside the roads). */
export type DistrictRules = {
  /** Lots per block side: lots × lots lots per block (0 for parks). */
  lots: number;
  /** Chance each lot is built on. */
  fill: number;
  /** At least this many buildings per block (the first unbuilt lots fill in, in lot order). */
  minPerBlock: number;
  /** Height range (m): min + (max − min) × rng^heightCurve, so a curve above 1 favours low buildings. */
  height: readonly [number, number];
  heightCurve: number;
  /** Footprint side as a fraction of the lot side. */
  footprint: readonly [number, number];
  /** Facade atlas cells (FACADE values) to pick from. */
  facades: readonly number[];
  /** Facade tint colours to pick from. */
  colors: readonly number[];
  /** Expected vertical neon signs per building (the fraction is a chance of one more). */
  signs: number;
  /** Chance of a rooftop billboard per building. */
  billboard: number;
  /** Street trees per block. */
  trees: number;
};

export type SignKind = 'vertical' | 'billboard' | 'screen';
/** A sign in its building's frame: centre offset from the building's base centre (m), box size (m), colour. */
export type SignDef = { kind: SignKind; lx: number; ly: number; lz: number; w: number; h: number; d: number; color: number };

/** One building: base centre (x, z), footprint w (x) × d (z), height h, facade atlas cell, tint, signs. */
export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; facade: number; color: number; signs: SignDef[] };

/** A destructible structure with its own mesh. `build` returns vertex-coloured geometry with its base centre at the origin, +Y up. */
export type LandmarkSpec = { id: string; x: number; z: number; w: number; d: number; h: number; build(): THREE.BufferGeometry };

/** A ground decal drawn over the road texture, `size` m square, centred on (x, z). */
export type GroundOverlay = { id: string; x: number; z: number; size: number };

export type CityStyle = {
  id: string;
  name: string;
  colors: {
    paved: number;
    pavedSpeck: number;
    park: number;
    road: number;
    roadLine: number;
    crosswalk: number;
    roof: number;
    tree: number;
  };
  /** Neon sign colours (never near the threat reds). */
  signColors: readonly number[];
  districtAt(x: number, z: number): DistrictId;
  districts: Readonly<Record<DistrictId, DistrictRules>>;
  /** Trees per park block (min, max). */
  parkTrees: readonly [number, number];
  landmarks: readonly LandmarkSpec[];
  /** Hand-placed buildings; they replace the random lots they overlap. */
  specialLots: readonly BuildingSpec[];
  overlays: readonly GroundOverlay[];
};
```

- [ ] **Step 6: Write the failing layout tests**

`src/cities/tokyo/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { DISTRICTS, type DistrictId } from '../types';
import { CORE_RADIUS, SHIBUYA_CROSSING, SHINJUKU, TMG_SITE, districtAt } from './layout';

describe('Tokyo layout', () => {
  it('puts the Shinjuku high-rise to the north and the Metropolitan Government Building inside it', () => {
    expect(SHINJUKU.z).toBeGreaterThan(2000);
    expect(districtAt(SHINJUKU.x, SHINJUKU.z)).toBe('highrise');
    expect(districtAt(TMG_SITE.x, TMG_SITE.z)).toBe('highrise');
  });
  it('puts the Shibuya Crossing north-west of the crash (+X is west), on a road intersection, in neon', () => {
    expect(SHIBUYA_CROSSING.x).toBeGreaterThan(0);
    expect(SHIBUYA_CROSSING.z).toBeGreaterThan(0);
    expect(SHIBUYA_CROSSING.x % CONFIG.world.blockSize).toBe(0);
    expect(SHIBUYA_CROSSING.z % CONFIG.world.blockSize).toBe(0);
    expect(districtAt(SHIBUYA_CROSSING.x + 100, SHIBUYA_CROSSING.z + 100)).toBe('neon');
  });
  it('lines the east (−X) edge of Shinjuku with neon streets', () => {
    expect(districtAt(-800, 3000)).toBe('neon');
  });
  it('has a park between Shibuya and Shinjuku, west of centre', () => {
    expect(districtAt(1300, 2300)).toBe('park');
  });
  it('never makes the crash site a park', () => {
    const W = CONFIG.world;
    for (let x = -1000; x <= 1000; x += 100) for (let z = -1000; z <= 1000; z += 100) {
      if (Math.hypot(x, z) < W.clearRadius + W.blockSize) expect(districtAt(x, z)).not.toBe('park');
    }
  });
  it('is deterministic', () => {
    for (const [x, z] of [[123, 456], [-9000, 12000], [40000, -3000]] as const) expect(districtAt(x, z)).toBe(districtAt(x, z));
  });
  it('beyond the core: every district appears, mostly residential or office, neon a minority', () => {
    const n: Record<DistrictId, number> = { highrise: 0, neon: 0, office: 0, residential: 0, park: 0 };
    let total = 0;
    for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
      const x = CORE_RADIUS + 1000 + i * 400;
      const z = -24000 + j * 400;
      n[districtAt(x, z)]++;
      total++;
    }
    for (const d of DISTRICTS) expect(n[d]).toBeGreaterThan(0);
    expect((n.residential + n.office) / total).toBeGreaterThan(0.6);
    expect(n.neon / total).toBeLessThan(0.2);
  });
});
```

- [ ] **Step 7: Run, expect FAIL** (module not found)

Run: `npx vitest run src/cities/tokyo/layout.test.ts`
Expected: FAIL, "Failed to load url ./layout".

- [ ] **Step 8: Implement `src/cities/tokyo/layout.ts`**

```ts
import { CONFIG } from '../../config';
import { hash2, valueNoise } from '../noise';
import type { DistrictId } from '../types';

/** World metres; north is +Z, west is +X, east is −X. The crash is at the origin. */
export const SHIBUYA_CROSSING = { x: 600, z: 1600 } as const;
export const SHINJUKU = { x: 300, z: 3100 } as const;
export const TMG_SITE = { x: 500, z: 3100 } as const;
/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core. First match wins; unmatched core points are office / mixed. */
const CORE_REGIONS: readonly Region[] = [
  { district: 'neon', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z, r: 450 },
  // Yoyogi Park and the Meiji Shrine woods.
  { district: 'park', x0: 900, z0: 2150, x1: 1700, z1: 2450 },
  // Neon streets along Shinjuku's east edge.
  { district: 'neon', x0: -1100, z0: 2500, x1: -500, z1: 3700 },
  { district: 'highrise', x0: -800, z0: 2500, x1: 1400, z1: 3700 },
  { district: 'residential', x0: 200, z0: -4000, x1: 4000, z1: 1150 },
  { district: 'residential', x0: -4000, z0: -4000, x1: 4000, z1: -700 },
];

const inRegion = (r: Region, x: number, z: number): boolean =>
  'r' in r ? Math.hypot(x - r.x, z - r.z) <= r.r : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const SEED = CONFIG.world.seed + 501;
/** Beyond the core: a "station" may sit in each STATION_CELL square; neon within STATION_R of it. */
const STATION_CELL = 1600;
const STATION_R = 260;

function nearStation(x: number, z: number): boolean {
  const cx = Math.floor(x / STATION_CELL);
  const cz = Math.floor(z / STATION_CELL);
  for (let i = cx - 1; i <= cx + 1; i++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      if (hash2(i, j, SEED) > 0.7) continue;
      const sx = (i + 0.2 + 0.6 * hash2(i, j, SEED + 1)) * STATION_CELL;
      const sz = (j + 0.2 + 0.6 * hash2(i, j, SEED + 2)) * STATION_CELL;
      if (Math.hypot(x - sx, z - sz) < STATION_R) return true;
    }
  }
  return false;
}

/** Tokyo's district at world point (x, z): the hand-laid core near the crash, seeded noise beyond. */
export function districtAt(x: number, z: number): DistrictId {
  if (Math.hypot(x, z) <= CORE_RADIUS) {
    for (const r of CORE_REGIONS) if (inRegion(r, x, z)) return r.district;
    return 'office';
  }
  if (nearStation(x, z)) return 'neon';
  if (valueNoise(x, z, 2200, SEED + 3) > 0.78) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.55 ? 'residential' : 'office';
}
```

- [ ] **Step 9: Run, expect PASS**

Run: `npx vitest run src/cities`
Expected: all pass. If "every district appears" fails on `highrise` or `park`, lower that threshold by 0.02 at a time
(0.78 → 0.76, 0.8 → 0.78) until it passes, and note the value in the commit message.

- [ ] **Step 10: Type-check and commit**

```bash
npx tsc --noEmit
git add src/cities
git commit -m "Cities: seeded noise, the city-style contract, and Tokyo's district layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Tokyo style (districts, Metropolitan Government Building, Shibuya) and `pickCity`

**Files:**
- Create: `src/cities/tokyo/districts.ts`, `src/cities/tokyo/tmg.ts`, `src/cities/tokyo/shibuya.ts`,
  `src/cities/tokyo/index.ts`, `src/cities/index.ts`
- Test: `src/cities/tokyo/tokyo.test.ts`, `src/cities/index.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `layout.ts` exports.
- Produces:
  - `TOKYO_DISTRICTS: Record<DistrictId, DistrictRules>`
  - `TMG: { w: 150; d: 90; h: 243 }`
  - `tmgGeometry(): THREE.BufferGeometry`
  - `SHIBUYA_LOTS: BuildingSpec[]`
  - `TOKYO: CityStyle`
  - `CITIES: readonly CityStyle[]`
  - `pickCity(rng: () => number): CityStyle`

- [ ] **Step 1: Write the failing tests**

`src/cities/tokyo/tokyo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { CRATER_RADIUS } from '../../world/City';
import { DISTRICTS } from '../types';
import { TOKYO } from './index';
import { SHIBUYA_CROSSING, TMG_SITE } from './layout';
import { TMG, tmgGeometry } from './tmg';

const W = CONFIG.world;
const INNER = W.blockSize - W.roadWidth;
const blockOf = (v: number) => Math.floor(v / W.blockSize);

describe('TOKYO', () => {
  it('has rules for every district; parks build nothing', () => {
    for (const d of DISTRICTS) expect(TOKYO.districts[d]).toBeDefined();
    expect(TOKYO.districts.park.lots).toBe(0);
    expect(TOKYO.districts.highrise.height[0]).toBeGreaterThanOrEqual(150);
    expect(TOKYO.districts.highrise.height[1]).toBeLessThanOrEqual(260);
    expect(TOKYO.districts.residential.height[1]).toBeLessThanOrEqual(25);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const threats = [CONFIG.palette.chevron, 0xff3b2f];
    const a = new THREE.Color();
    const b = new THREE.Color();
    for (const s of TOKYO.signColors) for (const t of threats) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('places the Metropolitan Government Building at its site, inside one block', () => {
    const tmg = TOKYO.landmarks.find((l) => l.id === 'tmg')!;
    expect(tmg).toMatchObject({ x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h });
    expect(blockOf(tmg.x - tmg.w / 2)).toBe(blockOf(tmg.x + tmg.w / 2));
    expect(blockOf(tmg.z - tmg.d / 2)).toBe(blockOf(tmg.z + tmg.d / 2));
    expect(tmg.w).toBeLessThanOrEqual(INNER);
    expect(tmg.d).toBeLessThanOrEqual(INNER);
  });

  it('builds the twin-towered landmark mesh to its size, base at y = 0, vertex-coloured', () => {
    const g = tmgGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(TMG.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(TMG.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(TMG.d + 2);
    expect(g.getAttribute('color')).toBeDefined();
  });

  it('puts four Shibuya corner buildings around the crossing, each inside one block, all beyond the topple radius, with screens', () => {
    expect(TOKYO.specialLots).toHaveLength(4);
    for (const b of TOKYO.specialLots) {
      expect(Math.abs(b.x - SHIBUYA_CROSSING.x)).toBeLessThan(W.blockSize / 2);
      expect(Math.abs(b.z - SHIBUYA_CROSSING.z)).toBeLessThan(W.blockSize / 2);
      expect(blockOf(b.x - b.w / 2)).toBe(blockOf(b.x + b.w / 2));
      expect(blockOf(b.z - b.d / 2)).toBe(blockOf(b.z + b.d / 2));
      expect(Math.hypot(b.x, b.z) - Math.max(b.w, b.d) / 2).toBeGreaterThanOrEqual(2 * CRATER_RADIUS);
    }
    expect(TOKYO.specialLots.filter((b) => b.signs.some((s) => s.kind === 'screen')).length).toBeGreaterThanOrEqual(3);
  });

  it('draws the scramble markings over the crossing', () => {
    expect(TOKYO.overlays).toContainEqual(expect.objectContaining({ id: 'scramble', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z }));
  });
});
```

`src/cities/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CITIES, pickCity } from './index';
import { TOKYO } from './tokyo';

describe('pickCity', () => {
  it('picks from the city list; with only Tokyo, always Tokyo', () => {
    expect(CITIES).toEqual([TOKYO]);
    for (const r of [0, 0.3, 0.999]) expect(pickCity(() => r)).toBe(TOKYO);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (modules not found)

Run: `npx vitest run src/cities`
Expected: FAIL on the missing `./index`, `./tmg` and `./tokyo` modules.

- [ ] **Step 3: Implement `src/cities/tokyo/districts.ts`**

```ts
import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Tokyo's districts. Heights are first-pass values for playtest tuning. */
export const TOKYO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // Shinjuku towers: one or two per block, glass and steel.
  highrise: {
    lots: 2, fill: 0.4, minPerBlock: 1, height: [150, 260], heightCurve: 1.2, footprint: [0.75, 0.95],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x9fb3c4, 0xb9c6d0, 0x8aa0b4, 0xd2d6d8, 0x7f93a8],
    signs: 0, billboard: 0.1, trees: 0,
  },
  // Shibuya and east Shinjuku: narrow, tall-ish, plastered with signs.
  neon: {
    lots: 3, fill: 0.6, minPerBlock: 3, height: [40, 110], heightCurve: 1.4, footprint: [0.7, 0.9],
    facades: [FACADE.shop, FACADE.office, FACADE.shop], colors: [0xe9e4dc, 0xc8c2b8, 0xd8d0c4, 0xa9a39c, 0xbfc5c9],
    signs: 1.2, billboard: 0.35, trees: 0,
  },
  office: {
    lots: 2, fill: 0.8, minPerBlock: 1, height: [30, 90], heightCurve: 1.6, footprint: [0.6, 0.85],
    facades: [FACADE.office, FACADE.office, FACADE.glass], colors: [0xd9d6cf, 0xc4c9cc, 0xe3ddd2, 0xb7bec4],
    signs: 0.1, billboard: 0.08, trees: 1,
  },
  residential: {
    lots: 3, fill: 0.5, minPerBlock: 2, height: [10, 25], heightCurve: 1.3, footprint: [0.6, 0.85],
    facades: [FACADE.balcony], colors: [0xf0e8da, 0xe6dccb, 0xd9cdb8, 0xeee9e0, 0xcfc6b4],
    signs: 0, billboard: 0, trees: 2,
  },
  park: {
    lots: 0, fill: 0, minPerBlock: 0, height: [0, 0], heightCurve: 1, footprint: [0, 0],
    facades: [FACADE.office], colors: [0xffffff], signs: 0, billboard: 0, trees: 0,
  },
};
```

- [ ] **Step 4: Implement `src/cities/tokyo/tmg.ts`**

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';

/** The Tokyo Metropolitan Government Building's footprint (x × z) and height, metres. */
export const TMG = { w: 150, d: 90, h: 243 } as const;
const BASE = 0xbcb9b0;
const STONE = 0xd5d3cc;
const BAND = 0x6f7680;

/** A box from y to y + h, centred on (x, z). */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry =>
  painted(faceted(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)), color);

/**
 * Twin towers on a lower base. Each tower has dark window bands and narrows near the top, then splits into the
 * building's two crowning peaks. Base centre at the origin, +Y up, vertex-coloured.
 */
export function tmgGeometry(): THREE.BufferGeometry {
  const parts = [box(TMG.w, 40, TMG.d, 0, 0, 0, BASE)];
  for (const side of [-1, 1]) {
    const cx = side * 40;
    parts.push(box(56, 165, 56, cx, 40, 0, STONE));
    for (let y = 52; y < 200; y += 14) parts.push(box(57, 4, 57, cx, y, 0, BAND));
    parts.push(box(50, 18, 50, cx, 205, 0, STONE));
    for (const peak of [-1, 1]) parts.push(box(20, 20, 46, cx + peak * 14, 223, 0, STONE));
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
```

- [ ] **Step 5: Implement `src/cities/tokyo/shibuya.ts`**

```ts
import { CONFIG } from '../../config';
import { FACADE, type BuildingSpec, type GroundOverlay, type SignDef } from '../types';
import { SHIBUYA_CROSSING } from './layout';

const C = SHIBUYA_CROSSING;
const SIZE = 56;
/** From the crossing's centre to each corner building's centre: half the road, a gap, half the building. */
const OFF = CONFIG.world.roadWidth / 2 + 6 + SIZE / 2;
const HEIGHTS = [70, 85, 60, 95] as const;
const SCREEN_COLORS = [0xffffff, 0xffffff, 0xffffff, 0xffffff] as const;
const BLADE_COLORS = [0xff3fb4, 0x35e8ff, 0xffd23a, 0x7a5cff] as const;

/**
 * The four corner buildings of the scramble crossing. Each faces the crossing with a big video screen (all but the
 * lowest) and a vertical blade sign. Signs are in the building's frame: base centre, +Y up.
 */
export const SHIBUYA_LOTS: BuildingSpec[] = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz], i) => {
  const h = HEIGHTS[i]!;
  const signs: SignDef[] = [];
  if (h >= 70) {
    // On the face toward the crossing in z (the building sits at +sz × OFF, so that face is at −sz × SIZE/2).
    signs.push({ kind: 'screen', lx: 0, ly: h * 0.62, lz: -sz! * (SIZE / 2 + 0.8), w: 40, h: 24, d: 1.2, color: SCREEN_COLORS[i]! });
  }
  signs.push({ kind: 'vertical', lx: -sx! * (SIZE / 2 + 3), ly: h * 0.45, lz: 0, w: 6, h: Math.min(30, h * 0.5), d: 1.5, color: BLADE_COLORS[i]! });
  return { x: C.x + sx! * OFF, z: C.z + sz! * OFF, w: SIZE, d: SIZE, h, facade: FACADE.shop, color: 0xd8d0c4, signs };
});

export const SCRAMBLE: GroundOverlay = { id: 'scramble', x: C.x, z: C.z, size: 120 };
```

- [ ] **Step 6: Implement `src/cities/tokyo/index.ts` and `src/cities/index.ts`**

`src/cities/tokyo/index.ts`:
```ts
import { CONFIG } from '../../config';
import type { CityStyle } from '../types';
import { TOKYO_DISTRICTS } from './districts';
import { districtAt, TMG_SITE } from './layout';
import { SCRAMBLE, SHIBUYA_LOTS } from './shibuya';
import { TMG, tmgGeometry } from './tmg';

export const TOKYO: CityStyle = {
  id: 'tokyo',
  name: 'Tokyo',
  colors: {
    paved: 0xa8a59d,
    pavedSpeck: 0x8f8c85,
    park: 0x7fa65c,
    road: CONFIG.palette.road,
    roadLine: CONFIG.palette.roadLine,
    crosswalk: 0xf2f0ea,
    roof: 0x6b6a70,
    tree: CONFIG.palette.groundDark,
  },
  // Magenta, cyan, warm white, yellow, violet: no reds (they belong to threats).
  signColors: [0xff3fb4, 0x35e8ff, 0xfff4d6, 0xffd23a, 0x7a5cff],
  districtAt,
  districts: TOKYO_DISTRICTS,
  parkTrees: [12, 18],
  landmarks: [{ id: 'tmg', x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h, build: tmgGeometry }],
  specialLots: SHIBUYA_LOTS,
  overlays: [SCRAMBLE],
};
```

`src/cities/index.ts`:
```ts
import { TOKYO } from './tokyo';
import type { CityStyle } from './types';

/** Every playable city; a run starts in one picked at random. */
export const CITIES: readonly CityStyle[] = [TOKYO];

export function pickCity(rng: () => number): CityStyle {
  return CITIES[Math.floor(rng() * CITIES.length)]!;
}
```

- [ ] **Step 7: Run, expect PASS**

Run: `npx vitest run src/cities`
Expected: all pass.

- [ ] **Step 8: Type-check and commit**

```bash
npx tsc --noEmit
git add src/cities
git commit -m "Cities: the Tokyo style (districts, Metropolitan Government Building, Shibuya corners) and pickCity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Style-driven chunk generation with caps

**Files:**
- Modify: `src/world/chunks.ts` (replace `generateChunk`; `BuildingSpec` now comes from `src/cities/types.ts`); `src/config.ts`
- Test: `src/world/chunks.test.ts` (adapt the existing generateChunk tests; add new ones)

**Interfaces:**
- Consumes:
  - `CityStyle`, `BuildingSpec`, `LandmarkSpec`, `SignDef`, `DistrictRules` (Task 1)
  - `TOKYO` (Task 2)
- Produces:
  - `type TreeSpec = { x: number; z: number; s: number }`
  - `type ParkSpec = { x: number; z: number }` (park block centre)
  - `type ChunkContent = { buildings: BuildingSpec[]; trees: TreeSpec[]; parks: ParkSpec[]; landmarks: LandmarkSpec[] }`
  - `generateChunk(style: CityStyle, seed: number, cx: number, cz: number): ChunkContent`
  - `maxLoadedChunks(): number`
  - `BUILDINGS_PER_CHUNK: number`
  - `SIGNS_PER_CHUNK: number`
  - re-export `type BuildingSpec`
  - Unchanged: `chunkKey`, `chunksInRadius`, `planStreaming`, `DestroyedLog`, `blastTopples`, `CHUNK_SIZE`,
    `ROAD_ORIGIN`

- [ ] **Step 1: Update config**

In `src/config.ts` `world`:
- remove `parkChance`, `minBuildingH`, `maxBuildingH`;
- change `maxBuildings: 7000` to `maxBuildings: 12000` and `maxTrees: 3000` to `maxTrees: 5000`;
- add `maxSigns: 6000`, `maxScreens: 60` and `maxParks: 2000`, each with a one-line doc comment.

Then remove `buildingFacades` from `palette`.

- [ ] **Step 2: Rewrite the generateChunk tests**

Replace the `describe('generateChunk', …)` block in `src/world/chunks.test.ts`, and add the imports below:
```ts
import { TOKYO } from '../cities/tokyo';
import type { CityStyle } from '../cities/types';
import { CRATER_RADIUS } from './City';
import { BUILDINGS_PER_CHUNK, SIGNS_PER_CHUNK, maxLoadedChunks } from './chunks';

const ALL_NEON: CityStyle = { ...TOKYO, districtAt: () => 'neon', landmarks: [], specialLots: [] };
const blockCell = (v: number) => Math.floor(v / W.blockSize);

describe('generateChunk', () => {
  it('is deterministic per style, seed and chunk, and differs between chunks and seeds', () => {
    expect(generateChunk(TOKYO, 1337, 3, -2)).toEqual(generateChunk(TOKYO, 1337, 3, -2));
    expect(generateChunk(TOKYO, 1337, 3, -2).buildings).not.toEqual(generateChunk(TOKYO, 1337, 4, -2).buildings);
    expect(generateChunk(TOKYO, 1337, 30, -2).buildings).not.toEqual(generateChunk(TOKYO, 99, 30, -2).buildings);
  });

  it('keeps every building inside its own chunk and its own block (off every road line)', () => {
    for (const [cx, cz] of [[0, 0], [0, 2], [0, 4], [5, -3], [-7, 11], [40, 40]] as const) {
      for (const b of generateChunk(TOKYO, 1337, cx, cz).buildings) {
        expect(Math.floor(b.x / CHUNK_SIZE)).toBe(cx);
        expect(Math.floor(b.z / CHUNK_SIZE)).toBe(cz);
        expect(blockCell(b.x - b.w / 2)).toBe(blockCell(b.x + b.w / 2));
        expect(blockCell(b.z - b.d / 2)).toBe(blockCell(b.z + b.d / 2));
      }
    }
  });

  it('builds on the crater site but plants no parks or trees there', () => {
    let inside = 0;
    for (const r of chunksInRadius(0, 0, W.clearRadius + CHUNK_SIZE)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      inside += c.buildings.filter((b) => Math.hypot(b.x, b.z) < W.clearRadius).length;
      for (const p of c.parks) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(W.clearRadius + W.blockSize * 0.5);
      for (const t of c.trees) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(W.clearRadius - W.blockSize * 0.25);
    }
    expect(inside).toBeGreaterThan(4);
  });

  it('fills chunks far from the origin densely', () => {
    let total = 0;
    for (let i = 0; i < 10; i++) total += generateChunk(TOKYO, 1337, 20 + i, -30).buildings.length;
    expect(total / 10).toBeGreaterThan(25);
  });

  it('stays within the per-chunk caps even when every block is neon, and the caps fit the pools', () => {
    expect(BUILDINGS_PER_CHUNK * maxLoadedChunks()).toBeLessThanOrEqual(W.maxBuildings);
    expect(SIGNS_PER_CHUNK * maxLoadedChunks()).toBeLessThanOrEqual(W.maxSigns);
    for (let i = 0; i < 6; i++) {
      const c = generateChunk(ALL_NEON, 1337, 10 + i, 7);
      expect(c.buildings.length).toBeLessThanOrEqual(BUILDINGS_PER_CHUNK);
      expect(c.buildings.reduce((n, b) => n + b.signs.length, 0)).toBeLessThanOrEqual(SIGNS_PER_CHUNK);
      expect(c.buildings.length).toBeGreaterThan(BUILDINGS_PER_CHUNK * 0.8);
    }
  });

  it('gives a landmark to exactly one chunk, and builds nothing else on its block', () => {
    const tmg = TOKYO.landmarks[0]!;
    let owners = 0;
    for (const r of chunksInRadius(tmg.x, tmg.z, CHUNK_SIZE * 2)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      owners += c.landmarks.filter((l) => l.id === tmg.id).length;
      for (const b of c.buildings) {
        const same = blockCell(b.x) === blockCell(tmg.x) && blockCell(b.z) === blockCell(tmg.z);
        expect(same).toBe(false);
      }
      for (const p of c.parks) expect(blockCell(p.x) === blockCell(tmg.x) && blockCell(p.z) === blockCell(tmg.z)).toBe(false);
    }
    expect(owners).toBe(1);
  });

  it('places the Shibuya corner buildings exactly, and no random building overlaps them', () => {
    const found: BuildingSpec[] = [];
    const all: BuildingSpec[] = [];
    for (const r of chunksInRadius(600, 1600, CHUNK_SIZE)) {
      const c = generateChunk(TOKYO, 1337, r.cx, r.cz);
      all.push(...c.buildings);
      for (const s of TOKYO.specialLots) found.push(...c.buildings.filter((b) => b.x === s.x && b.z === s.z && b.h === s.h));
    }
    expect(found).toHaveLength(4);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of found) for (const b of all) if (b !== s) expect(overlaps(s, b)).toBe(false);
    for (const s of found) expect(Math.hypot(s.x, s.z) - Math.max(s.w, s.d) / 2).toBeGreaterThanOrEqual(2 * CRATER_RADIUS);
  });

  it('keeps every sign on its building: beside a face or on the roof, within its height', () => {
    for (const [cx, cz] of [[0, 2], [-2, 3], [-1, 4]] as const) {
      for (const b of generateChunk(TOKYO, 1337, cx, cz).buildings) {
        for (const s of b.signs) {
          expect(Math.abs(s.lx)).toBeLessThanOrEqual(b.w / 2 + s.w + 4);
          expect(Math.abs(s.lz)).toBeLessThanOrEqual(b.d / 2 + s.d + 4);
          expect(s.ly - s.h / 2).toBeGreaterThanOrEqual(0);
          expect(s.ly + s.h / 2).toBeLessThanOrEqual(b.h + 30);
        }
      }
    }
  });

  it('builds neon blocks with signs and Shinjuku with tall towers', () => {
    const near = (x: number, z: number) => generateChunk(TOKYO, 1337, Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)).buildings;
    expect(near(600, 1600).some((b) => b.signs.length > 0)).toBe(true);
    expect(Math.max(...near(300, 3100).map((b) => b.h))).toBeGreaterThanOrEqual(150);
  });
});
```
Also add `import type { BuildingSpec } from './chunks';`, and change the existing `chunks` import to also bring in
`BUILDINGS_PER_CHUNK`, `SIGNS_PER_CHUNK` and `maxLoadedChunks` (merge them into the existing import line).

- [ ] **Step 3: Run, expect FAIL**

Run: `npx vitest run src/world/chunks.test.ts`
Expected: FAIL: `generateChunk` takes the old arguments and `BUILDINGS_PER_CHUNK` is not exported.

- [ ] **Step 4: Implement the new generator in `src/world/chunks.ts`**

Replace the `BuildingSpec` / `TreeSpec` / `ChunkContent` types and `generateChunk` with the code below. Keep
everything else (`chunkKey`, `parseKey`, `distToChunk`, `chunkSeed`, `chunksInRadius`, `planStreaming`,
`DestroyedLog`, `blastTopples`) unchanged.
```ts
import { CONFIG } from '../config';
import { mulberry32, pick, range } from '../util/rng';
import type { BuildingSpec, CityStyle, DistrictRules, LandmarkSpec, SignDef } from '../cities/types';

export type { BuildingSpec } from '../cities/types';
export type TreeSpec = { x: number; z: number; s: number };
/** A park block, by its centre: drawn as a green pad under its trees. */
export type ParkSpec = { x: number; z: number };
export type ChunkContent = { buildings: BuildingSpec[]; trees: TreeSpec[]; parks: ParkSpec[]; landmarks: LandmarkSpec[] };

// (chunkKey, parseKey, distToChunk, chunkSeed unchanged)

/** The most chunks that can be loaded at once (anywhere inside a chunk, out to unloadRadius). */
export function maxLoadedChunks(): number {
  let max = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    max = Math.max(max, chunksInRadius((i / 4) * CHUNK_SIZE, (j / 4) * CHUNK_SIZE, CONFIG.world.unloadRadius).length);
  }
  return max;
}
/** Per-chunk caps, so a full load of the densest districts still fits the pools. */
export const BUILDINGS_PER_CHUNK = Math.floor(CONFIG.world.maxBuildings / maxLoadedChunks());
export const SIGNS_PER_CHUNK = Math.floor(CONFIG.world.maxSigns / maxLoadedChunks());

const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, gap = 0) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.z - b.z) * 2 < a.d + b.d + gap;

/** Vertical neon blades on the sides and maybe a rooftop billboard, in the building's frame. */
function makeSigns(rules: DistrictRules, style: CityStyle, w: number, d: number, h: number, rng: () => number): SignDef[] {
  const signs: SignDef[] = [];
  const n = Math.floor(rules.signs) + (rng() < rules.signs % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const face = Math.floor(rng() * 4);
    const len = 4 + rng() * 3;
    const sh = Math.min(h * 0.6, 18 + rng() * 22);
    const ly = Math.min(h - sh / 2, Math.max(sh / 2 + 6, h * (0.4 + 0.4 * rng())));
    const color = pick(style.signColors, rng);
    // A blade sticks straight out of the facade.
    if (face < 2) {
      const sx = face === 0 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: sx * (w / 2 + len / 2), ly, lz: (rng() - 0.5) * d * 0.6, w: len, h: sh, d: 1.5, color });
    } else {
      const sz = face === 2 ? 1 : -1;
      signs.push({ kind: 'vertical', lx: (rng() - 0.5) * w * 0.6, ly, lz: sz * (d / 2 + len / 2), w: 1.5, h: sh, d: len, color });
    }
  }
  if (rng() < rules.billboard) {
    const bh = 10 + rng() * 8;
    signs.push({ kind: 'billboard', lx: 0, ly: h + bh / 2 + 2, lz: 0, w: w * 0.8, h: bh, d: 1.5, color: pick(style.signColors, rng) });
  }
  return signs;
}

/**
 * One chunk of the city in `style`: each block is built from the district at its centre. Landmarks claim their
 * block (the chunk holding the landmark's centre owns it); special lots replace the random lots they overlap; the
 * crash site is never a park. Per-chunk caps thin the random buildings (never special lots) and then their signs.
 * Same inputs, same chunk.
 */
export function generateChunk(style: CityStyle, seed: number, cx: number, cz: number): ChunkContent {
  const w = CONFIG.world;
  const rng = mulberry32(chunkSeed(seed, cx, cz));
  const pitch = w.blockSize;
  const inner = pitch - w.roadWidth;
  const buildings: BuildingSpec[] = [];
  const specials: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];
  const parks: ParkSpec[] = [];
  const landmarks: LandmarkSpec[] = [];
  const blockOf = (v: number) => Math.floor(v / pitch);

  for (let i = 0; i < w.chunkBlocks; i++) {
    for (let j = 0; j < w.chunkBlocks; j++) {
      const bi = cx * w.chunkBlocks + i;
      const bj = cz * w.chunkBlocks + j;
      const bx = (bi + 0.5) * pitch + ROAD_ORIGIN;
      const bz = (bj + 0.5) * pitch + ROAD_ORIGIN;
      const craterSite = Math.hypot(bx, bz) < w.clearRadius + pitch * 0.5;

      const landmark = style.landmarks.find((l) => blockOf(l.x) === bi && blockOf(l.z) === bj);
      if (landmark) {
        if (!craterSite) landmarks.push(landmark);
        continue;
      }
      let district = style.districtAt(bx, bz);
      if (craterSite && district === 'park') district = 'office';
      const rules = style.districts[district];

      if (district === 'park') {
        parks.push({ x: bx, z: bz });
        const count = Math.round(range(rng, style.parkTrees[0], style.parkTrees[1]));
        for (let t = 0; t < count; t++) {
          trees.push({ x: bx + range(rng, -inner / 2, inner / 2), z: bz + range(rng, -inner / 2, inner / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      const blockSpecials = style.specialLots.filter((s) => blockOf(s.x) === bi && blockOf(s.z) === bj);
      for (const s of blockSpecials) specials.push({ ...s, signs: s.signs.map((g) => ({ ...g })) });

      const n = rules.lots;
      const lot = inner / n;
      // Roll every lot first so the dice sequence never depends on what was placed.
      const rolls: { lx: number; lz: number; built: boolean }[] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        rolls.push({ lx: bx + (a - (n - 1) / 2) * lot, lz: bz + (b - (n - 1) / 2) * lot, built: rng() < rules.fill });
      }
      const free = rolls.filter((r) => !blockSpecials.some((s) => overlaps(s, { x: r.lx, z: r.lz, w: lot, d: lot }, 4)));
      let placed = free.filter((r) => r.built).length;
      for (const r of free) {
        if (!r.built && placed < rules.minPerBlock) {
          r.built = true;
          placed++;
        }
      }
      for (const r of free) {
        if (!r.built) continue;
        const bw = lot * range(rng, rules.footprint[0], rules.footprint[1]);
        const bd = lot * range(rng, rules.footprint[0], rules.footprint[1]);
        const h = rules.height[0] + (rules.height[1] - rules.height[0]) * Math.pow(rng(), rules.heightCurve);
        buildings.push({ x: r.lx, z: r.lz, w: bw, d: bd, h, facade: pick(rules.facades, rng), color: pick(rules.colors, rng), signs: makeSigns(rules, style, bw, bd, h, rng) });
      }
      if (!craterSite) {
        for (let t = 0; t < rules.trees; t++) {
          // Street trees along the block's edge (the pavement).
          const along = range(rng, -inner / 2, inner / 2);
          const edge = (rng() < 0.5 ? -1 : 1) * (inner / 2 - 3);
          const xs = rng() < 0.5;
          trees.push({ x: bx + (xs ? along : edge), z: bz + (xs ? edge : along), s: range(rng, 9, 14) });
        }
      }
    }
  }

  // Caps: thin random buildings evenly (deterministic), never special lots; then trim signs.
  const room = Math.max(0, BUILDINGS_PER_CHUNK - specials.length);
  let kept = buildings;
  if (buildings.length > room) {
    const order = buildings.map((_, k) => ({ k, r: rng() })).sort((a, b) => a.r - b.r).slice(0, room).map((o) => o.k).sort((a, b) => a - b);
    kept = order.map((k) => buildings[k]!);
  }
  const out = [...specials, ...kept];
  let signs = 0;
  for (const b of out) {
    const allowed = Math.max(0, SIGNS_PER_CHUNK - signs);
    if (b.signs.length > allowed) b.signs.length = allowed;
    signs += b.signs.length;
  }
  return { buildings: out, trees, parks, landmarks };
}
```
`chunksInRadius` is declared later in the file. That is fine for function declarations, but `BUILDINGS_PER_CHUNK`
is a module-level `const` that calls `maxLoadedChunks()` at import time, so **move both constants (and
`maxLoadedChunks`) below `chunksInRadius`** in the file.

- [ ] **Step 5: Run, expect PASS**

Run: `npx vitest run src/world/chunks.test.ts`
Expected: all pass. If "fills chunks far from the origin densely" fails, raise `fill` for residential (0.5 → 0.55)
and office (0.8 → 0.85) in `districts.ts`, and note it in the commit.

- [ ] **Step 6: Type-check** (City.ts will not compile yet; that's expected and fixed in Task 5)

Run: `npx tsc --noEmit 2>&1 | grep -v "src/world/City.ts" | head`
Expected: no errors outside `src/world/City.ts`. Remaining errors in `City.ts` (`generateChunk` arguments,
`spec.style`, `buildingFacades`) are fixed in Task 5. Do **not** commit a broken build: continue straight to Task 4
and commit Tasks 3–5 once `tsc` is clean, or stub the City call site as below, and commit now:

```ts
// City.ts loadChunk, temporary until Task 5:
const content = generateChunk(TOKYO, this.seed, cx, cz);
// and the colour line:
this.buildingMesh.setColorAt(slot, _c.setHex(spec.color));
```
(import `TOKYO` from `'../cities/tokyo'`). With the stub, `npx tsc --noEmit` and `npx vitest run` must be clean.

- [ ] **Step 7: Commit**

```bash
git add src/world/chunks.ts src/world/chunks.test.ts src/world/City.ts src/config.ts
git commit -m "World: chunks are generated from a city style (districts, signs, parks, landmarks, special lots) under per-chunk caps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: City textures (facade atlas, style ground, scramble, screens) and the facade shader

**Files:**
- Modify: `src/world/pixelTextures.ts`
- Test: `src/world/pixelTextures.test.ts` (new)

**Interfaces:**
- Consumes:
  - `CityStyle`, `FACADE_COUNT` (Task 1)
- Produces:
  - `type CityTextures = { ground(style: CityStyle): THREE.Texture; crater(): THREE.Texture; facades(): THREE.Texture; screen(): THREE.Texture; overlay(id: string): THREE.Texture }`
  - `canvasCityTextures: CityTextures`
  - `SCREEN_FRAMES = 4`
  - `FACADE_TILE = { w: 16, h: 24 }`
  - `patchFacadeShader(sh: { vertexShader: string; fragmentShader: string }): void`
  - Removes: `facadeTexture`, `blockGroundTexture`.

- [ ] **Step 1: Write the failing test for the shader patch** (the canvas textures need a DOM, so they are checked
  visually in Task 8)

`src/world/pixelTextures.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FACADE_COUNT } from '../cities/types';
import { FACADE_TILE, patchFacadeShader } from './pixelTextures';

const VERT = 'x\n#include <common>\ny\n#include <uv_vertex>\nz';
const FRAG = 'x\n#include <common>\ny\n#include <map_fragment>\nz';

describe('patchFacadeShader', () => {
  it('reads the per-building facade cell and tiles it by the building size (one cell per FACADE_TILE metres)', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh);
    expect(sh.vertexShader).toContain('attribute float aFacade;');
    expect(sh.vertexShader).toContain('instanceMatrix');
    expect(sh.vertexShader).toContain(`/ ${FACADE_TILE.h.toFixed(1)}`);
    expect(sh.fragmentShader).toContain('fract(vFacadeUv.x)');
    expect(sh.fragmentShader).toContain(`/ ${FACADE_COUNT.toFixed(1)}`);
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/world/pixelTextures.test.ts`
Expected: FAIL: `patchFacadeShader` and `FACADE_TILE` are not exported.

- [ ] **Step 3: Implement in `src/world/pixelTextures.ts`**

Remove `facadeTexture` and `blockGroundTexture`. Keep `hex`, `finish` and `craterTexture`. Add:
```ts
import type { CityStyle } from '../cities/types';
import { FACADE_COUNT } from '../cities/types';

/** One facade cell repeats every FACADE_TILE metres (width along the face, height up it). */
export const FACADE_TILE = { w: 16, h: 24 } as const;
const CELL_W = 16;
const CELL_H = 24;

/**
 * Facade atlas: FACADE_COUNT cells of CELL_W × CELL_H px, left to right: glass curtain wall, office window bands,
 * residential balconies, shop fronts. Light greys and whites, so the per-building tint colours them.
 */
export function facadeAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * FACADE_COUNT;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  const cell = (k: number, draw: (x0: number) => void) => draw(k * CELL_W);
  // 0: glass: pale panes, thin dark mullions, a lighter sky-reflection band.
  cell(0, (x0) => {
    g.fillStyle = '#c9d4dc';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    g.fillStyle = '#e8eef2';
    g.fillRect(x0, 4, CELL_W, 6);
    g.fillStyle = '#5d6a74';
    for (let x = 0; x < CELL_W; x += 4) g.fillRect(x0 + x, 0, 1, CELL_H);
    for (let y = 0; y < CELL_H; y += 6) g.fillRect(x0, y, CELL_W, 1);
  });
  // 1: office: white spandrels with dark window bands.
  cell(1, (x0) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    g.fillStyle = '#3d4a5e';
    for (let y = 2; y < CELL_H; y += 6) g.fillRect(x0, y, CELL_W, 3);
    g.fillStyle = '#b8b0a4';
    for (let x = 0; x < CELL_W; x += 8) g.fillRect(x0 + x, 0, 1, CELL_H);
  });
  // 2: residential: rows of balconies (light rails over dark doors), small windows between.
  cell(2, (x0) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    for (let y = 0; y < CELL_H; y += 8) {
      g.fillStyle = '#4a4f57';
      g.fillRect(x0 + 2, y + 2, 4, 4);
      g.fillRect(x0 + 10, y + 2, 4, 4);
      g.fillStyle = '#d9d3c8';
      g.fillRect(x0 + 1, y + 6, 14, 2);
    }
  });
  // 3: shop fronts: small bright windows, some lit warm.
  cell(3, (x0) => {
    g.fillStyle = '#f2efe9';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    const rng = mulberry32(CONFIG.world.seed + 7);
    for (let y = 1; y < CELL_H; y += 4) for (let x = 1; x < CELL_W; x += 4) {
      g.fillStyle = rng() < 0.3 ? '#ffe9a8' : '#4a5566';
      g.fillRect(x0 + x, y, 2, 2);
    }
  });
  return finish(c);
}

/**
 * Ground tile covering 2 × 2 blocks in a city's colours: paved with speckle; roads on the block lines with dashed
 * centre lines; zebra crosswalks across every road arm at each intersection. Wraps seamlessly.
 */
export function cityGroundTexture(style: CityStyle): THREE.CanvasTexture {
  const { world } = CONFIG;
  const C = style.colors;
  const size = 128;
  const span = world.blockSize * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const px = size / span;
  const rng = mulberry32(world.seed + 1);
  g.fillStyle = hex(C.paved);
  g.fillRect(0, 0, size, size);
  g.fillStyle = hex(C.pavedSpeck);
  for (let i = 0; i < 500; i++) g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  const roadPx = Math.max(2, Math.round(world.roadWidth * px));
  const half = Math.floor(roadPx / 2);
  const lines = [0, Math.round(world.blockSize * px), size];
  g.fillStyle = hex(C.road);
  for (const p of lines) {
    g.fillRect(p - half, 0, roadPx, size);
    g.fillRect(0, p - half, size, roadPx);
  }
  g.fillStyle = hex(C.roadLine);
  for (const p of lines) for (let t = 0; t < size; t += 6) {
    g.fillRect(p, t, 1, 3);
    g.fillRect(t, p, 3, 1);
  }
  // Crosswalks: stripes across each arm, just outside every intersection.
  g.fillStyle = hex(C.crosswalk);
  for (const ix of lines) for (const iz of lines) {
    for (let s = -half; s < half; s += 2) {
      for (const o of [half + 1, -half - 2]) {
        g.fillRect(ix + s, iz + o, 1, 1);
        g.fillRect(ix + o, iz + s, 1, 1);
      }
    }
  }
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** The Shibuya scramble: zebra crossings on all four arms plus both diagonals, transparent elsewhere (use alphaTest). */
export function scrambleTexture(): THREE.CanvasTexture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f0ea';
  const m = n / 2;
  const road = Math.round((CONFIG.world.roadWidth / 120) * n);
  for (let t = -road / 2; t < road / 2; t += 2) {
    // The four straight crossings, at the edge of the intersection.
    for (const e of [m - road / 2 - 4, m + road / 2 + 1]) {
      g.fillRect(m + t, e, 1, 3);
      g.fillRect(e, m + t, 3, 1);
    }
  }
  // Both diagonals, as stripes across a band.
  for (let k = -m + 6; k < m - 6; k += 2) for (let s = -2; s <= 2; s++) {
    g.fillRect(m + k + s, m + k - s, 1, 1);
    g.fillRect(m + k + s, m - k + s, 1, 1);
  }
  return finish(c);
}

export const SCREEN_FRAMES = 4;

/** Video-screen frames left to right (SCREEN_FRAMES × 32 × 18 px): bold pixel pictures in neon colours. */
export function screenTexture(): THREE.CanvasTexture {
  const fw = 32;
  const fh = 18;
  const c = document.createElement('canvas');
  c.width = fw * SCREEN_FRAMES;
  c.height = fh;
  const g = c.getContext('2d')!;
  const bg = ['#1b1440', '#0f2a3a', '#2a0f2a', '#101a10'];
  const fg = ['#ff3fb4', '#35e8ff', '#ffd23a', '#7a5cff'];
  for (let f = 0; f < SCREEN_FRAMES; f++) {
    const x0 = f * fw;
    g.fillStyle = bg[f]!;
    g.fillRect(x0, 0, fw, fh);
    g.fillStyle = fg[f]!;
    if (f === 0) for (let i = 0; i < 6; i++) g.fillRect(x0 + 3 + i * 5, 14 - i * 2, 3, 2 + i * 2);
    if (f === 1) { g.fillRect(x0 + 10, 4, 12, 10); g.fillStyle = '#ffffff'; g.fillRect(x0 + 13, 7, 2, 2); g.fillRect(x0 + 18, 7, 2, 2); }
    if (f === 2) for (let i = 0; i < 4; i++) g.fillRect(x0 + 3, 3 + i * 4, 6 + ((i * 7) % 20), 2);
    if (f === 3) { g.fillRect(x0 + 4, 4, 24, 3); g.fillRect(x0 + 4, 11, 24, 3); g.fillStyle = '#ffffff'; g.fillRect(x0 + 14, 2, 4, 14); }
  }
  return finish(c);
}

/** Everything the city draws with a texture; injectable so City can be built in tests without a DOM. */
export type CityTextures = {
  ground(style: CityStyle): THREE.Texture;
  crater(): THREE.Texture;
  facades(): THREE.Texture;
  screen(): THREE.Texture;
  overlay(id: string): THREE.Texture;
};

export const canvasCityTextures: CityTextures = {
  ground: cityGroundTexture,
  crater: craterTexture,
  facades: facadeAtlas,
  screen: screenTexture,
  overlay: () => scrambleTexture(),
};

/**
 * Facade material hook: each building instance picks an atlas cell (attribute aFacade) and the cell repeats by the
 * building's size, one per FACADE_TILE metres, so tall towers get more floors rather than stretched windows.
 */
export function patchFacadeShader(sh: { vertexShader: string; fragmentShader: string }): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFacade;\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vFacade = aFacade;
  float across = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
  vFacadeUv = vec2(uv.x * across / ${FACADE_TILE.w.toFixed(1)}, uv.y * length(instanceMatrix[1].xyz) / ${FACADE_TILE.h.toFixed(1)});`,
    );
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <map_fragment>',
      `vec2 facadeUv = vec2((fract(vFacadeUv.x) + vFacade) / ${FACADE_COUNT.toFixed(1)}, fract(vFacadeUv.y));
  diffuseColor *= texture2D(map, facadeUv);`,
    );
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run src/world/pixelTextures.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit together with Task 5** (City still imports the removed functions; Task 5 rewires it)

No commit here if `tsc` fails because of `City.ts`. Go straight to Task 5 and commit both together; Task 5's
commit message covers both.

---

### Task 5: City renders a style: facades, colours, parks, overlays, landmarks, `reset(style)`; GameScene picks the city

**Files:**
- Modify: `src/world/City.ts`, `src/GameScene.ts`
- Test: `src/world/City.test.ts` (new)

**Interfaces:**
- Consumes:
  - `generateChunk(style, …)`, `ChunkContent` (Task 3)
  - `CityTextures`, `canvasCityTextures`, `patchFacadeShader` (Task 4)
  - `TOKYO`, `pickCity` (Task 2)
- Produces:
  - `new City(scene: THREE.Scene, style: CityStyle, seed: number, onDestroyed: OnDestroyed, textures?: CityTextures)`
  - `city.reset(style?: CityStyle): void`
  - `city.style: CityStyle` (readonly getter)
  - `city.landmarkAt(x: number, z: number): boolean`: inside any loaded landmark's footprint
  - `city.landmarkCount(): number` (loaded landmark meshes; for tests)
  - Unchanged: `blast`, `damage`, `pickBuilding`, `forEachStandingInRadius`, `targetForInstance`, `update`,
    `destroyedCount`, `buildingMesh`, `onCollapseStart`, `CRATER_RADIUS`

- [ ] **Step 1: Write the failing tests**

`src/world/City.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import type { CityStyle } from '../cities/types';
import { City, CRATER_RADIUS } from './City';
import type { CityTextures } from './pixelTextures';
import type { Target } from '../combat';

const STUB: CityTextures = {
  ground: () => new THREE.Texture(),
  crater: () => new THREE.Texture(),
  facades: () => new THREE.Texture(),
  screen: () => new THREE.Texture(),
  overlay: () => new THREE.Texture(),
};
const make = (style: CityStyle = TOKYO, onDestroyed = (_t: Target, _e: number) => {}) => {
  const scene = new THREE.Scene();
  return { scene, city: new City(scene, style, CONFIG.world.seed, onDestroyed, STUB) };
};
const tmg = TOKYO.landmarks[0]!;
const landmarkTarget = (city: City): Target => {
  let t: Target | null = null;
  city.forEachStandingInRadius({ x: tmg.x, z: tmg.z }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) t = b; });
  return t!;
};

describe('City (Tokyo)', () => {
  it('loads the Metropolitan Government Building as a standing building-kind target with HP by height', () => {
    const { city } = make();
    expect(city.landmarkCount()).toBe(1);
    const t = landmarkTarget(city);
    expect(t.kind).toBe('building');
    expect((t as unknown as { maxHp: number }).maxHp).toBe(Math.round(tmg.h * CONFIG.world.buildingHpPerMetre));
    expect(city.landmarkAt(tmg.x, tmg.z)).toBe(true);
    expect(city.landmarkAt(tmg.x + tmg.w, tmg.z)).toBe(false);
  });

  it('is picked by a ray aimed at it (straight down, so no nearer tower is in the way)', () => {
    const { city } = make();
    const ray = new THREE.Ray(new THREE.Vector3(tmg.x, 1000, tmg.z), new THREE.Vector3(0, -1, 0));
    expect(city.pickBuilding(ray)).toBe(landmarkTarget(city));
  });

  it('collapses when destroyed, awarding EXP by HP, and its mesh tilts and sinks, then is hidden', () => {
    let exp = 0;
    const { city, scene } = make(TOKYO, (_t, e) => { exp = e; });
    const t = landmarkTarget(city);
    t.applyDamage(1e9);
    expect(t.isAlive()).toBe(false);
    expect(exp).toBe(Math.max(1, Math.round(Math.round(tmg.h * CONFIG.world.buildingHpPerMetre) * CONFIG.world.buildingExpPerHp)));
    const mesh = scene.children.find((o) => (o as THREE.Mesh).isMesh && o.position.x === tmg.x && o.position.z === tmg.z) as THREE.Mesh;
    city.update(CONFIG.world.collapseTime * 0.5, new THREE.Vector3());
    expect(mesh.position.y).toBeLessThan(0);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0);
    city.update(CONFIG.world.collapseTime, new THREE.Vector3());
    expect(mesh.visible).toBe(false);
  });

  it('remembers a destroyed landmark after its chunk streams out and back', () => {
    const { city } = make();
    landmarkTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3(30000, 0, 0));
    expect(city.landmarkCount()).toBe(0);
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3());
    expect(city.landmarkCount()).toBe(1);
    let standing = false;
    city.forEachStandingInRadius({ x: tmg.x, z: tmg.z }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) standing = true; });
    expect(standing).toBe(false);
  });

  it('is untouched by the crash blast at its distance (only the topple zone falls)', () => {
    const { city } = make();
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(landmarkTarget(city).isAlive()).toBe(true);
  });

  it('a landmark inside the blast radius topples like any building', () => {
    const near: CityStyle = { ...TOKYO, landmarks: [{ ...tmg, x: 500, z: 700 }] };
    const { city } = make(near);
    let t: Target | null = null;
    city.forEachStandingInRadius({ x: 500, z: 700 }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) t = b; });
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(t!.isAlive()).toBe(false);
  });

  it('reset(style) twice leaves exactly one mesh per loaded landmark and per overlay (no leftovers)', () => {
    const { city, scene } = make();
    const count = () => scene.children.filter((o) => (o as THREE.Mesh).isMesh).length;
    const before = count();
    city.reset(TOKYO);
    city.reset(TOKYO);
    expect(count()).toBe(before);
    expect(city.landmarkCount()).toBe(1);
    expect(city.style).toBe(TOKYO);
  });

  it('keeps the chunk under the monster fully built after streaming far away and back (no pool starvation)', () => {
    const { city } = make();
    const countNear = () => {
      let n = 0;
      city.forEachStandingInRadius({ x: 100, z: 1900 }, 150, () => n++);
      return n;
    };
    const first = countNear();
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) city.update(0.016, new THREE.Vector3(20000, 0, 0));
    for (let i = 0; i < 400; i++) city.update(0.016, new THREE.Vector3(0, 0, 0));
    expect(countNear()).toBe(first);
  });

  it('tints each building with its spec colour and sets its facade cell', () => {
    const { city } = make();
    const attr = city.buildingMesh.geometry.getAttribute('aFacade') as THREE.InstancedBufferAttribute;
    expect(attr).toBeDefined();
    let seen = false;
    for (let i = 0; i < city.buildingMesh.count; i++) if (attr.getX(i) > 0) seen = true;
    expect(seen).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/world/City.test.ts`
Expected: FAIL: the constructor arguments don't match, and `landmarkCount` / `landmarkAt` don't exist.

- [ ] **Step 3: Implement the City changes**

Change `src/world/City.ts` as follows. Show the full code for each changed member; everything not listed stays as
it is.

1. Imports:
   ```ts
   import { TOKYO } from '../cities/tokyo'; // remove (Task 3 stub)
   import type { CityStyle, LandmarkSpec } from '../cities/types';
   import { canvasCityTextures, patchFacadeShader, type CityTextures } from './pixelTextures';
   import { blastTopples, chunksInRadius, DestroyedLog, generateChunk, planStreaming, type BuildingSpec, type ChunkContent } from './chunks';
   ```
2. `Building` gains an optional own mesh (a landmark):
   ```ts
   constructor(
     readonly chunk: string,
     readonly index: number,
     /** Instanced slot, or −1 for a landmark (which has its own mesh). */
     readonly slot: number,
     readonly spec: BuildingSpec,
     private city: City,
     readonly mesh: THREE.Mesh | null = null,
   )
   ```
3. Fields:
   ```ts
   private parkMesh: THREE.InstancedMesh;
   private freeParks: number[] = [];
   private parkUsed: boolean[];
   private overlays: THREE.Mesh[] = [];
   private landmarkMat: THREE.MeshToonMaterial;
   private facadeAttr: THREE.InstancedBufferAttribute;
   private roofMat: THREE.MeshToonMaterial;
   private treeMat: THREE.MeshToonMaterial;
   private landmarks = 0;
   ```
   The `LoadedChunk` type gains `parkSlots: number[]`.
4. Constructor signature:
   `constructor(private scene: THREE.Scene, private _style: CityStyle, private seed: number, private onDestroyed: OnDestroyed, private textures: CityTextures = canvasCityTextures)`,
   plus `get style(): CityStyle { return this._style; }`.
   - **Ground:** `toonMat(0xffffff, { map: this.groundTexture() })` where
     `private groundTexture(): THREE.Texture { const tex = this.textures.ground(this._style); const span = this.groundSpan; tex.repeat.set(span / GROUND_TILE, span / GROUND_TILE); return tex; }`
     and `private groundSpan = Math.ceil((CONFIG.world.unloadRadius * 2.4) / GROUND_TILE) * GROUND_TILE;`.
     Set `tex.wrapS`/`wrapT` in the factory (canvas) and here as well:
     `tex.wrapS = tex.wrapT = THREE.RepeatWrapping;`.
   - **Crater:** `toonMat(0xffffff, { map: this.textures.crater() })`.
   - **Facade:**
     ```ts
     const facade = toonMat(0xffffff, { map: this.textures.facades() });
     facade.onBeforeCompile = (sh) => patchFacadeShader(sh);
     facade.customProgramCacheKey = () => 'city-facade';
     this.roofMat = toonMat(this._style.colors.roof);
     this.facadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
     box.setAttribute('aFacade', this.facadeAttr);
     this.buildingMesh = new THREE.InstancedMesh(box, [facade, facade, this.roofMat, this.roofMat, facade, facade], max);
     ```
   - **Trees:** `this.treeMat = toonMat(this._style.colors.tree)`.
   - **Parks:**
     ```ts
     this.parkMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), toonMat(this._style.colors.park), world.maxParks);
     this.parkMesh.receiveShadow = true;
     this.parkMesh.position.y = 0.2;
     ```
     Add `parkMesh` to the `frustumCulled = false` / `ZERO` loop and to `scene.add`, and initialise
     `this.parkUsed = new Array(world.maxParks).fill(false)`.
   - **Landmarks:** `this.landmarkMat = toonMat(0xffffff, { vertexColors: true });`
   - **Overlays:** call `this.buildOverlays()` before the first `stream`.
5. New private helpers:
   ```ts
   private buildOverlays(): void {
     for (const o of this.overlays) {
       o.removeFromParent();
       o.geometry.dispose();
       (o.material as THREE.MeshToonMaterial).map?.dispose();
       (o.material as THREE.Material).dispose();
     }
     this.overlays = this._style.overlays.map((ov) => {
       const mat = toonMat(0xffffff, { map: this.textures.overlay(ov.id) });
       mat.alphaTest = 0.5;
       mat.polygonOffset = true;
       mat.polygonOffsetFactor = -1;
       const m = new THREE.Mesh(new THREE.PlaneGeometry(ov.size, ov.size).rotateX(-Math.PI / 2), mat);
       m.position.set(ov.x, 0.35, ov.z);
       m.receiveShadow = true;
       this.scene.add(m);
       return m;
     });
   }

   private landmarkSpec(l: LandmarkSpec): BuildingSpec {
     return { x: l.x, z: l.z, w: l.w, d: l.d, h: l.h, facade: 0, color: 0xffffff, signs: [] };
   }

   landmarkAt(x: number, z: number): boolean {
     for (const c of this.chunks.values()) for (const b of c.buildings) {
       if (b.mesh && Math.abs(x - b.spec.x) <= b.spec.w / 2 && Math.abs(z - b.spec.z) <= b.spec.d / 2) return true;
     }
     return false;
   }

   landmarkCount(): number {
     return this.landmarks;
   }
   ```
6. `resetPools()` also refills `freeParks` (`maxParks − 1 … 0`).
7. `reset(style?: CityStyle)`:
   ```ts
   reset(style?: CityStyle): void {
     if (style && style !== this._style) {
       this._style = style;
       const mat = this.ground.material as THREE.MeshToonMaterial;
       mat.map?.dispose();
       mat.map = this.groundTexture();
       mat.needsUpdate = true;
       this.roofMat.color.setHex(style.colors.roof);
       this.treeMat.color.setHex(style.colors.tree);
       (this.parkMesh.material as THREE.MeshToonMaterial).color.setHex(style.colors.park);
     }
     this.buildOverlays();
     this.crater.visible = false;
     for (const key of [...this.loadedKeys]) this.unloadChunk(key);
     this.collapsing = [];
     this.destroyed.clear();
     this.resetPools();
     this.stream(new THREE.Vector3(), Infinity);
   }
   ```
8. `collapse`: `const rng = mulberry32(b.slot >= 0 ? b.slot + 99 : b.index + 7919);`.
9. `update`: add `this.parkMesh` to the `instanceMatrix.needsUpdate` loop, and set
   `this.facadeAttr.needsUpdate = true` inside the `dirty` block.
10. `updateCounts`: add `this.parkMesh.count = high((i) => this.parkUsed[i]!, this.parkUsed.length);`.
11. `loadChunk`:
    ```ts
    private loadChunk(key: string, cx: number, cz: number): void {
      const content = generateChunk(this._style, this.seed, cx, cz);
      const buildings: Building[] = [];
      const treeSlots: number[] = [];
      const parkSlots: number[] = [];
      content.buildings.forEach((spec, index) => {
        const slot = this.freeSlots.pop();
        if (slot === undefined) return;
        const b = new Building(key, index, slot, spec, this);
        this.slotOwner[slot] = b;
        this.buildingMesh.setColorAt(slot, _c.setHex(spec.color));
        this.facadeAttr.setX(slot, spec.facade);
        if (this.destroyed.has(key, index)) this.writeRubble(b);
        else this.writeStanding(b, 0, 0);
        buildings.push(b);
      });
      content.landmarks.forEach((l, i) => {
        const index = content.buildings.length + i;
        const mesh = new THREE.Mesh(l.build(), this.landmarkMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.landmarks++;
        const b = new Building(key, index, -1, this.landmarkSpec(l), this, mesh);
        if (this.destroyed.has(key, index)) this.writeRubble(b);
        else this.writeStanding(b, 0, 0);
        buildings.push(b);
      });
      for (const p of content.parks) {
        const slot = this.freeParks.pop();
        if (slot === undefined) break;
        const inner = CONFIG.world.blockSize - CONFIG.world.roadWidth;
        _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(inner, 1, inner));
        this.parkMesh.setMatrixAt(slot, _m);
        this.parkUsed[slot] = true;
        parkSlots.push(slot);
      }
      for (const t of content.trees) {
        // (unchanged tree code)
      }
      this.chunks.set(key, { content, buildings, treeSlots, parkSlots });
      this.loadedKeys.add(key);
      this.dirty = true;
    }
    ```
12. `unloadChunk`: for each building, if `b.mesh`, do
    `b.mesh.removeFromParent(); b.mesh.geometry.dispose(); this.landmarks--; this.releaseRubble(b); continue;`
    before the instanced-slot code. Release `parkSlots` like `treeSlots`, using `parkMesh` and `parkUsed`.
13. `writeRubble`: replace `this.buildingMesh.setMatrixAt(b.slot, ZERO);` with
    `if (b.mesh) b.mesh.visible = false; else this.buildingMesh.setMatrixAt(b.slot, ZERO);`.
    Replace the rubble rotation `_q.setFromAxisAngle(UP, b.slot)` with `_q.setFromAxisAngle(UP, b.slot >= 0 ? b.slot : b.index)`.
14. `writeStanding`:
    ```ts
    private writeStanding(b: Building, sink: number, tilt: number): void {
      const s = b.spec;
      _q.setFromAxisAngle(b.tiltAxis.lengthSq() > 0 ? b.tiltAxis : X_AXIS, tilt);
      if (b.mesh) {
        b.mesh.visible = true;
        b.mesh.position.set(s.x, -sink, s.z);
        b.mesh.quaternion.copy(_q);
        return;
      }
      _m.compose(_p.set(s.x, -sink, s.z), _q, _s.set(s.w, s.h, s.d));
      this.buildingMesh.setMatrixAt(b.slot, _m);
    }
    ```

In `src/GameScene.ts`:
- `import { pickCity } from './cities';`
- Construction: `this.city = new City(this.scene, pickCity(this.rng), CONFIG.world.seed, this.onTargetDestroyed);`
  This needs `this.rng` to be initialised before this line. It is a field initialiser (check with
  `grep -n "rng =" src/GameScene.ts`); if it is not, use `pickCity(Math.random)`.
- `resetRun()`: `this.city.reset(pickCity(this.rng));`

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run src/world`
Expected: all pass.

- [ ] **Step 5: Full check and commit** (covers Task 4 too)

```bash
npx tsc --noEmit && npx vitest run
git add src/world src/GameScene.ts
git commit -m "City renders a city style: facade atlas, district colours, parks, ground overlays, landmarks (the Metropolitan Government Building); runs pick the city

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Neon signs and video screens that fall with their building

**Files:**
- Modify: `src/world/City.ts`
- Test: `src/world/City.test.ts` (add a `describe('signs')` block)

**Interfaces:**
- Consumes: `BuildingSpec.signs: SignDef[]` (Tasks 1 and 3), `SCREEN_FRAMES` (Task 4)
- Produces:
  - `city.signCount(): number` and `city.screenCount(): number`: slots in use (for tests)
  - `Building.signSlots: { sign: SignDef; pool: 'sign' | 'screen'; slot: number }[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/world/City.test.ts`:
```ts
describe('signs', () => {
  const corner = TOKYO.specialLots.find((s) => s.signs.some((g) => g.kind === 'screen'))!;
  const cornerTarget = (city: City): Target => {
    let t: Target | null = null;
    city.forEachStandingInRadius({ x: corner.x, z: corner.z }, 2, (b) => { if (b.position.x === corner.x && b.position.z === corner.z) t = b; });
    return t!;
  };
  const signMatrix = (city: City, b: Target, k: number) => {
    const entry = (b as unknown as { signSlots: { pool: 'sign' | 'screen'; slot: number }[] }).signSlots[k]!;
    const mesh = (city as unknown as Record<string, THREE.InstancedMesh>)[entry.pool === 'sign' ? 'signMesh' : 'screenMesh']!;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(entry.slot, m);
    return m;
  };

  it('builds signs and screens for standing buildings', () => {
    const { city } = make();
    expect(city.signCount()).toBeGreaterThan(0);
    expect(city.screenCount()).toBeGreaterThanOrEqual(3);
  });

  it('a screen sits on its building and follows it as it tilts and sinks', () => {
    const { city } = make();
    const b = cornerTarget(city);
    const k = corner.signs.findIndex((g) => g.kind === 'screen');
    const g = corner.signs[k]!;
    const at = new THREE.Vector3().setFromMatrixPosition(signMatrix(city, b, k));
    expect(at.x).toBeCloseTo(corner.x + g.lx);
    expect(at.y).toBeCloseTo(g.ly);
    expect(at.z).toBeCloseTo(corner.z + g.lz);
    b.applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 0.6, new THREE.Vector3());
    const mid = new THREE.Vector3().setFromMatrixPosition(signMatrix(city, b, k));
    expect(mid.y).toBeLessThan(g.ly - 1);
  });

  it('is gone once the building is rubble', () => {
    const { city } = make();
    const before = city.screenCount();
    cornerTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    expect(city.screenCount()).toBe(before - corner.signs.filter((g) => g.kind === 'screen').length);
  });

  it('a destroyed building that streams back returns as rubble without signs', () => {
    const { city } = make();
    cornerTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    const after = city.screenCount();
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3(30000, 0, 0));
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3());
    expect(city.screenCount()).toBe(after);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/world/City.test.ts`
Expected: FAIL: `signCount` does not exist.

- [ ] **Step 3: Implement**

In `src/world/City.ts`:
1. `Building` gets `signSlots: { sign: SignDef; pool: 'sign' | 'screen'; slot: number }[] = [];`
   (import `SignDef` as a type).
2. Fields and construction:
   ```ts
   private signMesh: THREE.InstancedMesh;
   private screenMesh: THREE.InstancedMesh;
   private freeSigns: number[] = [];
   private freeScreens: number[] = [];
   private signUsed: boolean[];
   private screenUsed: boolean[];
   private screenTex: THREE.Texture;
   private screenT = 0;
   ```
   In the constructor:
   ```ts
   const signBox = new THREE.BoxGeometry(1, 1, 1);
   this.signMesh = new THREE.InstancedMesh(signBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), world.maxSigns);
   this.screenTex = this.textures.screen();
   this.screenTex.repeat.set(1 / SCREEN_FRAMES, 1);
   this.screenMesh = new THREE.InstancedMesh(signBox, new THREE.MeshBasicMaterial({ map: this.screenTex }), world.maxScreens);
   for (let i = 0; i < world.maxSigns; i++) this.signMesh.setColorAt(i, _c.setHex(0xffffff));
   this.signUsed = new Array(world.maxSigns).fill(false);
   this.screenUsed = new Array(world.maxScreens).fill(false);
   ```
   Add both meshes to the `frustumCulled = false` / `ZERO` loop and to `scene.add`.
3. `resetPools`: refill `freeSigns` (`maxSigns − 1 … 0`) and `freeScreens`.
4. Allocation, in `loadChunk` after `writeStanding` for a standing (not destroyed) instanced building, and before the
   `writeStanding` call so the signs get written:
   ```ts
   private attachSigns(b: Building): void {
     for (const sign of b.spec.signs) {
       const screen = sign.kind === 'screen';
       const slot = (screen ? this.freeScreens : this.freeSigns).pop();
       if (slot === undefined) continue;
       (screen ? this.screenUsed : this.signUsed)[slot] = true;
       if (!screen) this.signMesh.setColorAt(slot, _c.setHex(sign.color));
       b.signSlots.push({ sign, pool: screen ? 'screen' : 'sign', slot });
     }
   }
   private releaseSigns(b: Building): void {
     for (const e of b.signSlots) {
       const mesh = e.pool === 'screen' ? this.screenMesh : this.signMesh;
       mesh.setMatrixAt(e.slot, ZERO);
       (e.pool === 'screen' ? this.screenUsed : this.signUsed)[e.slot] = false;
       (e.pool === 'screen' ? this.freeScreens : this.freeSigns).push(e.slot);
     }
     b.signSlots = [];
   }
   ```
   In `loadChunk`: `if (this.destroyed.has(key, index)) this.writeRubble(b); else { this.attachSigns(b); this.writeStanding(b, 0, 0); }`.
5. `writeStanding` (instanced branch), after setting the building matrix:
   ```ts
   for (const e of b.signSlots) {
     const g = e.sign;
     // Building frame: base centre (x, -sink, z), tilted by _q; the sign's centre offset, rotated with it.
     _p2.set(g.lx, g.ly, g.lz).applyQuaternion(_q).add(_p.set(s.x, -sink, s.z));
     _m2.compose(_p2, _q, _s2.set(g.w, g.h, g.d));
     (e.pool === 'screen' ? this.screenMesh : this.signMesh).setMatrixAt(e.slot, _m2);
   }
   ```
   with module scratch `const _p2 = new THREE.Vector3(); const _s2 = new THREE.Vector3(); const _m2 = new THREE.Matrix4();`.
   Note that `_p` is reused for the building position above, so set the building matrix first, as the existing
   code does.
6. `writeRubble`: call `this.releaseSigns(b);` at the start.
7. `unloadChunk`: call `this.releaseSigns(b);` for each instanced building.
8. `updateCounts`: add the counts for `signMesh` (from `signUsed`) and `screenMesh` (from `screenUsed`).
9. `update`:
   - Add `signMesh` and `screenMesh` to the `needsUpdate` loop, and set
     `if (this.signMesh.instanceColor) this.signMesh.instanceColor.needsUpdate = true;`.
   - Animate the screens:
     ```ts
     this.screenT += dt;
     this.screenTex.offset.x = (Math.floor(this.screenT / 0.7) % SCREEN_FRAMES) / SCREEN_FRAMES;
     ```
10. Counters:
    `signCount(): number { return this.signUsed.filter(Boolean).length; }`
    `screenCount(): number { return this.screenUsed.filter(Boolean).length; }`

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run src/world && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/world/City.ts src/world/City.test.ts
git commit -m "City: neon signs and Shibuya video screens, one draw call each, that tilt and fall with their building

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Artillery never spawns inside a landmark

**Files:**
- Modify: `src/enemies/types.ts`, `src/enemies/Artillery.ts`, `src/GameScene.ts`
- Test: `src/enemies/Artillery.test.ts` (new)

**Interfaces:**
- Consumes: `city.landmarkAt(x, z)` (Task 5)
- Produces: `WorldContext.blocked?(x: number, z: number): boolean`

- [ ] **Step 1: Write the failing test**

`src/enemies/Artillery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Artillery } from './Artillery';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';

const ctx = (blocked: (x: number, z: number) => boolean): WorldContext =>
  ({
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
    blocked,
  }) as unknown as WorldContext;

describe('Artillery spawn', () => {
  it('never places a gun inside a blocked spot (a landmark footprint)', () => {
    const a = new Artillery(new THREE.Scene());
    // Block everything east of the monster (x < 0): batteries must land west.
    const c = ctx((x) => x < 0);
    for (let i = 0; i < 20; i++) a.spawn(c);
    const guns = a.targets();
    expect(guns.length).toBeGreaterThan(0);
    for (const g of guns) expect(g.position.x).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/enemies/Artillery.test.ts`
Expected: FAIL: some gun has x < 0.

- [ ] **Step 3: Implement**

`src/enemies/types.ts`, inside `WorldContext`:
```ts
  /** True where nothing may be placed (inside a landmark's footprint). Optional: absent means nowhere is blocked. */
  blocked?(x: number, z: number): boolean;
```

`src/enemies/Artillery.ts` `spawn`: replace the single angle pick with up to 8 tries:
```ts
  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.batteries.length >= MAX_BATTERIES) return;
    const m = ctx.monster.position;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = A.distMin + ctx.rng() * (A.distMax - A.distMin);
      const cx = m.x + Math.cos(a) * r;
      const cz = m.z + Math.sin(a) * r;
      const spots: { x: number; z: number }[] = [];
      for (let i = 0; i < A.guns; i++) {
        const off = (i - (A.guns - 1) / 2) * A.gunSpacing;
        spots.push({ x: cx - Math.sin(a) * off, z: cz + Math.cos(a) * off });
      }
      if (ctx.blocked && spots.some((s) => ctx.blocked!(s.x, s.z))) continue;
      const guns = spots.map((s) => {
        const g = new Gun(A.hp * ctx.difficulty.hpMult, this.damage);
        g.position.set(s.x, A.size * 0.3, s.z);
        g.yaw = Math.atan2(m.x - cx, m.z - cz);
        return g;
      });
      this.batteries.push({ guns, salvoT: A.salvoEvery * 0.5 });
      return;
    }
  }
```

`src/GameScene.ts` `buildContext()`: add `blocked: (x, z) => this.city.landmarkAt(x, z),`.

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run src/enemies && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/enemies/types.ts src/enemies/Artillery.ts src/enemies/Artillery.test.ts src/GameScene.ts
git commit -m "Artillery batteries never spawn inside a landmark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Visual verification, performance soak, and tuning

**Files:**
- Modify (tuning only, as the screenshots show is needed): `src/cities/tokyo/districts.ts`, `src/cities/tokyo/index.ts`,
  `src/cities/tokyo/shibuya.ts`, `src/world/pixelTextures.ts`, `src/config.ts`
- Scripts (scratchpad, not committed): reuse `intro-sheet.mjs` and `perf-soak.mjs` in
  `/private/tmp/claude-501/-Users-eric-Developer-azragon/cf6289c6-12f2-45ae-8375-d49490c90a88/scratchpad/`

**Interfaces:** none new.

- [ ] **Step 1: Screenshots.** The dev server is already running on http://localhost:5173 (do not start another).
  Use Playwright chromium with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, at 1440 × 900 and at a
  390 × 844 phone portrait. Capture:
  - the title flyover;
  - the intro dive at t = 6.5 and 7.2: `SLOW=1 node intro-sheet.mjs 5173 tokyo-dive 6.5 7.2 11.9`;
  - play start, after `skipIntro()`;
  - Shibuya: set `__game.monster.position` to (600, 0, 1300) with yaw 0 and let the camera settle;
  - Shinjuku: the monster at (300, 0, 2400);
  - a residential edge: the monster at (2500, 0, −2500).

  Check each against the spec:
  - the Shinjuku skyline is visible ahead in the dive and at play start;
  - signs glow and screens animate;
  - the scramble markings are visible;
  - the Metropolitan Government Building reads as twin towers;
  - there is no z-fighting between the overlay and the ground;
  - no building stands on a road.

- [ ] **Step 2: All four monsters.** Play the crash with each monster (the select screen's `selectStep(n)`, then
  `playSelected()`) and confirm no errors in the console and the crater forms.

- [ ] **Step 3: Performance soak.** Run `perf-soak.mjs` (from the 2026-10-13 perf investigation) on this branch.
  Compare draw calls, `renderer.info` geometries and textures, heap, and frame time with
  `perf-soak-before.json`, and write `perf-soak-5a.json`.
  - **Acceptance:** draw calls ≤ +6 over the old baseline at play start; no growth across cycles; CPU frame time
    within 25% of the baseline.
  - **If not:** lower `maxBuildings` and the district `fill` values, re-run, and record the ruling.

- [ ] **Step 4: Tune** heights, colours, sign density and facade tile sizes until the screenshots read as Tokyo, then
  re-run `npx tsc --noEmit && npx vitest run`.

- [ ] **Step 5: Commit tuning**

```bash
git add src/cities src/world/pixelTextures.ts src/config.ts
git commit -m "Tokyo: tuning from screenshots and the perf soak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | Compass and layout, core regions, noise beyond | 1 |
  | District rules and colours | 2 |
  | Shibuya Crossing (fixed corners, screens, overlay) | 2, 4, 5, 6 |
  | Metropolitan Government Building and the landmark type | 2, 5 |
  | Neon signs and screens | 3, 6 |
  | Ground paved, crosswalks | 4 |
  | Parks | 3, 5 |
  | Random pick and run reset | 2, 5 |
  | Budgets and caps | 3, 8 |
  | Spawns | 7 |
  | Title and select use the current city | unchanged: they use `this.city`, which is built at construction with the picked style |
  | Testing and visual checks | 1–8 |

- **Placeholder scan:** none left. Task 3's density fallback and Task 8's tuning are explicit, conditional steps with
  values.
- **Type consistency:**
  - `generateChunk(style, seed, cx, cz)` is used the same way in Tasks 3 and 5.
  - `CityTextures` (Task 4) matches its use in Task 5.
  - `Building.signSlots` (Task 6) matches the tests.
  - `landmarkAt` (Task 5) is used in Task 7.
- **Review Focus:**
  - (1) Task 7;
  - (2) Task 5, "reset(style) twice";
  - (3) Task 2, "readability";
  - (4) Task 5, "pool starvation";
  - (5) Task 6, "streams back as rubble".
