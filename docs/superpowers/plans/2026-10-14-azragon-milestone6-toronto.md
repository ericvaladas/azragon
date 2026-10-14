# Milestone 6: Toronto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Toronto, a second city picked at random per run: a warm sunset, brick midtown, a glass downtown, the
CN Tower over the lake and islands, and the Don Valley cutting north–south. Tokyo's look and behaviour stay unchanged.

**Architecture:**
- **Shared code gains only what Toronto needs:**
  - a per-city `atmosphere` (sky, fog, lights, window glow), applied by `City.reset`;
  - a river `axis` and `bankPark`;
  - overlay textures chosen by id;
  - glyph sets for the sign atlas;
  - per-city cranes and water colour;
  - a shared `coastDistance`.
- **Toronto is a sibling of Tokyo** in `src/cities/toronto/`. It holds the layout, style and landmark geometry, the
  Financial District and Yonge-Dundas lots, and the Nathan Phillips Square decal as pure rectangle lists.
- **Dev hook:** a `?city=` URL parameter (dev builds only) forces the city run by run for screenshots and the soak.

**Tech Stack:** Three.js 0.170, TypeScript strict (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals`), Vitest (environment `node`, no DOM: canvas textures and `IntroCinematic` are not unit-testable, so
tests target pure functions and `City` with stub textures), Vite, Playwright (visual checks only).

**Spec:** `docs/superpowers/specs/2026-10-14-azragon-milestone6-toronto-design.md`

## Global Constraints

- **Tokyo unchanged:** Tokyo's look and behaviour must not change. Its existing tests keep passing as they are. The
  only edit to an existing assertion's file is the `r.z0` → `r.c0` rename in one failure message, which the spec's
  rename requires.
- **Orientation:**
  - The pod dives from −Z and crashes at the origin. The play-start camera faces +Z.
  - **Toronto's +Z is geographic south (toward the lake).** +X is east (the player's left); −X is west (the
    player's right).
  - Lattice cells are 200 m; avenues every 1000 m (`AVENUE_EVERY = 5`), streets between.
- **Toronto positions (world metres from the crash):**

  | Place | Position |
  |---|---|
  | Yonge Street | avenue line x = 0 |
  | Yonge-Dundas Square | neon block centred at (−100, 900) |
  | City Hall and Nathan Phillips Square | (−500, 1100) (see Ruling R2) |
  | Financial District | high-rise centred at (−300, 1500), about 350 m across |
  | CN Tower | (−700, 1900) |
  | Rogers Centre | (−1100, 1900) (see Ruling R1) |
  | Lakeshore | about z = 2200; port (no container cranes) from x = 0 to x = 1400 |
  | Toronto Islands | offshore, centred at (−300, 2900) |
  | Don Valley | centred near x = 1500 |

- **Toronto atmosphere (starting values, tuned in Task 8):**
  - **Sky:** zenith `0x4b4a8c`, horizon `0xf2a46b`.
  - **Fog:** `0xe9a985`; near and far as Tokyo's.
  - **Ambient:** sky `0xffc59a` over ground `0x4a3550`, intensity 0.8 (Tokyo 1.1).
  - **Sun:** `0xffa25a`, intensity 2.0, direction (−0.9, 0.3, 0.2) normalised.
  - **Window glow:** warm yellow. It is an emissive tint on existing facade window texels only, with no new material
    and no extra draw call.
- **Tokyo atmosphere:** exactly today's values: `CONFIG.palette` `skyZenith`, `skyHorizon`, `fog`, `hemiSky`,
  `hemiGround` and `sun`; hemisphere intensity 1.1, sun intensity 2.2, sun direction (0.45, 0.8, 0.35);
  `CONFIG.fog`; no window glow.
- **Intro:** the space sun takes the run city's sun colour, and the dive uses the run city's fog.
- **Don:** `x = 1500 + 150·sin(z / 1100)`, half-width 130 m, infinite, meeting the lake.
  - **Bridges:** only on avenues crossing it (z a multiple of 1000).
  - **Banks:** blocks within one block of the water are park (`bankPark: 1`).
- **Road removal (Toronto):** residential 15%, office 15%, high-rise 10%, parks 40%.
- **District heights (Toronto):**
  - **High-rise:** 200–300 m.
  - **Neon:** 40–90 m.
  - **Office:** 40–100 m.
  - **Residential:** 10–22 m, with 6 street trees per block.
  - **Port:** 80–160 m condos, no `yard`.
  - **Billboards:** chance 0.02 or less outside the hand-placed Yonge-Dundas lots.
- **Landmarks:** each is destructible (HP by height, EXP by HP), fits inside one block, is not on water, is not in the
  crater, and survives the crash blast.
  - **CN Tower:** 720 m.
  - **Rogers Centre:** about 70 m tall; diameter per Ruling R1.
  - **City Hall:** towers 130 m and 105 m.
- **Financial District:**
  - 8–10 dark glass towers, 200–300 m tall.
  - **Royal Bank Plaza:** two stepped gold towers.
  - **First Canadian Place:** the tallest, a white slab.
  - All are `keep` `specialLots`.
- **Glyphs:** `CityStyle.glyphs`: Tokyo `'kanji'` (unchanged atlas), Toronto `'latin'`.
- **Cranes:** `CityStyle.cranes?: { colors } | false`. Tokyo unset (today's colours); Toronto `false`.
- **`CITIES = [TOKYO, TORONTO]`.** `pickCity` is unchanged.
- **Performance:** the soak with Toronto's long shadows. Acceptance:
  - no growth across cycles;
  - CPU frame time within **25%** of the Tokyo baseline.
- **Repo rules:**
  - No `useEffect`; game logic stays in classes.
  - Never start a dev server: one is already running at `http://localhost:5173`, and its dev handle is
    `window.__game`.
  - Local git only, on branch `milestone6-toronto`. Never push or deploy.
  - Each commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings (spec ambiguities and conflicts settled by this plan)

- **R1 (Rogers Centre size):** the spec's 220 m diameter cannot fit one block. The buildable interior is 164 m between
  streets, and 146 m at (−1100, 1900) because x = −1000 and z = 2000 are avenues.
  - The drum is **144 m across, 70 m tall**, centred on that block's interior at **(−1110, 1890)**.
- **R2 (City Hall and Nathan Phillips Square):** both are in the block (−600..−400, 1000..1200).
  - City Hall's footprint is 130 × 90 m at **(−500, 1135)**.
  - The square's decal is centred at **(−500, 1106)**, 140 m.
  - Its paving, pool and TORONTO strip lie on the block's north side (z 1036–1090), facing the start camera. The
    square is in front of City Hall *from the player's view*, rather than geographically south of it, so it is visible.
- **R3 (Yonge-Dundas):**
  - **Billboards:** generated billboards are limited to one per chunk in the chunk's central 400 m, and (−100, 900)
    lies outside its chunk's centre. So "dense billboards and video screens" come from four hand-placed `keep` lots
    (screens, roof billboards, blades) in `src/cities/toronto/yongeDundas.ts`. This file is not in the spec's list.
  - **Neon rules:** the block's district is neon, with `billboard: 0.02`.
- **R4 (Financial District extent):**
  - **High-rise district:** the blocks whose centre is within 250 m of (−300, 1500): the centre block and its four
    neighbours.
  - **Hand-placed lots:** First Canadian Place, Royal Bank Plaza and one dark tower in the centre block; two dark
    towers in each neighbour. That makes 9 dark towers.
  - **Royal Bank Plaza:** each tower is three staggered boxes (the "saw-tooth" edge), since special lots are boxes.
- **R5 (Lakeshore):**
  - **Port:** the coastal band (0–400 m from the coastline) inside the core is port only for x in [0, 1400], and is
    office elsewhere in the downtown core. Beyond the core radius (4000 m) the whole coastal band is port (condos).
  - **Bank parks** override port at the Don's mouth.
- **R6 (Lake shape):** `bay: { dir: (0, 1), offset: 2250, amp: 60, wavelength: 1500 }`. So the coastline is z ≈
  2190–2310, and land cells end at z = 2200 almost everywhere.
- **R7 (Islands):** `island: { center: (−300, 2900), halfAlong: 250, halfAcross: 900 }`. That is 27 cells, all park
  with trees and no roads. A water row (z 2400–2600) separates them from the mainland.
- **R8 (Neon and port removal):** the spec gives no removal fractions for these. Neon gets 0.10, like the high-rise
  core, and port gets 0.15.
- **R9 (Bank park rule):**
  - **Which blocks:** "within one block of the water" means a land cell whose 8-neighbourhood (Chebyshev distance 1)
    holds a river cell outside the bay.
  - **Where it applies:** in chunk generation, through `blockDistrict`. `segmentAt`'s removal lookup keeps
    `style.districtAt`, so the road lattice is unchanged.
- **R10 (Water colour):** the spec's palette asks for "a slightly greener lake blue", so `CityStyle.colors` gains
  `water` (Tokyo `0x3f8fc9`, today's constant). This field is not in the spec's list of shared changes.
- **R11 (Residential lots):** `lots: 4` (16 per block, "many lots"). The existing per-chunk building cap
  (`BUILDINGS_PER_CHUNK`) still thins dense chunks, as it does for Tokyo.
- **R12 (Window texels):** a facade texel counts as a window when its linear `b − r ≥ 0.145`. Of the atlas inks, only
  the bluish window colours `#7f93ab`, `#8a9aae` and `#8796aa` pass. Glass curtain panes do not glow, but office bands,
  balconies and shop windows do.
- **R13 (Shared shapes):** Toronto's builders use a new `src/cities/shapes.ts` (`box`, `ring`, `merge`). Tokyo's
  private copies in `towers.ts`, `tmg.ts` and `rainbowBridge.ts` are left untouched.

## Review Focus

1. **Switching cities between runs leaves stale state.** Tokyo → Toronto → Tokyo must restore sky, fog colour and
   distances, lights, sun direction, window glow, sign glyphs, crane paint and water colour exactly. Tested in Task 1
   (atmosphere) and Task 3 (glyphs, cranes, water); both are re-run with the real Toronto in Task 7.
2. **The intro after a switch.** The dive must use the run city's fog distances and restore them after the impact, and
   `introFog`'s base must be the city's, not `CONFIG.fog`. Tested in Task 1 (`introFog` with a base).
3. **Routing and nearest-road across a north–south river.** Ground units must cross the Don only on bridges, and
   `nearestRoadPoint` must never return a water point off a bridge line. The old tests hard-code bridge lines at
   x = k·1000, so this needs axis-aware checks. Tested in Task 2 and generically in Task 7.
4. **Pool exhaustion with an infinite lake and islands.** Water quads, sea walls, park and quay pads, roads and nodes
   must fit their pools for a full load on the Lakeshore, at the Don mouth and beside the islands. Tested in Task 7.
5. **Bad `?city=` values.** Unknown ids, empty values, mixed case and stray spaces must fall back to the random pick,
   never crash or index out of range. Tested in Task 7 (`forcedCity`).

---

## File map

**New:**

| File | Responsibility |
|---|---|
| `src/render/atmosphere.ts` | `AtmosphereTargets`, `applyAtmosphere`, `fogDistances`, `windowGlowColor` |
| `src/render/atmosphere.test.ts` | Tokyo-equals-today, apply, Lighting and Sky read the atmosphere |
| `src/cities/coast.ts` (+ `coast.test.ts`) | shared `coastDistance` |
| `src/cities/shapes.ts` | `box`, `ring`, `merge` for vertex-coloured landmark geometry |
| `src/world/latinFont.ts` | 5 × 7 capital letters, sign words, board rectangles (pure) |
| `src/cities/toronto/index.ts` | `TORONTO` style |
| `src/cities/toronto/districts.ts` | `TORONTO_DISTRICTS` |
| `src/cities/toronto/layout.ts` | sites, lake, islands, Don, `districtAt`, `blockInterior`, `lotCentre` |
| `src/cities/toronto/cnTower.ts`, `rogersCentre.ts`, `cityHall.ts` | landmark geometry |
| `src/cities/toronto/financial.ts` | Financial District lots |
| `src/cities/toronto/yongeDundas.ts` | Yonge-Dundas lots (Ruling R3) |
| `src/cities/toronto/square.ts` | Nathan Phillips Square overlay and its paint rectangles |
| `src/cities/toronto/layout.test.ts`, `toronto.test.ts` | Toronto tests |
| `src/world/bothCities.test.ts` | key road, chunk, shore and splash tests over `CITIES` |

**Changed:**
- `src/cities/types.ts`, `src/cities/index.ts` (+ test), `src/cities/tokyo/index.ts`, `src/cities/tokyo/layout.ts`.
- `src/world/roads.ts`, `src/world/chunks.ts`, `src/world/City.ts`, `src/world/pixelTextures.ts`,
  `src/world/crane.ts`.
- `src/render/Sky.ts`, `src/render/Lighting.ts`.
- `src/intro/timeline.ts`, `src/intro/IntroCinematic.ts`, `src/intro/SpaceScene.ts`.
- `src/GameScene.ts`.
- Tests extended: `roads.test.ts`, `shore.test.ts`, `splash.test.ts`, `chunks.test.ts`, `City.test.ts`,
  `pixelTextures.test.ts`, `timeline.test.ts`, `src/cities/index.test.ts`.

Commands used throughout:
- Single test file: `npx vitest run <file>`.
- Full suite: `npx vitest run`.
- Types: `npx tsc --noEmit -p .`. Its expected output is no output and exit code 0.

---
### Task 1: Atmosphere per city

**Files:**
- Modify: `src/cities/types.ts` (add `Atmosphere`, `CityStyle.atmosphere`), `src/cities/tokyo/index.ts`
- Create: `src/render/atmosphere.ts`, `src/render/atmosphere.test.ts`
- Modify: `src/render/Sky.ts`, `src/render/Lighting.ts`, `src/world/pixelTextures.ts` (`patchFacadeShader` glow,
  `WINDOW_CHROMA`, `isWindowTexel`), `src/world/City.ts` (window glow uniform, `attachAtmosphere`, apply on `reset`),
  `src/intro/timeline.ts` (`introFog` base), `src/intro/IntroCinematic.ts`, `src/intro/SpaceScene.ts` (`setSun`),
  `src/GameScene.ts`
- Test: `src/render/atmosphere.test.ts`, `src/world/pixelTextures.test.ts`, `src/world/City.test.ts`,
  `src/intro/timeline.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // src/cities/types.ts
  export type Atmosphere = {
    skyZenith: number; skyHorizon: number; fog: number; fogNear?: number; fogFar?: number;
    hemiSky: number; hemiGround: number; hemiIntensity: number;
    sun: number; sunIntensity: number; sunDir: { x: number; y: number; z: number };
    windowGlow: { color: number; strength: number };
  };
  // CityStyle gains: atmosphere: Atmosphere;
  // src/render/atmosphere.ts
  export type AtmosphereTargets = { fog: THREE.Fog; sky: { zenith: THREE.Color; horizon: THREE.Color }; hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; sunDir: THREE.Vector3; windowGlow: THREE.Color };
  export function fogDistances(a: Atmosphere): { near: number; far: number };
  export function windowGlowColor(a: Atmosphere, out: THREE.Color): THREE.Color;
  export function applyAtmosphere(a: Atmosphere, t: AtmosphereTargets): void;
  // src/render/Sky.ts
  export function createSky(scene: THREE.Scene, a: Atmosphere): THREE.Mesh;
  export function skyColors(sky: THREE.Mesh): { zenith: THREE.Color; horizon: THREE.Color };
  // src/render/Lighting.ts
  class Lighting { constructor(scene: THREE.Scene, a: Atmosphere); readonly hemi; readonly sun; readonly sunDir: THREE.Vector3; ... }
  // src/world/pixelTextures.ts
  export const WINDOW_CHROMA = 0.145;
  export function isWindowTexel(hex: number): boolean;
  export function patchFacadeShader(sh, glow?: { value: THREE.Color }): void;
  // src/world/City.ts
  readonly windowGlow: THREE.Color;
  attachAtmosphere(t: Omit<AtmosphereTargets, 'windowGlow'>): void;
  // src/intro/timeline.ts
  export function introFog(camY: number, out: { near: number; far: number }, base?: { near: number; far: number }): { near: number; far: number };
  // src/intro/SpaceScene.ts
  setSun(color: number): void;
  ```

- [ ] **Step 1: Write the failing atmosphere tests**

Create `src/render/atmosphere.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import type { Atmosphere } from '../cities/types';
import { applyAtmosphere, fogDistances, windowGlowColor, type AtmosphereTargets } from './atmosphere';
import { Lighting } from './Lighting';
import { createSky, skyColors } from './Sky';

const DUSK: Atmosphere = {
  skyZenith: 0x4b4a8c, skyHorizon: 0xf2a46b, fog: 0xe9a985, fogNear: 1800, fogFar: 4200,
  hemiSky: 0xffc59a, hemiGround: 0x4a3550, hemiIntensity: 0.8,
  sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 },
  windowGlow: { color: 0xffc46b, strength: 0.5 },
};
const targets = (): AtmosphereTargets => ({
  fog: new THREE.Fog(0x000000, 1, 2),
  sky: { zenith: new THREE.Color(), horizon: new THREE.Color() },
  hemi: new THREE.HemisphereLight(),
  sun: new THREE.DirectionalLight(),
  sunDir: new THREE.Vector3(),
  windowGlow: new THREE.Color(),
});

describe('atmosphere', () => {
  it("TOKYO.atmosphere is exactly today's CONFIG palette, fog and light values, with no window glow", () => {
    const P = CONFIG.palette;
    expect(TOKYO.atmosphere).toEqual({
      skyZenith: P.skyZenith, skyHorizon: P.skyHorizon, fog: P.fog,
      hemiSky: P.hemiSky, hemiGround: P.hemiGround, hemiIntensity: 1.1,
      sun: P.sun, sunIntensity: 2.2, sunDir: { x: 0.45, y: 0.8, z: 0.35 },
      windowGlow: { color: 0xffd27a, strength: 0 },
    });
    expect(fogDistances(TOKYO.atmosphere)).toEqual(CONFIG.fog);
    expect(windowGlowColor(TOKYO.atmosphere, new THREE.Color(1, 1, 1)).getHex()).toBe(0);
  });

  it('applies every sky, fog, light and glow value, the sun direction normalised', () => {
    const t = targets();
    applyAtmosphere(DUSK, t);
    expect(t.sky.zenith.getHex()).toBe(0x4b4a8c);
    expect(t.sky.horizon.getHex()).toBe(0xf2a46b);
    expect(t.fog.color.getHex()).toBe(0xe9a985);
    expect([t.fog.near, t.fog.far]).toEqual([1800, 4200]);
    expect(t.hemi.color.getHex()).toBe(0xffc59a);
    expect(t.hemi.groundColor.getHex()).toBe(0x4a3550);
    expect(t.hemi.intensity).toBe(0.8);
    expect(t.sun.color.getHex()).toBe(0xffa25a);
    expect(t.sun.intensity).toBe(2);
    expect(t.sunDir.length()).toBeCloseTo(1);
    expect(t.sunDir.x).toBeLessThan(0);
    expect(t.sunDir.distanceTo(new THREE.Vector3(-0.9, 0.3, 0.2).normalize())).toBeLessThan(1e-9);
    expect(t.windowGlow.getHex()).toBe(new THREE.Color(0xffc46b).multiplyScalar(0.5).getHex());
  });

  it("applied to Tokyo, gives exactly what the scene was built with before (Tokyo's rendering is unchanged)", () => {
    const P = CONFIG.palette;
    const t = targets();
    applyAtmosphere(DUSK, t);
    applyAtmosphere(TOKYO.atmosphere, t);
    const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 1.1);
    const sun = new THREE.DirectionalLight(P.sun, 2.2);
    expect(t.hemi.color.equals(hemi.color)).toBe(true);
    expect(t.hemi.groundColor.equals(hemi.groundColor)).toBe(true);
    expect(t.hemi.intensity).toBe(1.1);
    expect(t.sun.color.equals(sun.color)).toBe(true);
    expect(t.sun.intensity).toBe(2.2);
    expect(t.sunDir.toArray()).toEqual(new THREE.Vector3(0.45, 0.8, 0.35).normalize().toArray());
    expect(t.fog.color.equals(new THREE.Color(P.fog))).toBe(true);
    expect([t.fog.near, t.fog.far]).toEqual([CONFIG.fog.near, CONFIG.fog.far]);
    expect(t.sky.zenith.equals(new THREE.Color(P.skyZenith))).toBe(true);
    expect(t.sky.horizon.equals(new THREE.Color(P.skyHorizon))).toBe(true);
    expect(t.windowGlow.getHex()).toBe(0);
  });

  it('Lighting and the sky dome are built from the atmosphere they are given', () => {
    const scene = new THREE.Scene();
    const lighting = new Lighting(scene, DUSK);
    expect(lighting.hemi.intensity).toBe(0.8);
    expect(lighting.sun.color.getHex()).toBe(0xffa25a);
    lighting.follow(new THREE.Vector3(100, 0, 200));
    const dir = lighting.sun.position.clone().sub(new THREE.Vector3(100, 0, 200)).normalize();
    expect(dir.x).toBeCloseTo(new THREE.Vector3(-0.9, 0.3, 0.2).normalize().x);
    const sky = createSky(scene, DUSK);
    expect(skyColors(sky).zenith.getHex()).toBe(0x4b4a8c);
    expect(skyColors(sky).horizon.getHex()).toBe(0xf2a46b);
    const fog = scene.fog as THREE.Fog;
    expect(fog.color.getHex()).toBe(0xe9a985);
    expect([fog.near, fog.far]).toEqual([1800, 4200]);
  });
});
```

Append to `src/intro/timeline.test.ts`, inside `describe('introFog', ...)`, after its existing `it`:

```ts
  it("starts from the run city's fog distances when given them (the existing call keeps CONFIG.fog)", () => {
    const f = { near: 0, far: 0 };
    introFog(300, f, { near: 1500, far: 3900 });
    expect(f).toEqual({ near: 1500, far: 3900 });
    introFog(5000, f, { near: 1500, far: 3900 });
    expect(f.near).toBeCloseTo(5500);
    expect(f.far).toBeCloseTo(13000);
  });
```

Append to `src/world/pixelTextures.test.ts`. Extend its imports to
`import { FACADE_TILE, WINDOW_CHROMA, isWindowTexel, patchFacadeShader, patchRoadShader, scrambleArms, scrambleStripes } from './pixelTextures';`
and add `import * as THREE from 'three';`. Then add:

```ts
describe('window glow', () => {
  it('adds the lit-window colour to window texels through a shared uniform', () => {
    const glow = { value: new THREE.Color(1, 0.8, 0.4) };
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh, glow);
    expect(sh.uniforms['uWindowGlow']).toBe(glow);
    expect(sh.fragmentShader).toContain('uniform vec3 uWindowGlow;');
    expect(sh.fragmentShader).toContain(`step(${WINDOW_CHROMA.toFixed(3)}, facadeTexel.b - facadeTexel.r)`);
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance += uWindowGlow');
    expect(sh.fragmentShader).toContain('diffuseColor *= facadeTexel;');
  });

  it('without a glow uniform patches exactly as before (no glow code)', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh);
    expect(sh.fragmentShader).not.toContain('uWindowGlow');
  });

  it('counts only the bluish window inks of the facade atlas as windows', () => {
    for (const ink of [0x7f93ab, 0x8a9aae, 0x8796aa]) expect(isWindowTexel(ink), ink.toString(16)).toBe(true);
    for (const ink of [0xc9d4dc, 0xe8eef2, 0x5d6a74, 0xffffff, 0xb8b0a4, 0xd9d3c8, 0xf2efe9, 0xffe9a8, 0xf4f4f4, 0xb4b4b4, 0x5a5a5a]) {
      expect(isWindowTexel(ink), ink.toString(16)).toBe(false);
    }
  });
});
```

Append to `src/world/City.test.ts`. Add `import type { AtmosphereTargets } from '../render/atmosphere';` to its imports, then:

```ts
describe('City atmosphere', () => {
  const DUSK: CityStyle = {
    ...TOKYO,
    id: 'dusk',
    atmosphere: { ...TOKYO.atmosphere, fog: 0xe9a985, skyZenith: 0x4b4a8c, sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 }, windowGlow: { color: 0xffc46b, strength: 0.5 } },
  };
  const targets = (): Omit<AtmosphereTargets, 'windowGlow'> => ({
    fog: new THREE.Fog(0x000000, 1, 2),
    sky: { zenith: new THREE.Color(), horizon: new THREE.Color() },
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    sunDir: new THREE.Vector3(),
  });
  const snap = (city: City, t: Omit<AtmosphereTargets, 'windowGlow'>) => ({
    fog: t.fog.color.getHex(), near: t.fog.near, far: t.fog.far, zenith: t.sky.zenith.getHex(), horizon: t.sky.horizon.getHex(),
    hemi: t.hemi.color.getHex(), ground: t.hemi.groundColor.getHex(), hemiI: t.hemi.intensity,
    sun: t.sun.color.getHex(), sunI: t.sun.intensity, dir: t.sunDir.toArray(), glow: city.windowGlow.getHex(),
  });

  it("starts with no window glow for Tokyo, before anything is attached", () => {
    const { city } = make();
    expect(city.windowGlow.getHex()).toBe(0);
  });

  it("applies the style's atmosphere when attached and on every reset: Tokyo → dusk → Tokyo restores everything", () => {
    const { city } = make();
    const t = targets();
    city.attachAtmosphere(t);
    const tokyo = snap(city, t);
    expect(tokyo.fog).toBe(CONFIG.palette.fog);
    expect([tokyo.near, tokyo.far]).toEqual([CONFIG.fog.near, CONFIG.fog.far]);
    city.reset(DUSK);
    const dusk = snap(city, t);
    expect(dusk.fog).toBe(0xe9a985);
    expect(dusk.zenith).toBe(0x4b4a8c);
    expect(dusk.sun).toBe(0xffa25a);
    expect(dusk.dir[0]).toBeLessThan(0);
    expect(dusk.glow).not.toBe(0);
    city.reset(TOKYO);
    expect(snap(city, t)).toEqual(tokyo);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/atmosphere.test.ts src/intro/timeline.test.ts src/world/pixelTextures.test.ts src/world/City.test.ts`
Expected: FAIL. `atmosphere.test.ts` fails with "Failed to resolve import './atmosphere'". `pixelTextures.test.ts` fails
on `isWindowTexel is not a function`. `City.test.ts` fails on `city.attachAtmosphere is not a function`.
`timeline.test.ts` fails on the new `it` (the third argument is ignored, so `near` is 2200).

- [ ] **Step 3: Add the `Atmosphere` type and Tokyo's values**

In `src/cities/types.ts`, add above `export type CityStyle`:

```ts
/**
 * A city's time of day. Colours are hex (sRGB). `sunDir` points from the ground toward the sun (normalised when
 * applied); fog distances default to CONFIG.fog's. Window glow is added to the facade's window texels as emissive
 * colour × strength (0 = none).
 */
export type Atmosphere = {
  skyZenith: number;
  skyHorizon: number;
  fog: number;
  fogNear?: number;
  fogFar?: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  sunDir: { x: number; y: number; z: number };
  windowGlow: { color: number; strength: number };
};
```

and inside `CityStyle`, after `keepNodes`:

```ts
  /** Sky, fog, lights and window glow; City.reset applies it. */
  atmosphere: Atmosphere;
```

In `src/cities/tokyo/index.ts`, add `import { CONFIG } from '../../config';` and, after `keepNodes: [SHIBUYA_CROSSING],`:

```ts
  // Today's midday, exactly: the palette and fog in CONFIG, the light intensities and sun direction Lighting used.
  atmosphere: {
    skyZenith: CONFIG.palette.skyZenith,
    skyHorizon: CONFIG.palette.skyHorizon,
    fog: CONFIG.palette.fog,
    hemiSky: CONFIG.palette.hemiSky,
    hemiGround: CONFIG.palette.hemiGround,
    hemiIntensity: 1.1,
    sun: CONFIG.palette.sun,
    sunIntensity: 2.2,
    sunDir: { x: 0.45, y: 0.8, z: 0.35 },
    windowGlow: { color: 0xffd27a, strength: 0 },
  },
```

- [ ] **Step 4: Create `src/render/atmosphere.ts`**

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from '../cities/types';

/** Everything an atmosphere drives: the scene fog, the sky dome's colours, the two lights, the sun's direction, the window glow. */
export type AtmosphereTargets = {
  fog: THREE.Fog;
  sky: { zenith: THREE.Color; horizon: THREE.Color };
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** Unit vector toward the sun; Lighting.follow places the sun along it. */
  sunDir: THREE.Vector3;
  /** The facade shader's lit-window colour (a uniform value). */
  windowGlow: THREE.Color;
};

/** Fog near and far under `a`: its own, else CONFIG.fog's. */
export function fogDistances(a: Atmosphere): { near: number; far: number } {
  return { near: a.fogNear ?? CONFIG.fog.near, far: a.fogFar ?? CONFIG.fog.far };
}

/** The lit-window colour under `a`: its glow colour times its strength (black when the strength is 0). */
export function windowGlowColor(a: Atmosphere, out: THREE.Color): THREE.Color {
  return out.setHex(a.windowGlow.color).multiplyScalar(a.windowGlow.strength);
}

/** Set every target from `a`. */
export function applyAtmosphere(a: Atmosphere, t: AtmosphereTargets): void {
  t.sky.zenith.setHex(a.skyZenith);
  t.sky.horizon.setHex(a.skyHorizon);
  t.fog.color.setHex(a.fog);
  const f = fogDistances(a);
  t.fog.near = f.near;
  t.fog.far = f.far;
  t.hemi.color.setHex(a.hemiSky);
  t.hemi.groundColor.setHex(a.hemiGround);
  t.hemi.intensity = a.hemiIntensity;
  t.sun.color.setHex(a.sun);
  t.sun.intensity = a.sunIntensity;
  t.sunDir.set(a.sunDir.x, a.sunDir.y, a.sunDir.z).normalize();
  windowGlowColor(a, t.windowGlow);
}
```

- [ ] **Step 5: Make Sky and Lighting read the atmosphere**

Replace `src/render/Sky.ts` with:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from '../cities/types';
import { fogDistances } from './atmosphere';

/** Gradient dome (horizon → zenith) that ignores fog, plus scene fog tinted by the atmosphere. */
export function createSky(scene: THREE.Scene, a: Atmosphere): THREE.Mesh {
  const geo = new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 16, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(a.skyZenith) },
      horizon: { value: new THREE.Color(a.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y * 2.2, 0.0, 1.0);
        t = floor(t * 6.0) / 6.0; // banded gradient reads as pixel art
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  const f = fogDistances(a);
  scene.fog = new THREE.Fog(a.fog, f.near, f.far);
  return sky;
}

/** The dome's two gradient colours (its uniform values), for applyAtmosphere. */
export function skyColors(sky: THREE.Mesh): { zenith: THREE.Color; horizon: THREE.Color } {
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  return { zenith: u['zenith']!.value as THREE.Color, horizon: u['horizon']!.value as THREE.Color };
}
```

In `src/render/Lighting.ts`:
- delete `const SUN_DIR = ...`;
- add `import type { Atmosphere } from '../cities/types';`;
- replace the fields and the constructor's first lines, and `follow`, as below. The shadow-camera lines in between
  stay as they are.

```ts
/** Sun with a tight shadow box that follows the monster, plus hemisphere fill; colours and direction from the city's atmosphere. */
export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  /** Unit vector toward the sun. */
  readonly sunDir = new THREE.Vector3();
  private sky: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, a: Atmosphere) {
    const { render } = CONFIG;
    this.hemi = new THREE.HemisphereLight(a.hemiSky, a.hemiGround, a.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(a.sun, a.sunIntensity);
    this.sunDir.set(a.sunDir.x, a.sunDir.y, a.sunDir.z).normalize();
    this.sun.castShadow = true;
    // ... shadow map, camera, bias and scene.add lines unchanged ...
  }

  /** Keep the shadow box centred on the target (the monster). The sky dome follows the camera. */
  follow(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, SUN_DISTANCE);
  }
```

- [ ] **Step 6: Window glow in the facade shader**

In `src/world/pixelTextures.ts`, add above `patchFacadeShader`:

```ts
/**
 * A facade texel is a window when its linear blue exceeds its red by this much: the bluish window inks of the atlas
 * (office bands, balcony and shop windows) pass, pale glass panes, mullions, whites and greys do not.
 */
export const WINDOW_CHROMA = 0.145;

/** Whether an atlas ink counts as a lit window (the shader's test, on the CPU). */
export function isWindowTexel(hex: number): boolean {
  const c = new THREE.Color(hex);
  return c.b - c.r >= WINDOW_CHROMA;
}
```

Replace `patchFacadeShader` with:

```ts
/**
 * Facade material hook: each building instance picks an atlas cell (attribute aFacade) and the cell repeats by the
 * building's size, one per FACADE_TILE metres, so tall towers get more floors rather than stretched windows. With
 * `glow`, window texels (see WINDOW_CHROMA) also emit the shared uniform's colour: lit windows at no extra draw call.
 */
export function patchFacadeShader(
  sh: { uniforms?: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string },
  glow?: { value: THREE.Color },
): void {
  if (glow && sh.uniforms) sh.uniforms['uWindowGlow'] = glow;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFacade;\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vFacade = aFacade;
  float across = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
  vFacadeUv = vec2(uv.x * across / ${FACADE_TILE.w.toFixed(1)}, uv.y * length(instanceMatrix[1].xyz) / ${FACADE_TILE.h.toFixed(1)});`,
    );
  const glowDecl = glow ? '\nuniform vec3 uWindowGlow;' : '';
  const glowAdd = glow ? `\n  totalEmissiveRadiance += uWindowGlow * step(${WINDOW_CHROMA.toFixed(3)}, facadeTexel.b - facadeTexel.r);` : '';
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vFacade;\nvarying vec2 vFacadeUv;${glowDecl}`)
    .replace(
      '#include <map_fragment>',
      `vec2 facadeUv = vec2((fract(vFacadeUv.x) + vFacade) / ${FACADE_COUNT.toFixed(1)}, fract(vFacadeUv.y));
  vec4 facadeTexel = texture2D(map, facadeUv);
  diffuseColor *= facadeTexel;${glowAdd}`,
    );
}
```

(`totalEmissiveRadiance` is declared before `#include <map_fragment>` in three's toon fragment shader. Tokyo's glow
is black, so it adds nothing.)

- [ ] **Step 7: City holds the glow and applies the atmosphere**

In `src/world/City.ts`:

- Imports: add `import { applyAtmosphere, windowGlowColor, type AtmosphereTargets } from '../render/atmosphere';`.
- Fields (after `onSplash`):

```ts
  /** Lit-window colour the facade shader adds to window texels (set from the style's atmosphere). */
  readonly windowGlow = new THREE.Color(0, 0, 0);
  private glowUniform = { value: this.windowGlow };
  /** Sky, fog and lights the style's atmosphere drives, once attached. */
  private atmosphere: AtmosphereTargets | null = null;
```

- Constructor: change `facade.onBeforeCompile = (sh) => patchFacadeShader(sh);` to
  `facade.onBeforeCompile = (sh) => patchFacadeShader(sh, this.glowUniform);`. As the constructor's first statement
  after `const { world } = CONFIG;`, add `windowGlowColor(this._style.atmosphere, this.windowGlow);`.
- New method after `landmarkCount()`:

```ts
  /** Attach the scene's sky, fog and lights: the style's atmosphere is applied now and on every reset. */
  attachAtmosphere(t: Omit<AtmosphereTargets, 'windowGlow'>): void {
    this.atmosphere = { ...t, windowGlow: this.windowGlow };
    applyAtmosphere(this._style.atmosphere, this.atmosphere);
  }
```

- In `reset`, after the `if (style && style !== this._style) { ... }` block and before `this.buildOverlays();`:

```ts
    if (this.atmosphere) applyAtmosphere(this._style.atmosphere, this.atmosphere);
    else windowGlowColor(this._style.atmosphere, this.windowGlow);
```

- [ ] **Step 8: Intro fog base and space sun**

In `src/intro/timeline.ts` replace `introFog`:

```ts
/**
 * Fog for a camera this high: pushed out while it looks down from altitude (so the city shows), the city's fog
 * (`base`, CONFIG.fog by default) near the ground.
 */
export function introFog(camY: number, out: { near: number; far: number }, base: { near: number; far: number } = CONFIG.fog): { near: number; far: number } {
  out.near = Math.max(base.near, camY * 1.1);
  out.far = Math.max(base.far, camY * 2.6);
  return out;
}
```

In `src/intro/SpaceScene.ts`:
- add a field `private sun: THREE.DirectionalLight;`;
- in the constructor replace `const sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.4);`,
  `sun.position.set(1, 0.7, -0.3);` and `this.scene.add(sun, ...)` with the lines below;
- add the method after the constructor.

```ts
    this.sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.4);
    this.sun.position.set(1, 0.7, -0.3);
    this.scene.add(this.sun, new THREE.HemisphereLight(0x4a5f8a, 0x000000, 0.5));
```

```ts
  /** The sun's colour: the run city's, so the dive never flips from one time of day to another. */
  setSun(color: number): void {
    this.sun.color.setHex(color);
  }
```

In `src/intro/IntroCinematic.ts`:
- Add `import { fogDistances } from '../render/atmosphere';`.
- In `start()`, after `this.pod.setLength(this.podLength);`, add
  `this.space.setSun(this.host.city.style.atmosphere.sun);`.
- In `updateWorld`, replace `introFog(h.camera.position.y, h.scene.fog as THREE.Fog);` with
  `introFog(h.camera.position.y, h.scene.fog as THREE.Fog, fogDistances(h.city.style.atmosphere));`.
- In `finish()`, replace the two lines `fog.near = CONFIG.fog.near;` / `fog.far = CONFIG.fog.far;` with:

```ts
    const base = fogDistances(this.host.city.style.atmosphere);
    fog.near = base.near;
    fog.far = base.far;
```

- [ ] **Step 9: GameScene wiring**

In `src/GameScene.ts`, change the import `import { createSky } from './render/Sky';` to
`import { createSky, skyColors } from './render/Sky';` and replace the three constructor lines

```ts
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, pickCity(this.rng), CONFIG.world.seed, this.onTargetDestroyed);
```

with

```ts
    const style = pickCity(this.rng);
    this.lighting = new Lighting(this.scene, style.atmosphere);
    const sky = createSky(this.scene, style.atmosphere);
    this.lighting.attachSky(sky);

    this.city = new City(this.scene, style, CONFIG.world.seed, this.onTargetDestroyed);
    // From here on every city.reset(style) swaps sky, fog, lights and window glow with the city.
    this.city.attachAtmosphere({ fog: this.scene.fog as THREE.Fog, sky: skyColors(sky), hemi: this.lighting.hemi, sun: this.lighting.sun, sunDir: this.lighting.sunDir });
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/render/atmosphere.test.ts src/intro/timeline.test.ts src/world/pixelTextures.test.ts src/world/City.test.ts`
Expected: PASS (all files green).

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

Run: `npx vitest run`
Expected: every test file passes.

- [ ] **Step 11: Commit**

```bash
git add src/cities/types.ts src/cities/tokyo/index.ts src/render/atmosphere.ts src/render/atmosphere.test.ts src/render/Sky.ts src/render/Lighting.ts src/world/pixelTextures.ts src/world/pixelTextures.test.ts src/world/City.ts src/world/City.test.ts src/intro/timeline.ts src/intro/timeline.test.ts src/intro/IntroCinematic.ts src/intro/SpaceScene.ts src/GameScene.ts
git commit -m "Cities carry their atmosphere: sky, fog, lights and window glow applied on City.reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: River axis and bank parks

**Files:**
- Modify: `src/cities/types.ts` (`RiverSpec`), `src/cities/tokyo/index.ts` (`z0` → `c0`), `src/world/roads.ts`
  (`isRiver`, `bridgeAxis`, `isRiverBank`, `blockDistrict`, `segmentAt` bridges), `src/world/chunks.ts` (districts via
  `blockDistrict`)
- Test: `src/world/roads.test.ts`, `src/world/shore.test.ts`, `src/systems/splash.test.ts`, `src/world/chunks.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  // src/cities/types.ts
  export type RiverSpec = { axis?: 'x' | 'z'; c0: number; amp: number; wavelength: number; halfWidth: number; bankPark?: number };
  // src/world/roads.ts
  export function bridgeAxis(style: CityStyle): Axis;                       // 'z' for an x river (Tokyo), 'x' for a z river
  export function isRiverBank(style: CityStyle, ci: number, cj: number): boolean;
  export function blockDistrict(style: CityStyle, x: number, z: number): DistrictId;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/world/roads.test.ts`. Extend its roads import with `bridgeAxis, blockDistrict, isRiverBank` and add
`import type { CityStyle } from '../cities/types';`. Then:

```ts
describe('a north–south river (axis z)', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 }, bay: undefined, island: undefined };
  const xc = (z: number) => 1500 + 150 * Math.sin(z / 1100);

  it('makes water of the cells whose centre is within 130 m of x = 1500 + 150·sin(z / 1100), in every row', () => {
    for (let cj = -30; cj <= 30; cj++) {
      let n = 0;
      for (let ci = -10; ci <= 20; ci++) {
        const x = PITCH * ci + PITCH / 2, z = PITCH * cj + PITCH / 2;
        expect(isRiver(NS, ci, cj), `${ci},${cj}`).toBe(Math.abs(x - xc(z)) < 130);
        if (isRiver(NS, ci, cj)) n++;
      }
      expect(n, `row ${cj}`).toBeGreaterThan(0);
    }
  });

  it("keeps Tokyo's east–west river: axis defaults to 'x' and its bridges run along z", () => {
    expect(TOKYO.river!.axis).toBeUndefined();
    expect(bridgeAxis(TOKYO)).toBe('z');
    expect(bridgeAxis(NS)).toBe('x');
  });

  it('bridges it only on x-avenues (z a multiple of 1000); no z segment runs along it', () => {
    let bridges = 0;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const axis of ['x', 'z'] as const) {
      const [a, b] = cellsOf(axis, i, j);
      if (!(isRiver(NS, a[0], a[1]) && isRiver(NS, b[0], b[1]))) continue;
      const seg = segmentAt(NS, axis, i, j);
      if (axis === 'x' && mod(j, 5) === 0) {
        expect(seg?.bridge, `${axis} ${i},${j}`).toBe(true);
        bridges++;
      } else expect(seg, `${axis} ${i},${j}`).toBeNull();
    }
    expect(bridges).toBeGreaterThan(10);
  });

  it('keeps every x-avenue continuous across it', () => {
    for (let j = -30; j <= 30; j += 5) for (let i = 0; i < 12; i++) expect(segmentAt(NS, 'x', i, j), `z=${PITCH * j} seg ${i}`).not.toBeNull();
  });

  it('routes ground units across it on bridges only', () => {
    const start = { x: 900, z: 500 }, goal = { x: 2300, z: 500 };
    const path = planRoadPath(NS, start, goal);
    expect(path.length).toBeGreaterThan(0);
    const wet = (p: { x: number; z: number }) => cellRange(p.x).every((i) => cellRange(p.z).every((j) => isWater(NS, i, j)));
    const pts = [nearestRoadPoint(NS, start), ...path];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!, b = pts[k]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
      for (let s = 0; s <= n; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n };
        if (wet(q)) expect(Math.abs(q.z - Math.round(q.z / 1000) * 1000), `water ${q.x},${q.z}`).toBeLessThan(1e-6);
      }
    }
    expect(path[path.length - 1]).toEqual(nearestRoadPoint(NS, goal));
  });

  it('nearestRoadPoint never returns a water point off a bridge line', () => {
    const rnd = mulberry32(29);
    for (let k = 0; k < 400; k++) {
      const p = { x: 1000 + rnd() * 1000, z: (rnd() - 0.5) * 6000 };
      const q = nearestRoadPoint(NS, p);
      const wet = cellRange(q.x).every((i) => cellRange(q.z).every((j) => isWater(NS, i, j)));
      if (wet) expect(Math.abs(q.z - Math.round(q.z / 1000) * 1000), `${q.x},${q.z}`).toBeLessThan(1e-6);
    }
  });

  it('makes park of the land blocks within one block of the river (bankPark), and nothing else changes', () => {
    let banks = 0;
    for (let ci = 0; ci <= 14; ci++) for (let cj = -10; cj <= 10; cj++) {
      const near = [-1, 0, 1].some((di) => [-1, 0, 1].some((dj) => isRiver(NS, ci + di, cj + dj)));
      const bank = near && !isWater(NS, ci, cj);
      expect(isRiverBank(NS, ci, cj), `${ci},${cj}`).toBe(bank);
      const x = PITCH * (ci + 0.5), z = PITCH * (cj + 0.5);
      expect(blockDistrict(NS, x, z)).toBe(bank ? 'park' : NS.districtAt(x, z));
      if (bank) banks++;
    }
    expect(banks).toBeGreaterThan(20);
    // Tokyo sets no bankPark: its blocks keep their districts.
    for (let ci = -10; ci <= 10; ci++) for (let cj = 0; cj <= 12; cj++) {
      expect(isRiverBank(TOKYO, ci, cj)).toBe(false);
      expect(blockDistrict(TOKYO, PITCH * (ci + 0.5), PITCH * (cj + 0.5))).toBe(TOKYO.districtAt(PITCH * (ci + 0.5), PITCH * (cj + 0.5)));
    }
  });
});
```

Append to `src/world/shore.test.ts`. Add `import type { CityStyle } from '../cities/types';` and:

```ts
describe('shore with a north–south river', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130 }, bay: undefined, island: undefined };
  it('never blocks its cells: the monster wades through', () => {
    let rivers = 0;
    for (let ci = 0; ci <= 12; ci++) for (let cj = -20; cj <= 20; cj++) {
      if (!isRiver(NS, ci, cj)) continue;
      rivers++;
      expect(inBay(NS, ci * 200 + 100, cj * 200 + 100)).toBe(false);
      expect(blockedAt(NS, ci * 200 + 100, cj * 200 + 100, 100)).toBe(false);
    }
    expect(rivers).toBeGreaterThan(20);
  });
});
```

Append to `src/systems/splash.test.ts`. Add `import type { CityStyle } from '../cities/types';` and:

```ts
describe('Splasher on a north–south river', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130 }, bay: undefined, island: undefined };
  it('splashes mid-channel, and not on the bank road along the x line at its west edge', () => {
    let ci = 0;
    while (!(isRiver(NS, ci, 0) && !isRiver(NS, ci - 1, 0))) ci++;
    const { out, fx } = stub();
    const sp = new Splasher(() => NS, fx);
    expect(sp.at(new THREE.Vector3(PITCH * (ci + 0.5), 0, PITCH * 0.5))).toBe(true);
    expect(out.emitted).toBeGreaterThan(0);
    sp.newFrame();
    const margin = lineWidth(ci) / 2 + SEA_WALL_SIZE.thick;
    expect(sp.at(new THREE.Vector3(PITCH * ci + margin - 2, 0, PITCH * 0.5))).toBe(false);
    expect(sp.at(new THREE.Vector3(PITCH * ci + margin + 2, 0, PITCH * 0.5))).toBe(true);
  });
});
```

Append to `src/world/chunks.test.ts`. Extend its roads import with `isRiverBank` and add:

```ts
describe('river bank parks', () => {
  const NS: CityStyle = { ...TOKYO, river: { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 }, bay: undefined, island: undefined, landmarks: [], specialLots: [] };
  it('lays every bank block as a park: a pad, and no building on it', () => {
    let banks = 0;
    for (let cx = 0; cx <= 3; cx++) for (let cz = -3; cz <= 2; cz++) {
      const c = generateChunk(NS, 1337, cx, cz);
      for (let i = 4 * cx; i < 4 * cx + 4; i++) for (let j = 4 * cz; j < 4 * cz + 4; j++) {
        if (!isRiverBank(NS, i, j)) continue;
        banks++;
        expect(c.parks).toContainEqual({ x: PITCH * (i + 0.5), z: PITCH * (j + 0.5) });
        expect(c.buildings.some((b) => Math.floor(b.x / PITCH) === i && Math.floor(b.z / PITCH) === j), `${i},${j}`).toBe(false);
      }
    }
    expect(banks).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/world/roads.test.ts src/world/shore.test.ts src/systems/splash.test.ts src/world/chunks.test.ts`
Expected: FAIL. TypeScript-in-vitest reports `bridgeAxis`/`isRiverBank`/`blockDistrict` as not exported
(`... is not a function`). The axis-z water test fails because `isRiver` still reads `z0`, which is now undefined, so
it gets NaN and the river is nowhere.

- [ ] **Step 3: Update `RiverSpec` and Tokyo**

In `src/cities/types.ts` replace the `RiverSpec` doc and type:

```ts
/**
 * A winding river. Along axis 'x' (the default: it runs east–west) the centreline is z = c0 + amp · sin(x / wavelength);
 * along 'z' (north–south) it is x = c0 + amp · sin(z / wavelength). Cells whose centre lies within halfWidth of the
 * centreline, measured across the axis, are water. With `bankPark`, land blocks within that many blocks of river
 * water (Chebyshev distance) are park.
 */
export type RiverSpec = { axis?: 'x' | 'z'; c0: number; amp: number; wavelength: number; halfWidth: number; bankPark?: number };
```

In `src/cities/tokyo/index.ts`: `river: { c0: 1300, amp: 180, wavelength: 900, halfWidth: 130 },`.

In `src/world/roads.test.ts` (the existing "water is continuous" test), change the failure message
``  `river near z ${r.z0}` `` to `` `river near z ${r.c0}` ``.

- [ ] **Step 4: Implement the axis, bridges and banks in `src/world/roads.ts`**

Change the import `import type { CityStyle, Shoreline } from '../cities/types';` to
`import type { CityStyle, DistrictId, Shoreline } from '../cities/types';`. Replace `isRiver`:

```ts
/** True when the centre of cell (ci, cj) lies within the river's half width of its centreline (measured across its axis). */
export function isRiver(style: CityStyle, ci: number, cj: number): boolean {
  const r = style.river;
  if (!r) return false;
  const { x, z } = cellCentre(ci, cj);
  const [along, across] = r.axis === 'z' ? [z, x] : [x, z];
  return Math.abs(across - (r.c0 + r.amp * Math.sin(along / r.wavelength))) < r.halfWidth;
}

/** The axis of the segments that bridge the river: they cross it, so they run across its axis. */
export function bridgeAxis(style: CityStyle): Axis {
  return style.river?.axis === 'z' ? 'x' : 'z';
}
```

After `isWater`, add:

```ts
/** True for a land cell within the river's bankPark blocks (Chebyshev) of river water outside the bay. */
export function isRiverBank(style: CityStyle, ci: number, cj: number): boolean {
  const n = style.river?.bankPark ?? 0;
  if (n <= 0 || isWater(style, ci, cj)) return false;
  for (let di = -n; di <= n; di++) for (let dj = -n; dj <= n; dj++) if (isRiverOnly(style, ci + di, cj + dj)) return true;
  return false;
}

/** The district a block at (x, z) is built as: the style's, except river bank blocks, which are park. */
export function blockDistrict(style: CityStyle, x: number, z: number): DistrictId {
  return isRiverBank(style, Math.floor(x / PITCH), Math.floor(z / PITCH)) ? 'park' : style.districtAt(x, z);
}
```

In `segmentAt`, replace the bridge line

```ts
  if (a && b) return avenue && axis === 'z' && isRiverOnly(style, ai, aj) && isRiverOnly(style, i, j) ? seg(true) : null;
```

with

```ts
  if (a && b) return avenue && axis === bridgeAxis(style) && isRiverOnly(style, ai, aj) && isRiverOnly(style, i, j) ? seg(true) : null;
```

(`Axis` is declared above `isRiver` in the same file.)

- [ ] **Step 5: Build blocks by `blockDistrict` in `src/world/chunks.ts`**

Add `blockDistrict` to the import from `./roads`. In `generateChunk`, make these replacements:
- `const district = style.districtAt(bx, bz);` (inside `if (landmark)`) becomes
  `const district = blockDistrict(style, bx, bz);`.
- `let district = style.districtAt(bx, bz);` becomes `let district = blockDistrict(style, bx, bz);`.
- In the lanes loop, `const da = style.districtAt(...)` and `const db = style.districtAt(...)` become
  `blockDistrict(style, ...)` with the same arguments.

Leave `segmentAt`'s removal lookup on `style.districtAt` (Ruling R9).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/world/roads.test.ts src/world/shore.test.ts src/systems/splash.test.ts src/world/chunks.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

Run: `npx vitest run`
Expected: every test file passes (Tokyo's river, bridge, route and chunk tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/cities/types.ts src/cities/tokyo/index.ts src/world/roads.ts src/world/chunks.ts src/world/roads.test.ts src/world/shore.test.ts src/systems/splash.test.ts src/world/chunks.test.ts
git commit -m "Rivers can run north-south: axis, c0, bridges across the axis, bank parks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Shared helpers: coast distance, overlays by id, glyph sets, cranes and water per city

**Files:**
- Create: `src/cities/coast.ts`, `src/cities/coast.test.ts`, `src/world/latinFont.ts`
- Modify: `src/cities/tokyo/layout.ts` (import and re-export `coastDistance`), `src/cities/types.ts` (`GlyphSet`,
  `CraneColors`, `CityStyle.glyphs`, `CityStyle.cranes`, `colors.water`), `src/cities/tokyo/index.ts`
  (`glyphs: 'kanji'`, `colors.water`), `src/world/pixelTextures.ts` (overlay registry, `signAtlas(glyphs)`,
  `CityTextures.signs(glyphs)`), `src/world/crane.ts` (colours), `src/world/chunks.ts` (`cranes: false`),
  `src/world/City.ts` (signs, cranes, water on reset)
- Test: `src/cities/coast.test.ts`, `src/world/pixelTextures.test.ts`, `src/world/chunks.test.ts`,
  `src/world/City.test.ts`

**Interfaces:**
- Consumes: Task 1's `City.reset` structure.
- Produces:
  ```ts
  // src/cities/coast.ts
  export function coastDistance(bay: BaySpec, x: number, z: number): number;   // moved verbatim from tokyo/layout
  // src/cities/types.ts
  export type GlyphSet = 'kanji' | 'latin';
  export type CraneColors = { main: number; band: number; machinery: number };
  // CityStyle gains: glyphs: GlyphSet; cranes?: { colors: CraneColors } | false; colors.water: number
  // src/world/latinFont.ts
  export const LATIN_FONT: Readonly<Record<string, readonly string[]>>;     // 5 × 7, rows top-down, '1' = ink
  export const SIGN_WORDS: readonly [string, string, string];               // one word per vertical board cell 0–2
  export function latinBoardRects(word: string, x0: number): { x: number; y: number; w: number; h: number }[];
  // src/world/pixelTextures.ts
  export function overlayPainter(id: string): (ov: GroundOverlay) => THREE.CanvasTexture;   // throws on an unknown id
  export function overlayTexture(ov: GroundOverlay): THREE.CanvasTexture;
  export function signAtlas(glyphs?: GlyphSet): THREE.CanvasTexture;
  // CityTextures.signs(glyphs: GlyphSet): THREE.Texture
  // src/world/crane.ts
  export const DEFAULT_CRANE_COLORS: CraneColors;                            // today's red, white, grey
  export function craneColors(style: CityStyle): CraneColors;
  export function craneGeometry(colors?: CraneColors): THREE.BufferGeometry;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/cities/coast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coastDistance } from './coast';
import { coastDistance as tokyoCoastDistance, TOKYO_BAY, TOKYO_ISLAND } from './tokyo/layout';
import { isBay, isIsland, PITCH } from '../world/roads';

describe('coastDistance', () => {
  it('is metres inland from the coastline along the bay dir: offset at the origin, negative out at sea', () => {
    expect(coastDistance(TOKYO_BAY, 0, 0)).toBeCloseTo(2000);
    const far = 3000 * Math.SQRT1_2;
    expect(coastDistance(TOKYO_BAY, -far, -far)).toBeLessThan(0);
    expect(coastDistance({ dir: { x: 0, z: 1 }, offset: 2250, amp: 0, wavelength: 1500 }, 123, 2000)).toBeCloseTo(250);
  });

  it("agrees with isBay at every cell centre (off the island), and Tokyo's layout re-exports the same function", () => {
    const shore = { bay: TOKYO_BAY, island: TOKYO_ISLAND };
    for (let i = -40; i <= 20; i++) for (let j = -40; j <= 20; j++) {
      if (isIsland(shore, i, j)) continue;
      expect(isBay(shore, i, j), `${i},${j}`).toBe(coastDistance(TOKYO_BAY, PITCH * (i + 0.5), PITCH * (j + 0.5)) < 0);
    }
    expect(tokyoCoastDistance).toBe(coastDistance);
  });
});
```

Append to `src/world/pixelTextures.test.ts`. Extend the pixelTextures import with `overlayPainter, scrambleTexture` and
add `import { LATIN_FONT, SIGN_WORDS, latinBoardRects } from './latinFont';`. Then:

```ts
describe('overlay textures by id', () => {
  it("paints the Shibuya scramble for 'scramble' (Tokyo unchanged)", () => {
    expect(overlayPainter('scramble')).toBe(scrambleTexture);
  });
  it('throws, naming the id, for an overlay with no texture', () => {
    expect(() => overlayPainter('no-such-decal')).toThrow(/no-such-decal/);
  });
});

describe('latin glyphs', () => {
  it('draws every letter 5 px wide and 7 tall', () => {
    for (const [ch, rows] of Object.entries(LATIN_FONT)) {
      expect(rows, ch).toHaveLength(7);
      for (const r of rows) expect(r, ch).toMatch(/^[01]{5}$/);
    }
  });
  it('has one word per vertical board, each at most 5 letters, all in the font', () => {
    expect(SIGN_WORDS).toHaveLength(3);
    for (const w of SIGN_WORDS) {
      expect(w.length).toBeLessThanOrEqual(5);
      for (const ch of w) expect(LATIN_FONT[ch], ch).toBeDefined();
    }
  });
  it('stacks a word down a 12 × 48 board inside its 1 px frame', () => {
    for (const [k, w] of SIGN_WORDS.entries()) {
      const x0 = k * 12;
      const rects = latinBoardRects(w, x0);
      expect(rects.length).toBeGreaterThan(w.length * 5);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(x0 + 1);
        expect(r.x + r.w).toBeLessThanOrEqual(x0 + 11);
        expect(r.y).toBeGreaterThanOrEqual(1);
        expect(r.y + r.h).toBeLessThanOrEqual(47);
      }
    }
  });
});
```

Append to `src/world/chunks.test.ts`, in `describe('harbour and island', ...)` after the crane-pool test:

```ts
  it('stands no crane anywhere when the style sets cranes: false (and the same coast with Tokyo has some)', () => {
    const NO_CRANES: CityStyle = { ...TOKYO, cranes: false };
    let tokyo = 0;
    for (const [cx, cz] of REGION) {
      expect(generateChunk(NO_CRANES, 1337, cx, cz).cranes).toEqual([]);
      tokyo += generateChunk(TOKYO, 1337, cx, cz).cranes.length;
    }
    expect(tokyo).toBeGreaterThan(0);
  });
```

Append to `src/world/City.test.ts`. Extend its existing `./crane` import to
`import { DEFAULT_CRANE_COLORS, craneGeometry } from './crane';`, then add:

```ts
describe('City style switch', () => {
  const vertexHexes = (g: THREE.BufferGeometry) => {
    const a = g.getAttribute('color');
    const out = new Set<number>();
    for (let i = 0; i < a.count; i++) out.add(new THREE.Color(a.getX(i), a.getY(i), a.getZ(i)).getHex());
    return out;
  };
  const LATIN: CityStyle = {
    ...TOKYO,
    id: 'latin',
    glyphs: 'latin',
    colors: { ...TOKYO.colors, water: 0x3d8fa8 },
    cranes: { colors: { main: 0x2255aa, band: 0xffffff, machinery: 0x444444 } },
  };

  it('rebuilds the sign atlas for the glyph set, repaints cranes and water on reset, and restores Tokyo after', () => {
    const asked: string[] = [];
    const textures: CityTextures = { ...STUB, signs: (g) => (asked.push(g), new THREE.Texture()) };
    const city = new City(new THREE.Scene(), TOKYO, CONFIG.world.seed, () => {}, textures);
    const m = city as unknown as { waterMesh: THREE.InstancedMesh; craneMesh: THREE.InstancedMesh };
    const water = () => (m.waterMesh.material as THREE.MeshToonMaterial).color.getHex();
    expect(water()).toBe(0x3f8fc9);
    expect(vertexHexes(m.craneMesh.geometry).has(DEFAULT_CRANE_COLORS.main)).toBe(true);
    city.reset(LATIN);
    expect(water()).toBe(0x3d8fa8);
    expect(vertexHexes(m.craneMesh.geometry).has(0x2255aa)).toBe(true);
    city.reset(TOKYO);
    expect(asked).toEqual(['kanji', 'latin', 'kanji']);
    expect(water()).toBe(0x3f8fc9);
    const hexes = vertexHexes(m.craneMesh.geometry);
    expect(hexes.has(DEFAULT_CRANE_COLORS.main)).toBe(true);
    expect(hexes.has(0x2255aa)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cities/coast.test.ts src/world/pixelTextures.test.ts src/world/chunks.test.ts src/world/City.test.ts`
Expected: FAIL. `coast.test.ts` fails with "Failed to resolve import './coast'", `pixelTextures.test.ts` fails with
"Failed to resolve import './latinFont'", the `cranes: false` test finds cranes, and the City switch test fails on
the water colour (`0x3f8fc9` stays).

- [ ] **Step 3: Move `coastDistance`**

Create `src/cities/coast.ts`:

```ts
import type { BaySpec } from './types';

/** Metres from (x, z) to the coastline along the bay's dir: positive inland, negative out in the bay. */
export function coastDistance(bay: BaySpec, x: number, z: number): number {
  const along = x * bay.dir.x + z * bay.dir.z;
  const across = -x * bay.dir.z + z * bay.dir.x;
  return bay.offset + bay.amp * Math.sin(across / bay.wavelength) - along;
}
```

In `src/cities/tokyo/layout.ts`:
- delete the `coastDistance` function and its doc comment;
- add `import { coastDistance } from '../coast';`;
- add `export { coastDistance } from '../coast';`, so `layout.test.ts` and other importers keep working unchanged.

- [ ] **Step 4: Style fields**

In `src/cities/types.ts` add, above `CityStyle`:

```ts
/** Lettering on vertical signs: Tokyo's blocky kanji-like strokes, or Latin capitals. */
export type GlyphSet = 'kanji' | 'latin';
/** Gantry crane paint: the bold bands (main and band alternate) and the grey machinery. */
export type CraneColors = { main: number; band: number; machinery: number };
```

In `CityStyle.colors` add, after `quay`:

```ts
    /** River and bay water. */
    water: number;
```

In `CityStyle` add, after `atmosphere`:

```ts
  /** The sign atlas's lettering. */
  glyphs: GlyphSet;
  /** Port cranes: their paint, or false for none; unset is today's red and white. */
  cranes?: { colors: CraneColors } | false;
```

In `src/cities/tokyo/index.ts` add `water: 0x3f8fc9,` after `quay: 0xb9b2a4,`, and `glyphs: 'kanji',` after
`atmosphere: {...},`.

- [ ] **Step 5: The Latin font**

Create `src/world/latinFont.ts`:

```ts
/** Blocky 5 × 7 capitals for Latin signs, rows top-down, '1' = ink. Only the letters the city's signs spell. */
export const LATIN_FONT: Readonly<Record<string, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

/** The word on each vertical board cell (0–2), read top to bottom. */
export const SIGN_WORDS = ['HOTEL', 'PIZZA', 'BANK'] as const;

/** Ink pixels of `word` stacked down the 12 × 48 board whose left edge is x0: letters 5 px wide at x0 + 3, every 9 px from y = 3. */
export function latinBoardRects(word: string, x0: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  [...word].forEach((ch, k) => {
    const rows = LATIN_FONT[ch] ?? [];
    rows.forEach((row, r) => {
      for (let c = 0; c < 5; c++) if (row[c] === '1') out.push({ x: x0 + 3 + c, y: 3 + 9 * k + r, w: 1, h: 1 });
    });
  });
  return out;
}
```

- [ ] **Step 6: Overlay registry and glyph-aware sign atlas in `src/world/pixelTextures.ts`**

Change the type import to `import type { CityStyle, GlyphSet, GroundOverlay } from '../cities/types';` and add
`import { SIGN_WORDS, latinBoardRects } from './latinFont';`.

After `scrambleTexture`, add:

```ts
/** The texture painter of each ground decal id. */
const OVERLAY_PAINTERS: Readonly<Record<string, (ov: GroundOverlay) => THREE.CanvasTexture>> = {
  scramble: scrambleTexture,
};

/** The painter for overlay `id`; an id with no painter is a programming error. */
export function overlayPainter(id: string): (ov: GroundOverlay) => THREE.CanvasTexture {
  const paint = OVERLAY_PAINTERS[id];
  if (!paint) throw new Error(`no overlay texture for '${id}'`);
  return paint;
}

/** The texture of ground decal `ov`, chosen by its id. */
export function overlayTexture(ov: GroundOverlay): THREE.CanvasTexture {
  return overlayPainter(ov.id)(ov);
}
```

In `CityTextures`, change `signs(): THREE.Texture;` to `signs(glyphs: GlyphSet): THREE.Texture;`. In
`canvasCityTextures`, change `signs: () => signAtlas(),` to `signs: (glyphs) => signAtlas(glyphs),` and
`overlay: scrambleTexture,` to `overlay: overlayTexture,`.

Replace `signAtlas` with the version below. The kanji branch is byte-for-byte today's code, including the same rng
draws, so Tokyo's atlas is unchanged.

```ts
/**
 * Sign atlas. Vertical boards: bright panels (tinted to the sign colour) with a dark frame and a column of dark
 * glyphs: blocky kanji-like strokes, or a Latin word (SIGN_WORDS). Billboards: small full-colour pictures (drawn
 * untinted): Tokyo's drink can, anime face and logo, or Latin logos and lettering.
 */
export function signAtlas(glyphs: GlyphSet = 'kanji'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SA;
  c.height = SA;
  const g = c.getContext('2d')!;
  const rng = mulberry32(CONFIG.world.seed + 11);
  for (let k = 0; k < 3; k++) {
    const x0 = k * 12;
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, 12, 48);
    g.fillStyle = '#26222e';
    g.fillRect(x0, 0, 12, 1);
    g.fillRect(x0, 47, 12, 1);
    g.fillRect(x0, 0, 1, 48);
    g.fillRect(x0 + 11, 0, 1, 48);
    if (glyphs === 'latin') {
      for (const r of latinBoardRects(SIGN_WORDS[k]!, x0)) g.fillRect(r.x, r.y, r.w, r.h);
      continue;
    }
    // Glyphs: 8 × 8 cells stacked down the board, each a few strokes.
    for (let y = 3; y + 8 <= 46; y += 9) {
      const gx = x0 + 2;
      g.fillRect(gx + 3, y, 2, 8);
      if (rng() < 0.8) g.fillRect(gx, y + 1 + Math.floor(rng() * 3), 8, 1);
      if (rng() < 0.7) g.fillRect(gx + 1, y + 5 + Math.floor(rng() * 2), 6, 1);
      if (rng() < 0.6) g.fillRect(gx + (rng() < 0.5 ? 0 : 6), y + 2, 2, 5);
      if (rng() < 0.5) g.fillRect(gx + 1, y + 7, 6, 1);
    }
  }
  if (glyphs === 'latin') latinBillboards(g);
  else kanjiBillboards(g);
  return finish(c);
}

/** Tokyo's billboards (cells 3–5): a drink can on yellow, an anime face on pink, a logo and text on deep blue. */
function kanjiBillboards(g: CanvasRenderingContext2D): void {
  // Billboard 3: a drink can on yellow with a red band of text.
  g.fillStyle = '#ffd23a';
  g.fillRect(36, 0, 28, 16);
  g.fillStyle = '#e8502a';
  g.fillRect(38, 2, 6, 12);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 5, 4, 2);
  g.fillStyle = '#2a2a3a';
  for (let i = 0; i < 4; i++) g.fillRect(47 + i * 4, 5, 3, 3);
  g.fillRect(47, 10, 14, 2);
  // Billboard 4: an anime face on pink.
  g.fillStyle = '#ff8fc8';
  g.fillRect(36, 16, 28, 16);
  g.fillStyle = '#fbe3cf';
  g.fillRect(44, 19, 12, 11);
  g.fillStyle = '#4a2a6a';
  g.fillRect(43, 17, 14, 4);
  g.fillRect(43, 17, 2, 10);
  g.fillRect(55, 17, 2, 10);
  g.fillStyle = '#35a0ff';
  g.fillRect(46, 23, 2, 3);
  g.fillRect(52, 23, 2, 3);
  g.fillStyle = '#e8502a';
  g.fillRect(49, 27, 2, 1);
  // Billboard 5: a white logo and text on deep blue.
  g.fillStyle = '#1f4fa8';
  g.fillRect(36, 32, 28, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 36, 8, 8);
  g.fillStyle = '#1f4fa8';
  g.fillRect(41, 38, 4, 4);
  g.fillStyle = '#ffffff';
  g.fillRect(50, 36, 11, 2);
  g.fillRect(50, 40, 8, 2);
  g.fillStyle = '#35e8ff';
  g.fillRect(50, 44, 11, 1);
}

/** Latin billboards (cells 3–5): simple logo shapes beside blocky lettering. */
function latinBillboards(g: CanvasRenderingContext2D): void {
  // Billboard 3: a red leaf-like star on white, red lettering bars.
  g.fillStyle = '#f4f1ea';
  g.fillRect(36, 0, 28, 16);
  g.fillStyle = '#d8322a';
  g.fillRect(41, 3, 2, 10);
  g.fillRect(38, 6, 8, 3);
  g.fillRect(39, 4, 6, 2);
  g.fillRect(48, 4, 13, 3);
  g.fillRect(48, 9, 9, 2);
  // Billboard 4: a coffee cup with steam on deep red, cream lettering.
  g.fillStyle = '#8a1c22';
  g.fillRect(36, 16, 28, 16);
  g.fillStyle = '#f2e6cf';
  g.fillRect(39, 22, 7, 7);
  g.fillRect(46, 24, 2, 3);
  g.fillRect(41, 18, 1, 3);
  g.fillRect(43, 18, 1, 3);
  g.fillRect(50, 20, 11, 2);
  g.fillRect(50, 24, 8, 2);
  g.fillRect(50, 28, 10, 1);
  // Billboard 5: a white ring logo on blue, white and amber lettering.
  g.fillStyle = '#1f4fa8';
  g.fillRect(36, 32, 28, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 35, 8, 10);
  g.fillStyle = '#1f4fa8';
  g.fillRect(41, 37, 4, 6);
  g.fillStyle = '#ffffff';
  g.fillRect(50, 36, 11, 2);
  g.fillRect(50, 40, 7, 2);
  g.fillStyle = '#ffc23a';
  g.fillRect(50, 44, 11, 1);
}
```

- [ ] **Step 7: Crane paint per city in `src/world/crane.ts`**

Replace the three colour constants, add the default colours and the style lookup, and take colours as a parameter:

```ts
import type { CityStyle, CraneColors } from '../cities/types';

/** Today's crane paint: bold red and white bands, grey machinery (Tokyo, and any style that leaves `cranes` unset). */
export const DEFAULT_CRANE_COLORS: CraneColors = { main: 0xd23a2c, band: 0xf2f0ea, machinery: 0x6f757b };

/** The style's crane paint (the default when unset or when it has no cranes). */
export function craneColors(style: CityStyle): CraneColors {
  return style.cranes ? style.cranes.colors : DEFAULT_CRANE_COLORS;
}
```

Change the signature to `export function craneGeometry(colors: CraneColors = DEFAULT_CRANE_COLORS): THREE.BufferGeometry {`.
Add `const RED = colors.main, WHITE = colors.band, GREY = colors.machinery;` as its first line, so the body is
unchanged.

- [ ] **Step 8: No cranes when `cranes: false`, in `src/world/chunks.ts`**

In `craneAt`, change the first line to

```ts
  if (style.cranes === false || !coastal(style, i, j) || !style.bay) return null;
```

- [ ] **Step 9: City repaints on a style switch, in `src/world/City.ts`**

- Imports: `import { craneColors, craneGeometry } from './crane';`.
- Delete `const WATER_COLOR = 0x3f8fc9;`.
- Fields: add `private signMat: THREE.MeshBasicMaterial;` and `private waterMat: THREE.MeshToonMaterial;`.
- Constructor:
  - Replace `this.waterMesh = new THREE.InstancedMesh(flat, layered(toonMat(WATER_COLOR), 1), world.maxWater);` with:

    ```ts
        this.waterMat = toonMat(this._style.colors.water);
        this.waterMesh = new THREE.InstancedMesh(flat, layered(this.waterMat, 1), world.maxWater);
    ```

  - Replace `this.craneMesh = new THREE.InstancedMesh(craneGeometry(), ...` with
    `this.craneMesh = new THREE.InstancedMesh(craneGeometry(craneColors(this._style)), toonMat(0xffffff, { vertexColors: true }), world.maxCranes);`.
  - Replace `const signMat = new THREE.MeshBasicMaterial({ map: this.textures.signs() });` with
    `const signMat = (this.signMat = new THREE.MeshBasicMaterial({ map: this.textures.signs(this._style.glyphs) }));`.
- In `reset`, inside `if (style && style !== this._style) {`, capture `const prev = this._style;` before
  `this._style = style;`, then add after `this.roadMat.needsUpdate = true;`:

```ts
      if (style.glyphs !== prev.glyphs) {
        this.signMat.map?.dispose();
        this.signMat.map = this.textures.signs(style.glyphs);
        this.signMat.needsUpdate = true;
      }
      this.waterMat.color.setHex(style.colors.water);
      if (craneColors(style) !== craneColors(prev)) {
        this.craneMesh.geometry.dispose();
        this.craneMesh.geometry = craneGeometry(craneColors(style));
      }
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/cities/coast.test.ts src/world/pixelTextures.test.ts src/world/chunks.test.ts src/world/City.test.ts src/cities/tokyo/layout.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

Run: `npx vitest run`
Expected: every test file passes.

- [ ] **Step 11: Commit**

```bash
git add src/cities/coast.ts src/cities/coast.test.ts src/cities/tokyo/layout.ts src/cities/types.ts src/cities/tokyo/index.ts src/world/latinFont.ts src/world/pixelTextures.ts src/world/pixelTextures.test.ts src/world/crane.ts src/world/chunks.ts src/world/chunks.test.ts src/world/City.ts src/world/City.test.ts
git commit -m "Shared city helpers: coastDistance, overlays by id, Latin glyphs, per-city cranes and water

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Toronto layout and style skeleton

**Files:**
- Create: `src/cities/toronto/layout.ts`, `src/cities/toronto/districts.ts`, `src/cities/toronto/index.ts`,
  `src/cities/toronto/layout.test.ts`, `src/cities/toronto/toronto.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `Atmosphere`.
  - Task 2: `RiverSpec.axis`/`bankPark`, `isRiverBank`, `blockDistrict`.
  - Task 3: `coastDistance` (`src/cities/coast.ts`), `glyphs`, `cranes`, `colors.water`.
- Produces:
  ```ts
  // src/cities/toronto/layout.ts
  export const YONGE_DUNDAS: { x: -100; z: 900 }; FINANCIAL: { x: -300; z: 1500 };
  export const CITY_HALL_SITE: { x: -500; z: 1135 }; CN_TOWER_SITE: { x: -700; z: 1900 }; ROGERS_CENTRE_SITE: { x: -1110; z: 1890 };
  export const TORONTO_LAKE: BaySpec; TORONTO_ISLANDS: IslandSpec; DON: RiverSpec;
  export const PORT_DEPTH = 400; WATERFRONT = { x0: 0, x1: 1400 }; CORE_RADIUS = 4000;
  export function districtAt(x: number, z: number): DistrictId;
  export function blockInterior(ci: number, cj: number): { x0: number; x1: number; z0: number; z1: number };
  export function lotCentre(ci: number, cj: number, n: number, a: number, b: number): { x: number; z: number };
  // src/cities/toronto/districts.ts
  export const TORONTO_DISTRICTS: Record<DistrictId, DistrictRules>;
  // src/cities/toronto/index.ts
  export const TORONTO: CityStyle;   // landmarks, specialLots, overlays empty until Tasks 5–6
  ```

- [ ] **Step 1: Write the failing layout tests**

Create `src/cities/toronto/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { DISTRICTS, type DistrictId } from '../types';
import { coastDistance } from '../coast';
import { CORE_RADIUS, DON, FINANCIAL, PORT_DEPTH, TORONTO_ISLANDS, TORONTO_LAKE, WATERFRONT, YONGE_DUNDAS, blockInterior, districtAt, lotCentre } from './layout';
import { TORONTO } from './index';
import { AVENUE_WIDTH, PITCH, blockDistrict, isBay, isIsland, isRiver, isRiverBank, isWater, lineWidth, segmentAt } from '../../world/roads';
import { inBay } from '../../world/shore';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const centre = (i: number) => PITCH * (i + 0.5);

describe('Toronto layout', () => {
  it('runs Yonge Street (the x = 0 avenue) unbroken from behind the crash to the lake', () => {
    expect(lineWidth(0)).toBe(AVENUE_WIDTH);
    for (let j = -10; j < 11; j++) expect(segmentAt(TORONTO, 'z', 0, j), `Yonge at z ${PITCH * j}`).not.toBeNull();
  });

  it('puts Yonge-Dundas, the one neon block, just right (west) of Yonge ahead of the crash', () => {
    expect(YONGE_DUNDAS).toEqual({ x: -100, z: 900 });
    expect(districtAt(-100, 900)).toBe('neon');
    for (const [x, z] of [[100, 900], [-300, 900], [-100, 700], [-100, 1100]] as const) expect(districtAt(x, z)).not.toBe('neon');
    let neon = 0;
    for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) if (districtAt(centre(i), centre(j)) === 'neon') neon++;
    expect(neon).toBe(1);
  });

  it('centres the Financial District on (−300, 1500): that block and its four neighbours are high-rise', () => {
    expect(FINANCIAL).toEqual({ x: -300, z: 1500 });
    for (const [x, z] of [[-300, 1500], [-500, 1500], [-100, 1500], [-300, 1300], [-300, 1700]] as const) expect(districtAt(x, z), `${x},${z}`).toBe('highrise');
    for (const [x, z] of [[-500, 1300], [-100, 1700], [-700, 1500], [-300, 1900]] as const) expect(districtAt(x, z), `${x},${z}`).not.toBe('highrise');
  });

  it('lays the lake ahead (+Z): land up to z = 2200, open lake beyond, none behind the crash', () => {
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 10; j++) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(false);
      for (const j of [12, 16, 20, 40]) if (!isIsland(TORONTO, i, j)) expect(isBay(TORONTO, i, j), `${i},${j}`).toBe(true);
    }
  });

  it('keeps the islands offshore: a long east–west group of park cells with open lake all round, unwalkable', () => {
    const cells: [number, number][] = [];
    for (let i = -20; i <= 20; i++) for (let j = 0; j <= 30; j++) if (isIsland(TORONTO, i, j)) cells.push([i, j]);
    expect(cells.length).toBeGreaterThan(20);
    const c = TORONTO_ISLANDS.center;
    expect(isIsland(TORONTO, Math.floor(c.x / PITCH), Math.floor(c.z / PITCH))).toBe(true);
    const is = cells.map(([i]) => i), js = cells.map(([, j]) => j);
    expect(Math.max(...is) - Math.min(...is)).toBeGreaterThan(3 * (Math.max(...js) - Math.min(...js)));
    for (const [i, j] of cells) {
      expect(districtAt(centre(i), centre(j))).toBe('park');
      expect(inBay(TORONTO, centre(i), centre(j))).toBe(true);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        expect(isIsland(TORONTO, i + di, j + dj) || isBay(TORONTO, i + di, j + dj), `${i + di},${j + dj} beside the islands`).toBe(true);
      }
    }
  });

  it('runs the Don north–south at x = 1500 + 150·sin(z / 1100), connected through water into the lake', () => {
    expect(DON).toEqual({ axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 });
    for (let j = -40; j <= 10; j++) {
      const cols: number[] = [];
      for (let i = -10; i <= 20; i++) if (isRiver(TORONTO, i, j)) cols.push(i);
      expect(cols.length, `row ${j}`).toBeGreaterThan(0);
      for (const i of cols) expect(Math.abs(centre(i) - 1500)).toBeLessThan(150 + 130);
    }
    let start: [number, number] = [0, -40];
    for (let i = -10; i <= 20; i++) if (isRiver(TORONTO, i, -40)) { start = [i, -40]; break; }
    const seen = new Set<string>([start.join(',')]);
    const queue: [number, number][] = [start];
    let lake = false;
    while (queue.length && !lake) {
      const [i, j] = queue.shift()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n: [number, number] = [i + di, j + dj];
        if (seen.has(n.join(',')) || n[1] < -41 || n[1] > 30 || !isWater(TORONTO, n[0], n[1])) continue;
        seen.add(n.join(','));
        if (isBay(TORONTO, n[0], n[1])) lake = true;
        queue.push(n);
      }
    }
    expect(lake).toBe(true);
  });

  it('bridges the Don only where an avenue crosses it (z a multiple of 1000), and greens its banks', () => {
    let bridges = 0, banks = 0;
    for (let i = 0; i <= 14; i++) for (let j = -30; j <= 10; j++) {
      const over = isRiver(TORONTO, i, j - 1) && isRiver(TORONTO, i, j) && !isBay(TORONTO, i, j - 1) && !isBay(TORONTO, i, j);
      if (over) {
        const seg = segmentAt(TORONTO, 'x', i, j);
        if (mod(j, 5) === 0) {
          expect(seg?.bridge, `x ${i},${j}`).toBe(true);
          bridges++;
        } else expect(seg, `x ${i},${j}`).toBeNull();
      }
      if (isRiverBank(TORONTO, i, j)) {
        banks++;
        expect(blockDistrict(TORONTO, centre(i), centre(j))).toBe('park');
      }
    }
    expect(bridges).toBeGreaterThan(5);
    expect(banks).toBeGreaterThan(60);
  });

  it('lines the lakeshore with port (condos) from x = 0 to x = 1400 in the core, and all along beyond it', () => {
    for (let i = -10; i <= 12; i++) for (let j = 8; j <= 11; j++) {
      if (isWater(TORONTO, i, j) || isIsland(TORONTO, i, j)) continue;
      const x = centre(i), z = centre(j);
      const coast = coastDistance(TORONTO_LAKE, x, z);
      const want = coast >= 0 && coast <= PORT_DEPTH && x >= WATERFRONT.x0 && x <= WATERFRONT.x1;
      expect(districtAt(x, z) === 'port', `${x},${z}`).toBe(want);
    }
    expect(districtAt(6100, 2100)).toBe('port');
    expect(districtAt(-6100, 2100)).toBe('port');
  });

  it('fills behind and beside the crash with residential midtown, and never builds the crash site as park', () => {
    for (const [x, z] of [[0, -1000], [-1500, 0], [900, -500], [-2000, -2000], [100, 100]] as const) expect(districtAt(x, z), `${x},${z}`).toBe('residential');
    const W = CONFIG.world;
    for (let x = -1000; x <= 1000; x += 100) for (let z = -1000; z <= 1000; z += 100) {
      if (Math.hypot(x, z) < W.clearRadius + W.blockSize) expect(blockDistrict(TORONTO, x, z)).not.toBe('park');
    }
  });

  it('is deterministic', () => {
    for (const [x, z] of [[123, 456], [-9000, 12000], [40000, -3000]] as const) expect(districtAt(x, z)).toBe(districtAt(x, z));
  });

  it('beyond the core: mostly residential and office, with high-rise, park and port, and never neon', () => {
    const n: Record<DistrictId, number> = { highrise: 0, neon: 0, office: 0, residential: 0, park: 0, port: 0 };
    let total = 0;
    for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
      const x = -24000 + i * 400, z = -24000 + j * 400;
      if (Math.hypot(x, z) <= CORE_RADIUS) continue;
      const ci = Math.floor(x / PITCH), cj = Math.floor(z / PITCH);
      if (isWater(TORONTO, ci, cj) || isIsland(TORONTO, ci, cj)) continue;
      n[districtAt(x, z)]++;
      total++;
    }
    for (const d of DISTRICTS) if (d !== 'neon') expect(n[d], d).toBeGreaterThan(0);
    expect(n.neon).toBe(0);
    expect((n.residential + n.office) / total).toBeGreaterThan(0.6);
  });

  it('blockInterior and lotCentre match where generateChunk lays lots (avenue pavement included)', () => {
    expect(blockInterior(-1, 4)).toEqual({ x0: -182, x1: -36, z0: 818, z1: 964 });
    expect(blockInterior(-2, 7)).toEqual({ x0: -382, x1: -218, z0: 1418, z1: 1582 });
    expect(lotCentre(-2, 7, 2, 0, 0)).toEqual({ x: -341, z: 1459 });
    expect(lotCentre(-1, 4, 2, 1, 1)).toEqual({ x: -72.5, z: 927.5 });
  });
});
```

Create `src/cities/toronto/toronto.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS, FACADE } from '../types';
import { TORONTO } from './index';
import { chunksInRadius, generateChunk } from '../../world/chunks';

describe('TORONTO', () => {
  it('has rules for every district at the spec heights; parks build nothing; the port is condos, not a container yard', () => {
    const D = TORONTO.districts;
    for (const d of DISTRICTS) expect(D[d]).toBeDefined();
    expect(D.park.lots).toBe(0);
    expect(D.highrise.height).toEqual([200, 300]);
    expect(D.neon.height).toEqual([40, 90]);
    expect(D.office.height).toEqual([40, 100]);
    expect(D.residential.height).toEqual([10, 22]);
    expect(D.residential.trees).toBe(6);
    expect(D.residential.lots).toBe(4);
    expect(D.port.height).toEqual([80, 160]);
    expect(D.port.yard).toBeUndefined();
  });

  it('keeps billboards rare: chance 0.02 or less in every district', () => {
    for (const d of DISTRICTS) expect(TORONTO.districts[d].billboard, d).toBeLessThanOrEqual(0.02);
  });

  it('removes fewer streets than Tokyo: residential 15%, office 15%, high-rise 10%, parks 40%', () => {
    expect(TORONTO.roadRemoval).toMatchObject({ residential: 0.15, office: 0.15, highrise: 0.1, park: 0.4 });
  });

  it('is a warm evening: dusky sky, peach fog at Tokyo\'s distances, low western sun, warm window glow', () => {
    expect(TORONTO.atmosphere).toEqual({
      skyZenith: 0x4b4a8c, skyHorizon: 0xf2a46b, fog: 0xe9a985,
      hemiSky: 0xffc59a, hemiGround: 0x4a3550, hemiIntensity: 0.8,
      sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 },
      windowGlow: { color: 0xffc46b, strength: 0.45 },
    });
  });

  it('letters its signs in Latin, has no cranes, and paints a greener lake', () => {
    expect(TORONTO.glyphs).toBe('latin');
    expect(TORONTO.cranes).toBe(false);
    expect(TORONTO.colors.water).not.toBe(0x3f8fc9);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const a = new THREE.Color(), b = new THREE.Color();
    for (const s of TORONTO.signColors) for (const t of [CONFIG.palette.chevron, 0xff3b2f]) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('generates no container cranes and no container facades along the lakeshore', () => {
    let built = 0;
    for (const r of chunksInRadius(0, 2100, 3000)) {
      const c = generateChunk(TORONTO, 1337, r.cx, r.cz);
      expect(c.cranes).toEqual([]);
      for (const b of c.buildings) expect(b.facade).not.toBe(FACADE.container);
      built += c.buildings.length;
    }
    expect(built).toBeGreaterThan(100);
  });

  it('generates the same chunk from the same inputs', () => {
    expect(generateChunk(TORONTO, 1337, -1, 2)).toEqual(generateChunk(TORONTO, 1337, -1, 2));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cities/toronto`
Expected: FAIL with "Failed to resolve import './layout'" and "Failed to resolve import './index'".

- [ ] **Step 3: Write `src/cities/toronto/layout.ts`**

```ts
import { CONFIG } from '../../config';
import { valueNoise } from '../noise';
import { coastDistance } from '../coast';
import type { BaySpec, DistrictId, IslandSpec, RiverSpec } from '../types';
import { AVENUE_WIDTH, PITCH, isIsland, lineWidth } from '../../world/roads';
import { AVENUE_PAVEMENT } from '../../world/chunks';

/**
 * World metres from the crash. Toronto's +Z is south (toward the lake), so +X is east (the player's left at play
 * start) and −X west (their right). The start camera looks down Yonge Street (x = 0) toward the lake.
 */
export const YONGE_DUNDAS = { x: -100, z: 900 } as const;
export const FINANCIAL = { x: -300, z: 1500 } as const;
/** City Hall stands in the south of its block; Nathan Phillips Square is the paved strip north of it (the camera side). */
export const CITY_HALL_SITE = { x: -500, z: 1135 } as const;
export const CN_TOWER_SITE = { x: -700, z: 1900 } as const;
/** Centred on the interior of block (−1200..−1000, 1800..2000), whose east and south sides are avenues. */
export const ROGERS_CENTRE_SITE = { x: -1110, z: 1890 } as const;
/** Lake Ontario: everything south of a gently wavering line near z = 2250 (land ends at z = 2200 almost everywhere). */
export const TORONTO_LAKE: BaySpec = { dir: { x: 0, z: 1 }, offset: 2250, amp: 60, wavelength: 1500 };
/** The Toronto Islands: long and low, east–west, one lake row offshore. */
export const TORONTO_ISLANDS: IslandSpec = { center: { x: -300, z: 2900 }, halfAlong: 250, halfAcross: 900 };
/** The Don: north–south, east of downtown, its banks a green ravine. */
export const DON: RiverSpec = { axis: 'z', c0: 1500, amp: 150, wavelength: 1100, halfWidth: 130, bankPark: 1 };
/** The lakeshore band: land within this many metres of the coastline. */
export const PORT_DEPTH = 400;
/** Inside the core, the lakeshore band is port (quays and condos) only between these x. */
export const WATERFRONT = { x0: 0, x1: 1400 } as const;
/** Inside this radius the districts are laid by hand (CORE_REGIONS); beyond it, noise. */
export const CORE_RADIUS = 4000;

type Region = { district: DistrictId } & ({ x0: number; z0: number; x1: number; z1: number } | { x: number; z: number; r: number });

/** The hand-laid core. First match wins; unmatched core points are residential midtown. */
const CORE_REGIONS: readonly Region[] = [
  // Yonge-Dundas: the one neon block, just west of Yonge.
  { district: 'neon', x0: -200, z0: 800, x1: 0, z1: 1000 },
  // The Financial District: the block at its centre and its four neighbours.
  { district: 'highrise', x: FINANCIAL.x, z: FINANCIAL.z, r: 250 },
  // Downtown: from the City Hall row to the lake, west of the Don's banks.
  { district: 'office', x0: -1800, z0: 1000, x1: 1200, z1: 2400 },
];

const inRegion = (r: Region, x: number, z: number): boolean =>
  'r' in r ? Math.hypot(x - r.x, z - r.z) <= r.r : x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const SEED = CONFIG.world.seed + 601;

/**
 * Toronto's district at world point (x, z). The islands are park. The lakeshore band (PORT_DEPTH of the coast, off
 * the crash site) is port: in the core only on the waterfront, beyond it all along. Then the hand-laid core, residential
 * where unmatched, and seeded noise beyond. The Don's bank parks are applied on top by blockDistrict.
 */
export function districtAt(x: number, z: number): DistrictId {
  const cell = CONFIG.world.blockSize;
  if (isIsland({ bay: TORONTO_LAKE, island: TORONTO_ISLANDS }, Math.floor(x / cell), Math.floor(z / cell))) return 'park';
  const r = Math.hypot(x, z);
  const coast = coastDistance(TORONTO_LAKE, x, z);
  const lakeshore = coast >= 0 && coast <= PORT_DEPTH && r > CONFIG.world.clearRadius + cell;
  if (lakeshore && (r > CORE_RADIUS || (x >= WATERFRONT.x0 && x <= WATERFRONT.x1))) return 'port';
  if (r <= CORE_RADIUS) {
    for (const reg of CORE_REGIONS) if (inRegion(reg, x, z)) return reg.district;
    return 'residential';
  }
  if (valueNoise(x, z, 2600, SEED + 3) > 0.8) return 'highrise';
  if (valueNoise(x, z, 900, SEED + 4) > 0.8) return 'park';
  return valueNoise(x, z, 1400, SEED + 5) < 0.62 ? 'residential' : 'office';
}

/** The buildable interior of block (ci, cj), as generateChunk lays lots: inset by half of each bordering line, plus pavement beside an avenue. */
export function blockInterior(ci: number, cj: number): { x0: number; x1: number; z0: number; z1: number } {
  const inset = (line: number) => lineWidth(line) / 2 + (lineWidth(line) === AVENUE_WIDTH ? AVENUE_PAVEMENT : 0);
  return { x0: PITCH * ci + inset(ci), x1: PITCH * (ci + 1) - inset(ci + 1), z0: PITCH * cj + inset(cj), z1: PITCH * (cj + 1) - inset(cj + 1) };
}

/** Centre of lot (a, b) of an n × n grid over block (ci, cj)'s interior. */
export function lotCentre(ci: number, cj: number, n: number, a: number, b: number): { x: number; z: number } {
  const r = blockInterior(ci, cj);
  return { x: r.x0 + ((a + 0.5) * (r.x1 - r.x0)) / n, z: r.z0 + ((b + 0.5) * (r.z1 - r.z0)) / n };
}
```

- [ ] **Step 4: Write `src/cities/toronto/districts.ts`**

```ts
import { FACADE, type DistrictId, type DistrictRules } from '../types';

/** Toronto's districts: brick midtown, warm stone offices, dark glass towers, pale condos on the lake. */
export const TORONTO_DISTRICTS: Record<DistrictId, DistrictRules> = {
  // The Financial District: dark blue-black and green-black glass (the hand-placed lots add gold and white).
  highrise: {
    lots: 2, fill: 0.5, minPerBlock: 1, height: [200, 300], heightCurve: 1.2, footprint: [0.75, 0.92],
    facades: [FACADE.glass, FACADE.glass, FACADE.office], colors: [0x2b3a4a, 0x22302c, 0x313844, 0x1f2a35, 0x3a4a52],
    signs: 0, billboard: 0.02, trees: 2,
  },
  // Yonge-Dundas: low brick and cream shop blocks with blades (its screens and billboards are hand-placed).
  neon: {
    lots: 3, fill: 0.7, minPerBlock: 4, height: [40, 90], heightCurve: 1.1, footprint: [0.75, 0.92],
    facades: [FACADE.shop, FACADE.office, FACADE.shop], colors: [0xb5543c, 0x8a4a3a, 0xd9c8a8, 0x6e3b32, 0xe0d6c2],
    signs: 1.5, billboard: 0.02, trees: 0,
  },
  // Warm grey stone and buff brick.
  office: {
    lots: 2, fill: 0.85, minPerBlock: 2, height: [40, 100], heightCurve: 1.3, footprint: [0.7, 0.9],
    facades: [FACADE.office, FACADE.office, FACADE.glass], colors: [0xb8ada0, 0xc9b48a, 0xa89f94, 0xd2c09a, 0x9c9389],
    signs: 0.1, billboard: 0.01, trees: 4,
  },
  // Midtown: small red, brown and dark-red brick houses, some cream stone, on leafy streets.
  residential: {
    lots: 4, fill: 0.55, minPerBlock: 4, height: [10, 22], heightCurve: 1.4, footprint: [0.55, 0.75],
    facades: [FACADE.balcony], colors: [0xa4442f, 0x8c3b2a, 0x7a2f24, 0xb5583c, 0x6b2a22, 0xd8c7a3],
    signs: 0, billboard: 0, trees: 6,
  },
  park: {
    lots: 0, fill: 0, minPerBlock: 0, height: [0, 0], heightCurve: 1, footprint: [0, 0],
    facades: [FACADE.office], colors: [0xffffff], signs: 0, billboard: 0, trees: 0,
  },
  // The waterfront: pale glass and teal condo towers on quay paving; no yard, so no containers or cranes.
  port: {
    lots: 2, fill: 0.7, minPerBlock: 1, height: [80, 160], heightCurve: 1.2, footprint: [0.6, 0.85],
    facades: [FACADE.glass, FACADE.balcony, FACADE.glass], colors: [0xcfe3e6, 0x9fd0cf, 0x6fb3b0, 0xe2ecec, 0x8cc4c9],
    signs: 0, billboard: 0, trees: 0,
  },
};
```

- [ ] **Step 5: Write `src/cities/toronto/index.ts`**

```ts
import type { CityStyle } from '../types';
import { TORONTO_DISTRICTS } from './districts';
import { DON, TORONTO_ISLANDS, TORONTO_LAKE, districtAt } from './layout';

export const TORONTO: CityStyle = {
  id: 'toronto',
  name: 'Toronto',
  colors: {
    paved: 0x9a948c,
    pavedSpeck: 0x8a847c,
    park: 0x5f9a43,
    road: 0x4f4b48,
    roadLine: 0xeeeae0,
    crosswalk: 0xf0ece2,
    roof: 0x5e5550,
    tree: 0x3f7a2f,
    quay: 0xb3aa9a,
    water: 0x3d8fa8,
  },
  // Warm white, amber, cyan, magenta, mint: no reds (they belong to threats).
  signColors: [0xfff4d6, 0xffc23a, 0x35e8ff, 0xff3fb4, 0x5cf2a0],
  districtAt,
  districts: TORONTO_DISTRICTS,
  parkTrees: [20, 28],
  landmarks: [],
  specialLots: [],
  overlays: [],
  river: DON,
  bay: TORONTO_LAKE,
  island: TORONTO_ISLANDS,
  // A very regular grid: fewer removed streets than Tokyo (neon and port per Ruling R8).
  roadRemoval: { highrise: 0.1, neon: 0.1, office: 0.15, residential: 0.15, park: 0.4, port: 0.15 },
  keepNodes: [],
  // A warm evening: the sun low in the west (−X), so shadows fall long to the east.
  atmosphere: {
    skyZenith: 0x4b4a8c,
    skyHorizon: 0xf2a46b,
    fog: 0xe9a985,
    hemiSky: 0xffc59a,
    hemiGround: 0x4a3550,
    hemiIntensity: 0.8,
    sun: 0xffa25a,
    sunIntensity: 2,
    sunDir: { x: -0.9, y: 0.3, z: 0.2 },
    windowGlow: { color: 0xffc46b, strength: 0.45 },
  },
  glyphs: 'latin',
  cranes: false,
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/cities/toronto`
Expected: PASS (both files green).

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/cities/toronto
git commit -m "Toronto layout and style: lake, islands, the Don, districts and a warm evening

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Landmarks: CN Tower, Rogers Centre, City Hall

**Files:**
- Create: `src/cities/shapes.ts`, `src/cities/toronto/cnTower.ts`, `src/cities/toronto/rogersCentre.ts`,
  `src/cities/toronto/cityHall.ts`
- Modify: `src/cities/toronto/index.ts` (`landmarks`)
- Test: `src/cities/toronto/toronto.test.ts`

**Interfaces:**
- Consumes: Task 4's `CN_TOWER_SITE`, `ROGERS_CENTRE_SITE`, `CITY_HALL_SITE`, `TORONTO`.
- Produces:
  ```ts
  // src/cities/shapes.ts
  export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): THREE.BufferGeometry;
  export function ring(r0: number, r1: number, y0: number, y1: number, color: number, sides?: number): THREE.BufferGeometry;
  export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
  // toronto
  export const CN_TOWER: { w: 100; d: 100; h: 720 }; export function cnTowerGeometry(): THREE.BufferGeometry;
  export const ROGERS_CENTRE: { w: 144; d: 144; h: 70 }; export function rogersCentreGeometry(): THREE.BufferGeometry;
  export const CITY_HALL: { w: 130; d: 90; h: 130 }; export function cityHallGeometry(): THREE.BufferGeometry;
  // landmark ids: 'cn-tower', 'rogers-centre', 'city-hall'
  ```

- [ ] **Step 1: Write the failing landmark tests**

Append to `src/cities/toronto/toronto.test.ts`. Add these imports:

```ts
import { CN_TOWER_SITE, CITY_HALL_SITE, ROGERS_CENTRE_SITE } from './layout';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
import { PITCH, isIsland, isWater, lineWidth } from '../../world/roads';
import { gameplayPose } from '../../intro/timeline';
```

and the tests:

```ts
describe('Toronto landmarks', () => {
  const W = CONFIG.world;
  const INNER = W.blockSize - W.roadWidth;
  const blockOf = (v: number) => Math.floor(v / W.blockSize);
  const at = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;
  const down = (g: THREE.BufferGeometry, x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)).intersectObject(new THREE.Mesh(g, new THREE.MeshBasicMaterial()))[0];

  it('lists the CN Tower, Rogers Centre and City Hall at their sites and sizes', () => {
    expect(TORONTO.landmarks.map((l) => l.id)).toEqual(['cn-tower', 'rogers-centre', 'city-hall']);
    expect(at('cn-tower')).toMatchObject({ ...CN_TOWER_SITE, ...CN_TOWER });
    expect(at('rogers-centre')).toMatchObject({ ...ROGERS_CENTRE_SITE, ...ROGERS_CENTRE });
    expect(at('city-hall')).toMatchObject({ ...CITY_HALL_SITE, ...CITY_HALL });
    expect(CN_TOWER_SITE).toEqual({ x: -700, z: 1900 });
    expect(CN_TOWER.h).toBe(720);
  });

  it('fits each inside one block clear of its roads, on land, and out of the crater', () => {
    for (const l of TORONTO.landmarks) {
      const ci = blockOf(l.x), cj = blockOf(l.z);
      expect(blockOf(l.x - l.w / 2), l.id).toBe(blockOf(l.x + l.w / 2));
      expect(blockOf(l.z - l.d / 2), l.id).toBe(blockOf(l.z + l.d / 2));
      expect(l.w).toBeLessThanOrEqual(INNER);
      expect(l.d).toBeLessThanOrEqual(INNER);
      expect(l.x - l.w / 2, l.id).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2);
      expect(l.x + l.w / 2, l.id).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2);
      expect(l.z - l.d / 2, l.id).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2);
      expect(l.z + l.d / 2, l.id).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2);
      expect(isWater(TORONTO, ci, cj), l.id).toBe(false);
      expect(isIsland(TORONTO, ci, cj), l.id).toBe(false);
      expect(Math.hypot(PITCH * (ci + 0.5), PITCH * (cj + 0.5)), l.id).toBeGreaterThanOrEqual(W.clearRadius + W.blockSize * 0.5);
    }
  });

  it('gives each landmark to exactly one chunk, and builds nothing else on its block', () => {
    for (const l of TORONTO.landmarks) {
      let owners = 0;
      for (const r of chunksInRadius(l.x, l.z, 1600)) {
        const c = generateChunk(TORONTO, 1337, r.cx, r.cz);
        owners += c.landmarks.filter((m) => m.id === l.id).length;
        for (const b of c.buildings) expect(blockOf(b.x) === blockOf(l.x) && blockOf(b.z) === blockOf(l.z), l.id).toBe(false);
      }
      expect(owners, l.id).toBe(1);
    }
  });

  it('builds the CN Tower 720 m tall from y = 0, within its footprint, vertex-coloured, its main pod about two-thirds up', () => {
    const g = cnTowerGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(720);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(CN_TOWER.w);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(CN_TOWER.d);
    expect(g.getAttribute('color')).toBeDefined();
    const pod = down(g, 25, 0)!;
    expect(pod.point.y / 720).toBeGreaterThan(0.6);
    expect(pod.point.y / 720).toBeLessThan(0.7);
    // The antenna is thin: just off its axis, a ray only meets the SkyPod below it.
    expect(down(g, 9, 0)!.point.y).toBeLessThan(610);
  });

  it('builds the Rogers Centre as a 144 m drum about 70 m tall from y = 0, vertex-coloured', () => {
    const g = rogersCentreGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(70);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(ROGERS_CENTRE.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(ROGERS_CENTRE.d + 0.01);
    expect(g.getAttribute('color')).toBeDefined();
    // The roof is domed: higher at the centre than near the rim.
    expect(down(g, 0, 0)!.point.y).toBeGreaterThan(down(g, 62, 0)!.point.y + 5);
  });

  it('builds City Hall: the east (+X) tower 130 m, the west 105 m, a saucer low between them', () => {
    const g = cityHallGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(130);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(CITY_HALL.w);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(CITY_HALL.d);
    expect(g.getAttribute('color')).toBeDefined();
    expect(down(g, 52, 3)!.point.y).toBeGreaterThan(125);
    expect(down(g, -52, 3)!.point.y).toBeGreaterThan(100);
    expect(down(g, -52, 3)!.point.y).toBeLessThan(110);
    const saucer = down(g, 0, 0)!.point.y;
    expect(saucer).toBeGreaterThan(20);
    expect(saucer).toBeLessThan(35);
  });

  it('frames the CN Tower in the opening gameplay view (as Tokyo Tower is framed)', () => {
    const pose = gameplayPose();
    const cam = new THREE.PerspectiveCamera(CONFIG.camera.baseVFovDeg, 16 / 10, CONFIG.camera.near, CONFIG.camera.far);
    cam.position.copy(pose.pos);
    cam.lookAt(pose.look);
    cam.updateMatrixWorld();
    const tower = at('cn-tower');
    const p = new THREE.Vector3(tower.x, tower.h / 2, tower.z).project(cam);
    expect(Math.abs(p.x)).toBeLessThan(0.9);
    expect(Math.abs(p.y)).toBeLessThan(0.9);
    expect(p.z).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cities/toronto/toronto.test.ts`
Expected: FAIL with "Failed to resolve import './cnTower'".

- [ ] **Step 3: Shared shape helpers**

Create `src/cities/shapes.ts`:

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';

/** A faceted, vertex-coloured box from (x0, y0, z0) to (x1, y1, z1). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): THREE.BufferGeometry {
  return painted(faceted(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), color);
}

/** A faceted, vertex-coloured `sides`-gon prism or frustum on the y axis from y0 to y1, corner radius r0 at the bottom to r1 at the top. */
export function ring(r0: number, r1: number, y0: number, y1: number, color: number, sides = 12): THREE.BufferGeometry {
  return painted(faceted(new THREE.CylinderGeometry(r1, r0, y1 - y0, sides).translate(0, (y0 + y1) / 2, 0)), color);
}

/** Merge vertex-coloured parts into one geometry (uvs dropped) and free the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
```

- [ ] **Step 4: The CN Tower**

Create `src/cities/toronto/cnTower.ts`:

```ts
import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** Drawn 1.3 × life size (like Tokyo Tower): 720 m to the antenna tip, the tallest structure in either city. */
export const CN_TOWER = { w: 100, d: 100, h: 720 } as const;
const CONCRETE = 0xd9d2c5;
const CONCRETE_DARK = 0xbfb6a6;
const GLASS = 0x2e3a4a;
const LIGHT = 0xffd98a;
const RED = 0xd8322a;
const WHITE = 0xf2f0ea;

/**
 * The CN Tower: a pale warm-grey three-sided shaft with three fins at the base stepping in as they rise; about
 * two-thirds up, the main pod (a flared underside, a dark glass band, a glowing light band, a white crown); the
 * smaller SkyPod above; a thin red-and-white antenna to the tip. Base centre at the origin, +Y up, vertex-coloured.
 */
export function cnTowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Three fins 120° apart, each tier reaching less far: the Y-shaped base tapering into the shaft. A fin runs along
  // local +x from the axis; rotateY turns it out from each face of the three-sided shaft.
  const tiers = [[0, 70, 46], [70, 160, 34], [160, 280, 24], [280, 400, 17]] as const;
  for (const [y0, y1, reach] of tiers) {
    for (let k = 0; k < 3; k++) parts.push(box(0, y0, -4.5, reach, y1, 4.5, CONCRETE).rotateY(Math.PI / 2 + (k * 2 * Math.PI) / 3));
  }
  parts.push(ring(18, 12, 0, 430, CONCRETE, 3));
  // Main pod.
  parts.push(ring(12, 34, 420, 436, CONCRETE_DARK, 16));
  parts.push(ring(34, 34, 436, 448, GLASS, 16));
  parts.push(ring(35, 35, 448, 452, LIGHT, 16));
  parts.push(ring(34, 30, 452, 466, WHITE, 16));
  parts.push(ring(30, 12, 466, 476, CONCRETE, 16));
  // Upper shaft and the SkyPod.
  parts.push(ring(10, 7, 476, 580, CONCRETE, 6));
  parts.push(ring(8, 13, 580, 586, CONCRETE_DARK, 12), ring(13, 13, 586, 594, GLASS, 12), ring(13, 6, 594, 600, WHITE, 12));
  // Antenna: red and white bands, tapering to the tip at CN_TOWER.h.
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const y0 = 600 + ((CN_TOWER.h - 600) * k) / bands;
    const y1 = 600 + ((CN_TOWER.h - 600) * (k + 1)) / bands;
    parts.push(ring(4.5 - (3.5 * k) / bands, 4.5 - (3.5 * (k + 1)) / bands, y0, y1, k % 2 ? WHITE : RED, 6));
  }
  return merge(parts);
}
```

- [ ] **Step 5: The Rogers Centre**

Create `src/cities/toronto/rogersCentre.ts`:

```ts
import type * as THREE from 'three';
import { merge, ring } from '../shapes';

/** 144 m across (the largest drum its avenue-side block holds; Ruling R1), about 70 m tall. */
export const ROGERS_CENTRE = { w: 144, d: 144, h: 70 } as const;
const WALL = 0xe4e0d8;
const BAND = 0x3a4048;
const ROOF_A = 0xf0eeea;
const ROOF_B = 0xd6d3cc;
const SIDES = 24;
/** Wall radius; the window bands stand 1 m proud of it, out to the footprint's edge. */
const R = 71;

/** The Rogers Centre: a low round drum, pale walls with dark window bands, and a slightly domed roof of pale segmented panels. */
export function rogersCentreGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [ring(R, R, 0, 52, WALL, SIDES)];
  for (const y of [12, 26, 40]) parts.push(ring(R + 1, R + 1, y, y + 5, BAND, SIDES));
  // The roof: four panel rings stepping in and up to the crown, alternating two pale tones.
  const roof = [[R, 60, 52, 58], [60, 46, 58, 63], [46, 30, 63, 67], [30, 12, 67, 70]] as const;
  roof.forEach(([r0, r1, y0, y1], k) => parts.push(ring(r0, r1, y0, y1, k % 2 ? ROOF_B : ROOF_A, SIDES)));
  return merge(parts);
}
```

- [ ] **Step 6: City Hall**

Create `src/cities/toronto/cityHall.ts`:

```ts
import type * as THREE from 'three';
import { box, merge, ring } from '../shapes';

/** 1.3 × life size. Footprint x × z and the taller tower's height. */
export const CITY_HALL = { w: 130, d: 90, h: 130 } as const;
const CONCRETE = 0xe2ddd2;
const GLASS = 0x34404c;
const RIB = 0xf2efe8;
const PODIUM = 0xcfc9bd;
const WHITE = 0xf6f4ef;
/** The east (+X) tower is the taller. */
const TOWERS = [{ side: 1, h: 130 }, { side: -1, h: 105 }] as const;
/** Each tower is an arc about the complex's centre: radius, wall thickness, half its angular spread, segments. */
const ARC_R = 52;
const THICK = 14;
const SPREAD = Math.PI / 4;
const SEGMENTS = 8;

/**
 * Toronto City Hall: two pale concrete towers curving toward each other like brackets (arcs about the centre, their
 * concave inner faces dark glass with pale vertical ribs), and a white saucer-shaped council chamber on a low podium
 * between them. Base centre at the origin, +Y up, vertex-coloured.
 */
export function cityHallGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(-55, 0, -30, 55, 10, 30, PODIUM)];
  for (const { side, h } of TOWERS) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a0 = -SPREAD + (2 * SPREAD * k) / SEGMENTS;
      const a1 = a0 + (2 * SPREAD) / SEGMENTS;
      const am = (a0 + a1) / 2;
      // A chord of the arc, a little long so neighbouring segments overlap.
      const len = 2 * ARC_R * Math.sin((a1 - a0) / 2) + 0.6;
      const theta = side > 0 ? am : Math.PI - am;
      // Local x runs out from the centre, local z along the arc; rotateY(−θ) turns local +x onto (cos θ, 0, sin θ).
      const place = (g: THREE.BufferGeometry, r: number) => g.rotateY(-theta).translate(r * Math.cos(theta), 0, r * Math.sin(theta));
      parts.push(place(box(-THICK / 2, 0, -len / 2, THICK / 2, h, len / 2, CONCRETE), ARC_R));
      parts.push(place(box(-0.6, 4, -len / 2, 0.6, h - 4, len / 2, GLASS), ARC_R - THICK / 2 - 0.6));
      parts.push(place(box(-1.2, 4, -0.6, 1.2, h - 2, 0.6, RIB), ARC_R - THICK / 2 - 1));
    }
  }
  // The council chamber: a white saucer on a short stem.
  parts.push(ring(8, 8, 10, 16, CONCRETE, 12), ring(10, 26, 16, 22, WHITE, 16), ring(26, 24, 22, 24, WHITE, 16), ring(24, 8, 24, 30, WHITE, 16));
  return merge(parts);
}
```

- [ ] **Step 7: List the landmarks**

In `src/cities/toronto/index.ts`, extend the layout import with `CITY_HALL_SITE, CN_TOWER_SITE, ROGERS_CENTRE_SITE`, add

```ts
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
```

and replace `landmarks: [],` with

```ts
  landmarks: [
    { id: 'cn-tower', x: CN_TOWER_SITE.x, z: CN_TOWER_SITE.z, w: CN_TOWER.w, d: CN_TOWER.d, h: CN_TOWER.h, build: cnTowerGeometry },
    { id: 'rogers-centre', x: ROGERS_CENTRE_SITE.x, z: ROGERS_CENTRE_SITE.z, w: ROGERS_CENTRE.w, d: ROGERS_CENTRE.d, h: ROGERS_CENTRE.h, build: rogersCentreGeometry },
    { id: 'city-hall', x: CITY_HALL_SITE.x, z: CITY_HALL_SITE.z, w: CITY_HALL.w, d: CITY_HALL.d, h: CITY_HALL.h, build: cityHallGeometry },
  ],
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/cities/toronto`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/cities/shapes.ts src/cities/toronto
git commit -m "Toronto landmarks: the CN Tower, Rogers Centre and City Hall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Financial District, Yonge-Dundas and Nathan Phillips Square

**Files:**
- Create: `src/cities/toronto/financial.ts`, `src/cities/toronto/yongeDundas.ts`, `src/cities/toronto/square.ts`
- Modify: `src/cities/toronto/index.ts` (`specialLots`, `overlays`), `src/world/pixelTextures.ts` (register
  `'nathan-phillips'`, `paintRects`, `squareTexture`)
- Test: `src/cities/toronto/toronto.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `overlayPainter`, `LATIN_FONT`.
  - Task 4: `lotCentre`, `blockInterior`, `CITY_HALL_SITE`, `districtAt`.
  - Task 5: `CITY_HALL`.
- Produces:
  ```ts
  // src/cities/toronto/financial.ts
  export const GOLD: number;
  export const FIRST_CANADIAN_PLACE: BuildingSpec;
  export const ROYAL_BANK_PLAZA: BuildingSpec[];     // 6 boxes: two towers × three staggered boxes
  export const FINANCIAL_LOTS: BuildingSpec[];       // FCP, RBP, then 9 dark towers
  // src/cities/toronto/yongeDundas.ts
  export const YD_BLOCK: { ci: -1; cj: 4 };
  export const YONGE_DUNDAS_LOTS: BuildingSpec[];    // 4 kept shop blocks with screens, billboards, blades
  // src/cities/toronto/square.ts
  export type PaintRect = { x: number; y: number; w: number; h: number; color: number };
  export const SQUARE_PX = 128;
  export const SQUARE_LAYOUT: { pool: {x,y,w,h}; rim: 2; strip: {x,y,w,h} };
  export const NATHAN_PHILLIPS: GroundOverlay;       // { id: 'nathan-phillips', x: -500, z: 1106, size: 140 }
  export function letterRects(): (PaintRect & { letter: number })[];
  export function squareRects(): PaintRect[];
  // src/world/pixelTextures.ts
  export function squareTexture(): THREE.CanvasTexture;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/cities/toronto/toronto.test.ts`. Add these imports:

```ts
import { CITY_HALL } from './cityHall';
import { blockInterior, districtAt } from './layout';
import { FIRST_CANADIAN_PLACE, FINANCIAL_LOTS, GOLD, ROYAL_BANK_PLAZA } from './financial';
import { YD_BLOCK, YONGE_DUNDAS_LOTS } from './yongeDundas';
import { NATHAN_PHILLIPS, SQUARE_LAYOUT, SQUARE_PX, letterRects, squareRects } from './square';
import { LATIN_FONT } from '../../world/latinFont';
import { overlayPainter } from '../../world/pixelTextures';
import type { BuildingSpec } from '../types';
```

(Merge `blockInterior, districtAt` into the existing `./layout` import, and `CITY_HALL` into the existing `./cityHall`
import.) Then add:

```ts
describe('hand-placed lots', () => {
  const blockOf = (v: number) => Math.floor(v / CONFIG.world.blockSize);
  const dark = FINANCIAL_LOTS.filter((b) => b !== FIRST_CANADIAN_PLACE && !ROYAL_BANK_PLAZA.includes(b));

  it('puts 8–10 dark glass towers 200–300 m tall in the Financial District, all kept through the crash', () => {
    expect(dark.length).toBeGreaterThanOrEqual(8);
    expect(dark.length).toBeLessThanOrEqual(10);
    for (const b of dark) {
      expect(b.h).toBeGreaterThanOrEqual(200);
      expect(b.h).toBeLessThanOrEqual(300);
      const c = new THREE.Color(b.color);
      expect(c.r + c.g + c.b).toBeLessThan(0.15);
      expect(districtAt(CONFIG.world.blockSize * (blockOf(b.x) + 0.5), CONFIG.world.blockSize * (blockOf(b.z) + 0.5))).toBe('highrise');
    }
    for (const b of TORONTO.specialLots) expect(b.keep).toBe(true);
  });

  it('makes First Canadian Place the tallest of all, a white slab', () => {
    expect(FIRST_CANADIAN_PLACE.h).toBe(Math.max(...TORONTO.specialLots.map((b) => b.h)));
    expect(FIRST_CANADIAN_PLACE.h).toBeLessThanOrEqual(300);
    expect(FIRST_CANADIAN_PLACE.w).not.toBe(FIRST_CANADIAN_PLACE.d);
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(FIRST_CANADIAN_PLACE.color).getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.l).toBeGreaterThan(0.85);
  });

  it('builds the Royal Bank Plaza as two gold towers, each three staggered boxes stepping down (saw-tooth edges)', () => {
    expect(ROYAL_BANK_PLAZA).toHaveLength(6);
    for (const b of ROYAL_BANK_PLAZA) expect(b.color).toBe(GOLD);
    for (const tower of [ROYAL_BANK_PLAZA.slice(0, 3), ROYAL_BANK_PLAZA.slice(3)]) {
      for (let k = 1; k < 3; k++) {
        expect(tower[k]!.x).toBeGreaterThan(tower[k - 1]!.x);
        expect(tower[k]!.z).toBeGreaterThan(tower[k - 1]!.z);
        expect(tower[k]!.h).toBeLessThan(tower[k - 1]!.h);
      }
    }
  });

  it('fills the Yonge-Dundas block with four kept shop blocks 40–90 m: a screen toward the crash, a roof billboard and a blade each', () => {
    expect(YONGE_DUNDAS_LOTS).toHaveLength(4);
    for (const b of YONGE_DUNDAS_LOTS) {
      expect([blockOf(b.x), blockOf(b.z)]).toEqual([YD_BLOCK.ci, YD_BLOCK.cj]);
      expect(b.h).toBeGreaterThanOrEqual(40);
      expect(b.h).toBeLessThanOrEqual(90);
      const screen = b.signs.find((s) => s.kind === 'screen')!;
      expect(screen.lz).toBeLessThan(-b.d / 2);
      expect([3, 4, 5]).toContain(b.signs.find((s) => s.kind === 'billboard')!.cell);
      const blade = b.signs.find((s) => s.kind === 'vertical')!;
      expect([0, 1, 2]).toContain(blade.cell);
      expect(TORONTO.signColors).toContain(blade.color);
    }
  });

  it('keeps every hand-placed lot inside its block interior (clear of roads and avenue pavement)', () => {
    for (const b of TORONTO.specialLots) {
      const r = blockInterior(blockOf(b.x), blockOf(b.z));
      const msg = `${b.x},${b.z}`;
      expect(b.x - b.w / 2, msg).toBeGreaterThanOrEqual(r.x0 - 1e-9);
      expect(b.x + b.w / 2, msg).toBeLessThanOrEqual(r.x1 + 1e-9);
      expect(b.z - b.d / 2, msg).toBeGreaterThanOrEqual(r.z0 - 1e-9);
      expect(b.z + b.d / 2, msg).toBeLessThanOrEqual(r.z1 + 1e-9);
    }
  });

  it('generates every hand-placed lot exactly, with no random building overlapping one', () => {
    const all: BuildingSpec[] = [];
    for (const r of chunksInRadius(-200, 1200, 1200)) all.push(...generateChunk(TORONTO, 1337, r.cx, r.cz).buildings);
    const isSpecial = (b: BuildingSpec) => TORONTO.specialLots.some((s) => s.x === b.x && s.z === b.z && s.h === b.h);
    expect(all.filter(isSpecial)).toHaveLength(TORONTO.specialLots.length);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of all.filter(isSpecial)) for (const b of all.filter((b) => !isSpecial(b))) expect(overlaps(s, b)).toBe(false);
  });

  it('puts video screens only on the Yonge-Dundas lots', () => {
    for (const r of chunksInRadius(0, 1500, 3000)) {
      for (const b of generateChunk(TORONTO, 1337, r.cx, r.cz).buildings) {
        if (b.signs.some((s) => s.kind === 'screen')) expect(YONGE_DUNDAS_LOTS.some((y) => y.x === b.x && y.z === b.z)).toBe(true);
      }
    }
  });
});

describe('Nathan Phillips Square', () => {
  const ov = NATHAN_PHILLIPS;
  const worldX = (px: number) => ov.x - ov.size / 2 + (px * ov.size) / SQUARE_PX;
  const worldZ = (py: number) => ov.z - ov.size / 2 + (py * ov.size) / SQUARE_PX;
  const hall = TORONTO.landmarks.find((l) => l.id === 'city-hall')!;

  it("is City Hall's block's ground decal, inside the block's interior, off every road", () => {
    expect(TORONTO.overlays).toEqual([NATHAN_PHILLIPS]);
    expect(ov).toEqual({ id: 'nathan-phillips', x: -500, z: 1106, size: 140 });
    const r = blockInterior(Math.floor(hall.x / 200), Math.floor(hall.z / 200));
    expect(ov.x - ov.size / 2).toBeGreaterThanOrEqual(r.x0);
    expect(ov.x + ov.size / 2).toBeLessThanOrEqual(r.x1);
    expect(ov.z - ov.size / 2).toBeGreaterThanOrEqual(r.z0);
    expect(ov.z + ov.size / 2).toBeLessThanOrEqual(r.z1);
  });

  it('paves the whole decal and sets the rimmed pool and the TORONTO strip on the plaza in front of City Hall (camera side)', () => {
    const rects = squareRects();
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: SQUARE_PX, h: SQUARE_PX });
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SQUARE_PX);
      expect(r.y + r.h).toBeLessThanOrEqual(SQUARE_PX);
    }
    const { pool, rim, strip } = SQUARE_LAYOUT;
    const front = hall.z - CITY_HALL.d / 2;
    for (const r of [{ x: pool.x - rim, y: pool.y - rim, w: pool.w + 2 * rim, h: pool.h + 2 * rim }, strip]) {
      expect(worldZ(r.y)).toBeGreaterThanOrEqual(blockInterior(-3, 5).z0);
      expect(worldZ(r.y + r.h)).toBeLessThanOrEqual(front);
      expect(worldX(r.x)).toBeGreaterThan(hall.x - CITY_HALL.w / 2);
      expect(worldX(r.x + r.w)).toBeLessThan(hall.x + CITY_HALL.w / 2);
    }
  });

  it('spells TORONTO on the strip, readable from the start camera: letters run toward −x, glyph tops toward +z', () => {
    const ink = letterRects();
    const word = 'TORONTO';
    const { strip } = SQUARE_LAYOUT;
    for (let k = 0; k < word.length; k++) {
      const mine = ink.filter((r) => r.letter === k);
      const want = LATIN_FONT[word[k]!]!.join('').split('').filter((c) => c === '1').length;
      expect(mine, word[k]).toHaveLength(want);
      for (const r of mine) {
        expect(r.x).toBeGreaterThanOrEqual(strip.x);
        expect(r.x + r.w).toBeLessThanOrEqual(strip.x + strip.w);
        expect(r.y).toBeGreaterThanOrEqual(strip.y);
        expect(r.y + r.h).toBeLessThanOrEqual(strip.y + strip.h);
      }
    }
    const xs = (k: number) => ink.filter((r) => r.letter === k).map((r) => r.x);
    expect(Math.min(...xs(0))).toBeGreaterThan(Math.max(...xs(6)));
    // The T's crossbar (its top row) is the farthest (+z) row of ink.
    const t = ink.filter((r) => r.letter === 0);
    const top = Math.max(...ink.map((r) => r.y));
    expect(t.filter((r) => r.y === top)).toHaveLength(5);
    expect(squareRects()).toEqual(expect.arrayContaining(ink.map(({ letter: _l, ...r }) => r)));
  });

  it('has its own texture painter', () => {
    expect(() => overlayPainter('nathan-phillips')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cities/toronto/toronto.test.ts`
Expected: FAIL with "Failed to resolve import './financial'".

- [ ] **Step 3: The Financial District lots**

Create `src/cities/toronto/financial.ts`:

```ts
import { FACADE, type BuildingSpec } from '../types';
import { lotCentre } from './layout';

const DARK = [0x24303c, 0x1f2b27, 0x2c3440] as const;
export const GOLD = 0xd4a442;
const WHITE = 0xf0eee8;
const DARK_SIZE = 56;
/**
 * Dark glass towers: block (ci, cj), lot (a, b) of its 2 × 2 grid, height. One in the centre block (−2, 7), two
 * on opposite corners of each of its four neighbours (Ruling R4).
 */
const DARK_TOWERS: readonly (readonly [number, number, number, number, number])[] = [
  [-2, 7, 0, 1, 270],
  [-3, 7, 0, 0, 240], [-3, 7, 1, 1, 210],
  [-1, 7, 0, 0, 255], [-1, 7, 1, 1, 225],
  [-2, 6, 0, 0, 205], [-2, 6, 1, 1, 245],
  [-2, 8, 0, 0, 285], [-2, 8, 1, 1, 215],
];

/** First Canadian Place: the tallest, a white slab. */
export const FIRST_CANADIAN_PLACE: BuildingSpec = { ...lotCentre(-2, 7, 2, 0, 0), w: 66, d: 44, h: 300, facade: FACADE.office, color: WHITE, signs: [], keep: true };

/** One Royal Bank Plaza tower on lot (a, b) of the centre block: three gold boxes staggered 8 m on each axis and 12 m lower each, so its edges step. */
function royalBankTower(a: number, b: number, h: number): BuildingSpec[] {
  const c = lotCentre(-2, 7, 2, a, b);
  return [0, 1, 2].map((k) => ({ x: c.x + (k - 1) * 8, z: c.z + (k - 1) * 8, w: 34, d: 34, h: h - 12 * k, facade: FACADE.glass, color: GOLD, signs: [], keep: true }));
}

/** The Royal Bank Plaza: two gold towers. */
export const ROYAL_BANK_PLAZA: BuildingSpec[] = [...royalBankTower(1, 0, 230), ...royalBankTower(1, 1, 150)];

/** The Financial District's hand-placed lots: ordinary buildings that ride out the crash blast (keep) and topple like any other. */
export const FINANCIAL_LOTS: BuildingSpec[] = [
  FIRST_CANADIAN_PLACE,
  ...ROYAL_BANK_PLAZA,
  ...DARK_TOWERS.map(([ci, cj, a, b, h], k): BuildingSpec => ({
    ...lotCentre(ci, cj, 2, a, b),
    w: DARK_SIZE,
    d: DARK_SIZE,
    h,
    facade: k % 3 === 2 ? FACADE.office : FACADE.glass,
    color: DARK[k % DARK.length]!,
    signs: [],
    keep: true,
  })),
];
```

- [ ] **Step 4: The Yonge-Dundas lots**

Create `src/cities/toronto/yongeDundas.ts`:

```ts
import { FACADE, type BuildingSpec, type SignDef } from '../types';
import { lotCentre } from './layout';

/** Yonge-Dundas Square's block: (−200..0, 800..1000), just west of Yonge. */
export const YD_BLOCK = { ci: -1, cj: 4 } as const;
const SIZE = 60;
/** Lots (0,0), (1,0) face the crash (−z) and stay lower, so the back row's screens show over them. */
const HEIGHTS = [55, 60, 85, 90] as const;
const COLORS = [0xd9c8a8, 0xb5543c, 0xe0d6c2, 0x8a4a3a] as const;
const BLADES = [0xff3fb4, 0x35e8ff, 0xffc23a, 0x5cf2a0] as const;

/**
 * The one bright billboard block (Ruling R3): four kept shop buildings filling the block's 2 × 2 lots, each with a
 * video screen on its face toward the crash, a rooftop billboard and a blade sign on its outer side.
 */
export const YONGE_DUNDAS_LOTS: BuildingSpec[] = ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([a, b], i): BuildingSpec => {
  const h = HEIGHTS[i]!;
  const signs: SignDef[] = [
    { kind: 'screen', lx: 0, ly: h * (b === 1 ? 0.72 : 0.6), lz: -(SIZE / 2 + 0.8), w: 48, h: 28, d: 1.2, color: 0xffffff },
    { kind: 'billboard', lx: 0, ly: h + 20, lz: 0, w: SIZE * 0.9, h: 36, d: 2, color: 0xffffff, cell: 3 + (i % 3) },
    { kind: 'vertical', lx: (a === 0 ? -1 : 1) * (SIZE / 2 + 7), ly: h * 0.45, lz: 0, w: 14, h: Math.min(50, h * 0.6), d: 2, color: BLADES[i]!, cell: i % 3 },
  ];
  return { ...lotCentre(YD_BLOCK.ci, YD_BLOCK.cj, 2, a, b), w: SIZE, d: SIZE, h, facade: FACADE.shop, color: COLORS[i]!, signs, keep: true };
});
```

- [ ] **Step 5: Nathan Phillips Square**

Create `src/cities/toronto/square.ts`:

```ts
import type { GroundOverlay } from '../types';
import { LATIN_FONT } from '../../world/latinFont';
import { CITY_HALL_SITE } from './layout';

/** A solid rectangle on a decal, in px: x along world +x, y along world +z (canvas row 0 is the decal's −z edge). */
export type PaintRect = { x: number; y: number; w: number; h: number; color: number };

/** The decal is SQUARE_PX square over `size` m of ground. */
export const SQUARE_PX = 128;
/**
 * The square in front of City Hall (Ruling R2): 140 m, from the block's avenue-side interior edge (z = 1036) south
 * under City Hall, so the visible plaza is its north part, facing the start camera.
 */
export const NATHAN_PHILLIPS: GroundOverlay = { id: 'nathan-phillips', x: CITY_HALL_SITE.x, z: 1106, size: 140 };
/** Pool (with a `rim` px border) and the TORONTO strip, in decal px. */
export const SQUARE_LAYOUT = { pool: { x: 23, y: 9, w: 82, h: 22 }, rim: 2, strip: { x: 40, y: 35, w: 48, h: 11 } } as const;
const WORD = 'TORONTO';
const PAVING = 0xb9b6ae;
const JOINT = 0xa4a199;
const RIM = 0xe6e3dc;
const POOL = 0x3f86b0;
const STRIP = 0x26222e;
const LETTERS = [0xffffff, 0x35e8ff, 0xff3fb4, 0xffc23a] as const;

/**
 * TORONTO in 5 × 7 capitals on the strip, each letter in its own colour, readable from the start camera (it looks
 * +z, so screen right is world −x and screen up is world +z): letters advance toward −x, glyph columns mirror, and a
 * glyph's top row lies at its +z edge.
 */
export function letterRects(): (PaintRect & { letter: number })[] {
  const { strip } = SQUARE_LAYOUT;
  const width = WORD.length * 6 - 1;
  const first = strip.x + Math.floor((strip.w + width) / 2) - 1;
  const top = strip.y + 8;
  const out: (PaintRect & { letter: number })[] = [];
  [...WORD].forEach((ch, k) => {
    LATIN_FONT[ch]!.forEach((row, r) => {
      for (let c = 0; c < 5; c++) {
        if (row[c] === '1') out.push({ x: first - (k * 6 + c), y: top - r, w: 1, h: 1, color: LETTERS[k % LETTERS.length]!, letter: k });
      }
    });
  });
  return out;
}

/** The whole decal: paving with joints, the rimmed reflecting pool, the dark strip and its letters. */
export function squareRects(): PaintRect[] {
  const n = SQUARE_PX;
  const { pool, rim, strip } = SQUARE_LAYOUT;
  const out: PaintRect[] = [{ x: 0, y: 0, w: n, h: n, color: PAVING }];
  for (let k = 16; k < n; k += 16) out.push({ x: k, y: 0, w: 1, h: n, color: JOINT }, { x: 0, y: k, w: n, h: 1, color: JOINT });
  out.push({ x: pool.x - rim, y: pool.y - rim, w: pool.w + 2 * rim, h: pool.h + 2 * rim, color: RIM }, { ...pool, color: POOL });
  out.push({ ...strip, color: STRIP });
  for (const { letter: _letter, ...r } of letterRects()) out.push(r);
  return out;
}
```

- [ ] **Step 6: Register the square's texture in `src/world/pixelTextures.ts`**

Add `import { SQUARE_PX, squareRects, type PaintRect } from '../cities/toronto/square';`. Above `OVERLAY_PAINTERS`,
add:

```ts
/** An n × n decal of solid rectangles (canvas row 0 at the decal's −z edge), transparent elsewhere (use with alphaTest). */
function paintRects(n: number, rects: readonly PaintRect[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  for (const r of rects) {
    g.fillStyle = hex(r.color);
    g.fillRect(r.x, r.y, r.w, r.h);
  }
  return finish(c);
}

/** Nathan Phillips Square: paving, the reflecting pool and the TORONTO strip. */
export function squareTexture(): THREE.CanvasTexture {
  return paintRects(SQUARE_PX, squareRects());
}
```

and add the entry to the registry: `'nathan-phillips': squareTexture,` after `scramble: scrambleTexture,`.

- [ ] **Step 7: Wire the lots and the decal into the style**

In `src/cities/toronto/index.ts` add

```ts
import { FINANCIAL_LOTS } from './financial';
import { YONGE_DUNDAS_LOTS } from './yongeDundas';
import { NATHAN_PHILLIPS } from './square';
```

and replace `specialLots: [],` with `specialLots: [...YONGE_DUNDAS_LOTS, ...FINANCIAL_LOTS],` and `overlays: [],` with
`overlays: [NATHAN_PHILLIPS],`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/cities/toronto src/world/pixelTextures.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/cities/toronto src/world/pixelTextures.ts
git commit -m "Toronto downtown: Financial District towers, Yonge-Dundas screens, Nathan Phillips Square

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Two cities: `CITIES`, the dev `?city=` hook, and world tests over both

**Files:**
- Modify: `src/cities/index.ts` (`CITIES`, `forcedCity`), `src/cities/index.test.ts`, `src/GameScene.ts`
  (`cityFor`, `runs`)
- Create: `src/world/bothCities.test.ts`
- Test: `src/cities/index.test.ts`, `src/world/bothCities.test.ts`, `src/world/City.test.ts`

**Interfaces:**
- Consumes:
  - Tasks 1–6: `TORONTO` (complete), `bridgeAxis`, `attachAtmosphere`, `openWater`, `inBay`.
- Produces:
  ```ts
  // src/cities/index.ts
  export const CITIES: readonly CityStyle[];   // [TOKYO, TORONTO]
  export function forcedCity(search: string, run: number, cities?: readonly CityStyle[]): CityStyle | null;
  // src/GameScene.ts (private)
  private runs: number; private cityFor(run: number): CityStyle;
  ```

- [ ] **Step 1: Write the failing tests**

Replace `src/cities/index.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { CITIES, forcedCity, pickCity } from './index';
import { TOKYO } from './tokyo';
import { TORONTO } from './toronto';

describe('pickCity', () => {
  it('holds Tokyo and Toronto, and can return either', () => {
    expect(CITIES).toHaveLength(2);
    expect(CITIES[0]).toBe(TOKYO);
    expect(CITIES[1]).toBe(TORONTO);
    expect(pickCity(() => 0)).toBe(TOKYO);
    expect(pickCity(() => 0.49)).toBe(TOKYO);
    expect(pickCity(() => 0.5)).toBe(TORONTO);
    expect(pickCity(() => 0.999)).toBe(TORONTO);
  });
});

describe('forcedCity (dev ?city= override)', () => {
  it('follows the listed ids run by run, cycling through the list', () => {
    const s = '?city=tokyo,toronto,tokyo';
    expect([0, 1, 2, 3, 4].map((run) => forcedCity(s, run))).toEqual([TOKYO, TORONTO, TOKYO, TOKYO, TORONTO]);
    expect(forcedCity('?city=toronto', 7)).toBe(TORONTO);
  });

  it('ignores case and spaces, and skips unknown ids', () => {
    expect(forcedCity('?city=%20Toronto%20', 0)).toBe(TORONTO);
    expect(forcedCity('?city=paris,TOKYO', 0)).toBe(TOKYO);
    expect(forcedCity('?debug&city=toronto', 0)).toBe(TORONTO);
  });

  it('is null (so the run picks at random) without the parameter, when it is empty, or when no id is known', () => {
    for (const s of ['', '?', '?debug', '?city=', '?city=,', '?city=paris', '?city=paris,rome']) expect(forcedCity(s, 0), s).toBeNull();
  });
});
```

Create `src/world/bothCities.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { CITIES } from '../cities';
import type { BuildingSpec, CityStyle } from '../cities/types';
import { mulberry32 } from '../util/rng';
import { CHUNK_SIZE, chunksInRadius, generateChunk } from './chunks';
import { AVENUE_WIDTH, PITCH, bridgeAxis, isBay, isIsland, isRiver, isWater, lineWidth, nearestRoadPoint, planRoadPath, segmentAt, type Axis } from './roads';
import { inBay } from './shore';
import { openWater } from '../systems/splash';

const W = CONFIG.world;
const R = 30;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const blockCell = (v: number) => Math.floor(v / PITCH);
const mid = (axis: Axis, i: number, j: number) => (axis === 'x' ? { x: PITCH * i + PITCH / 2, z: PITCH * j } : { x: PITCH * i, z: PITCH * j + PITCH / 2 });
const cellsOf = (axis: Axis, i: number, j: number): [[number, number], [number, number]] => (axis === 'x' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]]);
const isAvenue = (axis: Axis, i: number, j: number) => mod(axis === 'x' ? j : i, 5) === 0;
const riverOnly = (s: CityStyle, i: number, j: number) => isRiver(s, i, j) && !isBay(s, i, j);
const cellRange = (v: number) => {
  const c = Math.floor(v / PITCH);
  return Math.abs(v - PITCH * c) < 1e-6 ? [c - 1, c] : [c];
};
const inWater = (s: CityStyle, p: { x: number; z: number }) => cellRange(p.x).every((i) => cellRange(p.z).every((j) => isWater(s, i, j)));
/** On an avenue line that bridges the river: x = k·1000 across an east–west river, z = k·1000 across a north–south one. */
const onBridgeLine = (s: CityStyle, p: { x: number; z: number }) => {
  const v = bridgeAxis(s) === 'z' ? p.x : p.z;
  return Math.abs(v - Math.round(v / 1000) * 1000) < 1e-6;
};
const onSegment = (s: CityStyle, p: { x: number; z: number }): boolean => {
  const eps = 1e-6;
  const ci = Math.floor(p.x / PITCH), cj = Math.floor(p.z / PITCH);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    if (Math.abs(p.z - PITCH * j) < eps && p.x >= PITCH * i - eps && p.x <= PITCH * (i + 1) + eps && segmentAt(s, 'x', i, j)) return true;
    if (Math.abs(p.x - PITCH * i) < eps && p.z >= PITCH * j - eps && p.z <= PITCH * (j + 1) + eps && segmentAt(s, 'z', i, j)) return true;
  }
  return false;
};
/** A route across the river, off the bridge avenues at both ends (Tokyo's is its existing route test's). */
const across = (s: CityStyle): [{ x: number; z: number }, { x: number; z: number }] => {
  const c0 = s.river!.c0;
  return s.river!.axis === 'z' ? [{ x: c0 - 600, z: 500 }, { x: c0 + 800, z: 500 }] : [{ x: 430, z: c0 - 900 }, { x: 610, z: c0 + 1100 }];
};
/** Full-load centres: the origin, the river, the coast and (Toronto) the lakeshore beside the islands and the Don's mouth. */
const LOAD_POINTS: Record<string, readonly (readonly [number, number])[]> = {
  tokyo: [[0, 0], [0, 1300], [-1100, -900], [-2000, 400]],
  toronto: [[0, 0], [1500, 0], [0, 2100], [-300, 2100], [1500, 2100], [-3000, 2100], [6000, 2100]],
};
// Chunks around the crash, the river and the coast, in every city.
const SAMPLE: [number, number][] = [];
for (let cx = -4; cx <= 4; cx++) for (let cz = -2; cz <= 3; cz++) SAMPLE.push([cx, cz]);

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: road network', (_id, style) => {
  it('is deterministic', () => {
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (const axis of ['x', 'z'] as const) {
      expect(segmentAt(style, axis, i, j)).toEqual(segmentAt(style, axis, i, j));
    }
  });

  it('keeps every avenue unless water is on both sides; where river is on both sides, only the bridge axis bridges it', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const axis of ['x', 'z'] as const) {
      if (!isAvenue(axis, i, j)) continue;
      const [a, b] = cellsOf(axis, i, j);
      if (isIsland(style, a[0], a[1]) || isIsland(style, b[0], b[1])) continue;
      const bothRiver = riverOnly(style, a[0], a[1]) && riverOnly(style, b[0], b[1]);
      const seg = segmentAt(style, axis, i, j);
      if (isWater(style, a[0], a[1]) && isWater(style, b[0], b[1]) && !bothRiver) expect(seg).toBeNull();
      else if (bothRiver && axis !== bridgeAxis(style)) expect(seg).toBeNull();
      else {
        expect(seg, `${axis} ${i},${j}`).not.toBeNull();
        expect(seg!.width).toBe(AVENUE_WIDTH);
        expect(seg!.bridge).toBe(bothRiver);
      }
    }
  });

  it('every land node keeps at least one segment', () => {
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const cells = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]];
      if (!cells.some(([a, b]) => !isWater(style, a!, b!)) || cells.some(([a, b]) => isIsland(style, a!, b!))) continue;
      const any = [segmentAt(style, 'x', i, j), segmentAt(style, 'x', i - 1, j), segmentAt(style, 'z', i, j), segmentAt(style, 'z', i, j - 1)].some((s) => s);
      expect(any, `node ${i},${j}`).toBe(true);
    }
  });

  it('keeps every segment near the crash site', () => {
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (const axis of ['x', 'z'] as const) {
      const m = mid(axis, i, j);
      if (Math.hypot(m.x, m.z) <= W.clearRadius + PITCH) expect(segmentAt(style, axis, i, j), `${axis} ${i},${j}`).not.toBeNull();
    }
  });

  it('removes streets at the style\'s fraction per district', () => {
    const tot: Record<string, number> = {};
    const gone: Record<string, number> = {};
    for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) for (const axis of ['x', 'z'] as const) {
      const removable = axis === 'x' ? mod(j, 2) === 1 : mod(i, 2) === 1 && mod(j, 2) === 0;
      const m = mid(axis, i, j);
      const ends = axis === 'x' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
      const kept = style.keepNodes.some((k) => ends.some(([a, b]) => k.x === PITCH * a! && k.z === PITCH * b!));
      if (!removable || isAvenue(axis, i, j) || kept || Math.hypot(m.x, m.z) <= W.clearRadius + PITCH) continue;
      const [a, b] = cellsOf(axis, i, j);
      if (isWater(style, a[0], a[1]) || isWater(style, b[0], b[1]) || isIsland(style, a[0], a[1]) || isIsland(style, b[0], b[1])) continue;
      const d = style.districtAt(m.x, m.z);
      tot[d] = (tot[d] ?? 0) + 1;
      if (!segmentAt(style, axis, i, j)) gone[d] = (gone[d] ?? 0) + 1;
    }
    let checked = 0;
    for (const [d, n] of Object.entries(tot)) {
      if (n < 200) continue;
      checked++;
      expect(Math.abs((gone[d] ?? 0) / n - style.roadRemoval[d as keyof typeof style.roadRemoval]), d).toBeLessThanOrEqual(0.05);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('puts landmarks and special lots on land, inset from the bordering road lines', () => {
    for (const s of [...style.landmarks, ...style.specialLots]) {
      const ci = blockCell(s.x), cj = blockCell(s.z);
      const msg = `${'id' in s ? s.id : 'lot'} ${s.x},${s.z}`;
      expect(isWater(style, ci, cj), msg).toBe(false);
      expect(s.x - s.w / 2, msg).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2);
      expect(s.x + s.w / 2, msg).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2);
      expect(s.z - s.d / 2, msg).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2);
      expect(s.z + s.d / 2, msg).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2);
    }
  });

  it('nearestRoadPoint never returns a water point off a bridge line', () => {
    const rnd = mulberry32(23);
    for (let k = 0; k < 500; k++) {
      const q = nearestRoadPoint(style, { x: (rnd() - 0.5) * 6000, z: (rnd() - 0.5) * 6000 });
      if (inWater(style, q)) expect(onBridgeLine(style, q), `${q.x},${q.z}`).toBe(true);
    }
  });

  it('routes ground units across the river along existing segments, over water only on bridges', () => {
    const [start, goal] = across(style);
    const path = planRoadPath(style, start, goal);
    expect(path.length).toBeGreaterThan(0);
    const pts = [nearestRoadPoint(style, start), ...path];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!, b = pts[k]!;
      expect(a.x === b.x || a.z === b.z, `leg ${k} axis-aligned`).toBe(true);
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
      for (let s = 0; s <= n; s++) {
        const q = { x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n };
        expect(onSegment(style, q), `leg ${k} sample ${q.x},${q.z}`).toBe(true);
        if (inWater(style, q)) expect(onBridgeLine(style, q), `water ${q.x},${q.z}`).toBe(true);
      }
    }
    expect(path[path.length - 1]).toEqual(nearestRoadPoint(style, goal));
  });
});

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: chunks', (id, style) => {
  it('is deterministic per chunk', () => {
    expect(generateChunk(style, 1337, 1, 2)).toEqual(generateChunk(style, 1337, 1, 2));
  });

  it('keeps every building inside its chunk and block, clear of the bordering line half-widths', () => {
    for (const [cx, cz] of SAMPLE) {
      for (const b of generateChunk(style, 1337, cx, cz).buildings) {
        expect(Math.floor(b.x / CHUNK_SIZE)).toBe(cx);
        expect(Math.floor(b.z / CHUNK_SIZE)).toBe(cz);
        const ci = blockCell(b.x), cj = blockCell(b.z);
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2 - 1e-6);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2 + 1e-6);
        expect(b.z - b.d / 2).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2 - 1e-6);
        expect(b.z + b.d / 2).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2 + 1e-6);
      }
    }
  });

  it('puts no building, tree or park in a water cell, and lists the water cells', () => {
    let water = 0;
    const wet = (x: number, z: number) => isWater(style, blockCell(x), blockCell(z));
    for (const [cx, cz] of SAMPLE) {
      const c = generateChunk(style, 1337, cx, cz);
      for (const b of c.buildings) expect(wet(b.x, b.z)).toBe(false);
      for (const t of c.trees) expect(wet(t.x, t.z)).toBe(false);
      for (const p of c.parks) expect(wet(p.x, p.z)).toBe(false);
      for (const w of c.water) expect(wet(w.x, w.z)).toBe(true);
      water += c.water.length;
    }
    expect(water).toBeGreaterThan(10);
  });

  it('gives each landmark to exactly one chunk and builds nothing else on its block', () => {
    for (const l of style.landmarks.filter((l) => !l.span)) {
      let owners = 0;
      for (const r of chunksInRadius(l.x, l.z, CHUNK_SIZE * 2)) {
        const c = generateChunk(style, 1337, r.cx, r.cz);
        owners += c.landmarks.filter((m) => m.id === l.id).length;
        for (const b of c.buildings) expect(blockCell(b.x) === blockCell(l.x) && blockCell(b.z) === blockCell(l.z), l.id).toBe(false);
      }
      expect(owners, l.id).toBe(1);
    }
  });

  it('places every special lot exactly and lets no random building overlap one', () => {
    const all: BuildingSpec[] = [];
    const seen = new Set<string>();
    for (const s of style.specialLots) {
      for (const r of chunksInRadius(s.x, s.z, 1)) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        all.push(...generateChunk(style, 1337, r.cx, r.cz).buildings);
      }
    }
    const isSpecial = (b: BuildingSpec) => style.specialLots.some((s) => s.x === b.x && s.z === b.z && s.h === b.h);
    expect(all.filter(isSpecial)).toHaveLength(style.specialLots.length);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of all.filter(isSpecial)) {
      expect(s.keep).toBe(true);
      for (const b of all.filter((b) => !isSpecial(b))) expect(overlaps(s, b)).toBe(false);
    }
  });

  it('fits a full load in every pool: roads, intersections and bridges, water, pads, sea wall, cranes, buildings, trees, signs, screens', () => {
    for (const [x, z] of LOAD_POINTS[id]!) {
      let roads = 0, nodes = 0, water = 0, pads = 0, walls = 0, cranes = 0, buildings = 0, trees = 0, signs = 0, screens = 0;
      for (const r of chunksInRadius(x, z, W.unloadRadius)) {
        const c = generateChunk(style, 1337, r.cx, r.cz);
        roads += c.roads.length;
        nodes += c.nodes.length + c.roads.filter((s) => s.bridge).length;
        water += c.water.length;
        pads += c.parks.length + c.quays.length;
        walls += c.seaWall.length;
        cranes += c.cranes.length;
        buildings += c.buildings.length;
        trees += c.trees.length;
        for (const b of c.buildings) for (const s of b.signs) if (s.kind === 'screen') screens++; else signs++;
      }
      const at = `${id} at ${x},${z}`;
      expect(roads, at).toBeLessThanOrEqual(W.maxRoads);
      expect(nodes * 1.1, at).toBeLessThanOrEqual(W.maxNodes);
      if (!isBay(style, blockCell(x), blockCell(z))) expect(water, at).toBeLessThanOrEqual(W.maxWater);
      expect(pads, at).toBeLessThanOrEqual(W.maxParks);
      expect(walls, at).toBeLessThanOrEqual(W.maxSeaWall);
      expect(cranes, at).toBeLessThanOrEqual(W.maxCranes);
      expect(buildings, at).toBeLessThanOrEqual(W.maxBuildings);
      expect(trees, at).toBeLessThanOrEqual(W.maxTrees);
      expect(signs, at).toBeLessThanOrEqual(W.maxSigns);
      expect(screens, at).toBeLessThanOrEqual(W.maxScreens);
    }
  });
});

describe.each(CITIES.map((c) => [c.id, c] as const))('%s: water underfoot', (_id, style) => {
  it('never blocks a river cell (the monster wades), and splashes in open river water but not on land', () => {
    let rivers = 0, open = 0;
    for (let ci = -20; ci < 20; ci++) for (let cj = -20; cj < 20; cj++) {
      if (!riverOnly(style, ci, cj)) continue;
      rivers++;
      const x = PITCH * (ci + 0.5), z = PITCH * (cj + 0.5);
      expect(inBay(style, x, z)).toBe(false);
      if (openWater(style, x, z)) open++;
    }
    expect(rivers).toBeGreaterThan(10);
    expect(open).toBeGreaterThan(5);
    expect(openWater(style, 0, 0)).toBe(false);
  });
});
```

Append to `src/world/City.test.ts`. Add `import { TORONTO } from '../cities/toronto';`, then:

```ts
describe('City (Toronto)', () => {
  const targets = (): Omit<AtmosphereTargets, 'windowGlow'> => ({
    fog: new THREE.Fog(0x000000, 1, 2),
    sky: { zenith: new THREE.Color(), horizon: new THREE.Color() },
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    sunDir: new THREE.Vector3(),
  });

  it('loads every landmark, and keeps them and every hand-placed lot standing through the crash blast', () => {
    const { city } = make(TORONTO);
    expect(city.landmarkCount()).toBe(TORONTO.landmarks.length);
    const at = (x: number, z: number): Target | null => {
      let t: Target | null = null;
      city.forEachStandingInRadius({ x, z }, 2, (b) => { if (b.position.x === x && b.position.z === z) t = b; });
      return t;
    };
    const targets = [...TORONTO.landmarks, ...TORONTO.specialLots].map((s) => at(s.x, s.z));
    for (const t of targets) expect(t).not.toBeNull();
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    for (const t of targets) expect(t!.isAlive()).toBe(true);
  });

  it('switches Tokyo → Toronto → Tokyo, restoring atmosphere, glyphs, water, cranes and the road network exactly', () => {
    const asked: string[] = [];
    const textures: CityTextures = { ...STUB, signs: (g) => (asked.push(g), new THREE.Texture()) };
    const city = new City(new THREE.Scene(), TOKYO, CONFIG.world.seed, () => {}, textures);
    const t = targets();
    city.attachAtmosphere(t);
    const water = () => ((city as unknown as { waterMesh: THREE.InstancedMesh }).waterMesh.material as THREE.MeshToonMaterial).color.getHex();
    const snap = () => ({
      fog: t.fog.color.getHex(), near: t.fog.near, far: t.fog.far, zenith: t.sky.zenith.getHex(), horizon: t.sky.horizon.getHex(),
      hemi: t.hemi.color.getHex(), hemiI: t.hemi.intensity, sun: t.sun.color.getHex(), sunI: t.sun.intensity, dir: t.sunDir.toArray(),
      glow: city.windowGlow.getHex(), water: water(), roads: city.roadNetworkCount(), cranes: city.craneCount(), landmarks: city.landmarkCount(),
    });
    const tokyo = snap();
    city.reset(TORONTO);
    const toronto = snap();
    expect(toronto.fog).toBe(0xe9a985);
    expect(toronto.sun).toBe(0xffa25a);
    expect(toronto.dir[0]).toBeLessThan(0);
    expect(toronto.glow).not.toBe(0);
    expect(toronto.water).toBe(TORONTO.colors.water);
    expect(toronto.cranes).toBe(0);
    expect(toronto.landmarks).toBe(TORONTO.landmarks.length);
    city.reset(TOKYO);
    expect(snap()).toEqual(tokyo);
    expect(asked).toEqual(['kanji', 'latin', 'kanji']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cities/index.test.ts src/world/bothCities.test.ts src/world/City.test.ts`
Expected: FAIL. `index.test.ts` fails on `forcedCity is not a function` and `CITIES` has length 1, and
`bothCities.test.ts` runs only the `tokyo` cases. The Toronto `City` tests pass already: they read `TORONTO`
directly, as a regression net for Tasks 1–6.

- [ ] **Step 3: Two cities and the override**

Replace `src/cities/index.ts` with:

```ts
import { TOKYO } from './tokyo';
import { TORONTO } from './toronto';
import type { CityStyle } from './types';

/** Every playable city; a run starts in one picked at random. */
export const CITIES: readonly CityStyle[] = [TOKYO, TORONTO];

export function pickCity(rng: () => number): CityStyle {
  return CITIES[Math.floor(rng() * CITIES.length)]!;
}

/**
 * Dev override for screenshots and soaks: the `city` URL parameter, a comma-separated list of city ids (any case,
 * spaces ignored), gives run `run` the list's entry `run mod length`. Unknown ids are skipped; null (pick at random)
 * without the parameter or when no listed id is known.
 */
export function forcedCity(search: string, run: number, cities: readonly CityStyle[] = CITIES): CityStyle | null {
  const raw = new URLSearchParams(search).get('city');
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => cities.find((c) => c.id === s.trim().toLowerCase()))
    .filter((c): c is CityStyle => c !== undefined);
  return list.length > 0 ? list[run % list.length]! : null;
}
```

- [ ] **Step 4: GameScene picks through the override in dev builds**

In `src/GameScene.ts`:
- Change `import { pickCity } from './cities';` to `import { forcedCity, pickCity } from './cities';`.
- Add `import type { CityStyle } from './cities/types';`.
- After `private rng = mulberry32(CONFIG.world.seed + 7);`, add:

```ts
  /** Runs started; a dev `?city=` list is followed in this order. */
  private runs = 0;
```

- Add this method next to `resetRun`:

```ts
  /** The city for run `run`: in dev builds the `?city=` list's entry when it names a known city, else a random pick. */
  private cityFor(run: number): CityStyle {
    return (import.meta.env.DEV ? forcedCity(location.search, run) : null) ?? pickCity(this.rng);
  }
```

- In the constructor, change `const style = pickCity(this.rng);` (from Task 1) to `const style = this.cityFor(0);`.
- In `resetRun`, change `this.city.reset(pickCity(this.rng));` to `this.city.reset(this.cityFor(this.runs++));`.

The title screen and the first run both use list entry 0. Each later run (Play Again, or Change Monster → Play)
advances one entry.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/cities/index.test.ts src/world/bothCities.test.ts src/world/City.test.ts`
Expected: PASS. The `toronto` cases of `bothCities.test.ts` now run too.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

Run: `npx vitest run`
Expected: every test file passes.

- [ ] **Step 6: Commit**

```bash
git add src/cities/index.ts src/cities/index.test.ts src/world/bothCities.test.ts src/world/City.test.ts src/GameScene.ts
git commit -m "Two cities: Toronto joins the random pick; dev ?city= override; world tests run over both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Visual checks, atmosphere tuning and the performance soak

**Files:**
- Create (scratchpad, not committed): `$S/m6/m6-shots.mjs` and `$S/m6/perf-soak-city.mjs`, where
  `S=/private/tmp/claude-501/-Users-eric-Developer-azragon/cf6289c6-12f2-45ae-8375-d49490c90a88/scratchpad`. That
  directory holds the existing `perf-soak.mjs`.
- Modify (tuning only): `src/cities/toronto/index.ts` (`atmosphere`, `colors`), `src/cities/toronto/districts.ts`
  (colours), `src/cities/toronto/toronto.test.ts` (the atmosphere expectation follows the tuned values)

**Interfaces:**
- Consumes:
  - Task 7's `?city=` hook (dev builds read `location.search`).
  - The dev handle `window.__game`, with `startFromTitle`, `playSelected`, `skipIntro`, `restart`, `getState`,
    `intro`, `monster`, `rig.orbit`, `enemies`, `city.style` and `scene.fog`.
- Produces: screenshots, tuned values and a perf table for the final report.

**Never start a dev server.** One is already running at `http://localhost:5173`. If it is not reachable, stop and ask.

- [ ] **Step 1: Write the screenshot script**

```bash
S=/private/tmp/claude-501/-Users-eric-Developer-azragon/cf6289c6-12f2-45ae-8375-d49490c90a88/scratchpad
mkdir -p $S/m6
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/
```
Expected: `200`.

Create `$S/m6/m6-shots.mjs`:

```js
// Toronto visual checks against the running dev server (never start one).
// Usage: node m6-shots.mjs <name> <cities> start
//        node m6-shots.mjs <name> <cities> at <x> <z> <yaw>      (view direction (sin yaw, cos yaw))
//        node m6-shots.mjs <name> <cities> dive <t...>           (intro times, slowed 0.15×)
//        node m6-shots.mjs <name> <cities> sequence              (Play, Play Again, Play Again)
// <cities> is the ?city= list, e.g. toronto or tokyo,toronto,tokyo. Shots land next to this script (or in $OUT).
import { chromium } from '/Users/eric/Developer/azragon/run-template-3d-react/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = process.env.OUT ?? path.dirname(fileURLToPath(import.meta.url));
const [name, cities, mode, ...args] = process.argv.slice(2);
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];

async function open(view) {
  const page = await (await browser.newContext(VIEWS[view])).newPage();
  page.on('pageerror', (e) => errs.push(`${view}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${view}: ${m.text()}`); });
  await page.goto(`http://localhost:5173/?city=${cities}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.getState() === 'title', null, { polling: 100, timeout: 30000 });
  await page.evaluate(() => window.__game.startFromTitle());
  await page.waitForTimeout(800);
  return page;
}
/** No enemies, so the shots show the city. */
const calm = (page) => page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.enemies.director.update = () => []; g.openingDone = true; });
async function play(page) {
  await page.evaluate(() => window.__game.playSelected());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.skipIntro());
  await calm(page);
}
async function die(page) {
  for (let i = 0; i < 60 && (await page.evaluate(() => window.__game.getState())) !== 'gameover'; i++) {
    await page.evaluate(() => { window.__game.monster.hp = 0; });
    await page.waitForTimeout(250);
  }
}
const info = (page) => page.evaluate(() => {
  const g = window.__game;
  return `${g.city.style.id} fog #${g.scene.fog.color.getHexString()} near ${g.scene.fog.near} far ${g.scene.fog.far}`;
});

if (mode === 'start' || mode === 'at') {
  for (const view of ['desktop', 'phone']) {
    const page = await open(view);
    await play(page);
    if (mode === 'at') {
      await page.evaluate(([x, z, yaw]) => {
        const g = window.__game;
        g.monster.position.set(x, 0, z);
        g.monster.yaw = yaw;
        g.rig.orbit.yaw = yaw;
      }, args.map(Number));
    }
    await page.waitForTimeout(2500);
    console.log(view, await info(page));
    await page.screenshot({ path: `${OUT}/${name}-${view}.png` });
    await page.close();
  }
} else if (mode === 'dive') {
  const page = await open('desktop');
  await page.evaluate(() => {
    const g = window.__game;
    const i = g.intro;
    const u = i.update.bind(i);
    i.update = (dt) => u(dt * 0.15);
    g.playSelected();
  });
  for (const T of args.map(Number)) {
    await page.waitForFunction((T) => window.__game.intro.t >= T || !window.__game.intro.active, T, { polling: 16, timeout: 120000 });
    await page.screenshot({ path: `${OUT}/${name}-t${T}.png` });
  }
  await page.waitForFunction(() => !window.__game.intro.active, null, { polling: 100, timeout: 120000 });
  console.log('after the dive', await info(page));
} else if (mode === 'sequence') {
  const page = await open('desktop');
  for (let run = 0; run < 3; run++) {
    if (run === 0) await play(page);
    else {
      await die(page);
      await page.evaluate(() => window.__game.restart());
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__game.skipIntro());
      await calm(page);
    }
    await page.waitForTimeout(2500);
    console.log(`run ${run}`, await info(page));
    await page.screenshot({ path: `${OUT}/${name}-run${run}.png` });
  }
}
console.log('errs', errs);
await browser.close();
```

- [ ] **Step 2: Take the screenshots and check each one**

Run each from `$S/m6` (`cd $S/m6`), then open every PNG and check it. Every run must end with `errs []`.

1. **Play start:** `node m6-shots.mjs start toronto start`.
   - **Log:** `toronto fog #e9a985 near 2200 far 4700` for both views.
   - **Desktop check:**
     - Yonge runs straight ahead to the lake.
     - The Yonge-Dundas screens and billboards are bright just right of Yonge.
     - The glass towers are ahead and right, and the CN Tower stands right of centre, taller than everything.
     - The lake and the long green islands are beyond.
     - The sky is dusky violet over an orange horizon, and shadows run long to the left (east).
     - Brick houses sit around the crash.
   - **Phone:** see "Spec conflict" in Self-review. Record whether the CN Tower is in the 390 × 844 frame.
2. **Intro dive:** `node m6-shots.mjs dive toronto dive 2.0 6.0 6.6 7.2 9.5`.
   - **t 2.0 (space):** the sun's light on the pod is orange, not white.
   - **t ≥ 6.0:** peach fog, with no midday blue at any frame.
   - **Log:** after the dive, `near 2200 far 4700`.
3. **CN Tower:** `node m6-shots.mjs cn toronto at -700 1400 0`. Check the fins, the pod's dark and glowing bands, the
   SkyPod and the red-and-white antenna.
4. **City Hall:** `node m6-shots.mjs hall toronto at -500 700 0`.
   - Two curved towers face each other, the east one (screen left) taller, with the saucer between them.
   - The square's paving, pool and TORONTO strip are in front, and the strip reads left to right.
5. **The Don:** `node m6-shots.mjs don toronto at 1000 500 1.571`. Check the green park banks with trees, the water,
   and the bridges on z = 0 and z = 1000 only.
6. **Lakeshore and islands:** `node m6-shots.mjs lake toronto at 0 1800 0`.
   - Condo towers and quay paving line the shore; there are no container cranes.
   - The islands are long, low and green, with no roads.
7. **City switch:** `node m6-shots.mjs seq tokyo,toronto,tokyo sequence`.
   - **Log:**
     - `run 0 tokyo fog #c4d6e0 near 2200 far 4700`;
     - `run 1 toronto fog #e9a985 ...`;
     - `run 2 tokyo fog #c4d6e0 near 2200 far 4700`.
   - **Images:** run 0 and run 2 show the same midday light, with kanji signs. Run 1 shows the dusk, with Latin signs.
8. **Tokyo is unchanged:** `node m6-shots.mjs tokyo tokyo start`. Compare it with the play-start screenshots from
   milestone 5 in `$S` (e.g. `5c-*.png`, `m5a-*.png`). The sky, light and shadows must match.

- [ ] **Step 3: Tune the atmosphere (only if a check fails)**

Change one value at a time, then re-run the affected shot. Guidance:
- **Too dark overall:** raise `hemiIntensity` (0.8 → at most 1.0) before touching `sunIntensity`. Keep
  `sunIntensity` ≥ 1.6 so the long shadows still read.
- **Distant city looks flat orange:**
  - Move `fog` toward the horizon colour, so the far edge melts into the sky.
  - Cool it toward `0xd99a86` if buildings in mid-distance look burnt.
  - Keep near and far unset (Tokyo's).
- **Harsh sky bands:** the dome has 6 steps. Lighten `skyZenith` toward `0x5d5a9a` rather than changing the shader
  (it is shared with Tokyo).
- **Shadow acne, striping or detached shadows on the low sun:** raise `sunDir.y` to 0.35–0.4 and keep `sunDir.x` the
  most negative component, so the sun stays in the west. Do not change `CONFIG.render` or the shadow bias; they are
  shared with Tokyo.
- **Window glow:**
  - Use `strength` 0.3–0.6. Lit bands should read on shaded facades without making sunlit ones look neon.
  - If nothing glows, check that the office or balcony facades are in use; glass panes never glow (Ruling R12).
- **Brick reads as mud under orange light:** lighten the residential colours in `districts.ts` by 10–15%. Keep the
  red, brown and dark-red order.
- **The CN Tower is lost against the sky:** darken `CONCRETE` in `cnTower.ts` slightly, or brighten `LIGHT`.

After tuning:
- Update the expected object in `toronto.test.ts`'s "is a warm evening" test to the tuned values.
- Run `npx vitest run src/cities/toronto src/render/atmosphere.test.ts`. Expected: PASS.
- Run `npx tsc --noEmit -p .`. Expected: no output.

- [ ] **Step 4: The performance soak**

```bash
S=/private/tmp/claude-501/-Users-eric-Developer-azragon/cf6289c6-12f2-45ae-8375-d49490c90a88/scratchpad
sed "s#page.goto('http://localhost:5173'#page.goto(process.env.URL ?? 'http://localhost:5173'#" $S/perf-soak.mjs > $S/m6/perf-soak-city.mjs
grep -c "process.env.URL" $S/m6/perf-soak-city.mjs
```
Expected: `1`.

```bash
cd $S/m6
URL='http://localhost:5173/?city=tokyo' CLEAN=1 node perf-soak-city.mjs soak-tokyo.json 6 20
URL='http://localhost:5173/?city=toronto' CLEAN=1 node perf-soak-city.mjs soak-toronto.json 6 20
node -e "
const fs = require('fs');
const runs = (p) => JSON.parse(fs.readFileSync(p)).results.slice(1);
const mean = (r, f) => r.reduce((s, x) => s + f(x), 0) / r.length;
const a = runs('soak-tokyo.json'), b = runs('soak-toronto.json');
for (const [k, f] of [['cpuMs', (x) => x.cpuMs], ['frameMs', (x) => x.frameMs], ['calls', (x) => x.calls], ['shadowDraws', (x) => x.perRender.shadowDraws], ['triangles', (x) => x.triangles]]) {
  console.log(k.padEnd(12), mean(a, f).toFixed(2).padStart(10), mean(b, f).toFixed(2).padStart(10), (mean(b, f) / mean(a, f)).toFixed(3));
}"
```
Expected:
- Each soak ends with `errs []`.
- Its `grew:` summary lines list no growth in `geometries`, `textures`, `programs`, `sceneTotal` or the `live`
  counts across cycles of the same monster.
- In the comparison table, the `cpuMs` ratio (Toronto ÷ Tokyo, last column) is ≤ **1.25**.

**If it fails:**
- **`cpuMs` over 1.25:** profile both with `PROFILE=1` and compare the top self-time functions.
  - **Shadow pass:** if the shadow pass grew (`shadowDraws` ratio), raise `sunDir.y` (shorter shadows put fewer
    casters in the box).
  - **Buildings:** if the residential cap is the cost, lower residential `fill` from 0.55 to 0.45.
- **Growth across cycles:** look for an un-disposed texture or geometry on the city switch. The sign atlas and crane
  geometry are rebuilt in `City.reset`; the old ones must be disposed.

Record both soaks' tables in the report.

- [ ] **Step 5: Full verification and commit**

Run: `npx vitest run`
Expected: every test file passes.

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

```bash
git add src/cities/toronto
git commit -m "Toronto: tuning from screenshots and the perf soak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If nothing was tuned, skip the commit. The report then lists:
- every check with its screenshot path;
- the CN Tower's phone-portrait result;
- both perf tables and the `cpuMs` ratio;
- every tuned value (old → new).

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Warm evening atmosphere; Sky, Lighting, intro fog and space sun read it; `City.reset` applies it; Tokyo exact | 1 |
| Window glow, no extra draw call (emissive on window texels, shared uniform) | 1 |
| `RiverSpec.axis`, `z0` → `c0`, bridges on either axis, shore, splash and pathfinding follow; `bankPark` | 2 |
| Overlay texture by id; Shibuya unchanged | 3 (registry), 6 (Nathan Phillips) |
| `glyphs: 'kanji' \| 'latin'`, Latin glyph set, atlas per style | 3 |
| `coastDistance` shared; `cranes?: { colors } \| false`; Tokyo's cranes unchanged | 3 |
| Lake ahead, islands (park, unwalkable), Don (course, extent, banks, bridges), districts and heights | 4 |
| Palette, sign rarity (billboard ≤ 0.02), removal fractions, port condos with no cranes | 4 |
| CN Tower, Rogers Centre, City Hall (geometry, sizes, in a block, not water, not crater, keep) | 5 (blast survival: 7) |
| CN Tower in the starting view | 5 |
| Financial District (8–10 dark towers, RBP gold stepped, FCP tallest white), Yonge-Dundas, Nathan Phillips Square and TORONTO | 6 |
| `CITIES = [TOKYO, TORONTO]`, `pickCity` unchanged and can return either | 7 |
| Generic world tests over both cities; Tokyo's existing tests untouched (except the `r.c0` message) | 7 |
| Atmosphere back again Tokyo → Toronto → Tokyo | 1 (synthetic), 7 (real Toronto) |
| Visual checks (start, dive, CN Tower, City Hall, Don, phone portrait, switch sequence) | 8 |
| Performance soak, 25% CPU acceptance, no growth | 8 |
| Out of scope (streetcars, Gardiner, rail, snow, chosen city, more cities, Humber) | none built |

**Type consistency:**
- **Task 1:**
  - `Atmosphere`, `AtmosphereTargets`, `applyAtmosphere`, `fogDistances` and `windowGlowColor` are used unchanged
    in Tasks 4, 7 and 8.
  - `City.attachAtmosphere(Omit<AtmosphereTargets, 'windowGlow'>)` and `City.windowGlow` are used in Task 7.
  - `Lighting.hemi`, `.sun` and `.sunDir`, and `skyColors(sky)`, are used by GameScene in Task 1.
- **Task 2:**
  - `RiverSpec.c0` (Tokyo 1300, Toronto 1500).
  - `bridgeAxis`, `isRiverBank` and `blockDistrict` are used in Tasks 4 and 7.
- **Task 3:**
  - `GlyphSet`, `CityTextures.signs(glyphs)`, `CraneColors`, `DEFAULT_CRANE_COLORS`, `craneColors(style)`,
    `colors.water` and `overlayPainter` are used in Tasks 4, 6 and 7.
  - `LATIN_FONT` is used in Task 6.
- **Task 4:**
  - `blockInterior` and `lotCentre` are used in Task 6.
  - The `CITY_HALL_SITE`, `CN_TOWER_SITE` and `ROGERS_CENTRE_SITE` constants are used in Tasks 5 and 6.
- **Task 6:**
  - `PaintRect`, `SQUARE_PX` and `squareRects` are imported by `pixelTextures.ts`.
  - The overlay id `'nathan-phillips'` matches between `square.ts` and the registry.
- **Task 7:** `forcedCity(search, run, cities?)` and `cityFor(run)`.

**Review Focus → tests:**
1. Task 1 (`City atmosphere` reset round trip) and Task 3 (`City style switch`), then Task 7 (`City (Toronto)`
   switch).
2. Task 1 (`introFog` with a base).
3. Task 2 (axis-z route and nearest-road tests) and Task 7 (`road network` over both).
4. Task 7 (`fits a full load in every pool` at Toronto's lakeshore, Don mouth and island-side points).
5. Task 7 (`forcedCity` tests).

**Spec conflict, not resolved silently:** at the spec's (−700, 1900), the CN Tower is in the 16:10 start view (NDC x
0.33, y 0.71), which is the check Tokyo Tower has. In phone portrait (390 × 844) it projects to NDC x ≈ 1.07, just
outside the frame. Tokyo Tower projects to 0.52 there.
- Task 5 tests the spec's rule the way Tokyo's test does (16:10).
- Task 8 records the portrait result.
- If the tower must be on screen in portrait, moving it to (−500, 1900) puts it at NDC 0.77. That site is in the same
  block row and is still south-west of the Financial District, but it changes a spec position, so it is left to the
  user.

**Dry run:** the code and tests of Tasks 1–7 were applied, as written here, to a scratch copy of `src`
(`.../scratchpad/m6/proto`, not the repo). The results:
- `npx tsc --noEmit -p .` was clean.
- `npx vitest run` passed 88 files and 737 tests, including every existing Tokyo test.
- The screenshot script and the soak (Task 8) need the dev server serving this branch, so they were not run.
