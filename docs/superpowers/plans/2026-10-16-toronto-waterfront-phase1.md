# Toronto Waterfront Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Toronto's rectangular island with scenery-only landforms drawn over the lake: the Toronto Islands crescent and Tommy Thompson Park, with beaches, lagoons, trees and hand-placed details.

**Architecture:**
- **Data:** each landform is a `LandformSpec`, defined in `src/cities/toronto/waterfront.ts`. It has an outline (smoothed unless sharp), holes, per-vertex beach widths, a tree density and details.
- **Shape maths:** pure, in `src/world/landforms.ts`.
- **Drawing:** `src/world/Landforms.ts` draws all landforms together as four meshes (sand, grass, trees, details). `City` owns it and rebuilds it on construction and every reset.
- **Gameplay:** no gameplay code reads landforms.

**Tech Stack:** TypeScript, Three.js r170, Vitest. Run tests with `npx vitest run <file>`, type-check with `npx tsc --noEmit -p .`.

**Spec:** `docs/superpowers/specs/2026-10-16-toronto-waterfront-phase1-design.md`

## Global Constraints

- Scenery only. Nothing touches collision, `blockedAt`, roads, spawns or `WorldContext`.
- Toronto's `island` (the rectangle `TORONTO_ISLANDS`) is removed. Tokyo's island and its tests are unchanged.
- Coordinates are game metres, +x east, +z south. Toronto's mainland land ends at the block edge z = 2200 along the lake.
- At most 1,200 landform trees in total.
- Comments state what the code does and its constraints, never history. Don't push or deploy.

## Review Focus

1. **Catmull-Rom overshoot at sharp corners.** The airport's square northwest corner and the spit's lobe tips could curl into small loops (Task 2: "smoothing stays close to the outline").
2. **Inset on thin shapes.** The 50 m arm with a 10 m beach must keep a grass strip, not invert (Task 2: "inset keeps a thin ribbon's grass inside it").
3. **Overlapping landforms.** The causeway, lobes and arm overlap at their joints. They must draw without flicker, so all sand goes in one mesh and all grass in another (Task 4: "draws all landforms as one sand and one grass mesh").
4. **Style switch and reset.** Toronto → Tokyo → Toronto must leave exactly one set of landform meshes, and Tokyo must have none (Task 4).
5. **Details in the water.** The pier and ferry dock deliberately stand over water. Everything else must stand on grass (Task 3: "every detail stands on grass, except piers and docks").

---

### Task 1: Remove Toronto's rectangular island

**Files:**
- Modify: `src/cities/toronto/layout.ts`. Delete `TORONTO_ISLANDS` (line 28), drop the island check in `baseDistrictAt` (line 155), and drop `island` from `WATERS` (line 188).
- Modify: `src/cities/toronto/index.ts`. Remove the `TORONTO_ISLANDS` import and the `island: TORONTO_ISLANDS,` line.
- Modify: `src/cities/toronto/layout.test.ts`. Replace the test `keeps the islands offshore…`, and drop `TORONTO_ISLANDS` from its import.

- [ ] **Step 1: Replace the island test.** In `src/cities/toronto/layout.test.ts`, replace the whole `it('keeps the islands offshore: …', () => { … });` block with:

```ts
  it('has no block-shaped island: the lake south of downtown is open water (the islands are drawn landforms)', () => {
    expect(TORONTO.island).toBeUndefined();
    for (let i = -12; i <= 8; i++) {
      for (let j = 12; j <= 20; j++) {
        expect(isIsland(TORONTO, i, j), `${i},${j}`).toBe(false);
        if (inBay(TORONTO, centre(i), centre(j))) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(true);
      }
    }
  });
```

and remove `TORONTO_ISLANDS, ` from the `./layout` import line.

- [ ] **Step 2: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/layout.test.ts`. Expected: FAIL. `TORONTO.island` is still defined, and some cells are islands.

- [ ] **Step 3: Remove the island.**
  - In `src/cities/toronto/layout.ts`:
    - delete the `TORONTO_ISLANDS` doc comment and its `export const` line;
    - delete the line `  if (isIsland({ bay: TORONTO_LAKE, island: TORONTO_ISLANDS }, Math.floor(x / cell), Math.floor(z / cell))) return 'park';`;
    - change `const WATERS = { river: DON, bay: TORONTO_LAKE, island: TORONTO_ISLANDS } as const;` to `const WATERS = { river: DON, bay: TORONTO_LAKE } as const;` and its comment to `/** The water, for the Don bank test. */`;
    - remove `isIsland` and `IslandSpec` from the imports if they are no longer used. Check with `npx tsc --noEmit -p .`.
  - In `src/cities/toronto/index.ts`, remove `TORONTO_ISLANDS, ` from the `./layout` import and delete the line `  island: TORONTO_ISLANDS,`.

- [ ] **Step 4: Run Toronto's tests and the type-check.** Run: `npx tsc --noEmit -p . && npx vitest run src/cities src/world`. Expected: PASS. Tests that assert `isIsland(TORONTO, …)` is false still hold. If a test fails because it expected island cells, rewrite it to the same intent with no island and log a ruling.

- [ ] **Step 5: Commit.**

```bash
git add src/cities/toronto/layout.ts src/cities/toronto/index.ts src/cities/toronto/layout.test.ts
git commit -m "Remove Toronto's rectangular island

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Landform shape maths

**Files:**
- Modify: `src/cities/types.ts` (add `Pt`, `LandformDetail`, `LandformSpec`; `CityStyle.landforms?`)
- Create: `src/world/landforms.ts`
- Test: `src/world/landforms.test.ts`

**Interfaces:**
- Produces:
  - types `Pt = { x: number; z: number }`, `OutlinePt = Pt & { beach?: number }`, `LandformDetail`, `LandformSpec`;
  - `CityStyle.landforms?: readonly LandformSpec[]`;
  - from `landforms.ts`: `smoothOutline(pts, samples)`, `ellipse(cx, cz, rx, rz, deg, n?)`, `ribbon(path, width, capSegments?)`, `insetOutline(pts, dist)`, `inPolygon(poly, x, z)`, `prepareLandform(spec): PreparedLandform`, `onLand(p, x, z)`, `onGrass(p, x, z)`, `treeSpot(p, x, z)`, `scatterTrees(p, seed, max)`.

- [ ] **Step 1: Add the types.** In `src/cities/types.ts`, above `export type CityStyle`, add:

```ts
/** A ground point (game metres, +x east, +z south). */
export type Pt = { x: number; z: number };
/** An outline corner; `beach` overrides the landform's beach width (m) there. */
export type OutlinePt = Pt & { beach?: number };
/**
 * A hand-placed solid on a landform. A box is `w` wide, `d` deep along its yaw (rad about +Y), `h` tall, standing
 * `y` m above the land. A tower is a tapering cylinder of base radius `r`, with a `cap` coloured lantern on top.
 * `water`: built out over the water (a pier or a dock), so it may leave the land.
 */
export type LandformDetail =
  | { kind: 'box'; x: number; z: number; w: number; d: number; h: number; yaw: number; color: number; y?: number; water?: boolean }
  | { kind: 'tower'; x: number; z: number; r: number; h: number; color: number; cap: number };
/**
 * Scenery land drawn over the water: a sand outline (smoothed into curves unless `sharp`) with a grass interior
 * `beach` m in from the edge, `holes` (lagoons) cut through both, trees on the grass (one per `treeEvery` m², none at
 * 0), and hand-placed `details`. It plays no part in gameplay.
 */
export type LandformSpec = {
  name: string;
  outline: readonly OutlinePt[];
  sharp?: boolean;
  holes: readonly (readonly Pt[])[];
  beach: number;
  treeEvery: number;
  details: readonly LandformDetail[];
};
```

and add to `CityStyle` (after `island?`):

```ts
  /** Scenery landforms drawn over the water (islands, spits); absent means none. */
  landforms?: readonly LandformSpec[];
```

- [ ] **Step 2: Write the failing test** `src/world/landforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { LandformSpec, Pt } from '../cities/types';
import { ellipse, inPolygon, insetOutline, onGrass, onLand, prepareLandform, ribbon, scatterTrees, smoothOutline, treeSpot } from './landforms';

const SQUARE: Pt[] = [{ x: -500, z: -500 }, { x: 500, z: -500 }, { x: 500, z: 500 }, { x: -500, z: 500 }];
const spec = (over: Partial<LandformSpec> = {}): LandformSpec => ({ name: 't', outline: SQUARE, sharp: true, holes: [], beach: 40, treeEvery: 2000, details: [], ...over });

describe('landform shapes', () => {
  it('smoothing passes through every corner and stays close to the outline', () => {
    const tri: Pt[] = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 800 }];
    const s = smoothOutline(tri, 8);
    for (const p of tri) expect(s.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-6)).toBe(true);
    for (const q of s) {
      expect(q.x).toBeGreaterThan(-250);
      expect(q.x).toBeLessThan(1250);
      expect(q.z).toBeGreaterThan(-250);
      expect(q.z).toBeLessThan(1050);
    }
  });

  it('carries per-corner beach widths along the curve', () => {
    const s = smoothOutline([{ x: 0, z: 0, beach: 10 }, { x: 100, z: 0, beach: 30 }, { x: 0, z: 100 }], 4, 20);
    expect(s[0]!.beach).toBe(10);
    expect(s[2]!.beach).toBeCloseTo(20, 6);
    expect(s[4]!.beach).toBe(30);
    expect(s[8]!.beach).toBe(20);
  });

  it('inset moves each edge inward by about the distance, never outside', () => {
    const inner = insetOutline(SQUARE.map((p) => ({ ...p, beach: 40 })), 40);
    for (const p of inner) {
      expect(Math.abs(p.x)).toBeCloseTo(460, 0);
      expect(Math.abs(p.z)).toBeCloseTo(460, 0);
    }
    // The same either way round.
    const rev = insetOutline([...SQUARE].reverse().map((p) => ({ ...p, beach: 40 })), 40);
    for (const p of rev) expect(inPolygon(SQUARE, p.x, p.z)).toBe(true);
  });

  it('inset keeps a thin ribbon\'s grass inside it', () => {
    const r = ribbon([{ x: 0, z: 0 }, { x: 300, z: 400 }, { x: 600, z: 400 }], 50);
    const inner = insetOutline(r.map((p) => ({ ...p, beach: 10 })), 10);
    for (const p of inner) expect(inPolygon(r, p.x, p.z)).toBe(true);
    // Its centre line is still grass.
    const p = prepareLandform(spec({ outline: r, beach: 10 }));
    expect(onGrass(p, 150, 200)).toBe(true);
  });

  it('ribbon follows its path at the given width, with rounded ends', () => {
    const r = ribbon([{ x: 0, z: 0 }, { x: 1000, z: 0 }], 100);
    expect(inPolygon(r, 500, 49)).toBe(true);
    expect(inPolygon(r, 500, 51)).toBe(false);
    expect(inPolygon(r, -49, 0)).toBe(true);
    expect(inPolygon(r, -45, 45)).toBe(false);
  });

  it('ellipse is a closed outline of the given radii and turn', () => {
    const e = ellipse(100, 200, 300, 100, 90);
    expect(inPolygon(e, 100, 200 + 290)).toBe(true);
    expect(inPolygon(e, 100 + 290, 200)).toBe(false);
  });

  it('land is inside the outline and outside every hole; grass is land beyond the beach', () => {
    const p = prepareLandform(spec({ holes: [ellipse(0, 0, 100, 100, 0)] }));
    expect(onLand(p, 300, 300)).toBe(true);
    expect(onLand(p, 0, 0)).toBe(false);
    expect(onLand(p, 600, 0)).toBe(false);
    expect(onLand(p, 480, 0)).toBe(true);
    expect(onGrass(p, 480, 0)).toBe(false);
    expect(onGrass(p, 300, 300)).toBe(true);
  });

  it('trees grow only on grass and off details, the same for the same seed, about one per treeEvery m², capped', () => {
    const box = { kind: 'box' as const, x: 200, z: 200, w: 200, d: 200, h: 5, yaw: 0, color: 0 };
    const p = prepareLandform(spec({ details: [box] }));
    const a = scatterTrees(p, 7, 10000);
    expect(a).toEqual(scatterTrees(p, 7, 10000));
    for (const t of a) {
      expect(onGrass(p, t.x, t.z)).toBe(true);
      expect(treeSpot(p, t.x, t.z)).toBe(true);
    }
    const grass = 920 * 920 - 200 * 200;
    expect(a.length).toBeGreaterThan((grass / 2000) * 0.6);
    expect(a.length).toBeLessThan((grass / 2000) * 1.4);
    expect(scatterTrees(p, 7, 10)).toHaveLength(10);
    expect(scatterTrees(prepareLandform(spec({ treeEvery: 0 })), 7, 100)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/world/landforms.test.ts`. Expected: FAIL, `./landforms` doesn't resolve.

- [ ] **Step 4: Implement** `src/world/landforms.ts`:

```ts
import { mulberry32 } from '../util/rng';
import type { LandformDetail, LandformSpec, OutlinePt, Pt } from '../cities/types';
import type { TreeSpec } from './chunks';

/** A landform ready to draw and test: its shoreline curve (with beach widths), grass outline, holes and details. */
export type PreparedLandform = {
  spec: LandformSpec;
  outline: OutlinePt[];
  grass: Pt[];
  holes: Pt[][];
  details: readonly LandformDetail[];
};

/** Clearance (m) kept between trees and a detail's footprint. */
const DETAIL_MARGIN = 8;

/**
 * A closed Catmull-Rom curve through `pts`, `samples` points per edge (each corner is one of them). Beach widths
 * interpolate linearly between corners; corners without one take `beach`.
 */
export function smoothOutline(pts: readonly OutlinePt[], samples: number, beach = 0): OutlinePt[] {
  const n = pts.length;
  const out: OutlinePt[] = [];
  const f = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const b1 = p1.beach ?? beach;
    const b2 = p2.beach ?? beach;
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x, t), z: f(p0.z, p1.z, p2.z, p3.z, t), beach: b1 + (b2 - b1) * t });
    }
  }
  return out;
}

/** An ellipse outline about (cx, cz) with radii rx (along x before the turn) × rz, turned `deg` degrees, `n` points. */
export function ellipse(cx: number, cz: number, rx: number, rz: number, deg: number, n = 24): Pt[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    return { x: cx + x * c - z * s, z: cz + x * s + z * c };
  });
}

/** The outline of `path` thickened to `width`: mitred along its length, with half-circle caps at both ends. */
export function ribbon(path: readonly Pt[], width: number, capSegments = 6): Pt[] {
  const h = width / 2;
  const n = path.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: -dz / l, z: dx / l };
  };
  const side = (sign: 1 | -1): Pt[] =>
    path.map((p, i) => {
      const n0 = i > 0 ? normal(path[i - 1]!, p) : normal(p, path[i + 1]!);
      const n1 = i < n - 1 ? normal(p, path[i + 1]!) : n0;
      const mx = n0.x + n1.x;
      const mz = n0.z + n1.z;
      const ml = Math.hypot(mx, mz) || 1;
      const scale = h / Math.max(0.3, (mx * n0.x + mz * n0.z) / ml);
      return { x: p.x + (sign * mx * scale) / ml, z: p.z + (sign * mz * scale) / ml };
    });
  const cap = (at: Pt, from: Pt): Pt[] => {
    // Half circle round `at`, starting on the side `from` lies and sweeping away from the path.
    const a0 = Math.atan2(from.z - at.z, from.x - at.x);
    const out: Pt[] = [];
    for (let k = 1; k < capSegments; k++) {
      const a = a0 - (k / capSegments) * Math.PI;
      out.push({ x: at.x + Math.cos(a) * h, z: at.z + Math.sin(a) * h });
    }
    return out;
  };
  const left = side(1);
  const right = side(-1);
  return [...left, ...cap(path[n - 1]!, left[n - 1]!), ...right.reverse(), ...cap(path[0]!, right[right.length - 1]!)];
}

/** Twice the signed area: positive when the outline runs anticlockwise in (x, z). */
function area2(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a;
}

/** Each corner moved `dist` (or its own `beach`) inward along the mean of its two edges' inward normals. */
export function insetOutline(pts: readonly OutlinePt[], dist: number): Pt[] {
  const n = pts.length;
  const sign = area2(pts) > 0 ? 1 : -1;
  const inward = (a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: (-dz / l) * sign, z: (dx / l) * sign };
  };
  return pts.map((p, i) => {
    const n0 = inward(pts[(i - 1 + n) % n]!, p);
    const n1 = inward(p, pts[(i + 1) % n]!);
    const mx = n0.x + n1.x;
    const mz = n0.z + n1.z;
    const ml = Math.hypot(mx, mz) || 1;
    const d = (p.beach ?? dist) / Math.max(0.3, (mx * n0.x + mz * n0.z) / ml);
    return { x: p.x + (mx / ml) * d, z: p.z + (mz / ml) * d };
  });
}

/** Whether (x, z) lies inside the polygon (even-odd rule). */
export function inPolygon(poly: readonly Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function prepareLandform(spec: LandformSpec): PreparedLandform {
  const outline = spec.sharp ? spec.outline.map((p) => ({ ...p, beach: p.beach ?? spec.beach })) : smoothOutline(spec.outline, 8, spec.beach);
  return { spec, outline, grass: insetOutline(outline, spec.beach), holes: spec.holes.map((h) => [...h]), details: spec.details };
}

export function onLand(p: PreparedLandform, x: number, z: number): boolean {
  return inPolygon(p.outline, x, z) && !p.holes.some((h) => inPolygon(h, x, z));
}

export function onGrass(p: PreparedLandform, x: number, z: number): boolean {
  return inPolygon(p.grass, x, z) && !p.holes.some((h) => inPolygon(h, x, z));
}

/** Whether a detail's footprint (grown by `margin`) covers (x, z). */
export function onDetail(d: LandformDetail, x: number, z: number, margin = 0): boolean {
  const dx = x - d.x;
  const dz = z - d.z;
  if (d.kind === 'tower') return Math.hypot(dx, dz) <= d.r + margin;
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= d.w / 2 + margin && Math.abs(lz) <= d.d / 2 + margin;
}

/** Grass with room for a tree: clear of every detail by DETAIL_MARGIN. */
export function treeSpot(p: PreparedLandform, x: number, z: number): boolean {
  return onGrass(p, x, z) && !p.details.some((d) => onDetail(d, x, z, DETAIL_MARGIN));
}

/** Trees on a jittered grid of one cell per spec.treeEvery m², kept where treeSpot allows, at most `max`. */
export function scatterTrees(p: PreparedLandform, seed: number, max: number): TreeSpec[] {
  const every = p.spec.treeEvery;
  if (every <= 0 || max <= 0) return [];
  const step = Math.sqrt(every);
  const xs = p.outline.map((q) => q.x);
  const zs = p.outline.map((q) => q.z);
  const rng = mulberry32(seed);
  const out: TreeSpec[] = [];
  for (let z = Math.min(...zs); z < Math.max(...zs) && out.length < max; z += step) {
    for (let x = Math.min(...xs); x < Math.max(...xs) && out.length < max; x += step) {
      const tx = x + rng() * step;
      const tz = z + rng() * step;
      const s = 14 + rng() * 12;
      if (treeSpot(p, tx, tz)) out.push({ x: tx, z: tz, s });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests.** Run: `npx vitest run src/world/landforms.test.ts`. Expected: PASS (8 tests).
  - If "ribbon … rounded ends" fails on the cap side, the cap is sweeping the wrong way round. Flip the sign of the sweep in `cap` (`a0 + …`) and log a ruling.

- [ ] **Step 6: Commit.**

```bash
git add src/cities/types.ts src/world/landforms.ts src/world/landforms.test.ts
git commit -m "Add landform shape maths: smoothing, ribbons, inset, land tests, tree scatter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Toronto's waterfront landforms (data and palette)

**Files:**
- Modify: `src/config.ts` (palette entries)
- Create: `src/cities/toronto/waterfront.ts`
- Modify: `src/cities/toronto/index.ts` (`landforms: TORONTO_LANDFORMS`)
- Test: `src/cities/toronto/waterfront.test.ts`

**Interfaces:**
- Consumes: `ellipse`, `ribbon`, `prepareLandform`, `onLand`, `onGrass`, `onDetail` (Task 2).
- Produces: `TORONTO_LANDFORMS: readonly LandformSpec[]` and named exports `ISLANDS`, `SPIT_CAUSEWAY`, `SPIT_LOBES`, `SPIT_ARM`. Palette: `landSand`, `landGrass`, `landPath`, `landRunway`, `landMarking`, `landTerminal`, `lighthouseWhite`, `lighthouseRed`, `cottage1`..`cottage4`.

- [ ] **Step 1: Add the palette.** In `src/config.ts`, after the `gustav…` palette entries, add:

```ts
    /** Scenery landforms (Toronto's islands and spit): sand, grass, paths, the airport, lighthouses, island cottages. */
    landSand: 0xe3d3a1,
    landGrass: 0x6a9a4c,
    landPath: 0xcfc8b4,
    landRunway: 0x55595d,
    landMarking: 0xf2f2ee,
    landTerminal: 0xd6dadd,
    lighthouseWhite: 0xf4f1ea,
    lighthouseRed: 0xc8352b,
    cottage1: 0xe8c7c8,
    cottage2: 0xc9dbe8,
    cottage3: 0xf2e2b0,
    cottage4: 0xcfe3c8,
```

- [ ] **Step 2: Write the failing test** `src/cities/toronto/waterfront.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TORONTO } from '.';
import { coastDistance } from '../coast';
import { ISLANDS, SPIT_ARM, SPIT_CAUSEWAY, SPIT_LOBES, TORONTO_LANDFORMS } from './waterfront';
import { inPolygon, onDetail, onGrass, onLand, prepareLandform } from '../../world/landforms';

const all = TORONTO_LANDFORMS.map(prepareLandform);
const prep = (s: typeof ISLANDS) => all[TORONTO_LANDFORMS.indexOf(s)]!;

describe('Toronto waterfront landforms', () => {
  it('lists the islands and the spit (causeway, lobes, arm) on Toronto', () => {
    expect(TORONTO.landforms).toBe(TORONTO_LANDFORMS);
    expect(TORONTO_LANDFORMS).toEqual([ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM]);
  });

  it('puts the islands about 2.5 km offshore and the spit tip about 4 km out', () => {
    const iz = prep(ISLANDS).outline.map((p) => p.z);
    expect(Math.max(...iz)).toBeGreaterThan(4700);
    expect(Math.max(...iz)).toBeLessThan(4950);
    const sz = prep(SPIT_LOBES).outline.map((p) => p.z);
    expect(Math.max(...sz)).toBeGreaterThan(6300);
  });

  it('keeps the islands, lobes and arm out in the lake; the causeway reaches the shore at Leslie St', () => {
    for (const s of [ISLANDS, SPIT_LOBES, SPIT_ARM]) {
      for (const p of prep(s).outline) expect(coastDistance(TORONTO.bay!, p.x, p.z), `${s.name} ${p.x},${p.z}`).toBeLessThan(0);
    }
    const cz = prep(SPIT_CAUSEWAY).outline.map((p) => p.z);
    expect(Math.min(...cz)).toBeLessThanOrEqual(2200);
  });

  it('keeps the islands clear of the spit', () => {
    const islands = prep(ISLANDS);
    for (const s of [SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM]) {
      for (const p of prep(s).outline) expect(onLand(islands, p.x, p.z), `${s.name} ${p.x},${p.z}`).toBe(false);
    }
  });

  it('keeps every hole inside its landform', () => {
    for (const p of all) {
      for (const h of p.holes) for (const q of h) expect(inPolygon(p.outline, q.x, q.z), `${p.spec.name} hole ${q.x},${q.z}`).toBe(true);
    }
  });

  it('stands every detail on grass, except piers and docks', () => {
    for (const p of all) {
      for (const d of p.details) {
        if (d.kind === 'box' && d.water) continue;
        const corners =
          d.kind === 'tower'
            ? [{ x: d.x + d.r, z: d.z }, { x: d.x - d.r, z: d.z }, { x: d.x, z: d.z + d.r }, { x: d.x, z: d.z - d.r }]
            : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
                const lx = (sx! * d.w) / 2;
                const lz = (sz! * d.d) / 2;
                return { x: d.x + lx * Math.cos(d.yaw) + lz * Math.sin(d.yaw), z: d.z - lx * Math.sin(d.yaw) + lz * Math.cos(d.yaw) };
              });
        for (const c of corners) expect(onGrass(p, c.x, c.z), `${p.spec.name} ${d.kind} at ${d.x},${d.z}`).toBe(true);
        expect(onDetail(d, d.x, d.z)).toBe(true);
      }
    }
  });

  it('has the airport, two lighthouses, a pier, a ferry dock and 25 cottages', () => {
    const d = all.flatMap((p) => p.details);
    expect(d.filter((x) => x.kind === 'tower')).toHaveLength(2);
    expect(d.filter((x) => x.kind === 'box' && x.water)).toHaveLength(2);
    expect(ISLANDS.details.filter((x) => x.kind === 'box' && x.w === 10 && x.d === 8)).toHaveLength(25);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npx vitest run src/cities/toronto/waterfront.test.ts`. Expected: FAIL, `./waterfront` doesn't resolve.

- [ ] **Step 4: Implement** `src/cities/toronto/waterfront.ts`:

```ts
import { CONFIG } from '../../config';
import type { LandformDetail, LandformSpec, OutlinePt, Pt } from '../types';
import { ellipse, ribbon } from '../../world/landforms';

/**
 * Toronto's waterfront scenery, traced from the real geography (game metres, about 5.4 m per pixel of the owner's
 * reference map, scaled by the game's Rogers Centre and Scotiabank Arena). It is drawn over the lake and plays no
 * part in gameplay.
 */
const P = CONFIG.palette;
const COTTAGES = [P.cottage1, P.cottage2, P.cottage3, P.cottage4] as const;

/** A flat strip from a to b, `width` across (paths, runways, markings). */
function strip(a: Pt, b: Pt, width: number, h: number, color: number, y = 0): LandformDetail {
  return { kind: 'box', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: width, d: Math.hypot(b.x - a.x, b.z - a.z), h, yaw: Math.atan2(b.x - a.x, b.z - a.z), color, y };
}

/** The airport runway's ends: 1,050 m along the island's long axis, turned 14° from east. */
const RUNWAY_A = { x: -1850 - 509, z: 2580 - 127 };
const RUNWAY_B = { x: -1850 + 509, z: 2580 + 127 };

/** Ten white centre-line dashes along the runway. */
const RUNWAY_DASHES: LandformDetail[] = Array.from({ length: 10 }, (_, k) => {
  const t0 = (k + 0.25) / 10;
  const t1 = (k + 0.6) / 10;
  const at = (t: number) => ({ x: RUNWAY_A.x + (RUNWAY_B.x - RUNWAY_A.x) * t, z: RUNWAY_A.z + (RUNWAY_B.z - RUNWAY_A.z) * t });
  return strip(at(t0), at(t1), 3, 0.4, P.landMarking);
});

/** 25 cottages in two rows along Ward's and Algonquin's east arm. */
const COTTAGE_DETAILS: LandformDetail[] = (() => {
  const a = { x: 650, z: 4280 };
  const b = { x: 1350, z: 3990 };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / len;
  const uz = (b.z - a.z) / len;
  const yaw = Math.atan2(ux, uz);
  return Array.from({ length: 25 }, (_, k) => {
    const row = k < 13 ? -1 : 1;
    const i = k < 13 ? k : k - 13;
    const t = (i + 0.5) / (row < 0 ? 13 : 12);
    const off = 70 * row;
    return { kind: 'box', x: a.x + ux * len * t - uz * off, z: a.z + uz * len * t + ux * off, w: 10, d: 8, h: 7, yaw, color: COTTAGES[k % COTTAGES.length]! } as LandformDetail;
  });
})();

/** The Toronto Islands crescent, from the airport's northwest corner clockwise. Beaches: 60 m on Hanlan's lake shore, 50 m on Centre's south shore. */
const ISLAND_OUTLINE: OutlinePt[] = [
  { x: -2483, z: 2360 }, { x: -1457, z: 2360 }, { x: -1106, z: 2520 }, { x: -1187, z: 2844 }, { x: -1133, z: 3168 },
  { x: -485, z: 3762 }, { x: 55, z: 4194 }, { x: 703, z: 3978 }, { x: 1297, z: 3708 }, { x: 1459, z: 3654 },
  { x: 1648, z: 3978 }, { x: 1621, z: 4194 },
  { x: 1135, z: 4437, beach: 50 }, { x: 379, z: 4653, beach: 50 }, { x: -701, z: 4815, beach: 50 }, { x: -1673, z: 4788, beach: 50 },
  { x: -2105, z: 4572, beach: 60 }, { x: -2375, z: 3708, beach: 60 }, { x: -2618, z: 2898, beach: 60 },
];

export const ISLANDS: LandformSpec = {
  name: 'Toronto Islands',
  outline: ISLAND_OUTLINE,
  holes: [
    ellipse(-215, 3720, 420, 190, 30),
    ribbon([{ x: -1950, z: 3200 }, { x: -1800, z: 3500 }, { x: -1800, z: 3900 }, { x: -1650, z: 4300 }], 80),
    ribbon([{ x: -1500, z: 3500 }, { x: -1300, z: 3700 }, { x: -1000, z: 3900 }, { x: -800, z: 4150 }], 70),
  ],
  beach: 40,
  treeEvery: 1500,
  details: [
    // Billy Bishop airport: the apron, the runway and its dashes, the terminal.
    { kind: 'box', x: -1900, z: 2760, w: 500, d: 260, h: 0.2, yaw: 0, color: P.landPath },
    strip(RUNWAY_A, RUNWAY_B, 70, 0.3, P.landRunway),
    ...RUNWAY_DASHES,
    { kind: 'box', x: -1950, z: 2700, w: 120, d: 60, h: 18, yaw: 0, color: P.landTerminal, y: 0.2 },
    // Gibraltar Point lighthouse, near the southwest corner.
    { kind: 'tower', x: -1950, z: 4560, r: 5, h: 25, color: P.lighthouseWhite, cap: P.lighthouseWhite },
    // Centre Island's pier, running south from the beach into the lake.
    { kind: 'box', x: -700, z: 4880, w: 12, d: 160, h: 2, yaw: 0, color: P.landPath, water: true },
    // The ferry dock on the harbour side near Ward's tip.
    { kind: 'box', x: 1380, z: 3640, w: 60, d: 15, h: 2, yaw: 0, color: P.landPath, water: true },
    ...COTTAGE_DETAILS,
  ],
};

const LESLIE_SHORE = { x: 4699, z: 2150 };
const CAUSEWAY_KNEE = { x: 4699, z: 3168 };
const CAUSEWAY_END = { x: 3727, z: 4788 };

/** The spit's causeway: down Leslie St from the shore, then diagonally southwest to the lobes, a pale path along it. */
export const SPIT_CAUSEWAY: LandformSpec = {
  name: 'Tommy Thompson Park causeway',
  outline: ribbon([LESLIE_SHORE, CAUSEWAY_KNEE, CAUSEWAY_END], 110),
  sharp: true,
  holes: [],
  beach: 20,
  treeEvery: 6000,
  details: [strip({ x: 4699, z: 2250 }, CAUSEWAY_KNEE, 12, 0.3, P.landPath), strip(CAUSEWAY_KNEE, { x: 3760, z: 4730 }, 12, 0.3, P.landPath)],
};

/** The spit's lobes, wrapping the Outer Harbour, with their two lagoons and the lighthouse at the southern tip. */
export const SPIT_LOBES: LandformSpec = {
  name: 'Tommy Thompson Park lobes',
  outline: [
    CAUSEWAY_END, { x: 3600, z: 5200 }, { x: 3300, z: 5700 }, { x: 2809, z: 6408 }, { x: 2323, z: 5868 }, { x: 1675, z: 6030 },
    { x: 1243, z: 6084 }, { x: 1135, z: 5868 }, { x: 1513, z: 5328 }, { x: 2107, z: 4788 }, { x: 2485, z: 4680 }, { x: 3025, z: 4788 },
  ],
  holes: [ellipse(2647, 5220, 330, 190, 0), ellipse(2000, 5700, 260, 150, 0)],
  beach: 20,
  treeEvery: 1500,
  details: [{ kind: 'tower', x: 2809, z: 6250, r: 4, h: 18, color: P.lighthouseWhite, cap: P.lighthouseRed }],
};

/** The arm back north toward the Outer Harbour marina, leaving the harbour mouth. */
export const SPIT_ARM: LandformSpec = {
  name: 'Tommy Thompson Park arm',
  outline: ribbon([{ x: 3025, z: 4788 }, { x: 3295, z: 4572 }, { x: 3420, z: 4260 }], 50),
  sharp: true,
  holes: [],
  beach: 10,
  treeEvery: 6000,
  details: [],
};

export const TORONTO_LANDFORMS: readonly LandformSpec[] = [ISLANDS, SPIT_CAUSEWAY, SPIT_LOBES, SPIT_ARM];
```

  In `src/cities/toronto/index.ts`, import `TORONTO_LANDFORMS` from `./waterfront` and add `landforms: TORONTO_LANDFORMS,` after the `bay: TORONTO_LAKE,` line.

- [ ] **Step 5: Run the tests.** Run: `npx vitest run src/cities/toronto/waterfront.test.ts`. Expected: PASS (7 tests).
  - If "stands every detail on grass" fails for a cottage or the runway, move that detail inward by up to 60 m, keeping the spec's intent, and log a ruling.
  - If it fails for a lighthouse, move it 30 m inward along the line to the landform's centre.

- [ ] **Step 6: Commit.**

```bash
git add src/config.ts src/cities/toronto/waterfront.ts src/cities/toronto/waterfront.test.ts src/cities/toronto/index.ts
git commit -m "Add Toronto's island and spit landforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Draw the landforms, and wire them into City

**Files:**
- Create: `src/world/Landforms.ts`
- Test: `src/world/Landforms.test.ts`
- Modify: `src/world/City.ts` (construct `Landforms` after the tree mesh is made; build in the constructor after `this.buildOverlays();`, and in `reset()` after `this.buildOverlays();`)
- Modify: `src/world/City.test.ts` (a Toronto/Tokyo landform test)

**Interfaces:**
- Consumes: `prepareLandform`, `scatterTrees` (Task 2); `TORONTO_LANDFORMS` through `style.landforms` (Task 3); the city's tree cone geometry and `treeMat`.
- Produces: `class Landforms { constructor(scene, treeGeo, treeMat); build(specs: readonly LandformSpec[]): void; clear(): void; meshes(): readonly THREE.Object3D[] }`. Mesh names: `landform-sand`, `landform-grass`, `landform-trees`, `landform-details`.

- [ ] **Step 1: Write the failing test** `src/world/Landforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Landforms, MAX_LANDFORM_TREES, LANDFORM_Y } from './Landforms';
import { TORONTO_LANDFORMS } from '../cities/toronto/waterfront';

const make = () => {
  const scene = new THREE.Scene();
  const lf = new Landforms(scene, new THREE.ConeGeometry(0.5, 1.6, 5), new THREE.MeshBasicMaterial());
  return { scene, lf };
};
const names = (lf: Landforms) => lf.meshes().map((m) => m.name).sort();

describe('Landforms', () => {
  it('draws all landforms as one sand and one grass mesh, plus trees and details', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    expect(names(lf)).toEqual(['landform-details', 'landform-grass', 'landform-sand', 'landform-trees']);
    const trees = lf.meshes().find((m) => m.name === 'landform-trees') as THREE.InstancedMesh;
    expect(trees.count).toBeGreaterThan(200);
    expect(trees.count).toBeLessThanOrEqual(MAX_LANDFORM_TREES);
  });

  it('builds nothing for a city without landforms, and rebuilding leaves exactly one set', () => {
    const { scene, lf } = make();
    lf.build([]);
    expect(lf.meshes()).toEqual([]);
    const before = scene.children.length;
    lf.build(TORONTO_LANDFORMS);
    lf.build(TORONTO_LANDFORMS);
    expect(lf.meshes()).toHaveLength(4);
    lf.build([]);
    expect(lf.meshes()).toEqual([]);
    expect(scene.children.length).toBe(before);
  });

  it('lays the land flat just above the water, grass over sand', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    const ys = (name: string) => {
      const m = lf.meshes().find((o) => o.name === name) as THREE.Mesh;
      const b = new THREE.Box3().setFromObject(m);
      return [b.min.y, b.max.y];
    };
    const [s0, s1] = ys('landform-sand');
    const [g0, g1] = ys('landform-grass');
    expect(s0).toBeCloseTo(LANDFORM_Y.sand, 3);
    expect(s1).toBeCloseTo(LANDFORM_Y.sand, 3);
    expect(g0).toBeGreaterThan(s1);
    expect(g1).toBeCloseTo(LANDFORM_Y.grass, 3);
    expect(LANDFORM_Y.sand).toBeGreaterThan(0.1);
  });

  it('cuts the lagoons out of the land', () => {
    const { lf } = make();
    lf.build(TORONTO_LANDFORMS);
    const grass = lf.meshes().find((o) => o.name === 'landform-grass') as THREE.Mesh;
    const ray = new THREE.Raycaster(new THREE.Vector3(-215, 100, 3720), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(grass)).toHaveLength(0);
    ray.set(new THREE.Vector3(-900, 100, 4500), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(grass).length).toBeGreaterThan(0);
  });
});
```

  Append to `src/world/City.test.ts` (it already has `make` and `TORONTO`):

```ts
describe('City landforms', () => {
  const landforms = (scene: THREE.Scene) => scene.children.filter((c) => c.name.startsWith('landform-')).map((c) => c.name).sort();

  it('draws Toronto\'s landforms and none for Tokyo, one set however often it resets or switches', () => {
    const { scene, city } = make(TORONTO);
    expect(landforms(scene)).toEqual(['landform-details', 'landform-grass', 'landform-sand', 'landform-trees']);
    city.reset(TOKYO);
    expect(landforms(scene)).toEqual([]);
    city.reset(TORONTO);
    city.reset(TORONTO);
    expect(landforms(scene)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.** Run: `npx vitest run src/world/Landforms.test.ts src/world/City.test.ts -t "Landforms|City landforms"`. Expected: FAIL, `./Landforms` doesn't resolve.

- [ ] **Step 3: Implement** `src/world/Landforms.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { LandformDetail, LandformSpec, Pt } from '../cities/types';
import { faceted, painted, toonMat } from '../render/toon';
import { prepareLandform, scatterTrees } from './landforms';

/** At most this many landform trees, shared across every landform in order. */
export const MAX_LANDFORM_TREES = 1200;
/** Heights of the land layers above the ground plane (the water lies at 0.1): sand, then grass over it. */
export const LANDFORM_Y = { sand: 0.6, grass: 0.7 } as const;
/** Tree seeds per landform: CONFIG.world.seed + this + its index. */
const SEED = 911;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Pulls a flat layer toward the camera by `offset` (as the city's ground layers do), so stacked layers never flicker. */
function layered<T extends THREE.Material>(mat: T, offset: number): T {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -offset * 0.25;
  mat.polygonOffsetUnits = -offset;
  return mat;
}

/** A flat shape from ground outlines at height y: the outline with its holes cut out, facing up. */
function flat(outline: readonly Pt[], holes: readonly (readonly Pt[])[], y: number): THREE.BufferGeometry {
  // Shape (x, y) → ground (x, z): shape y is −z, then rotating −90° about X lays it flat with its face up.
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.z))));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** A detail's solid, vertex-coloured, standing on the grass. */
function detailGeometry(d: LandformDetail): THREE.BufferGeometry {
  if (d.kind === 'tower') {
    const body = painted(faceted(new THREE.CylinderGeometry(d.r * 0.7, d.r, d.h, 8).translate(0, d.h / 2, 0)), d.color);
    const cap = painted(faceted(new THREE.CylinderGeometry(d.r * 0.9, d.r * 0.9, d.r * 1.4, 8).translate(0, d.h + d.r * 0.7, 0)), d.cap);
    const roof = painted(faceted(new THREE.ConeGeometry(d.r, d.r * 1.2, 8).translate(0, d.h + d.r * 2, 0)), d.cap);
    return mergeGeometries([body, cap, roof])!.translate(d.x, LANDFORM_Y.grass, d.z);
  }
  const g = new THREE.BoxGeometry(d.w, d.h, d.d).translate(0, d.h / 2 + (d.y ?? 0), 0).rotateY(d.yaw);
  return painted(faceted(g), d.color).translate(d.x, LANDFORM_Y.grass, d.z);
}

/**
 * Scenery landforms over the water: every landform's sand in one mesh and grass in another (so overlapping landforms
 * never flicker against each other), lagoons cut through both, their trees in one instanced mesh (the city's tree
 * shape and material), and their details in one merged mesh. Rebuilt per city; nothing in gameplay reads it.
 */
export class Landforms {
  private built: THREE.Object3D[] = [];
  private sandMat = layered(toonMat(CONFIG.palette.landSand), 2);
  private grassMat = layered(toonMat(CONFIG.palette.landGrass), 3);
  private detailMat = toonMat(0xffffff, { vertexColors: true });

  constructor(
    private scene: THREE.Scene,
    private treeGeo: THREE.BufferGeometry,
    private treeMat: THREE.Material,
  ) {}

  meshes(): readonly THREE.Object3D[] {
    return this.built;
  }

  build(specs: readonly LandformSpec[]): void {
    this.clear();
    if (specs.length === 0) return;
    const prepared = specs.map(prepareLandform);
    const sand = new THREE.Mesh(mergeGeometries(prepared.map((p) => flat(p.outline, p.holes, LANDFORM_Y.sand)))!, this.sandMat);
    const grass = new THREE.Mesh(mergeGeometries(prepared.map((p) => flat(p.grass, p.holes, LANDFORM_Y.grass)))!, this.grassMat);
    sand.name = 'landform-sand';
    grass.name = 'landform-grass';
    sand.receiveShadow = grass.receiveShadow = true;
    let left = MAX_LANDFORM_TREES;
    const trees = prepared.flatMap((p, i) => {
      const t = scatterTrees(p, CONFIG.world.seed + SEED + i, left);
      left -= t.length;
      return t;
    });
    const treeMesh = new THREE.InstancedMesh(this.treeGeo, this.treeMat, Math.max(1, trees.length));
    treeMesh.name = 'landform-trees';
    trees.forEach((t, i) => treeMesh.setMatrixAt(i, _m.compose(_p.set(t.x, LANDFORM_Y.grass, t.z), _q.identity(), _s.setScalar(t.s))));
    treeMesh.count = trees.length;
    const details = prepared.flatMap((p) => p.details.map(detailGeometry));
    const detailMesh = new THREE.Mesh(details.length ? mergeGeometries(details)! : new THREE.BufferGeometry(), this.detailMat);
    detailMesh.name = 'landform-details';
    detailMesh.castShadow = detailMesh.receiveShadow = true;
    this.built = [sand, grass, treeMesh, detailMesh];
    this.scene.add(...this.built);
  }

  /** Removes the landforms and frees their geometry (the shared tree geometry and materials are kept). */
  clear(): void {
    for (const o of this.built) {
      this.scene.remove(o);
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose();
    }
    this.built = [];
  }
}
```

- [ ] **Step 4: Wire it into City.** In `src/world/City.ts`:
  - Import: `import { Landforms } from './Landforms';`.
  - Field (next to `private treeMesh`): `/** Scenery landforms drawn over the water (Toronto's islands and spit). */ private landforms: Landforms;`.
  - In the constructor, directly after the line that creates `this.treeMesh` (`this.treeMesh = new THREE.InstancedMesh(cone, this.treeMat, world.maxTrees);`), add `this.landforms = new Landforms(scene, cone, this.treeMat);`.
  - In the constructor, after `this.buildOverlays();`, add `this.landforms.build(this._style.landforms ?? []);`.
  - In `reset()`, after its `this.buildOverlays();`, add `this.landforms.build(this._style.landforms ?? []);`.

- [ ] **Step 5: Run the tests, the type-check and the build.** Run: `npx tsc --noEmit -p . && npx vitest run && npm run build`. Expected: no type errors, everything passes, `✓ built`.
  - If "cuts the lagoons out of the land" finds a hit inside Blockhouse Bay, the hole is being treated as solid. Check that hole points are passed as a `THREE.Path` without being reversed.

- [ ] **Step 6: Commit.**

```bash
git add src/world/Landforms.ts src/world/Landforms.test.ts src/world/City.ts src/world/City.test.ts
git commit -m "Draw scenery landforms over the lake: Toronto's islands and Tommy Thompson Park

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser check with the owner

- [ ] **Hand over for playtesting:** `npm run dev` with `?city=toronto`. Things to check:
  - **The islands:** they read as a curved, natural crescent with beaches, lagoons, the airport and cottages.
  - **The spit:** it runs from Leslie St with its lobes round the Outer Harbour.
  - **Rendering:** no flicker where shapes overlap the water or each other.
  - **Performance:** acceptable on a phone.
- [ ] **Tune:** apply requested tuning (outlines, beach widths, tree density, colours). Commit only when the owner says so; never push or deploy unasked.
