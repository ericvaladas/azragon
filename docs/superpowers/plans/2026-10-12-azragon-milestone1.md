# AZRAGON Milestone 1 (Look & Core Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template's dice demo with a playable AZRAGON slice. The Insect Titan
stomps a pixel-rendered city while tanks and jets attack it, with EXP, level-up
choices, and game over. It runs on phone (touch) and desktop (mouse).

**Architecture:** `GameScene` is a thin orchestrator that owns small systems: render,
world, monster, enemies, and systems. Rules that can be tested without WebGL
(tap classification, progression, spawn director, monster decisions, gait, IK,
camera math, city layout, road paths, picking) live in pure TypeScript modules
with Vitest tests. Three.js classes wrap them. React renders only the HUD,
level-up cards, and game over, driven by typed `GameEvents`.

**Tech Stack:** TypeScript 5, Three.js 0.170, React 18 (UI only), Vite 6, Vitest 2, Playwright (screenshots only), RUN SDK 5.28.1, rundot CLI.

**Spec:** `docs/superpowers/specs/2026-10-12-azragon-milestone1-design.md`

## Global Constraints

- Template rules (CLAUDE.md): React is for UI only. **No `useEffect`.** The game mounts through a `useCallback` ref. No React Three Fiber/drei. No tween libraries.
- Models are Y-up and face +Z. **+X is the model's left, −X its right.** Facing yaw: `forward = (sin yaw, 0, cos yaw)` and `rotation.y = yaw`.
- **Never call `renderer.setPixelRatio()`.** DPR is `Math.min(devicePixelRatio, 2)`, applied by hand.
- Never use `logarithmicDepthBuffer`. Keep draw calls under about 150. Use `InstancedMesh` for repeated objects (buildings, trees, tanks, projectiles, particles).
- World units are metres. Monster height is about 550. `PIXEL_SCALE` defaults to 3, and the internal render height floor is 180 px.
- The game fills the window in any orientation. The template's 9:16 cap is removed.
- Input uses Pointer Events only. `touch-action: none` on the scene container. The context menu is disabled on the canvas.
- HUD: dark translucent panels, 2–6 px radius, Chakra Petch font, uppercase labels, tabular numbers, `:active` scale on buttons, React updates throttled to 10 Hz.
- All tunable numbers live in `src/config.ts`. Gameplay code must not contain magic numbers that a designer would want to tune.
- Frame delta is clamped to 0.05 s.
- Every SDK call is wrapped in try/catch. Read `.rundot-docs` before adding SDK usage.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Tapping tiny or fast targets on a phone:** a tap within 28 CSS px of a tank's or jet's on-screen position selects it, even when the raycast misses. Pinned by the `pickEnemy` tests (Task 6).
2. **Resize or orientation change mid-run, including 0×0 sizes during layout:** the render target and camera field of view update without crashing or stretching. Pinned by the `internalSize` and `fovForAspect` tests (Tasks 2 and 5).
3. **Backgrounded tab or a long frame:** a huge delta must not teleport the monster or flood spawns. Pinned by the `clampDelta` test (Task 1) and the director cap tests (Task 9).
4. **One big EXP gain that crosses several levels:** each level produces its own upgrade offer, shown one at a time. Pinned by the Progression multi-level test (Task 10).
5. **A target dies while being attacked or while spikes are in flight:** the monster goes idle or auto-defends, and spikes finish at their last aim point without errors. Pinned by the `decide` dead-target test (Task 7) and the Projectiles code path (Task 8).

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | All tunable constants |
| `src/util/rng.ts` | Seeded RNG (`mulberry32`), `pick`, `shuffle` |
| `src/util/math.ts` | `clampDelta`, `damp`, `Vec2` helpers |
| `src/render/PixelRenderer.ts` | Low-res render target, nearest-filter upscale, resize |
| `src/render/pixelSize.ts` | Pure `internalSize()` |
| `src/render/toon.ts` | Shared toon gradient map, `toonMat()`, `faceted()` |
| `src/render/Sky.ts` | Gradient sky dome and fog |
| `src/render/Lighting.ts` | Sun and hemisphere light; shadow area follows the monster |
| `src/world/cityLayout.ts` | Pure city generator (buildings, parks, trees, road grid) |
| `src/world/roads.ts` | Pure `snapToRoad`, `planRoadPath` |
| `src/world/pixelTextures.ts` | Canvas 2D textures (facades, ground map) |
| `src/world/City.ts` | Instanced buildings, rubble, trees, ground; damage and collapse |
| `src/monster/ik.ts` | Pure two-bone IK and segment placement math |
| `src/monster/gait.ts` | Pure tripod gait (`footState`, `didLand`) |
| `src/monster/brain.ts` | Pure order/attack decision (`decide`, `autoTarget`) |
| `src/monster/InsectTitanModel.ts` | Builds the meshes; exposes leg and tail rig nodes |
| `src/monster/Monster.ts` | Movement, gait animation, attacks, HP, hit flash, death |
| `src/systems/orbit.ts` | Pure camera pose, drag/zoom clamps, `fovForAspect` |
| `src/systems/CameraRig.ts` | Applies pose to camera, trauma shake |
| `src/systems/tap.ts` | Pure `classifyGesture`, `pickEnemy` |
| `src/systems/Input.ts` | Pointer events → tap/drag/hover/wheel callbacks |
| `src/systems/Particles.ts` | Pooled instanced particles |
| `src/systems/Projectiles.ts` | Pooled shells, rockets, spikes |
| `src/systems/Progression.ts` | Pure EXP, levels, upgrade offers, modifier stats |
| `src/enemies/SpawnDirector.ts` | Pure spawn budget and caps |
| `src/enemies/TankFleet.ts` | Instanced tanks: road driving, firing, death |
| `src/enemies/JetSquadron.ts` | Jets: strafing passes, rockets, crash |
| `src/enemies/steer.ts` | Pure `steerToward` |
| `src/combat.ts` | `Target` interface shared by monster, enemies, and buildings |
| `src/GameScene.ts` | Orchestrator: state machine, loop, wiring, events |
| `src/GameEvents.ts` | Event map: state, hud, expGain, levelUpOffer, gameOver |
| `src/ui/Hud.tsx`, `src/ui/LevelUpCards.tsx`, `src/ui/GameOver.tsx` | React overlays |
| `src/App.tsx`, `src/style.css`, `src/theme.ts`, `index.html` | Shell, styles, theme, font |
| `scripts/screenshot.mjs` | Playwright screenshots at 390×844 and 1440×900 |

Tests sit next to their modules as `*.test.ts`.

### Task 1: Tooling, config, utilities, full-window shell

Removes the dice demo, adds Vitest and the screenshot script, adds `config.ts` and
the utilities, and makes the app fill the window. The deliverable is a running
game that shows a clear-colored canvas, plus passing unit tests.

**Files:**
- Modify: `package.json` (scripts, devDeps)
- Create: `vitest.config.ts`, `src/config.ts`, `src/util/rng.ts`, `src/util/math.ts`, `src/util/rng.test.ts`, `src/util/math.test.ts`, `scripts/screenshot.mjs`
- Modify: `src/GameScene.ts` (strip to skeleton), `src/GameEvents.ts`, `src/App.tsx`, `src/style.css`, `src/theme.ts`, `index.html`
- Delete: `assets/*Dice*`, `src/loadStowKitPack.ts` stays (unused for now, kept for later milestones)

**Interfaces:**
- Produces: `CONFIG` (shape below); `mulberry32(seed): () => number`; `shuffle<T>(arr, rng): T[]`; `pick<T>(arr, rng): T`; `clampDelta(dt): number`; `damp(current, target, lambda, dt): number`; `type Vec2 = { x: number; z: number }`; `dist2(a: Vec2, b: Vec2): number`.
- Produces: `GameState = 'loading' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover'`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest@2.1.9 playwright@1.48.2
npx playwright install chromium
```

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"shot": "node scripts/screenshot.mjs"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 2: Write failing tests for the utilities**

`src/util/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle, pick } from './rng';

describe('mulberry32', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle / pick', () => {
  it('shuffle returns a permutation without mutating input', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, mulberry32(1));
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
  it('pick returns an element', () => {
    expect([7, 8, 9]).toContain(pick([7, 8, 9], mulberry32(3)));
  });
});
```

`src/util/math.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampDelta, damp, dist2 } from './math';

describe('clampDelta', () => {
  it('caps long frames at 0.05s and floors negatives at 0', () => {
    expect(clampDelta(3)).toBe(0.05);
    expect(clampDelta(0.016)).toBeCloseTo(0.016);
    expect(clampDelta(-1)).toBe(0);
  });
});

describe('damp', () => {
  it('moves toward target, never overshoots', () => {
    const v = damp(0, 10, 5, 0.1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
    expect(damp(0, 10, 5, 100)).toBeCloseTo(10);
  });
});

describe('dist2', () => {
  it('is horizontal distance', () => {
    expect(dist2({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/util`
Expected: FAIL (cannot resolve `./rng` and `./math`).

- [ ] **Step 4: Implement the utilities**

`src/util/rng.ts`:

```ts
/** Seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates on a copy. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function range(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}
```

`src/util/math.ts`:

```ts
export type Vec2 = { x: number; z: number };

export const MAX_DELTA = 0.05;

/** Frame delta clamped to [0, MAX_DELTA] so hitches and backgrounded tabs never teleport anything. */
export function clampDelta(dt: number): number {
  return Math.min(MAX_DELTA, Math.max(0, dt));
}

/** Frame-rate-independent exponential approach. Larger lambda is snappier. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Horizontal (XZ) distance. */
export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Yaw so that forward = (sin yaw, cos yaw) points from `from` to `to`. */
export function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/util`
Expected: PASS (6 tests).

- [ ] **Step 6: Create `src/config.ts`**

```ts
/** All tunable constants. World units are metres; times are seconds. */
export const CONFIG = {
  render: {
    pixelScale: 3,
    minInternalHeight: 180,
    shadowMapSize: 1024,
    shadowExtent: 900,
  },
  palette: {
    skyZenith: 0x6f9fd8,
    skyHorizon: 0xcfdfe8,
    fog: 0xb9cbd6,
    ground: 0x8fb46a,
    groundDark: 0x6f9a52,
    ochre: 0xc9b06a,
    road: 0x9a9184,
    roadLine: 0xd9d0b8,
    sun: 0xfff1d6,
    hemiSky: 0xcfe3ff,
    hemiGround: 0x6b5a3a,
    buildingFacades: [0xe8d9c4, 0xc9d6df, 0xe6c3b0, 0xd4dcc2, 0xbfb8d6],
    roof: 0x5d5a66,
    carapace: 0x7fd41e,
    carapaceDark: 0x4e8f12,
    joint: 0x7a2fa8,
    stinger: 0xe8ff6a,
    eye: 0xffe14d,
    tank: 0x6b7a3a,
    tankDark: 0x4a5528,
    jet: 0x9aa3ad,
    fire: 0xff8a1f,
    smoke: 0x4d4a48,
    dust: 0xcbb592,
    debris: 0x8a8378,
  },
  fog: { near: 1500, far: 6500 },
  camera: {
    near: 5,
    far: 12000,
    baseVFovDeg: 60,
    maxHFovDeg: 82,
    defaultYaw: 0,
    defaultPitch: 0.42,
    minPitch: 0.12,
    maxPitch: 1.15,
    defaultDistance: 900,
    minDistance: 600,
    maxDistance: 1500,
    shoulderHeight: 430,
    shoulderOffset: 120,
    lookAhead: 500,
    dragSensitivity: 0.006,
    wheelSensitivity: 0.8,
    shakeMaxOffset: 22,
    shakeDecay: 1.6,
  },
  input: { tapMaxMovePx: 10, tapMaxMs: 300, pickRadiusPx: 28 },
  world: {
    seed: 1337,
    citySize: 4000,
    blockSize: 200,
    roadWidth: 36,
    clearRadius: 380,
    parkChance: 0.12,
    minBuildingH: 20,
    maxBuildingH: 120,
    groundExtent: 30000,
    buildingHpPerMetre: 1.5,
    buildingExpPerHp: 0.05,
    collapseTime: 1.4,
  },
  monster: {
    height: 550,
    maxHp: 1000,
    regenPerSec: 4,
    moveSpeed: 70,
    turnRate: 1.4,
    arriveRadius: 25,
    bodyRadius: 170,
    contactDps: 220,
    strideLength: 260,
    meleeRange: 300,
    meleeRadius: 170,
    meleeDamage: 60,
    meleeCooldown: 1.2,
    meleeWindup: 0.3,
    spikeRange: 1700,
    spikeDamage: 40,
    spikeCooldown: 0.9,
    spikeSpeed: 1100,
    spikeSpreadRad: 0.12,
    deathTime: 2.2,
  },
  tank: { hp: 30, speed: 28, range: 950, damage: 6, fireCooldown: 3.2, shellFlightTime: 1.6, shellArc: 140, exp: 5, size: 24 },
  jet: { hp: 60, speed: 260, altitude: 430, turnRate: 0.9, damage: 10, rocketsPerSalvo: 3, salvoMin: 700, salvoMax: 1600, rocketSpeed: 650, exp: 15, size: 36, hitRadius: 70, exitDistance: 2600 },
  director: {
    baseRate: 0.35,
    rateGrowthPerMin: 0.45,
    budgetCap: 12,
    tankCost: 1,
    jetCost: 4,
    jetUnlockTime: 30,
    jetChance: 0.3,
    maxTanks: 40,
    maxJets: 8,
    spawnRing: 2300,
  },
  progression: { expBase: 40, expExponent: 1.35, offerCount: 3 },
  hudHz: 10,
} as const;
```

- [ ] **Step 7: Strip GameScene to a skeleton, and update events, layout, theme and font**

Replace `src/GameEvents.ts`:

```ts
export type GameState = 'loading' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover';

export type HudSnapshot = {
  hp: number;
  maxHp: number;
  exp: number;
  expToNext: number;
  level: number;
  timeSec: number;
};

export type UpgradeOffer = { id: string; title: string; desc: string; icon: string };

export type RunStats = { timeSec: number; kills: number; buildings: number; level: number };

export type GameEventMap = {
  stateChange: GameState;
  hud: HudSnapshot;
  expGain: number;
  levelUpOffer: UpgradeOffer[];
  gameOver: RunStats;
};

type Handler<T> = (data: T) => void;

export class GameEventEmitter {
  private listeners = new Map<keyof GameEventMap, Set<Handler<any>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof GameEventMap>(event: K, data: GameEventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
```

Replace `src/GameScene.ts` with a skeleton. Later tasks fill it in, so keep the section comments:

```ts
import * as THREE from 'three';
import { GameEventEmitter, type GameState } from './GameEvents';
import { clampDelta } from './util/math';

export class GameScene {
  readonly events = new GameEventEmitter();

  private state: GameState = 'loading';
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 5, 12000);
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private resizeObserver: ResizeObserver;

  constructor(private container: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x6f9fd8);
    container.appendChild(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.clock.start();
    this.update();
    this.setState('playing');
  }

  getState(): GameState {
    return this.state;
  }

  restart(): void {
    this.setState('playing');
  }

  private setState(next: GameState): void {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('stateChange', next);
  }

  private onResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;
    const { width: w, height: h } = entry.contentRect;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(w * dpr, h * dpr, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const dt = clampDelta(this.clock.getDelta());
    void dt;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.removeAll();
    void this.container;
  }
}
```

Replace `src/App.tsx`. This is a temporary shell; Task 11 adds the HUD components:

```tsx
import { useRef, useCallback } from 'react';
import { GameScene } from './GameScene';
import './style.css';

function App() {
  const gameRef = useRef<GameScene | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (container && !gameRef.current) {
      gameRef.current = new GameScene(container);
    }
  }, []);

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div className="hud" />
    </div>
  );
}

export default App;
```

In `src/style.css`:
- In `.app-container`, delete the `max-width: 720px;`, `max-height: 1280px;` and `aspect-ratio: 9 / 16;` lines, so the app fills the window.
- Change the `html, body` `font-family` to `'Chakra Petch', system-ui, sans-serif`.
- Delete the `.hud-score` and `.hud-gameover*` rules. Task 11 replaces them.
- Add `.scene-container canvas { display: block; image-rendering: pixelated; }`.
- Add `.scene-container { cursor: default; } .scene-container.can-target { cursor: crosshair; }`.

In `index.html`:
- Set the title to `<title>AZRAGON</title>`.
- Add these tags to `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&display=swap" rel="stylesheet" />
```

Replace the token values in `src/theme.ts`:

```ts
export const theme = {
  background: '#0d1110',
  surface: '#161d1a',
  primary: '#9be22d',
  secondary: '#a24bd8',
  text: '#f2f5e8',
  textMuted: 'rgba(242, 245, 232, 0.7)',
};
```

Also update the `:root` fallback values in `style.css` to match these tokens.

Delete the dice source assets, then rebuild the pack:

```bash
git rm assets/SM_Dice.fbx assets/SM_Dice.fbx.stowmeta assets/M_Dice.stowmat assets/M_Dice.stowmat.stowmeta assets/T_Dice.png assets/T_Dice.png.stowmeta
npx stowkit build || echo "stowkit build unavailable; pack unused in M1"
```

- [ ] **Step 8: Create the screenshot script**

`scripts/screenshot.mjs` captures a phone portrait shot and a desktop shot from a running dev server:

```js
// Usage: npm run dev (in another shell), then: npm run shot -- [url] [waitMs] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const waitMs = Number(process.argv[3] ?? 5000);
const outDir = process.argv[4] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${s.name}]`, m.text()); });
  page.on('pageerror', (e) => console.error(`[${s.name}] pageerror`, e.message));
  await page.goto(url);
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${outDir}/${s.name}.png` });
  console.log(`wrote ${outDir}/${s.name}.png`);
  await page.close();
}
await browser.close();
```

Add `screenshots/` to `.gitignore`.

- [ ] **Step 9: Verify the build and run a smoke test**

Run: `npm run build && npm test`
Expected: tsc and the vite build succeed, and all tests pass.
Run: `npm run dev` (background), then `npm run shot`.
Expected: both PNGs show a solid sky-blue canvas filling the whole viewport. The console shows no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Set up AZRAGON shell: config, utils, Vitest, screenshots, full-window layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Pixel renderer, toon materials, sky, lighting

Delivers the core look: a low-res scene upscaled with crisp pixels, two-tone
toon lighting, a gradient sky and fog. To check it, render a temporary ground
plane and a reference block that is removed in Task 3.

**Files:**
- Create: `src/render/pixelSize.ts`, `src/render/pixelSize.test.ts`, `src/render/PixelRenderer.ts`, `src/render/toon.ts`, `src/render/Sky.ts`, `src/render/Lighting.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `CONFIG`, `clampDelta`.
- Produces:
  - `internalSize(cssW: number, cssH: number, pixelScale: number, minH: number): { w: number; h: number }`
  - `class PixelRenderer { readonly renderer: THREE.WebGLRenderer; readonly domElement: HTMLCanvasElement; resize(cssW: number, cssH: number): void; render(scene: THREE.Scene, camera: THREE.Camera): void; dispose(): void }`
  - `toonMat(color: THREE.ColorRepresentation, opts?: { emissive?: THREE.ColorRepresentation; map?: THREE.Texture }): THREE.MeshToonMaterial`
  - `faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry`
  - `createSky(scene: THREE.Scene): THREE.Mesh` (it also sets `scene.fog`)
  - `class Lighting { constructor(scene: THREE.Scene); follow(target: THREE.Vector3): void }`

- [ ] **Step 1: Write the failing test for `internalSize`**

`src/render/pixelSize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { internalSize } from './pixelSize';

describe('internalSize', () => {
  it('divides by pixelScale and keeps aspect', () => {
    expect(internalSize(1440, 900, 3, 180)).toEqual({ w: 480, h: 300 });
  });
  it('enforces the minimum internal height on small screens', () => {
    const s = internalSize(390, 500, 3, 180);
    expect(s.h).toBe(180);
    expect(s.w).toBe(Math.round(180 * (390 / 500)));
  });
  it('never exceeds the CSS size', () => {
    expect(internalSize(200, 120, 3, 180)).toEqual({ w: 200, h: 120 });
  });
  it('returns at least 1x1 for zero sizes', () => {
    expect(internalSize(0, 0, 3, 180)).toEqual({ w: 1, h: 1 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/render/pixelSize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `internalSize`**

`src/render/pixelSize.ts`:

```ts
/** Low-res render target size for a CSS viewport. Keeps aspect, floors height at minH, never upsamples past CSS size. */
export function internalSize(cssW: number, cssH: number, pixelScale: number, minH: number): { w: number; h: number } {
  if (cssW <= 0 || cssH <= 0) return { w: 1, h: 1 };
  const h = Math.min(cssH, Math.max(minH, Math.round(cssH / pixelScale)));
  const w = Math.max(1, Math.round(h * (cssW / cssH)));
  return { w, h: Math.max(1, h) };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/render/pixelSize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `PixelRenderer`**

`src/render/PixelRenderer.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { internalSize } from './pixelSize';

/** Renders the scene into a low-res sRGB target, then draws it full-screen with nearest filtering. */
export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.domElement = this.renderer.domElement;
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    container.appendChild(this.domElement);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: THREE.SRGBColorSpace,
    });

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false }),
    );
    this.quadScene.add(quad);
  }

  /** Call with the container's CSS size (from ResizeObserver contentRect). */
  resize(cssW: number, cssH: number): void {
    const { w, h } = internalSize(cssW, cssH, CONFIG.render.pixelScale, CONFIG.render.minInternalHeight);
    this.target.setSize(w, h);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)), false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.renderer.dispose();
    this.domElement.remove();
  }
}
```

- [ ] **Step 6: Implement toon materials, sky and lighting**

`src/render/toon.ts`:

```ts
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Shared 3-step light ramp: shadow, mid, lit. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMat(
  color: THREE.ColorRepresentation,
  opts: { emissive?: THREE.ColorRepresentation; map?: THREE.Texture } = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive ?? 0x000000,
    map: opts.map ?? null,
  });
}

/** Non-indexed copy with per-face normals, for a faceted low-poly look under toon shading. */
export function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo.clone();
  out.computeVertexNormals();
  return out;
}
```

`src/render/Sky.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';

/** Gradient dome (horizon → zenith) that ignores fog, plus scene fog tinted to the horizon. */
export function createSky(scene: THREE.Scene): THREE.Mesh {
  const { skyZenith, skyHorizon, fog } = CONFIG.palette;
  const geo = new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 16, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(skyZenith) },
      horizon: { value: new THREE.Color(skyHorizon) },
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
  scene.fog = new THREE.Fog(fog, CONFIG.fog.near, CONFIG.fog.far);
  return sky;
}
```

`src/render/Lighting.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';

const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const SUN_DISTANCE = 2000;

/** Sun with a tight shadow box that follows the monster, plus hemisphere fill. */
export class Lighting {
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    const { palette, render } = CONFIG;
    scene.add(new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 1.1));

    this.sun = new THREE.DirectionalLight(palette.sun, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(render.shadowMapSize, render.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -render.shadowExtent;
    cam.right = render.shadowExtent;
    cam.top = render.shadowExtent;
    cam.bottom = -render.shadowExtent;
    cam.near = 100;
    cam.far = SUN_DISTANCE * 2;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 2;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Keep the shadow box centred on the target (the monster). The sky dome follows the camera. */
  follow(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(SUN_DIR, SUN_DISTANCE);
  }

  attachSky(sky: THREE.Mesh): void {
    this.sky = sky;
  }

  followCamera(camera: THREE.Camera): void {
    this.sky?.position.copy(camera.position);
  }
}
```

- [ ] **Step 7: Wire them into GameScene, with a temporary look-check scene**

In `src/GameScene.ts`:
- Replace the raw `WebGLRenderer` with `PixelRenderer`.
- Create the sky and lighting.
- Add a temporary ground plane and a 550-tall reference pillar, for checking the look.
- Have resize call `pixelRenderer.resize(w, h)` and update the camera aspect.

Replace the constructor body, resize handler, update loop, and dispose with:

```ts
// fields
private pixel: PixelRenderer;
private lighting: Lighting;
private tmpLookCheck: THREE.Group | null = null; // removed in Task 3

constructor(private container: HTMLDivElement) {
  this.pixel = new PixelRenderer(container);
  this.camera.near = CONFIG.camera.near;
  this.camera.far = CONFIG.camera.far;
  this.lighting = new Lighting(this.scene);
  this.lighting.attachSky(createSky(this.scene));

  // Temporary look-check content (Task 3 replaces with the city)
  this.tmpLookCheck = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), toonMat(CONFIG.palette.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const pillar = new THREE.Mesh(faceted(new THREE.CylinderGeometry(60, 90, 550, 6)), toonMat(CONFIG.palette.carapace));
  pillar.position.y = 275;
  pillar.castShadow = true;
  for (let i = 0; i < 30; i++) {
    const h = 20 + ((i * 37) % 100);
    const b = new THREE.Mesh(new THREE.BoxGeometry(60, h, 60), toonMat(CONFIG.palette.buildingFacades[i % 5]!));
    b.position.set(((i % 6) - 3) * 160, h / 2, Math.floor(i / 6) * 160 + 200);
    b.castShadow = b.receiveShadow = true;
    this.tmpLookCheck.add(b);
  }
  this.tmpLookCheck.add(ground, pillar);
  this.scene.add(this.tmpLookCheck);
  this.camera.position.set(-120, 430 + 380, -820);
  this.camera.lookAt(0, 300, 400);
  this.lighting.follow(new THREE.Vector3());

  this.resizeObserver = new ResizeObserver(this.onResize);
  this.resizeObserver.observe(container);
  this.clock.start();
  this.update();
  this.setState('playing');
}

private onResize = (entries: ResizeObserverEntry[]) => {
  const entry = entries[0];
  if (!entry) return;
  const { width: w, height: h } = entry.contentRect;
  if (w === 0 || h === 0) return;
  this.pixel.resize(w, h);
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
};

private update = () => {
  this.animationFrameId = requestAnimationFrame(this.update);
  const dt = clampDelta(this.clock.getDelta());
  void dt;
  this.lighting.followCamera(this.camera);
  this.pixel.render(this.scene, this.camera);
};

dispose(): void {
  cancelAnimationFrame(this.animationFrameId);
  this.resizeObserver.disconnect();
  this.pixel.dispose();
  this.events.removeAll();
  void this.container;
}
```

Remove the old `renderer` field. Add these imports: `CONFIG`, `PixelRenderer`, `Lighting`, `createSky`, `toonMat`, `faceted`.

- [ ] **Step 8: Verify the build and take screenshots**

Run: `npm run build && npm test` and expect both to pass.
Run: `npm run dev` (background) and `npm run shot`.
Expected in `screenshots/phone.png` and `desktop.png`:
- Visibly chunky pixels.
- A banded blue sky fading to pale haze.
- A two-tone shaded green pillar with a shadow.
- Pastel blocks fading into fog.

Show both screenshots to the user and adjust `pixelScale` or the palette if they ask. **This is the first visual checkpoint. Wait for user feedback before Task 3.**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add pixel renderer, toon materials, gradient sky, lighting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: City — layout, roads, pixel textures, destructible instanced buildings

Delivers the generated city: a pixel-art ground map with roads and a crater
clearing, instanced buildings with window facades, park trees, and building
damage → collapse → rubble. It also adds the shared `Target` interface.

**Files:**
- Create: `src/combat.ts`, `src/world/roads.ts`, `src/world/roads.test.ts`, `src/world/cityLayout.ts`, `src/world/cityLayout.test.ts`, `src/world/pixelTextures.ts`, `src/world/City.ts`
- Modify: `src/GameScene.ts` (remove `tmpLookCheck` and add `City`)

**Interfaces:**
- Consumes: `CONFIG`, `mulberry32`, `range`, `Vec2`, `toonMat`, `faceted`.
- Produces:
  - `type TargetKind = 'tank' | 'jet' | 'building'`
  - `interface Target { readonly kind: TargetKind; readonly position: THREE.Vector3; readonly radius: number; readonly airborne: boolean; isAlive(): boolean; applyDamage(amount: number): void }`
  - `type OnDestroyed = (target: Target, exp: number) => void`
  - `snapToRoad(v: number, origin: number, pitch: number): number`
  - `planRoadPath(start: Vec2, goal: Vec2, origin: number, pitch: number): Vec2[]`
  - `type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; style: number }`
  - `type CityLayout = { buildings: BuildingSpec[]; trees: { x: number; z: number; s: number }[]; roadOrigin: number; pitch: number; half: number }`
  - `generateCityLayout(seed: number): CityLayout`
  - `class City { readonly layout: CityLayout; readonly buildingMesh: THREE.InstancedMesh; constructor(scene: THREE.Scene, layout: CityLayout, onDestroyed: OnDestroyed); targetForInstance(id: number): Target | null; forEachStandingInRadius(p: Vec2, r: number, fn: (t: Target) => void): void; update(dt: number): void; reset(): void; destroyedCount(): number }`
  - `City` also takes an `onCollapseStart: (pos: THREE.Vector3, size: number) => void` hook, set as the public field `city.onCollapseStart`, which `GameScene` uses for dust and shake.

- [ ] **Step 1: Create `src/combat.ts`**

```ts
import type * as THREE from 'three';

export type TargetKind = 'tank' | 'jet' | 'building';

/** Anything the monster can attack. Owners apply damage and report destruction via OnDestroyed. */
export interface Target {
  readonly kind: TargetKind;
  /** World-space aim point (centre of mass). Updated by the owner each frame. */
  readonly position: THREE.Vector3;
  /** Horizontal radius used for range checks. */
  readonly radius: number;
  readonly airborne: boolean;
  isAlive(): boolean;
  applyDamage(amount: number): void;
}

export type OnDestroyed = (target: Target, exp: number) => void;
```

- [ ] **Step 2: Write failing tests for roads and the city layout**

`src/world/roads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { snapToRoad, planRoadPath } from './roads';

const O = -2000;
const P = 200;

describe('snapToRoad', () => {
  it('snaps to the nearest road line', () => {
    expect(snapToRoad(90, O, P)).toBe(0);
    expect(snapToRoad(110, O, P)).toBe(200);
    expect(snapToRoad(-2000, O, P)).toBe(-2000);
  });
});

describe('planRoadPath', () => {
  it('from a north-south road: drive along z, then along x', () => {
    const path = planRoadPath({ x: -2000, z: 600 }, { x: 330, z: -170 }, O, P);
    expect(path).toEqual([{ x: -2000, z: -200 }, { x: 400, z: -200 }]);
  });
  it('from an east-west road: drive along x, then along z', () => {
    const path = planRoadPath({ x: 777, z: 2000 }, { x: -30, z: 10 }, O, P);
    expect(path).toEqual([{ x: 0, z: 2000 }, { x: 0, z: 0 }]);
  });
  it('drops zero-length legs', () => {
    expect(planRoadPath({ x: 0, z: 1000 }, { x: 10, z: 0 }, O, P)).toEqual([{ x: 0, z: 0 }]);
  });
});
```

`src/world/cityLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateCityLayout } from './cityLayout';
import { CONFIG } from '../config';

describe('generateCityLayout', () => {
  const a = generateCityLayout(1337);

  it('is deterministic per seed', () => {
    expect(generateCityLayout(1337)).toEqual(a);
    expect(generateCityLayout(7).buildings).not.toEqual(a.buildings);
  });

  it('produces a dense city', () => {
    expect(a.buildings.length).toBeGreaterThan(500);
    expect(a.trees.length).toBeGreaterThan(20);
  });

  it('keeps the crater clearing empty', () => {
    for (const b of a.buildings) {
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(CONFIG.world.clearRadius);
    }
  });

  it('never places a building across a road line', () => {
    const cell = (v: number) => Math.floor((v - a.roadOrigin) / a.pitch);
    for (const b of a.buildings) {
      expect(cell(b.x - b.w / 2)).toBe(cell(b.x + b.w / 2));
      expect(cell(b.z - b.d / 2)).toBe(cell(b.z + b.d / 2));
    }
  });

  it('heights stay within config bounds', () => {
    for (const b of a.buildings) {
      expect(b.h).toBeGreaterThanOrEqual(CONFIG.world.minBuildingH);
      expect(b.h).toBeLessThanOrEqual(CONFIG.world.maxBuildingH);
    }
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/world`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement roads and the layout**

`src/world/roads.ts`:

```ts
import type { Vec2 } from '../util/math';

export function snapToRoad(v: number, origin: number, pitch: number): number {
  return origin + Math.round((v - origin) / pitch) * pitch;
}

function onLine(v: number, origin: number, pitch: number): boolean {
  return Math.abs(v - snapToRoad(v, origin, pitch)) < 1e-6;
}

/**
 * L-shaped path along the road grid from `start` (which sits on a road line) to the
 * intersection nearest `goal`. Zero-length legs are dropped.
 */
export function planRoadPath(start: Vec2, goal: Vec2, origin: number, pitch: number): Vec2[] {
  const end = { x: snapToRoad(goal.x, origin, pitch), z: snapToRoad(goal.z, origin, pitch) };
  const corner = onLine(start.x, origin, pitch) ? { x: start.x, z: end.z } : { x: end.x, z: start.z };
  const path: Vec2[] = [];
  if (corner.x !== start.x || corner.z !== start.z) path.push(corner);
  if (end.x !== corner.x || end.z !== corner.z) path.push(end);
  return path;
}
```

`src/world/cityLayout.ts`:

```ts
import { CONFIG } from '../config';
import { mulberry32, range } from '../util/rng';

export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; style: number };

export type CityLayout = {
  buildings: BuildingSpec[];
  trees: { x: number; z: number; s: number }[];
  roadOrigin: number;
  pitch: number;
  half: number;
};

/** Grid city: roads on every block line, 2x2 lots per block, parks, and an empty crater clearing at the origin. */
export function generateCityLayout(seed: number): CityLayout {
  const w = CONFIG.world;
  const rng = mulberry32(seed);
  const half = w.citySize / 2;
  const pitch = w.blockSize;
  const n = Math.floor(w.citySize / pitch);
  const inner = pitch - w.roadWidth;
  const lot = inner / 2;
  const buildings: BuildingSpec[] = [];
  const trees: { x: number; z: number; s: number }[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = -half + (i + 0.5) * pitch;
      const cz = -half + (j + 0.5) * pitch;
      if (Math.hypot(cx, cz) < w.clearRadius + pitch * 0.5) continue;

      if (rng() < w.parkChance) {
        const count = 6 + Math.floor(rng() * 5);
        for (let t = 0; t < count; t++) {
          trees.push({ x: cx + range(rng, -inner / 2, inner / 2), z: cz + range(rng, -inner / 2, inner / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          if (rng() > 0.78) continue;
          const bw = lot * range(rng, 0.55, 0.85);
          const bd = lot * range(rng, 0.55, 0.85);
          const t = rng();
          buildings.push({
            x: cx + (a - 0.5) * lot,
            z: cz + (b - 0.5) * lot,
            w: bw,
            d: bd,
            h: w.minBuildingH + (w.maxBuildingH - w.minBuildingH) * t * t,
            style: Math.floor(rng() * CONFIG.palette.buildingFacades.length),
          });
        }
      }
    }
  }

  return { buildings, trees, roadOrigin: -half, pitch, half };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/world`
Expected: PASS (9 tests). If "dense city" fails, the parameters drifted; check `blockSize` and `clearRadius` against the spec and don't loosen the test.

- [ ] **Step 6: Implement the pixel textures**

`src/world/pixelTextures.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CityLayout } from './cityLayout';
import { mulberry32 } from '../util/rng';

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 16x32 white facade with a window grid; tinted per instance via instanceColor. */
export function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = '#3d4a5e';
  for (let y = 2; y < 27; y += 4) {
    for (let x = 1; x < 16; x += 4) g.fillRect(x, y, 2, 2);
  }
  g.fillStyle = '#b8b0a4';
  g.fillRect(0, 29, 16, 3);
  return finish(c);
}

/** Whole-city ground map: grass with speckle, roads with dashed centre lines, and a dirt crater clearing. */
export function groundTexture(layout: CityLayout): THREE.CanvasTexture {
  const { palette, world } = CONFIG;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const px = size / world.citySize;
  const rng = mulberry32(world.seed + 1);

  g.fillStyle = hex(palette.ground);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rng() < 0.75 ? hex(palette.groundDark) : hex(palette.ochre);
    g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  }

  const roadPx = Math.max(2, Math.round(world.roadWidth * px));
  const n = Math.round(world.citySize / layout.pitch);
  for (let k = 0; k <= n; k++) {
    const p = Math.round(k * layout.pitch * px);
    g.fillStyle = hex(palette.road);
    g.fillRect(p - roadPx / 2, 0, roadPx, size);
    g.fillRect(0, p - roadPx / 2, size, roadPx);
  }
  g.fillStyle = hex(palette.roadLine);
  for (let k = 0; k <= n; k++) {
    const p = Math.round(k * layout.pitch * px);
    for (let t = 0; t < size; t += 6) {
      g.fillRect(p, t, 1, 3);
      g.fillRect(t, p, 3, 1);
    }
  }

  const r = (world.clearRadius + layout.pitch * 0.5) * px;
  g.fillStyle = hex(palette.ochre);
  g.beginPath();
  g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(palette.dust);
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    g.fillRect(Math.floor(size / 2 + Math.cos(a) * d), Math.floor(size / 2 + Math.sin(a) * d), 1, 1);
  }
  return finish(c);
}
```

- [ ] **Step 7: Implement `City`**

`src/world/City.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import type { Vec2 } from '../util/math';
import { mulberry32 } from '../util/rng';
import type { BuildingSpec, CityLayout } from './cityLayout';
import { facadeTexture, groundTexture } from './pixelTextures';
import { faceted, toonMat } from '../render/toon';

type BuildingState = 'standing' | 'collapsing' | 'rubble';

class Building implements Target {
  readonly kind = 'building' as const;
  readonly airborne = false;
  readonly position: THREE.Vector3;
  readonly radius: number;
  hp: number;
  readonly maxHp: number;
  state: BuildingState = 'standing';
  t = 0;
  tiltAxis = new THREE.Vector3();

  constructor(
    readonly index: number,
    readonly spec: BuildingSpec,
    private city: City,
  ) {
    this.position = new THREE.Vector3(spec.x, spec.h / 2, spec.z);
    this.radius = Math.max(spec.w, spec.d) / 2;
    this.maxHp = Math.round(spec.h * CONFIG.world.buildingHpPerMetre);
    this.hp = this.maxHp;
  }

  isAlive(): boolean {
    return this.state === 'standing';
  }

  applyDamage(amount: number): void {
    this.city.damage(this, amount);
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class City {
  readonly buildingMesh: THREE.InstancedMesh;
  private rubbleMesh: THREE.InstancedMesh;
  private buildings: Building[];
  private collapsing: Building[] = [];
  private destroyed = 0;
  onCollapseStart: (pos: THREE.Vector3, size: number) => void = () => {};

  constructor(
    scene: THREE.Scene,
    readonly layout: CityLayout,
    private onDestroyed: OnDestroyed,
  ) {
    const { palette, world } = CONFIG;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(world.citySize, world.citySize), toonMat(0xffffff, { map: groundTexture(layout) }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(world.groundExtent, world.groundExtent), toonMat(palette.ground));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -1;
    outer.receiveShadow = true;
    scene.add(ground, outer);

    // Unit box with base at y=0; per-face materials: sides = facade, top = roof.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const facade = toonMat(0xffffff, { map: facadeTexture() });
    const roof = toonMat(palette.roof);
    this.buildingMesh = new THREE.InstancedMesh(box, [facade, facade, roof, roof, facade, facade], layout.buildings.length);
    this.buildingMesh.castShadow = true;
    this.buildingMesh.receiveShadow = true;

    const rubbleGeo = faceted(new THREE.DodecahedronGeometry(0.5, 0)).translate(0, 0.25, 0);
    this.rubbleMesh = new THREE.InstancedMesh(rubbleGeo, toonMat(palette.debris), layout.buildings.length);
    this.rubbleMesh.receiveShadow = true;

    this.buildings = layout.buildings.map((spec, i) => new Building(i, spec, this));
    const color = new THREE.Color();
    for (const b of this.buildings) {
      this.buildingMesh.setColorAt(b.index, color.setHex(palette.buildingFacades[b.spec.style]!));
    }
    this.reset();
    scene.add(this.buildingMesh, this.rubbleMesh);
    this.addTrees(scene);
  }

  private addTrees(scene: THREE.Scene): void {
    const cone = faceted(new THREE.ConeGeometry(0.5, 1.6, 5)).translate(0, 0.8, 0);
    const trees = new THREE.InstancedMesh(cone, toonMat(CONFIG.palette.groundDark), this.layout.trees.length);
    this.layout.trees.forEach((t, i) => {
      _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.setScalar(t.s));
      trees.setMatrixAt(i, _m);
    });
    trees.castShadow = true;
    scene.add(trees);
  }

  /** Restore every building to standing; clear rubble. */
  reset(): void {
    this.collapsing = [];
    this.destroyed = 0;
    for (const b of this.buildings) {
      b.state = 'standing';
      b.hp = b.maxHp;
      b.t = 0;
      this.writeStanding(b, 0, 0);
      this.rubbleMesh.setMatrixAt(b.index, ZERO);
    }
    this.buildingMesh.instanceMatrix.needsUpdate = true;
    this.rubbleMesh.instanceMatrix.needsUpdate = true;
    if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
    this.buildingMesh.computeBoundingSphere();
  }

  targetForInstance(id: number): Target | null {
    const b = this.buildings[id];
    return b && b.isAlive() ? b : null;
  }

  forEachStandingInRadius(p: Vec2, r: number, fn: (t: Target) => void): void {
    for (const b of this.buildings) {
      if (b.state !== 'standing') continue;
      if (Math.hypot(b.spec.x - p.x, b.spec.z - p.z) <= r + b.radius) fn(b);
    }
  }

  destroyedCount(): number {
    return this.destroyed;
  }

  damage(b: Building, amount: number): void {
    if (b.state !== 'standing') return;
    b.hp -= amount;
    if (b.hp > 0) return;
    b.state = 'collapsing';
    b.t = 0;
    const rng = mulberry32(b.index + 99);
    b.tiltAxis.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    this.collapsing.push(b);
    this.destroyed++;
    this.onCollapseStart(new THREE.Vector3(b.spec.x, 0, b.spec.z), Math.max(b.spec.w, b.spec.d));
    this.onDestroyed(b, Math.max(1, Math.round(b.maxHp * CONFIG.world.buildingExpPerHp)));
  }

  /** Animate collapses: sink and tilt, then swap to rubble. */
  update(dt: number): void {
    if (this.collapsing.length === 0) return;
    const T = CONFIG.world.collapseTime;
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const b = this.collapsing[i]!;
      b.t += dt;
      const k = Math.min(1, b.t / T);
      if (k >= 1) {
        b.state = 'rubble';
        this.buildingMesh.setMatrixAt(b.index, ZERO);
        const s = b.spec;
        _q.setFromAxisAngle(UP, b.index);
        _m.compose(_p.set(s.x, 0, s.z), _q, _s.set(s.w * 1.1, s.h * 0.12 + 6, s.d * 1.1));
        this.rubbleMesh.setMatrixAt(b.index, _m);
        this.rubbleMesh.instanceMatrix.needsUpdate = true;
        this.collapsing.splice(i, 1);
      } else {
        this.writeStanding(b, k * k * b.spec.h, k * 0.3);
      }
    }
    this.buildingMesh.instanceMatrix.needsUpdate = true;
  }

  private writeStanding(b: Building, sink: number, tilt: number): void {
    const s = b.spec;
    _q.setFromAxisAngle(b.tiltAxis.lengthSq() > 0 ? b.tiltAxis : X_AXIS, tilt);
    _m.compose(_p.set(s.x, -sink, s.z), _q, _s.set(s.w, s.h, s.d));
    this.buildingMesh.setMatrixAt(b.index, _m);
  }
}
```

- [ ] **Step 8: Put the city into GameScene**

In `src/GameScene.ts`, delete the `tmpLookCheck` block and its field. Then add:

```ts
// field
private city: City;
private kills = 0;

// in constructor, after lighting
this.city = new City(this.scene, generateCityLayout(CONFIG.world.seed), this.onTargetDestroyed);

// method (Task 10 adds EXP; until then just count)
private onTargetDestroyed = (target: Target, exp: number): void => {
  if (target.kind !== 'building') this.kills++;
  void exp;
};

// in update(), before render:
this.city.update(dt);
```

Keep the temporary fixed camera from Task 2. Also add temporary debug code: on pointerdown, raycast `this.city.buildingMesh` and apply 9999 damage to the hit instance, so collapse can be checked by eye. Task 6 replaces it.

```ts
// temporary in constructor:
this.pixel.domElement.addEventListener('pointerdown', this.debugSmash);
// temporary method:
private debugSmash = (e: PointerEvent) => {
  const r = this.pixel.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
  const hit = ray.intersectObject(this.city.buildingMesh)[0];
  if (hit?.instanceId !== undefined) this.city.targetForInstance(hit.instanceId)?.applyDamage(9999);
};
```

Remove `debugSmash` in `dispose` as well.

- [ ] **Step 9: Verify the build and take screenshots**

Run: `npm run build && npm test` (both pass) and `npm run shot`.
Expected:
- A pixelated city of pastel boxes with window speckles and dark roofs.
- Grey roads with dashed lines on green ground.
- An ochre clearing in the middle.
- Clusters of dark green tree cones.
- Fog swallowing the distant blocks.

In `npm run dev`, clicking a building should make it sink and tilt for about 1.4 s, then leave a rubble mound.
Check the draw calls in the console with `renderer.info.render.calls` (temporarily log once). The expected count is under 30.

Show the screenshots to the user. **Second visual checkpoint.**

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add generated pixel city with destructible instanced buildings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Insect Titan — model, two-bone IK, tripod gait, walking

Delivers the monster model built in code: a segmented body, mandibles, glowing
eyes, a curled stinger tail, and six legs driven by IK with a tripod gait.
Movement is kinematic, toward a goal point. Task 4 includes a temporary
auto-walk so the gait can be checked by eye.

**Files:**
- Create: `src/monster/ik.ts`, `src/monster/ik.test.ts`, `src/monster/gait.ts`, `src/monster/gait.test.ts`, `src/monster/InsectTitanModel.ts`, `src/monster/Monster.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `CONFIG`, `toonMat`, `faceted`, `Vec2`, `angleDelta`, `yawTo`, `dist2`.
- Produces:
  - `solveTwoBone(hip: THREE.Vector3, foot: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3): THREE.Vector3`
  - `placeSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void` (scales Y to the length; the geometry must be height 1 and centred)
  - `TRIPOD_A: readonly number[]`, `footState(cycle: number, leg: number): { lift: number; stride: number }`, `didLand(prev: number, cur: number, leg: number): boolean`
  - `class InsectTitanModel { readonly root: THREE.Group; readonly body: THREE.Group; readonly legs: LegRig[]; readonly mandibles: THREE.Object3D[]; readonly stingerTip: THREE.Object3D; readonly materials: THREE.MeshToonMaterial[]; updateTail(time: number): void }`
  - `class Monster { readonly model: InsectTitanModel; readonly position: THREE.Vector3; yaw: number; hp: number; maxHp: number; alive: boolean; onFootLand: (p: THREE.Vector3) => void; moveToward(goal: Vec2, dt: number, speedMult: number): boolean; faceToward(p: Vec2, dt: number): number; animate(dt: number, time: number): void; forward(out: THREE.Vector3): THREE.Vector3; flash(): void; reset(): void }`
  - `faceToward` returns the remaining absolute yaw error in radians.

- [ ] **Step 1: Write failing tests for IK and gait**

`src/monster/ik.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveTwoBone } from './ik';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('solveTwoBone', () => {
  it('keeps both bone lengths when reachable', () => {
    const hip = V(0, 300, 0);
    const foot = V(300, 0, 100);
    const knee = solveTwoBone(hip, foot, 250, 330, V(200, 700, 0), new THREE.Vector3());
    expect(knee.distanceTo(hip)).toBeCloseTo(250, 3);
    expect(knee.distanceTo(foot)).toBeCloseTo(330, 3);
  });
  it('bends toward the pole', () => {
    const hip = V(0, 300, 0);
    const foot = V(300, 0, 0);
    const knee = solveTwoBone(hip, foot, 250, 330, V(0, 1000, 0), new THREE.Vector3());
    const mid = hip.clone().add(foot).multiplyScalar(0.5);
    expect(knee.y).toBeGreaterThan(mid.y);
  });
  it('straightens toward unreachable targets', () => {
    const hip = V(0, 0, 0);
    const knee = solveTwoBone(hip, V(0, 0, 2000), 250, 330, V(0, 1, 0), new THREE.Vector3());
    expect(knee.x).toBeCloseTo(0, 1);
    expect(knee.z).toBeCloseTo(250, 0);
  });
});
```

`src/monster/gait.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { footState, didLand, TRIPOD_A } from './gait';

describe('tripod gait', () => {
  it('lifts exactly tripod A mid-swing, tripod B planted', () => {
    for (let leg = 0; leg < 6; leg++) {
      const { lift } = footState(0.25, leg);
      if (TRIPOD_A.includes(leg)) expect(lift).toBeCloseTo(1);
      else expect(lift).toBe(0);
    }
  });
  it('swing goes back→front, stance front→back', () => {
    expect(footState(0, 0).stride).toBeCloseTo(-1);
    expect(footState(0.49, 0).stride).toBeGreaterThan(0.9);
    expect(footState(0, 1).stride).toBeCloseTo(1);
  });
  it('detects landing when a foot finishes its swing', () => {
    expect(didLand(0.4, 0.6, 0)).toBe(true);
    expect(didLand(0.4, 0.6, 1)).toBe(false);
    expect(didLand(0.9, 1.1, 1)).toBe(true);
    expect(didLand(0.6, 0.6, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/monster`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement IK and gait**

`src/monster/ik.ts`:

```ts
import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/**
 * Knee for a hip→knee→foot chain with bone lengths l1, l2. The knee bends toward `pole`.
 * Unreachable feet clamp to a straight (or fully folded) chain.
 */
export function solveTwoBone(
  hip: THREE.Vector3,
  foot: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  _dir.subVectors(foot, hip);
  const raw = _dir.length();
  if (raw < 1e-6) return out.copy(hip).addScaledVector(_up, l1);
  _dir.divideScalar(raw);
  const d = Math.min(Math.max(raw, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _bend.subVectors(pole, hip);
  _bend.addScaledVector(_dir, -_bend.dot(_dir));
  if (_bend.lengthSq() < 1e-8) _bend.copy(_up).addScaledVector(_dir, -_up.dot(_dir));
  _bend.normalize();
  return out.copy(hip).addScaledVector(_dir, a).addScaledVector(_bend, h);
}

/** Stretch a height-1, centred mesh between a and b. */
export function placeSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _dir.subVectors(b, a);
  const len = _dir.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) obj.quaternion.copy(_q.setFromUnitVectors(_up, _dir.divideScalar(len)));
  obj.scale.y = len;
}
```

`src/monster/gait.ts`:

```ts
/** Leg indices: 0 L-front, 1 R-front, 2 L-mid, 3 R-mid, 4 L-back, 5 R-back. Tripod A swings together. */
export const TRIPOD_A: readonly number[] = [0, 3, 4];

function phase(cycle: number, leg: number): number {
  const p = cycle + (TRIPOD_A.includes(leg) ? 0 : 0.5);
  return p - Math.floor(p);
}

/**
 * lift: 0..1 foot height factor. stride: -1 (back) .. 1 (front) along the body axis.
 * First half of a leg's phase is swing (lifted, moving forward), second half is stance (planted, moving back).
 */
export function footState(cycle: number, leg: number): { lift: number; stride: number } {
  const p = phase(cycle, leg);
  if (p < 0.5) {
    const t = p / 0.5;
    return { lift: Math.sin(Math.PI * t), stride: -1 + 2 * t };
  }
  const t = (p - 0.5) / 0.5;
  return { lift: 0, stride: 1 - 2 * t };
}

/** True when a leg's swing ended between prev and cur (the foot touched down). */
export function didLand(prev: number, cur: number, leg: number): boolean {
  if (cur <= prev) return false;
  const off = TRIPOD_A.includes(leg) ? 0 : 0.5;
  return Math.floor(prev + off - 0.5) !== Math.floor(cur + off - 0.5);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/monster`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement the model**

`src/monster/InsectTitanModel.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { placeSegment } from './ik';

export type LegRig = {
  side: 1 | -1;
  hipLocal: THREE.Vector3; // in body space
  restFoot: THREE.Vector3; // in root space
  femur: THREE.Mesh;
  tibia: THREE.Mesh;
  knee: THREE.Mesh;
};

const LEG_Z = [90, 90, 0, 0, -90, -90];
const FOOT_Z = [270, 270, 20, 20, -250, -250];
const TAIL_BASE: THREE.Vector3[] = [
  new THREE.Vector3(0, 350, -380),
  new THREE.Vector3(0, 450, -440),
  new THREE.Vector3(0, 540, -330),
  new THREE.Vector3(0, 550, -190),
  new THREE.Vector3(0, 510, -90),
];

/** Built from primitives. Faces +Z, Y-up; +X is the monster's left. ~550 tall at the stinger. */
export class InsectTitanModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly legs: LegRig[] = [];
  readonly mandibles: THREE.Object3D[] = [];
  readonly stingerTip = new THREE.Object3D();
  readonly materials: THREE.MeshToonMaterial[];
  private tailSegs: THREE.Mesh[] = [];
  private tailPts = TAIL_BASE.map((p) => p.clone());
  private stinger: THREE.Mesh;

  constructor() {
    const p = CONFIG.palette;
    const shell = toonMat(p.carapace);
    const shellDark = toonMat(p.carapaceDark);
    const joint = toonMat(p.joint);
    const glow = toonMat(p.stinger, { emissive: p.stinger });
    const eye = toonMat(p.eye, { emissive: p.eye });
    this.materials = [shell, shellDark, joint];

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const box = faceted(new THREE.BoxGeometry(1, 1, 1));
    const blob = faceted(new THREE.IcosahedronGeometry(1, 1));

    add(this.body, box, shell, [0, 300, 0], [150, 110, 200]);
    add(this.body, box, shellDark, [0, 360, 0], [110, 30, 170]);
    const abdomen = add(this.body, blob, shell, [0, 330, -210], [130, 105, 190]);
    abdomen.rotation.x = -0.25;
    for (let i = 0; i < 3; i++) add(this.body, box, shellDark, [0, 395 - i * 8, -140 - i * 70], [120 - i * 15, 18, 40]);
    add(this.body, box, shell, [0, 290, 150], [110, 90, 100]);
    add(this.body, box, eye, [36, 315, 202], [26, 18, 8]);
    add(this.body, box, eye, [-36, 315, 202], [26, 18, 8]);

    const mandibleGeo = faceted(new THREE.ConeGeometry(14, 100, 4)).rotateX(Math.PI / 2).translate(0, 0, 50);
    for (const side of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 32, 255, 195);
      const m = new THREE.Mesh(mandibleGeo, shellDark);
      m.castShadow = true;
      pivot.add(m);
      this.body.add(pivot);
      this.mandibles.push(pivot);
    }

    const tailGeo = faceted(new THREE.CylinderGeometry(0.5, 0.6, 1, 6));
    for (let i = 0; i < TAIL_BASE.length - 1; i++) {
      const r = 70 - i * 12;
      this.tailSegs.push(add(this.body, tailGeo, i % 2 ? shellDark : shell, [0, 0, 0], [r, 1, r]));
    }
    this.stinger = add(this.body, faceted(new THREE.ConeGeometry(22, 90, 5)), glow, [0, 0, 0]);
    this.body.add(this.stingerTip);
    this.updateTail(0);

    const femurGeo = faceted(new THREE.BoxGeometry(1, 1, 1));
    const tibiaGeo = faceted(new THREE.CylinderGeometry(0.35, 1, 1, 5));
    const kneeGeo = faceted(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 6; i++) {
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      this.legs.push({
        side,
        hipLocal: new THREE.Vector3(side * 75, 290, LEG_Z[i]!),
        restFoot: new THREE.Vector3(side * 330, 0, FOOT_Z[i]!),
        femur: add(this.root, femurGeo, shellDark, [0, 0, 0], [40, 1, 40]),
        tibia: add(this.root, tibiaGeo, shell, [0, 0, 0], [24, 1, 24]),
        knee: add(this.root, kneeGeo, joint, [0, 0, 0], [30, 30, 30]),
      });
    }

    this.root.add(this.body);
  }

  /** Curl and sway the tail chain; the stinger and spike origin ride on the last point. */
  updateTail(time: number): void {
    for (let i = 1; i < this.tailPts.length; i++) {
      const base = TAIL_BASE[i]!;
      const k = i / (this.tailPts.length - 1);
      this.tailPts[i]!.set(base.x + Math.sin(time * 1.3) * 25 * k, base.y + Math.sin(time * 2.1 + i) * 10 * k, base.z);
    }
    for (let i = 0; i < this.tailSegs.length; i++) {
      placeSegment(this.tailSegs[i]!, this.tailPts[i]!, this.tailPts[i + 1]!);
    }
    const tip = this.tailPts[this.tailPts.length - 1]!;
    const prev = this.tailPts[this.tailPts.length - 2]!;
    const end = tip.clone().addScaledVector(tip.clone().sub(prev).normalize(), 70);
    placeSegment(this.stinger, tip, end);
    this.stinger.scale.set(1, 1, 1);
    this.stingerTip.position.copy(end);
  }
}
```

- [ ] **Step 6: Implement `Monster` (movement and animation; attacks come in Task 7)**

`src/monster/Monster.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDelta, dist2, yawTo, type Vec2 } from '../util/math';
import { InsectTitanModel } from './InsectTitanModel';
import { didLand, footState } from './gait';
import { solveTwoBone, placeSegment } from './ik';

const FEMUR = 250;
const TIBIA = 330;
const LIFT = 110;
const FACE_BEFORE_WALK = 1.0; // radians of yaw error allowed while walking
const _hip = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _world = new THREE.Vector3();

export class Monster {
  readonly model = new InsectTitanModel();
  readonly position: THREE.Vector3;
  yaw = 0;
  hp: number = CONFIG.monster.maxHp;
  maxHp: number = CONFIG.monster.maxHp;
  alive = true;
  onFootLand: (p: THREE.Vector3) => void = () => {};

  private cycle = 0;
  private motion = 0; // 0..1 how much the gait is engaged
  private flashT = 0;
  /** Extra body pose offsets driven by attacks (Task 7) and death. */
  readonly pose = { dip: 0, pitch: 0, collapse: 0 };

  constructor(scene: THREE.Scene) {
    this.position = this.model.root.position;
    scene.add(this.model.root);
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.hp = this.maxHp = CONFIG.monster.maxHp;
    this.alive = true;
    this.cycle = 0;
    this.pose.dip = this.pose.pitch = this.pose.collapse = 0;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Rotate toward p at the capped turn rate. Returns remaining |yaw error|. */
  faceToward(p: Vec2, dt: number): number {
    const target = yawTo({ x: this.position.x, z: this.position.z }, p);
    const err = angleDelta(this.yaw, target);
    const step = Math.sign(err) * Math.min(Math.abs(err), CONFIG.monster.turnRate * dt);
    this.yaw += step;
    this.cycle += (Math.abs(step) * 160) / CONFIG.monster.strideLength;
    this.motion = Math.max(this.motion, Math.min(1, Math.abs(step) * 40));
    return Math.abs(err - step);
  }

  /** Turn, then walk toward goal. Returns true on arrival. */
  moveToward(goal: Vec2, dt: number, speedMult: number): boolean {
    const here = { x: this.position.x, z: this.position.z };
    const d = dist2(here, goal);
    if (d <= CONFIG.monster.arriveRadius) return true;
    const err = this.faceToward(goal, dt);
    if (err < FACE_BEFORE_WALK) {
      const step = Math.min(d, CONFIG.monster.moveSpeed * speedMult * dt * (1 - err / FACE_BEFORE_WALK));
      this.position.x += Math.sin(this.yaw) * step;
      this.position.z += Math.cos(this.yaw) * step;
      this.cycle += step / CONFIG.monster.strideLength;
      this.motion = 1;
    }
    return false;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  /** Pose body, legs, mandibles, tail. Call once per frame after movement. */
  animate(dt: number, time: number): void {
    const prevCycle = this.lastCycle;
    this.lastCycle = this.cycle;
    this.motion = Math.max(0, this.motion - dt * 2);

    const root = this.model.root;
    root.rotation.y = this.yaw;
    const body = this.model.body;
    const bob = Math.sin(this.cycle * Math.PI * 4) * 10 * this.motion;
    const breathe = Math.sin(time * 1.6) * 5;
    body.position.y = bob + breathe - this.pose.dip - this.pose.collapse * 230;
    body.rotation.x = this.pose.pitch;
    body.rotation.z = Math.sin(this.cycle * Math.PI * 2) * 0.03 * this.motion;
    root.updateMatrixWorld(true);

    for (let i = 0; i < 6; i++) {
      const leg = this.model.legs[i]!;
      const fs = footState(this.cycle, i);
      _hip.copy(leg.hipLocal).applyMatrix4(body.matrix);
      const splay = 1 + this.pose.collapse * 0.35;
      _foot.set(
        leg.restFoot.x * splay,
        fs.lift * LIFT * this.motion,
        leg.restFoot.z + fs.stride * (CONFIG.monster.strideLength / 2) * this.motion,
      );
      _pole.copy(_hip).add(_knee.set(leg.side * 220, 420, 0));
      solveTwoBone(_hip, _foot, FEMUR, TIBIA, _pole, _knee);
      placeSegment(leg.femur, _hip, _knee);
      placeSegment(leg.tibia, _knee, _foot);
      leg.knee.position.copy(_knee);
      if (this.motion > 0.3 && didLand(prevCycle, this.cycle, i)) {
        this.onFootLand(_world.copy(_foot).applyMatrix4(root.matrixWorld));
      }
    }

    const twitch = 0.18 + Math.sin(time * 7) * 0.08;
    this.model.mandibles[0]!.rotation.y = -twitch;
    this.model.mandibles[1]!.rotation.y = twitch;
    this.model.updateTail(time);

    if (this.flashT > 0) this.flashT -= dt;
    const e = this.flashT > 0 ? 0xffffff : 0x000000;
    for (const m of this.model.materials) m.emissive.setHex(e);
  }

  private lastCycle = 0;
}
```

`body.matrix` is current because `root.updateMatrixWorld(true)` runs before the leg loop.

- [ ] **Step 7: Add the monster to GameScene with a temporary auto-walk**

In `src/GameScene.ts`:

```ts
// fields
private monster: Monster;
private elapsed = 0;

// constructor, after city
this.monster = new Monster(this.scene);

// update(), replacing `void dt;`
this.elapsed += dt;
// TEMP (removed in Task 6): wander in a circle to check the gait
const t = this.elapsed * 0.15;
this.monster.moveToward({ x: Math.sin(t) * 260, z: Math.cos(t) * 260 }, dt, 1);
this.monster.animate(dt, this.elapsed);
this.lighting.follow(this.monster.position);
```

Move the temporary camera to `(-150, 820, -950)`, looking at `(0, 300, 300)`, so the monster is framed.

- [ ] **Step 8: Verify the build and take screenshots**

Run: `npm run build && npm test` (both pass) and `npm run shot`.
Expected:
- The insect stands in the crater with six legs reaching the ground and the tail curling over its back.
- The stinger glows and the eyes are yellow.
- It casts a big shadow over the buildings and towers over them (buildings around knee height).

In the dev server, the legs should alternate in a tripod rhythm as it circles, with no feet sliding during stance and no knee popping. If the knees bend inward, flip the pole `x` sign. Show the user. **Third visual checkpoint (monster look).**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add Insect Titan model with IK legs and tripod gait

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Over-the-shoulder camera rig (orbit math, aspect-aware FOV, shake)

Delivers the camera: it sits behind and above the monster's right shoulder,
follows smoothly, keeps a sensible field of view in both portrait and
landscape, and supports trauma-based shake. Drag and zoom inputs are wired in
Task 6.

**Files:**
- Create: `src/systems/orbit.ts`, `src/systems/orbit.test.ts`, `src/systems/CameraRig.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `CONFIG`, `damp`.
- Produces:
  - `type OrbitState = { yaw: number; pitch: number; distance: number }`
  - `applyDrag(s: OrbitState, dxPx: number, dyPx: number): OrbitState`
  - `applyZoom(s: OrbitState, wheelDeltaY: number): OrbitState`
  - `cameraPose(s: OrbitState, target: { x: number; y: number; z: number }): { pos: [number, number, number]; look: [number, number, number] }`
  - `fovForAspect(aspect: number, baseVFovDeg: number, maxHFovDeg: number): number` (returns vertical FOV in degrees)
  - `class CameraRig { readonly camera: THREE.PerspectiveCamera; orbit: OrbitState; constructor(camera: THREE.PerspectiveCamera); setAspect(aspect: number): void; drag(dx: number, dy: number): void; zoom(deltaY: number): void; addTrauma(amount: number): void; update(dt: number, target: THREE.Vector3): void; reset(): void }`

- [ ] **Step 1: Write the failing tests**

`src/systems/orbit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyDrag, applyZoom, cameraPose, fovForAspect, type OrbitState } from './orbit';
import { CONFIG } from '../config';

const C = CONFIG.camera;
const base: OrbitState = { yaw: 0, pitch: C.defaultPitch, distance: C.defaultDistance };

describe('cameraPose', () => {
  it('at yaw 0 sits behind (-Z), above, and to the right (-X) of the target, looking ahead (+Z)', () => {
    const { pos, look } = cameraPose(base, { x: 0, y: 0, z: 0 });
    expect(pos[2]).toBeLessThan(0);
    expect(pos[1]).toBeGreaterThan(C.shoulderHeight);
    expect(pos[0]).toBeLessThan(0);
    expect(look[2]).toBeGreaterThan(0);
  });
  it('at yaw π/2 sits on the -X side, looking toward +X', () => {
    const { pos, look } = cameraPose({ ...base, yaw: Math.PI / 2 }, { x: 0, y: 0, z: 0 });
    expect(pos[0]).toBeLessThan(-100);
    expect(look[0]).toBeGreaterThan(0);
  });
  it('raises the camera as pitch increases', () => {
    const lo = cameraPose({ ...base, pitch: 0.2 }, { x: 0, y: 0, z: 0 });
    const hi = cameraPose({ ...base, pitch: 1.0 }, { x: 0, y: 0, z: 0 });
    expect(hi.pos[1]).toBeGreaterThan(lo.pos[1]);
  });
});

describe('applyDrag / applyZoom', () => {
  it('drag right turns the view right (yaw decreases), drag down raises pitch', () => {
    const s = applyDrag(base, 100, 50);
    expect(s.yaw).toBeLessThan(0);
    expect(s.pitch).toBeGreaterThan(base.pitch);
  });
  it('clamps pitch and distance', () => {
    expect(applyDrag(base, 0, 1e6).pitch).toBe(C.maxPitch);
    expect(applyDrag(base, 0, -1e6).pitch).toBe(C.minPitch);
    expect(applyZoom(base, 1e6).distance).toBe(C.maxDistance);
    expect(applyZoom(base, -1e6).distance).toBe(C.minDistance);
  });
});

describe('fovForAspect', () => {
  it('keeps the base vertical FOV in portrait', () => {
    expect(fovForAspect(390 / 844, 60, 82)).toBeCloseTo(60);
  });
  it('narrows vertical FOV in wide landscape so horizontal FOV stays at the cap', () => {
    const v = fovForAspect(1.6, 60, 82);
    expect(v).toBeLessThan(60);
    const h = (2 * Math.atan(Math.tan((v * Math.PI) / 360) * 1.6) * 180) / Math.PI;
    expect(h).toBeCloseTo(82, 3);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/systems/orbit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the orbit math**

`src/systems/orbit.ts`:

```ts
import { CONFIG } from '../config';

export type OrbitState = { yaw: number; pitch: number; distance: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drag right → look right (yaw decreases, since +X is left). Drag down → higher, steeper view. */
export function applyDrag(s: OrbitState, dxPx: number, dyPx: number): OrbitState {
  const c = CONFIG.camera;
  return {
    ...s,
    yaw: s.yaw - dxPx * c.dragSensitivity,
    pitch: clamp(s.pitch + dyPx * c.dragSensitivity, c.minPitch, c.maxPitch),
  };
}

export function applyZoom(s: OrbitState, wheelDeltaY: number): OrbitState {
  const c = CONFIG.camera;
  return { ...s, distance: clamp(s.distance + wheelDeltaY * c.wheelSensitivity, c.minDistance, c.maxDistance) };
}

/** Over-the-right-shoulder pose around a target on the ground (the monster's root). */
export function cameraPose(
  s: OrbitState,
  t: { x: number; y: number; z: number },
): { pos: [number, number, number]; look: [number, number, number] } {
  const c = CONFIG.camera;
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const rx = -Math.cos(s.yaw); // character right is -X at yaw 0
  const rz = Math.sin(s.yaw);
  const back = Math.cos(s.pitch) * s.distance;
  const up = Math.sin(s.pitch) * s.distance;
  return {
    pos: [t.x - fx * back + rx * c.shoulderOffset, t.y + c.shoulderHeight + up, t.z - fz * back + rz * c.shoulderOffset],
    look: [t.x + fx * c.lookAhead + rx * c.shoulderOffset * 0.5, t.y + c.shoulderHeight * 0.55, t.z + fz * c.lookAhead + rz * c.shoulderOffset * 0.5],
  };
}

/** Vertical FOV (deg) that keeps horizontal FOV at or under maxHFovDeg. */
export function fovForAspect(aspect: number, baseVFovDeg: number, maxHFovDeg: number): number {
  const toRad = Math.PI / 180;
  const h = 2 * Math.atan(Math.tan((baseVFovDeg * toRad) / 2) * aspect);
  if (h <= maxHFovDeg * toRad) return baseVFovDeg;
  return (2 * Math.atan(Math.tan((maxHFovDeg * toRad) / 2) / aspect)) / toRad;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/systems/orbit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Implement `CameraRig`**

`src/systems/CameraRig.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { damp } from '../util/math';
import { applyDrag, applyZoom, cameraPose, fovForAspect, type OrbitState } from './orbit';

const FOLLOW_LAMBDA = 6;

export class CameraRig {
  orbit: OrbitState = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
  private trauma = 0;
  private follow = new THREE.Vector3();
  private time = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.near = CONFIG.camera.near;
    camera.far = CONFIG.camera.far;
  }

  reset(): void {
    this.orbit = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
    this.trauma = 0;
    this.follow.set(0, 0, 0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect, CONFIG.camera.baseVFovDeg, CONFIG.camera.maxHFovDeg);
    this.camera.updateProjectionMatrix();
  }

  drag(dx: number, dy: number): void {
    this.orbit = applyDrag(this.orbit, dx, dy);
  }

  zoom(deltaY: number): void {
    this.orbit = applyZoom(this.orbit, deltaY);
  }

  /** Trauma in 0..1; shake magnitude is trauma². */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, target: THREE.Vector3): void {
    this.time += dt;
    this.follow.x = damp(this.follow.x, target.x, FOLLOW_LAMBDA, dt);
    this.follow.y = damp(this.follow.y, target.y, FOLLOW_LAMBDA, dt);
    this.follow.z = damp(this.follow.z, target.z, FOLLOW_LAMBDA, dt);
    const { pos, look } = cameraPose(this.orbit, this.follow);
    const s = this.trauma * this.trauma * CONFIG.camera.shakeMaxOffset;
    const t = this.time * 40;
    this.camera.position.set(pos[0] + Math.sin(t * 1.1) * s, pos[1] + Math.sin(t * 1.7 + 1) * s, pos[2] + Math.sin(t * 1.3 + 2) * s);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.trauma = Math.max(0, this.trauma - CONFIG.camera.shakeDecay * dt);
  }
}
```

- [ ] **Step 6: Wire it into GameScene**

In `src/GameScene.ts`:
- Add the field `private rig: CameraRig;` and create it in the constructor with `this.rig = new CameraRig(this.camera);`.
- Delete the temporary fixed camera position and `lookAt`.
- In `onResize`, replace the aspect lines with `this.rig.setAspect(w / h);`.
- In `update()`, after `monster.animate`, add `this.rig.update(dt, this.monster.position);`.
- Make foot landings shake slightly: `this.monster.onFootLand = () => this.rig.addTrauma(0.08);`.

- [ ] **Step 7: Verify the build and take screenshots**

Run: `npm run build && npm test` (both pass) and `npm run shot`.
Expected:
- **Phone:** the monster's back and tail fill the lower-middle of the frame, with the city stretching ahead into the haze and sky in the upper third.
- **Desktop:** a wider view where the monster isn't oversized.

The camera should follow smoothly as the temporary auto-walk circles. Tune `shoulderHeight`, `shoulderOffset`, `defaultPitch` and `lookAhead` in `config.ts` with the user. **Fourth visual checkpoint (framing).**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add over-the-shoulder camera rig with aspect-aware FOV and shake

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Input — tap vs drag, picking, move/attack orders, markers, desktop hover and zoom

Delivers the controls. Tapping or clicking the ground walks the monster there,
with a pixel marker. Tapping a building or an enemy selects it as the attack
target, with a ring under it. Drag orbits the camera, the mouse wheel zooms,
and desktop hover shows a crosshair and hover ring. This task removes the
temporary auto-walk and debug smash.

**Files:**
- Create: `src/systems/tap.ts`, `src/systems/tap.test.ts`, `src/systems/Input.ts`, `src/systems/Markers.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `CONFIG`, `CameraRig.drag/zoom`, `City.buildingMesh`, `City.targetForInstance`, `Target`, `Monster.moveToward/animate`, `toonMat`.
- Produces:
  - `type Gesture = 'pending' | 'tap' | 'drag' | 'none'`
  - `classifyGesture(movedPx: number, elapsedMs: number, released: boolean): Gesture`
  - `type ScreenPoint = { index: number; x: number; y: number; visible: boolean }`
  - `pickEnemy(points: ScreenPoint[], x: number, y: number, radiusPx: number): number | null`
  - `class Input { constructor(el: HTMLElement, handlers: InputHandlers); dispose(): void }` with `type InputHandlers = { tap(x: number, y: number): void; drag(dx: number, dy: number): void; hover(x: number, y: number): void; wheel(deltaY: number): void }` (x and y are CSS px relative to the element)
  - `class Markers { constructor(scene: THREE.Scene); tapAt(p: THREE.Vector3): void; setTarget(t: Target | null): void; setHover(t: Target | null): void; update(dt: number): void }`
  - `type Order = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: Target } | null` (lives in GameScene)
  - `GameScene.enemyTargets(): Target[]` returns `[]` until Task 9 fills it in.

- [ ] **Step 1: Write the failing tests**

`src/systems/tap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyGesture, pickEnemy } from './tap';

describe('classifyGesture', () => {
  it('short, still release is a tap', () => {
    expect(classifyGesture(3, 120, true)).toBe('tap');
  });
  it('moving past the threshold is a drag, even before release', () => {
    expect(classifyGesture(25, 50, false)).toBe('drag');
    expect(classifyGesture(25, 50, true)).toBe('drag');
  });
  it('a long still press is neither', () => {
    expect(classifyGesture(2, 900, true)).toBe('none');
  });
  it('still and held is pending', () => {
    expect(classifyGesture(2, 100, false)).toBe('pending');
  });
});

describe('pickEnemy', () => {
  const pts = [
    { index: 0, x: 100, y: 100, visible: true },
    { index: 1, x: 120, y: 100, visible: true },
    { index: 2, x: 105, y: 102, visible: false },
  ];
  it('picks the nearest visible point within the radius', () => {
    expect(pickEnemy(pts, 112, 100, 28)).toBe(1);
    expect(pickEnemy(pts, 101, 100, 28)).toBe(0);
  });
  it('ignores points behind the camera / off-screen', () => {
    expect(pickEnemy([pts[2]!], 105, 102, 28)).toBeNull();
  });
  it('returns null when nothing is close enough', () => {
    expect(pickEnemy(pts, 300, 300, 28)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/systems/tap.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tap.ts`**

```ts
import { CONFIG } from '../config';

export type Gesture = 'pending' | 'tap' | 'drag' | 'none';

export function classifyGesture(movedPx: number, elapsedMs: number, released: boolean): Gesture {
  if (movedPx > CONFIG.input.tapMaxMovePx) return 'drag';
  if (!released) return 'pending';
  return elapsedMs <= CONFIG.input.tapMaxMs ? 'tap' : 'none';
}

export type ScreenPoint = { index: number; x: number; y: number; visible: boolean };

/** Nearest visible screen point within radiusPx of (x, y). Generous radius makes tiny targets tappable on phones. */
export function pickEnemy(points: ScreenPoint[], x: number, y: number, radiusPx: number): number | null {
  let best: number | null = null;
  let bestD = radiusPx;
  for (const p of points) {
    if (!p.visible) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = p.index;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/systems/tap.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Implement `Input`**

`src/systems/Input.ts`:

```ts
import { classifyGesture } from './tap';

export type InputHandlers = {
  tap(x: number, y: number): void;
  drag(dx: number, dy: number): void;
  hover(x: number, y: number): void;
  wheel(deltaY: number): void;
};

/** Single-pointer gesture handling over the canvas. Touch and mouse share one path; hover and wheel are mouse-only. */
export class Input {
  private activeId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private startT = 0;
  private dragging = false;

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown = (e: PointerEvent) => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    [this.startX, this.startY] = this.local(e);
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.startT = performance.now();
    this.dragging = false;
  };

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.local(e);
    if (this.activeId === null) {
      if (e.pointerType === 'mouse') this.h.hover(x, y);
      return;
    }
    if (e.pointerId !== this.activeId) return;
    if (!this.dragging) {
      const moved = Math.hypot(x - this.startX, y - this.startY);
      this.dragging = classifyGesture(moved, performance.now() - this.startT, false) === 'drag';
    }
    if (this.dragging) this.h.drag(x - this.lastX, y - this.lastY);
    this.lastX = x;
    this.lastY = y;
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    const [x, y] = this.local(e);
    const moved = Math.hypot(x - this.startX, y - this.startY);
    if (!this.dragging && classifyGesture(moved, performance.now() - this.startT, true) === 'tap') this.h.tap(x, y);
    this.activeId = null;
    this.dragging = false;
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerId === this.activeId) this.activeId = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.h.wheel(e.deltaY);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
  }
}
```

- [ ] **Step 6: Implement `Markers`**

`src/systems/Markers.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const TAP_TIME = 0.6;

function ring(color: number, inner: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, 1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }),
  );
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

/** Ground rings: tap destination (pulse + fade), selected target, desktop hover. */
export class Markers {
  private tap = ring(CONFIG.palette.carapace, 0.7);
  private target = ring(CONFIG.palette.fire, 0.82);
  private hover = ring(0xffffff, 0.88);
  private tapT = 0;
  private targetRef: Target | null = null;
  private hoverRef: Target | null = null;
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.tap, this.target, this.hover);
  }

  tapAt(p: THREE.Vector3): void {
    this.tap.position.set(p.x, 2, p.z);
    this.tapT = TAP_TIME;
    this.tap.visible = true;
  }

  setTarget(t: Target | null): void {
    this.targetRef = t;
  }

  setHover(t: Target | null): void {
    this.hoverRef = t;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.tapT > 0) {
      this.tapT -= dt;
      const k = 1 - this.tapT / TAP_TIME;
      this.tap.scale.setScalar(30 + 50 * k);
      (this.tap.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      this.tap.visible = this.tapT > 0;
    }
    this.place(this.target, this.targetRef, 1.5 + Math.sin(this.time * 8) * 0.1);
    this.place(this.hover, this.hoverRef !== this.targetRef ? this.hoverRef : null, 1.3);
  }

  private place(m: THREE.Mesh, t: Target | null, scale: number): void {
    if (!t || !t.isAlive()) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(t.position.x, t.airborne ? t.position.y : 3, t.position.z);
    m.scale.setScalar(Math.max(30, t.radius) * scale);
  }
}
```

- [ ] **Step 7: Wire input and orders into GameScene**

In `src/GameScene.ts`:
- Remove the `debugSmash` listener and method, and the temporary auto-walk lines.
- Add:

```ts
// fields
private input: Input;
private markers: Markers;
private order: Order = null;
private raycaster = new THREE.Raycaster();
private ndc = new THREE.Vector2();
private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
private tmpV = new THREE.Vector3();

// constructor (after rig)
this.markers = new Markers(this.scene);
this.input = new Input(this.pixel.domElement, {
  tap: this.onTap,
  drag: (dx, dy) => this.rig.drag(dx, dy),
  wheel: (dy) => this.rig.zoom(dy),
  hover: this.onHover,
});

// methods
/** Enemies the player can target. Filled in by Task 9. */
enemyTargets(): Target[] {
  return [];
}

private setRay(x: number, y: number): void {
  const el = this.pixel.domElement;
  this.ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
  this.raycaster.setFromCamera(this.ndc, this.camera);
}

/** Enemy within the pick radius on screen, else building under the ray. */
private pickTarget(x: number, y: number): Target | null {
  const enemies = this.enemyTargets();
  const el = this.pixel.domElement;
  const pts = enemies.map((t, index) => {
    this.tmpV.copy(t.position).project(this.camera);
    return {
      index,
      x: (this.tmpV.x * 0.5 + 0.5) * el.clientWidth,
      y: (-this.tmpV.y * 0.5 + 0.5) * el.clientHeight,
      visible: this.tmpV.z < 1 && t.isAlive(),
    };
  });
  const hit = pickEnemy(pts, x, y, CONFIG.input.pickRadiusPx);
  if (hit !== null) return enemies[hit]!;
  this.setRay(x, y);
  const b = this.raycaster.intersectObject(this.city.buildingMesh)[0];
  return b?.instanceId !== undefined ? this.city.targetForInstance(b.instanceId) : null;
}

private onTap = (x: number, y: number): void => {
  if (this.state !== 'playing') return;
  const target = this.pickTarget(x, y);
  if (target) {
    this.order = { kind: 'attack', target };
    this.markers.setTarget(target);
    return;
  }
  this.setRay(x, y);
  const p = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
  if (!p) return;
  const lim = CONFIG.world.citySize / 2;
  p.x = Math.min(lim, Math.max(-lim, p.x));
  p.z = Math.min(lim, Math.max(-lim, p.z));
  this.order = { kind: 'move', to: { x: p.x, z: p.z } };
  this.markers.setTarget(null);
  this.markers.tapAt(p);
};

private onHover = (x: number, y: number): void => {
  const t = this.state === 'playing' ? this.pickTarget(x, y) : null;
  this.markers.setHover(t);
  this.container.classList.toggle('can-target', t !== null);
};
```

Add `this.input.dispose()` to `dispose()`.

In `update()`, replace the temporary walk with order handling. Task 7 replaces the attack branch with the brain:

```ts
if (this.state === 'playing') {
  if (this.order?.kind === 'move') {
    if (this.monster.moveToward(this.order.to, dt, 1)) this.order = null;
  } else if (this.order?.kind === 'attack') {
    const t = this.order.target;
    if (!t.isAlive()) {
      this.order = null;
      this.markers.setTarget(null);
    } else {
      this.monster.moveToward({ x: t.position.x, z: t.position.z }, dt, 1);
    }
  }
}
this.monster.animate(dt, this.elapsed);
this.markers.update(dt);
```

Define `type Order` at the top of `GameScene.ts`. Import `Input`, `Markers`, `pickEnemy`, `Target`, and `Vec2`.

- [ ] **Step 8: Verify the build and check by hand on desktop and phone viewport**

Run: `npm run build && npm test` (both pass).
Run `npm run dev` and check:
- **Desktop:** click the ground and the monster turns, then walks there with a green ring pulse. Drag with left or right button and the camera orbits; no context menu appears. The wheel zooms within limits. Hovering a building shows a white ring and a crosshair cursor. Clicking a building gives it an orange ring, and the monster walks to it.
- **Touch:** in Chrome DevTools device mode (iPhone 12 Pro), a tap walks, a drag orbits, and a drag never walks.

Report the results to the user.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add tap/drag input, picking, move/attack orders, and markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Monster brain, melee stomp, contact damage, particles

Delivers fighting buildings with juice. A pure `decide()` turns orders into
move, face and attack actions. The stomp rears up, slams, damages everything in
radius, and kicks up a dust ring and debris. Walking through buildings
crushes them. Foot landings puff dust. The ranged choice from `decide()` is
wired to spikes in Task 8.

**Files:**
- Create: `src/monster/brain.ts`, `src/monster/brain.test.ts`, `src/systems/Particles.ts`
- Modify: `src/monster/Monster.ts` (cooldowns, melee animation), `src/GameScene.ts`

**Interfaces:**
- Consumes: `Vec2`, `dist2`, `Target`, `City.forEachStandingInRadius`, `City.onCollapseStart`, `CameraRig.addTrauma`.
- Produces:
  - `type BrainTarget = { x: number; z: number; radius: number; airborne: boolean; alive: boolean }`
  - `type BrainOrder = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: BrainTarget } | null`
  - `type BrainInput = { pos: Vec2; order: BrainOrder; auto: BrainTarget | null; meleeRange: number; spikeRange: number; meleeReady: boolean; spikeReady: boolean; arriveRadius: number }`
  - `type Decision = { moveTo: Vec2 | null; face: Vec2 | null; attack: 'melee' | 'ranged' | null; attackOn: 'order' | 'auto' | null; orderDone: boolean }`
  - `decide(i: BrainInput): Decision`
  - `nearestInRange<T extends { position: { x: number; z: number }; isAlive(): boolean }>(pos: Vec2, candidates: readonly T[], range: number): T | null`
  - `type ParticleKind = 'dust' | 'debris' | 'fire' | 'smoke' | 'spark'`
  - `class Particles { constructor(scene: THREE.Scene); emit(kind: ParticleKind, at: THREE.Vector3, count: number, spread?: number): void; ring(kind: ParticleKind, center: THREE.Vector3, radius: number, count: number): void; explosion(at: THREE.Vector3, scale: number): void; update(dt: number): void; clear(): void }`
  - New `Monster` members: `onMeleeImpact: (p: THREE.Vector3) => void`, `meleeReady(): boolean`, `spikeReady(): boolean`, `startMelee(cooldownMult: number): void`, `consumeSpike(cooldownMult: number): void`, `tick(dt: number): void`

- [ ] **Step 1: Write the failing tests**

`src/monster/brain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decide, nearestInRange, type BrainInput, type BrainTarget } from './brain';

const base: BrainInput = {
  pos: { x: 0, z: 0 },
  order: null,
  auto: null,
  meleeRange: 300,
  spikeRange: 1700,
  meleeReady: true,
  spikeReady: true,
  arriveRadius: 25,
};
const ground = (x: number, alive = true): BrainTarget => ({ x, z: 0, radius: 30, airborne: false, alive });
const air = (x: number): BrainTarget => ({ x, z: 0, radius: 70, airborne: true, alive: true });

describe('decide', () => {
  it('walks toward a far move order without attacking', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 500, z: 0 } } });
    expect(d.moveTo).toEqual({ x: 500, z: 0 });
    expect(d.attack).toBeNull();
    expect(d.orderDone).toBe(false);
  });
  it('completes a move order on arrival', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 10, z: 0 } } });
    expect(d.orderDone).toBe(true);
    expect(d.moveTo).toBeNull();
  });
  it('stomps a ground target inside melee range, facing it', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(250) } });
    expect(d.attack).toBe('melee');
    expect(d.moveTo).toBeNull();
    expect(d.face).toEqual({ x: 250, z: 0 });
  });
  it('approaches a ground target beyond melee range and spikes it on the way', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(900) } });
    expect(d.moveTo).toEqual({ x: 900, z: 0 });
    expect(d.attack).toBe('ranged');
    expect(d.attackOn).toBe('order');
  });
  it('spikes airborne targets in range without moving', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: air(1200) } });
    expect(d.attack).toBe('ranged');
    expect(d.moveTo).toBeNull();
  });
  it('chases airborne targets out of range', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: air(3000) } });
    expect(d.moveTo).toEqual({ x: 3000, z: 0 });
    expect(d.attack).toBeNull();
  });
  it('drops a dead target and falls back to auto-defense', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(250, false) }, auto: air(800) });
    expect(d.orderDone).toBe(true);
    expect(d.attack).toBe('ranged');
    expect(d.attackOn).toBe('auto');
  });
  it('does not attack while on cooldown', () => {
    const d = decide({ ...base, meleeReady: false, spikeReady: false, order: { kind: 'attack', target: ground(250) } });
    expect(d.attack).toBeNull();
  });
  it('does not auto-fire while executing a move order', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 500, z: 0 } }, auto: air(800) });
    expect(d.attack).toBeNull();
  });
});

describe('nearestInRange', () => {
  const mk = (x: number, alive = true) => ({ position: { x, z: 0 }, isAlive: () => alive });
  it('returns the nearest alive candidate within range', () => {
    const a = mk(500);
    const b = mk(300);
    const c = mk(100, false);
    expect(nearestInRange({ x: 0, z: 0 }, [a, b, c], 1000)).toBe(b);
    expect(nearestInRange({ x: 0, z: 0 }, [a], 400)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/monster/brain.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the brain**

`src/monster/brain.ts`:

```ts
import { dist2, type Vec2 } from '../util/math';

export type BrainTarget = { x: number; z: number; radius: number; airborne: boolean; alive: boolean };
export type BrainOrder = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: BrainTarget } | null;
export type BrainInput = {
  pos: Vec2;
  order: BrainOrder;
  auto: BrainTarget | null;
  meleeRange: number;
  spikeRange: number;
  meleeReady: boolean;
  spikeReady: boolean;
  arriveRadius: number;
};
export type Decision = {
  moveTo: Vec2 | null;
  face: Vec2 | null;
  attack: 'melee' | 'ranged' | null;
  attackOn: 'order' | 'auto' | null;
  orderDone: boolean;
};

const IDLE: Decision = { moveTo: null, face: null, attack: null, attackOn: null, orderDone: false };

/** Pure decision for one frame: orders first; with no live order, auto-defend with spikes. */
export function decide(i: BrainInput): Decision {
  const o = i.order;
  let orderDone = false;

  if (o?.kind === 'move') {
    if (dist2(i.pos, o.to) > i.arriveRadius) return { ...IDLE, moveTo: o.to };
    orderDone = true;
  } else if (o?.kind === 'attack') {
    const t = o.target;
    if (t.alive) {
      const at = { x: t.x, z: t.z };
      const gap = dist2(i.pos, at) - t.radius;
      if (t.airborne) {
        if (gap <= i.spikeRange) {
          return { ...IDLE, face: at, attack: i.spikeReady ? 'ranged' : null, attackOn: i.spikeReady ? 'order' : null };
        }
        return { ...IDLE, moveTo: at };
      }
      if (gap <= i.meleeRange) {
        return { ...IDLE, face: at, attack: i.meleeReady ? 'melee' : null, attackOn: i.meleeReady ? 'order' : null };
      }
      const fire = gap <= i.spikeRange && i.spikeReady;
      return { ...IDLE, moveTo: at, attack: fire ? 'ranged' : null, attackOn: fire ? 'order' : null };
    }
    orderDone = true;
  }

  if (i.auto && i.auto.alive && i.spikeReady) {
    return { ...IDLE, attack: 'ranged', attackOn: 'auto', orderDone };
  }
  return { ...IDLE, orderDone };
}

export function nearestInRange<T extends { position: { x: number; z: number }; isAlive(): boolean }>(
  pos: Vec2,
  candidates: readonly T[],
  range: number,
): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const c of candidates) {
    if (!c.isAlive()) continue;
    const d = dist2(pos, c.position);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/monster/brain.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Implement `Particles`**

`src/systems/Particles.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted } from '../render/toon';

export type ParticleKind = 'dust' | 'debris' | 'fire' | 'smoke' | 'spark';

type Preset = { color: number; life: number; size0: number; size1: number; speed: number; up: number; gravity: number; drag: number };

const P = CONFIG.palette;
const PRESETS: Record<ParticleKind, Preset> = {
  dust: { color: P.dust, life: 1.3, size0: 22, size1: 70, speed: 110, up: 40, gravity: -15, drag: 2.2 },
  debris: { color: P.debris, life: 1.6, size0: 12, size1: 8, speed: 160, up: 260, gravity: 420, drag: 0.3 },
  fire: { color: P.fire, life: 0.55, size0: 34, size1: 4, speed: 70, up: 60, gravity: -40, drag: 1.5 },
  smoke: { color: P.smoke, life: 2.0, size0: 26, size1: 80, speed: 40, up: 70, gravity: -20, drag: 1.2 },
  spark: { color: P.eye, life: 0.3, size0: 10, size1: 2, speed: 260, up: 80, gravity: 200, drag: 0.5 },
};

const MAX = 700;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Pooled chunky puffs: one InstancedMesh, swap-remove on death, zero per-frame allocation. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX);
  private kind: ParticleKind[] = new Array(MAX).fill('dust');

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(faceted(new THREE.IcosahedronGeometry(0.5, 0)), new THREE.MeshBasicMaterial(), MAX);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
    }
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  emit(kind: ParticleKind, at: THREE.Vector3, count: number, spread = 1): void {
    const p = PRESETS[kind];
    for (let k = 0; k < count && this.n < MAX; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = p.speed * spread * (0.4 + Math.random() * 0.6);
      this.spawn(kind, at.x, at.y, at.z, Math.cos(a) * s, p.up * (0.5 + Math.random()), Math.sin(a) * s);
    }
  }

  /** Outward ring along the ground, used for foot landings and stomps. */
  ring(kind: ParticleKind, center: THREE.Vector3, radius: number, count: number): void {
    const p = PRESETS[kind];
    for (let k = 0; k < count && this.n < MAX; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.3;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      this.spawn(kind, center.x + cx * radius * 0.5, center.y + 4, center.z + cz * radius * 0.5, cx * p.speed * 1.4, p.up * 0.3, cz * p.speed * 1.4);
    }
  }

  explosion(at: THREE.Vector3, scale: number): void {
    this.emit('fire', at, Math.round(10 * scale), scale);
    this.emit('smoke', at, Math.round(6 * scale), scale);
    this.emit('debris', at, Math.round(6 * scale), scale);
    this.emit('spark', at, Math.round(6 * scale), scale);
  }

  private spawn(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.kind[i] = kind;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[kind].color));
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const p = PRESETS[this.kind[i]!];
      const age = (this.age[i]! += dt);
      if (age >= p.life) {
        this.swapRemove(i);
        continue;
      }
      const o = i * 3;
      const damp = Math.exp(-p.drag * dt);
      this.vel[o] = this.vel[o]! * damp;
      this.vel[o + 1] = this.vel[o + 1]! * damp - p.gravity * dt;
      this.vel[o + 2] = this.vel[o + 2]! * damp;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = Math.max(0, this.pos[o + 1]! + this.vel[o + 1]! * dt);
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      const k = age / p.life;
      _s.setScalar(p.size0 + (p.size1 - p.size0) * k);
      if (k > 0.75) _s.multiplyScalar((1 - k) / 0.25);
      _m.compose(_p.set(this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!), _q.set(age, age * 0.7, 0, 1).normalize(), _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private swapRemove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.age[i] = this.age[last]!;
    this.kind[i] = this.kind[last]!;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[this.kind[i]!].color));
  }
}
```

- [ ] **Step 6: Add cooldowns and the melee animation to `Monster`**

Add to `src/monster/Monster.ts`:

```ts
// fields
onMeleeImpact: (p: THREE.Vector3) => void = () => {};
private meleeCd = 0;
private spikeCd = 0;
private meleeT = -1; // -1 = not attacking; else time since start
private impactDone = false;

meleeReady(): boolean {
  return this.alive && this.meleeCd <= 0 && this.meleeT < 0;
}

spikeReady(): boolean {
  return this.alive && this.spikeCd <= 0;
}

startMelee(cooldownMult: number): void {
  this.meleeCd = CONFIG.monster.meleeCooldown * cooldownMult;
  this.meleeT = 0;
  this.impactDone = false;
}

consumeSpike(cooldownMult: number): void {
  this.spikeCd = CONFIG.monster.spikeCooldown * cooldownMult;
}

/** Cooldowns and the stomp pose: rear up during windup, slam, recover. */
tick(dt: number): void {
  this.meleeCd = Math.max(0, this.meleeCd - dt);
  this.spikeCd = Math.max(0, this.spikeCd - dt);
  if (this.meleeT < 0) {
    this.pose.pitch *= Math.exp(-10 * dt);
    this.pose.dip *= Math.exp(-10 * dt);
    return;
  }
  this.meleeT += dt;
  const w = CONFIG.monster.meleeWindup;
  if (this.meleeT < w) {
    const k = this.meleeT / w;
    this.pose.pitch = -0.3 * k;
    this.pose.dip = -20 * k;
  } else {
    if (!this.impactDone) {
      this.impactDone = true;
      this.pose.pitch = 0.18;
      this.pose.dip = 45;
      const f = this.forward(new THREE.Vector3());
      this.onMeleeImpact(f.multiplyScalar(CONFIG.monster.meleeRange * 0.6).add(this.position).setY(0));
    }
    if (this.meleeT > w + 0.35) this.meleeT = -1;
  }
}
```

In `reset()`, also zero `meleeCd`, `spikeCd`, `meleeT = -1`.

- [ ] **Step 7: Wire the brain, stomp, contact damage and particles into GameScene**

In `src/GameScene.ts`:

```ts
// fields
private particles: Particles;

// constructor
this.particles = new Particles(this.scene);
this.city.onCollapseStart = (pos, size) => {
  this.particles.ring('dust', pos, size, 14);
  this.particles.emit('debris', pos.clone().setY(30), 8);
  this.rig.addTrauma(0.12);
};
this.monster.onFootLand = (p) => {
  this.particles.ring('dust', p, 60, 7);
  this.rig.addTrauma(0.06);
};
this.monster.onMeleeImpact = (p) => this.meleeImpact(p);

// methods
private toBrain(t: Target): BrainTarget {
  return { x: t.position.x, z: t.position.z, radius: t.radius, airborne: t.airborne, alive: t.isAlive() };
}

private meleeImpact(p: THREE.Vector3): void {
  const r = CONFIG.monster.meleeRadius;
  const dmg = CONFIG.monster.meleeDamage;
  this.city.forEachStandingInRadius({ x: p.x, z: p.z }, r, (t) => t.applyDamage(dmg));
  for (const t of this.enemyTargets()) {
    if (!t.airborne && t.isAlive() && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= r + t.radius) t.applyDamage(dmg);
  }
  this.particles.ring('dust', p, r, 18);
  this.particles.emit('debris', p.clone().setY(10), 10, 1.3);
  this.rig.addTrauma(0.35);
}

/** Order → brain → monster actions. Task 8 handles 'ranged'; Task 10 adds stat multipliers. */
private updateMonster(dt: number): void {
  const m = this.monster;
  const pos = { x: m.position.x, z: m.position.z };
  const auto = nearestInRange(pos, this.enemyTargets(), CONFIG.monster.spikeRange);
  const order: BrainOrder =
    this.order?.kind === 'attack' ? { kind: 'attack', target: this.toBrain(this.order.target) } : this.order;
  const d = decide({
    pos,
    order,
    auto: auto ? this.toBrain(auto) : null,
    meleeRange: CONFIG.monster.meleeRange,
    spikeRange: CONFIG.monster.spikeRange,
    meleeReady: m.meleeReady(),
    spikeReady: m.spikeReady(),
    arriveRadius: CONFIG.monster.arriveRadius,
  });
  if (d.orderDone) {
    this.order = null;
    this.markers.setTarget(null);
  }
  if (d.moveTo) m.moveToward(d.moveTo, dt, 1);
  else if (d.face) m.faceToward(d.face, dt);
  if (d.attack === 'melee') m.startMelee(1);
  if (d.attack === 'ranged') this.fireSpikes(d.attackOn === 'order' && this.order?.kind === 'attack' ? this.order.target : auto);
  m.tick(dt);

  this.city.forEachStandingInRadius(pos, CONFIG.monster.bodyRadius, (t) => t.applyDamage(CONFIG.monster.contactDps * dt));
}

/** Implemented in Task 8. */
private fireSpikes(target: Target | null): void {
  void target;
}
```

In `update()`, replace the Task 6 order block with `if (this.state === 'playing') this.updateMonster(dt);`. Then, after `monster.animate`, add `this.particles.update(dt);`.

- [ ] **Step 8: Verify the build and check by hand**

Run: `npm run build && npm test` (both pass). In `npm run dev`:
- Click a building. The monster walks over, rears up, and slams. The building and its neighbours in radius collapse with dust rings and debris, and the camera kicks.
- Walking through a block flattens it.
- Feet puff dust on landing.

Take an idle screenshot with `npm run shot`. The headless script can't trigger a stomp, so ask the user to try the stomp in the browser. **Fifth checkpoint: the user plays it.**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add monster brain, stomp attack, contact crushing, and particles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Projectiles — stinger spikes (homing), shells (ballistic), rockets (straight)

Delivers pooled, instanced projectiles. The monster fires glowing spikes from
its stinger tip at tapped targets and, when idle, at the nearest enemy. Shells
and rockets are added here too, so Task 9's enemies can use them.

**Files:**
- Create: `src/systems/projectileMath.ts`, `src/systems/projectileMath.test.ts`, `src/systems/Projectiles.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `Target`, `Particles`, `Monster.model.stingerTip`, `Monster.consumeSpike`, `CONFIG`.
- Produces:
  - `ballistic(from: THREE.Vector3, to: THREE.Vector3, arc: number, t: number, out: THREE.Vector3): THREE.Vector3`
  - `spikeTargets<T>(primary: T, others: readonly T[], count: number): T[]`
  - `type ShotKind = 'spike' | 'shell' | 'rocket'`
  - `type Hit = { kind: ShotKind; point: THREE.Vector3; target: Target | null; damage: number }`
  - `class Projectiles { onHit: (h: Hit) => void; onTrail: (p: THREE.Vector3) => void; constructor(scene: THREE.Scene); fireSpike(from: THREE.Vector3, target: Target, damage: number, yawOffset: number): void; fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void; fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void; update(dt: number): void; clear(): void }`

- [ ] **Step 1: Write the failing tests**

`src/systems/projectileMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ballistic, spikeTargets } from './projectileMath';

describe('ballistic', () => {
  const a = new THREE.Vector3(0, 0, 0);
  const b = new THREE.Vector3(100, 50, 0);
  it('starts at from and ends at to', () => {
    expect(ballistic(a, b, 80, 0, new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    const end = ballistic(a, b, 80, 1, new THREE.Vector3());
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
  it('peaks arc above the straight line at the midpoint', () => {
    const mid = ballistic(a, b, 80, 0.5, new THREE.Vector3());
    expect(mid.y).toBeCloseTo(25 + 80);
  });
});

describe('spikeTargets', () => {
  it('primary first, then other distinct targets, then repeats primary', () => {
    expect(spikeTargets('p', ['a', 'b'], 1)).toEqual(['p']);
    expect(spikeTargets('p', ['a', 'p', 'b'], 3)).toEqual(['p', 'a', 'b']);
    expect(spikeTargets('p', ['a'], 3)).toEqual(['p', 'a', 'p']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/systems/projectileMath.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `projectileMath.ts`**

```ts
import type * as THREE from 'three';

/** Straight-line lerp plus a parabolic lift of `arc` at t = 0.5. */
export function ballistic(from: THREE.Vector3, to: THREE.Vector3, arc: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += arc * 4 * t * (1 - t);
  return out;
}

/** Multi-shot target list: the primary, then distinct others (pre-sorted nearest first), then the primary again. */
export function spikeTargets<T>(primary: T, others: readonly T[], count: number): T[] {
  const out: T[] = [primary];
  for (const o of others) {
    if (out.length >= count) break;
    if (o !== primary && !out.includes(o)) out.push(o);
  }
  while (out.length < count) out.push(primary);
  return out;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/systems/projectileMath.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `Projectiles`**

`src/systems/Projectiles.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted } from '../render/toon';
import { ballistic } from './projectileMath';

export type ShotKind = 'spike' | 'shell' | 'rocket';
export type Hit = { kind: ShotKind; point: THREE.Vector3; target: Target | null; damage: number };

type Shot = {
  kind: ShotKind;
  from: THREE.Vector3;
  aim: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: Target | null;
  t: number;
  dur: number;
  damage: number;
  trailT: number;
};

const SPIKE_TTL = 3;
const SPIKE_TURN = 4; // homing responsiveness
const TRAIL_EVERY = 0.06;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 1, 0);
const _yaxis = new THREE.Vector3(0, 1, 0);

/** Pooled projectiles drawn with one InstancedMesh per kind. */
export class Projectiles {
  onHit: (h: Hit) => void = () => {};
  onTrail: (p: THREE.Vector3) => void = () => {};
  private shots: Shot[] = [];
  private free: Shot[] = [];
  private meshes: Record<ShotKind, THREE.InstancedMesh>;
  private sizes: Record<ShotKind, [number, number, number]> = {
    spike: [12, 60, 12],
    shell: [8, 8, 8],
    rocket: [6, 22, 6],
  };

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const make = (geo: THREE.BufferGeometry, color: number, max: number) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.meshes = {
      spike: make(faceted(new THREE.ConeGeometry(0.5, 1, 4)), P.stinger, 64),
      shell: make(new THREE.BoxGeometry(1, 1, 1), P.eye, 128),
      rocket: make(faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 5)), 0xf2f2f2, 64),
    };
  }

  clear(): void {
    this.free.push(...this.shots);
    this.shots = [];
  }

  private alloc(kind: ShotKind, from: THREE.Vector3, aim: THREE.Vector3, damage: number, target: Target | null): Shot {
    const s = this.free.pop() ?? {
      kind, from: new THREE.Vector3(), aim: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      target: null, t: 0, dur: 1, damage: 0, trailT: 0,
    };
    s.kind = kind;
    s.from.copy(from);
    s.aim.copy(aim);
    s.pos.copy(from);
    s.target = target;
    s.t = 0;
    s.damage = damage;
    s.trailT = 0;
    this.shots.push(s);
    return s;
  }

  /** Launches up and outward (with yaw spread), then homes on the target's live position. */
  fireSpike(from: THREE.Vector3, target: Target, damage: number, yawOffset: number): void {
    const s = this.alloc('spike', from, target.position, damage, target);
    _d.subVectors(target.position, from).setY(0).normalize().applyAxisAngle(_yaxis, yawOffset);
    s.vel.set(_d.x, 0.8, _d.z).normalize().multiplyScalar(CONFIG.monster.spikeSpeed);
    s.dur = SPIKE_TTL;
  }

  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('shell', from, to, damage, null);
    s.dur = CONFIG.tank.shellFlightTime;
  }

  fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('rocket', from, to, damage, null);
    s.dur = Math.max(0.2, from.distanceTo(to) / CONFIG.jet.rocketSpeed);
  }

  update(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt;
      let done = false;
      if (s.kind === 'spike') {
        if (s.target?.isAlive()) s.aim.copy(s.target.position);
        _d.subVectors(s.aim, s.pos);
        const dist = _d.length();
        const want = _d.normalize().multiplyScalar(CONFIG.monster.spikeSpeed);
        s.vel.lerp(want, 1 - Math.exp(-SPIKE_TURN * dt));
        s.pos.addScaledVector(s.vel, dt);
        const hitR = Math.max(30, s.target?.radius ?? 30);
        done = dist < hitR || s.t >= s.dur;
        if (done && !(s.target?.isAlive() ?? false)) s.target = null;
      } else {
        const k = Math.min(1, s.t / s.dur);
        if (s.kind === 'shell') ballistic(s.from, s.aim, CONFIG.tank.shellArc, k, s.pos);
        else s.pos.lerpVectors(s.from, s.aim, k);
        s.vel.subVectors(s.aim, s.from);
        done = k >= 1;
      }
      s.trailT += dt;
      if (s.kind !== 'shell' && s.trailT >= TRAIL_EVERY) {
        s.trailT = 0;
        this.onTrail(s.pos);
      }
      if (done) {
        this.onHit({ kind: s.kind, point: s.pos.clone(), target: s.target, damage: s.damage });
        this.shots.splice(i, 1);
        this.free.push(s);
      }
    }
    this.draw();
  }

  private draw(): void {
    const counts: Record<ShotKind, number> = { spike: 0, shell: 0, rocket: 0 };
    for (const s of this.shots) {
      const mesh = this.meshes[s.kind];
      const i = counts[s.kind]++;
      if (i >= mesh.instanceMatrix.count) continue;
      _q.setFromUnitVectors(_fwd, _d.copy(s.vel).normalize());
      const [x, y, z] = this.sizes[s.kind];
      _m.compose(s.pos, _q, _s.set(x, y, z));
      mesh.setMatrixAt(i, _m);
    }
    for (const k of Object.keys(this.meshes) as ShotKind[]) {
      const mesh = this.meshes[k];
      mesh.count = Math.min(counts[k], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
```

- [ ] **Step 6: Wire spikes into GameScene**

In `src/GameScene.ts`:

```ts
// field
private projectiles: Projectiles;

// constructor
this.projectiles = new Projectiles(this.scene);
this.projectiles.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.2);
this.projectiles.onHit = this.onProjectileHit;

// replace the fireSpikes stub
private fireSpikes(target: Target | null): void {
  if (!target) return;
  const m = this.monster;
  const count = 1; // Task 10: + progression.stats.extraSpikes
  const pos = { x: m.position.x, z: m.position.z };
  const others = this.enemyTargets()
    .filter((t) => t.isAlive() && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) <= CONFIG.monster.spikeRange)
    .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
  const from = m.model.stingerTip.getWorldPosition(new THREE.Vector3());
  spikeTargets(target, others, count).forEach((t, i) => {
    this.projectiles.fireSpike(from, t, CONFIG.monster.spikeDamage, (i - (count - 1) / 2) * CONFIG.monster.spikeSpreadRad);
  });
  this.particles.emit('spark', from, 4);
  m.consumeSpike(1);
}

private onProjectileHit = (h: Hit): void => {
  if (h.kind === 'spike') {
    h.target?.applyDamage(h.damage);
    this.particles.emit('spark', h.point, 6);
    this.particles.emit('fire', h.point, 3, 0.5);
    return;
  }
  // shells and rockets: Task 9 applies damage to the monster
  this.particles.explosion(h.point, 0.6);
};
```

Add `this.projectiles.update(dt);` in `update()` before `particles.update`. While testing this task, buildings are the only targets, so tap a building beyond melee range. The monster should spike it on the way in.

- [ ] **Step 7: Verify the build and check by hand**

Run: `npm run build && npm test` (both pass). In `npm run dev`, tap a building ~1000 m away. Glowing spikes should arc out of the stinger with smoke trails, curve onto the building and spark on impact. The building should collapse after enough hits.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add pooled projectiles and homing stinger spikes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Enemies — spawn director, tanks on roads, strafing jets, damage to the monster

Delivers the human military. Tanks spawn on roads at the edge of the action,
drive along the road grid toward the monster, stop at range and lob shells.
Jets fly strafing passes past the monster's head, fire rocket salvos, bank
away, and loop back. Destroyed jets spiral down trailing smoke and explode on
the ground. The monster takes damage and flashes.

**Files:**
- Create: `src/enemies/SpawnDirector.ts`, `src/enemies/SpawnDirector.test.ts`, `src/enemies/steer.ts`, `src/enemies/steer.test.ts`, `src/enemies/TankFleet.ts`, `src/enemies/JetSquadron.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `CONFIG`, `Target`, `OnDestroyed`, `planRoadPath`, `snapToRoad`, `CityLayout`, `toonMat`, `faceted`, `Vec2`, `dist2`, `mulberry32`.
- Produces:
  - `type SpawnKind = 'tank' | 'jet'`
  - `class SpawnDirector { constructor(rng: () => number); reset(): void; elapsed: number; update(dt: number, alive: { tanks: number; jets: number }): SpawnKind[] }`
  - `steerToward(dir: THREE.Vector3, desired: THREE.Vector3, maxAngle: number): number` (mutates `dir`, which stays unit length, and returns the signed yaw turn: positive means turning toward +X/left)
  - `class TankFleet { constructor(scene: THREE.Scene, layout: CityLayout, onDestroyed: OnDestroyed, fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void); spawn(around: THREE.Vector3, rng: () => number): void; update(dt: number, monster: THREE.Vector3): void; targets(): readonly Target[]; count(): number; clear(): void }`
  - `class JetSquadron { onTrail: (p: THREE.Vector3) => void; onCrash: (p: THREE.Vector3) => void; constructor(scene: THREE.Scene, onDestroyed: OnDestroyed, fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void); spawn(around: THREE.Vector3, rng: () => number): void; update(dt: number, monster: THREE.Vector3): void; targets(): readonly Target[]; count(): number; clear(): void }`
  - `GameScene.enemyTargets()` now returns tanks and jets.

- [ ] **Step 1: Write the failing tests**

`src/enemies/SpawnDirector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SpawnDirector, type SpawnKind } from './SpawnDirector';
import { CONFIG } from '../config';

const D = CONFIG.director;
const always0 = () => 0; // rng that would always choose a jet when allowed

function run(dir: SpawnDirector, seconds: number, alive = { tanks: 0, jets: 0 }): SpawnKind[] {
  const out: SpawnKind[] = [];
  for (let t = 0; t < seconds; t += 0.05) out.push(...dir.update(0.05, alive));
  return out;
}

describe('SpawnDirector', () => {
  it('sends only tanks before jets unlock', () => {
    const spawns = run(new SpawnDirector(always0), D.jetUnlockTime - 1);
    expect(spawns.length).toBeGreaterThan(0);
    expect(spawns).not.toContain('jet');
  });

  it('sends jets after they unlock', () => {
    const dir = new SpawnDirector(always0);
    run(dir, D.jetUnlockTime);
    expect(run(dir, 30)).toContain('jet');
  });

  it('respects caps on concurrent enemies', () => {
    const dir = new SpawnDirector(always0);
    expect(run(dir, 120, { tanks: D.maxTanks, jets: D.maxJets })).toEqual([]);
  });

  it('escalates over time', () => {
    const dir = new SpawnDirector(() => 0.99);
    const early = run(dir, 60).length;
    run(dir, 240);
    const late = run(dir, 60).length;
    expect(late).toBeGreaterThan(early * 2);
  });

  it('never bursts more than the budget cap in one update', () => {
    const dir = new SpawnDirector(() => 0.99);
    dir.update(10000, { tanks: 0, jets: 0 });
    expect(dir.update(10000, { tanks: 0, jets: 0 }).length).toBeLessThanOrEqual(D.budgetCap);
  });

  it('reset restarts the clock', () => {
    const dir = new SpawnDirector(always0);
    run(dir, 100);
    dir.reset();
    expect(dir.elapsed).toBe(0);
    expect(run(dir, 5)).not.toContain('jet');
  });
});
```

`src/enemies/steer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { steerToward } from './steer';

describe('steerToward', () => {
  it('turns by at most maxAngle and stays unit length', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    const turned = steerToward(dir, new THREE.Vector3(1, 0, 0), 0.1);
    expect(Math.abs(turned)).toBeCloseTo(0.1);
    expect(dir.length()).toBeCloseTo(1);
    expect(dir.angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.1);
  });
  it('turning toward +X (left) reports a positive yaw turn', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    expect(steerToward(dir, new THREE.Vector3(1, 0, 0), 0.1)).toBeGreaterThan(0);
  });
  it('snaps when within maxAngle, and handles a reversed desire', () => {
    const dir = new THREE.Vector3(0, 0, 1);
    steerToward(dir, new THREE.Vector3(0.01, 0, 1).normalize(), 0.5);
    expect(dir.z).toBeCloseTo(1, 3);
    const back = new THREE.Vector3(0, 0, 1);
    steerToward(back, new THREE.Vector3(0, 0, -1), 0.2);
    expect(back.angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/enemies`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `SpawnDirector` and `steerToward`**

`src/enemies/SpawnDirector.ts`:

```ts
import { CONFIG } from '../config';

export type SpawnKind = 'tank' | 'jet';

/**
 * Budget-based escalation: spending points per second grow linearly with time.
 * The next enemy kind is rolled first and saved up for, so expensive jets are not starved by cheap tanks.
 * Caps limit concurrent enemies.
 */
export class SpawnDirector {
  elapsed = 0;
  private budget = 0;
  private next: SpawnKind | null = null;

  constructor(private rng: () => number) {}

  reset(): void {
    this.elapsed = 0;
    this.budget = 0;
    this.next = null;
  }

  update(dt: number, alive: { tanks: number; jets: number }): SpawnKind[] {
    const D = CONFIG.director;
    this.elapsed += dt;
    const rate = D.baseRate + (D.rateGrowthPerMin * this.elapsed) / 60;
    this.budget = Math.min(D.budgetCap, this.budget + rate * dt);
    const out: SpawnKind[] = [];
    let tanks = alive.tanks;
    let jets = alive.jets;
    for (;;) {
      if (this.next === null) {
        const jetsOpen = this.elapsed >= D.jetUnlockTime && jets < D.maxJets;
        this.next = jetsOpen && this.rng() < D.jetChance ? 'jet' : 'tank';
      }
      const atCap = this.next === 'jet' ? jets >= D.maxJets : tanks >= D.maxTanks;
      if (atCap) {
        this.next = null;
        break;
      }
      const cost = this.next === 'jet' ? D.jetCost : D.tankCost;
      if (this.budget < cost) break;
      this.budget -= cost;
      out.push(this.next);
      if (this.next === 'jet') jets++;
      else tanks++;
      this.next = null;
    }
    return out;
  }
}
```

`src/enemies/steer.ts`:

```ts
import * as THREE from 'three';

const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Rotate unit `dir` toward unit `desired` by at most maxAngle. Returns signed yaw turn (+ = toward +X / left). */
export function steerToward(dir: THREE.Vector3, desired: THREE.Vector3, maxAngle: number): number {
  const angle = dir.angleTo(desired);
  if (angle < 1e-6) return 0;
  _axis.crossVectors(dir, desired);
  if (_axis.lengthSq() < 1e-10) _axis.copy(UP);
  _axis.normalize();
  const step = Math.min(angle, maxAngle);
  dir.applyAxisAngle(_axis, step).normalize();
  return step * Math.sign(_axis.y || 1);
}
```

Check the sign convention against the test. With `dir = +Z` and `desired = +X`, `cross(+Z, +X) = +Y`, so the turn is positive ✓.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/enemies`
Expected: PASS (9 tests). If "escalates over time" fails, check that `rateGrowthPerMin` matches the config and don't weaken the assertion.

- [ ] **Step 5: Implement `TankFleet`**

`src/enemies/TankFleet.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import { toonMat } from '../render/toon';
import { dist2, type Vec2 } from '../util/math';
import type { CityLayout } from '../world/cityLayout';
import { planRoadPath, snapToRoad } from '../world/roads';

const REPLAN_EVERY = 4;
const MAX_TANKS = CONFIG.director.maxTanks;
const S = CONFIG.tank.size;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Tank implements Target {
  readonly kind = 'tank' as const;
  readonly airborne = false;
  readonly radius = S * 0.6;
  readonly position = new THREE.Vector3();
  hp: number = CONFIG.tank.hp;
  alive = true;
  heading = 0;
  turretYaw = 0;
  path: Vec2[] = [];
  replanT = 0;
  fireCd = 0;
  flashT = 0;

  constructor(private onDamage: (t: Tank, amount: number) => void) {}

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Up to maxTanks tanks drawn as three InstancedMeshes (hull, turret, barrel). */
export class TankFleet {
  private tanks: Tank[] = [];
  private hull: THREE.InstancedMesh;
  private turret: THREE.InstancedMesh;
  private barrel: THREE.InstancedMesh;

  constructor(
    scene: THREE.Scene,
    private layout: CityLayout,
    private onDestroyed: OnDestroyed,
    private fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void,
  ) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mk = (color: number) => {
      const m = new THREE.InstancedMesh(box, toonMat(color), MAX_TANKS);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      for (let i = 0; i < MAX_TANKS; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
      return m;
    };
    this.hull = mk(CONFIG.palette.tank);
    this.turret = mk(CONFIG.palette.tankDark);
    this.barrel = mk(CONFIG.palette.tankDark);
  }

  targets(): readonly Target[] {
    return this.tanks;
  }

  count(): number {
    return this.tanks.length;
  }

  clear(): void {
    this.tanks = [];
    this.draw();
  }

  /** Spawn on a north-south road at roughly spawnRing distance from `around`, inside the city. */
  spawn(around: THREE.Vector3, rng: () => number): void {
    if (this.tanks.length >= MAX_TANKS) return;
    const a = rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * (0.8 + rng() * 0.3);
    const lim = this.layout.half;
    const x = snapToRoad(Math.max(-lim, Math.min(lim, around.x + Math.cos(a) * r)), this.layout.roadOrigin, this.layout.pitch);
    const z = Math.max(-lim, Math.min(lim, around.z + Math.sin(a) * r));
    const t = new Tank(this.damage);
    t.position.set(x, S * 0.3, z);
    t.fireCd = 1 + rng() * CONFIG.tank.fireCooldown;
    this.tanks.push(t);
  }

  private damage = (t: Tank, amount: number): void => {
    if (!t.alive) return;
    t.hp -= amount;
    t.flashT = 0.1;
    if (t.hp <= 0) {
      t.alive = false;
      this.onDestroyed(t, CONFIG.tank.exp);
    }
  };

  update(dt: number, monster: THREE.Vector3): void {
    const T = CONFIG.tank;
    const goal = { x: monster.x, z: monster.z };
    for (let i = this.tanks.length - 1; i >= 0; i--) {
      const t = this.tanks[i]!;
      if (!t.alive) {
        this.tanks.splice(i, 1);
        continue;
      }
      t.flashT = Math.max(0, t.flashT - dt);
      const here = { x: t.position.x, z: t.position.z };
      const d = dist2(here, goal);
      t.turretYaw = Math.atan2(goal.x - here.x, goal.z - here.z);

      if (d <= T.range) {
        t.fireCd -= dt;
        if (t.fireCd <= 0) {
          t.fireCd = T.fireCooldown;
          const muzzle = new THREE.Vector3(Math.sin(t.turretYaw), 0, Math.cos(t.turretYaw)).multiplyScalar(S * 0.8).add(t.position).setY(S * 0.5);
          const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, 220 + Math.random() * 200, (Math.random() - 0.5) * 160));
          this.fire(muzzle, aim, T.damage);
        }
        continue;
      }

      t.replanT -= dt;
      if (t.path.length === 0 || t.replanT <= 0) {
        t.path = planRoadPath(here, goal, this.layout.roadOrigin, this.layout.pitch);
        t.replanT = REPLAN_EVERY;
      }
      const wp = t.path[0];
      if (!wp) continue;
      const wd = dist2(here, wp);
      const step = Math.min(wd, T.speed * dt);
      if (wd > 1e-3) {
        t.heading = Math.atan2(wp.x - here.x, wp.z - here.z);
        t.position.x += ((wp.x - here.x) / wd) * step;
        t.position.z += ((wp.z - here.z) / wd) * step;
      }
      if (wd - step < 1) t.path.shift();
    }
    this.draw();
  }

  private draw(): void {
    this.tanks.forEach((t, i) => {
      _q.setFromAxisAngle(UP, t.heading);
      _m.compose(_p.set(t.position.x, S * 0.18, t.position.z), _q, _s.set(S * 0.6, S * 0.35, S));
      this.hull.setMatrixAt(i, _m);
      _q.setFromAxisAngle(UP, t.turretYaw);
      _m.compose(_p.set(t.position.x, S * 0.45, t.position.z), _q, _s.set(S * 0.42, S * 0.22, S * 0.46));
      this.turret.setMatrixAt(i, _m);
      _p.set(Math.sin(t.turretYaw), 0, Math.cos(t.turretYaw)).multiplyScalar(S * 0.5).add(t.position).setY(S * 0.47);
      _m.compose(_p, _q, _s.set(S * 0.08, S * 0.08, S * 0.6));
      this.barrel.setMatrixAt(i, _m);
      _c.setHex(t.flashT > 0 ? 0xffd0a0 : 0xffffff);
      this.hull.setColorAt(i, _c);
      this.turret.setColorAt(i, _c);
    });
    for (const m of [this.hull, this.turret, this.barrel]) {
      m.count = this.tanks.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
```

- [ ] **Step 6: Implement `JetSquadron`**

`src/enemies/JetSquadron.ts`:

```ts
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import { steerToward } from './steer';

type Mode = 'attack' | 'exit' | 'crashing';
const S = CONFIG.jet.size;
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

class Jet implements Target {
  readonly kind = 'jet' as const;
  readonly airborne = true;
  readonly radius = CONFIG.jet.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly dir = new THREE.Vector3(0, 0, 1);
  readonly waypoint = new THREE.Vector3();
  readonly offset = new THREE.Vector3();
  hp: number = CONFIG.jet.hp;
  mode: Mode = 'attack';
  salvoFired = false;
  bank = 0;
  spin = 0;
  vy = 0;
  trailT = 0;
  flashT = 0;

  constructor(
    readonly material: THREE.MeshToonMaterial,
    private onDamage: (j: Jet, amount: number) => void,
  ) {}

  isAlive(): boolean {
    return this.mode !== 'crashing';
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Jets fly strafing passes: attack run past the monster's head, fire a salvo, exit, loop back. */
export class JetSquadron {
  onTrail: (p: THREE.Vector3) => void = () => {};
  onCrash: (p: THREE.Vector3) => void = () => {};
  private jets: Jet[] = [];
  private fuselage = faceted(new THREE.BoxGeometry(S * 0.22, S * 0.18, S));
  private wing = faceted(new THREE.BoxGeometry(S * 0.95, S * 0.04, S * 0.32));
  private fin = faceted(new THREE.BoxGeometry(S * 0.04, S * 0.26, S * 0.2));

  constructor(
    private scene: THREE.Scene,
    private onDestroyed: OnDestroyed,
    private fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void,
  ) {}

  targets(): readonly Target[] {
    return this.jets;
  }

  count(): number {
    return this.jets.filter((j) => j.mode !== 'crashing').length;
  }

  clear(): void {
    for (const j of this.jets) this.scene.remove(j.group);
    this.jets = [];
  }

  spawn(around: THREE.Vector3, rng: () => number): void {
    const mat = toonMat(CONFIG.palette.jet);
    const j = new Jet(mat, this.damage);
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      j.group.add(m);
    };
    add(this.fuselage, 0, 0, 0);
    add(this.wing, 0, 0, -S * 0.05);
    add(this.fin, 0, S * 0.15, -S * 0.4);
    const a = rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * 1.2;
    j.position.set(around.x + Math.cos(a) * r, CONFIG.jet.altitude, around.z + Math.sin(a) * r);
    j.dir.set(-Math.cos(a), 0, -Math.sin(a));
    j.offset.set((rng() - 0.5) * 400, (rng() - 0.5) * 120, (rng() - 0.5) * 400);
    this.scene.add(j.group);
    this.jets.push(j);
  }

  private damage = (j: Jet, amount: number): void => {
    if (j.mode === 'crashing') return;
    j.hp -= amount;
    j.flashT = 0.1;
    if (j.hp <= 0) {
      j.mode = 'crashing';
      j.spin = (Math.random() < 0.5 ? -1 : 1) * 4;
      this.onDestroyed(j, CONFIG.jet.exp);
    }
  };

  update(dt: number, monster: THREE.Vector3): void {
    const J = CONFIG.jet;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i]!;
      j.flashT = Math.max(0, j.flashT - dt);
      j.material.emissive.setHex(j.flashT > 0 ? 0xffffff : 0x000000);

      if (j.mode === 'crashing') {
        j.vy -= 120 * dt;
        j.position.addScaledVector(j.dir, J.speed * 0.8 * dt);
        j.position.y += j.vy * dt;
        j.bank += j.spin * dt;
        j.trailT += dt;
        if (j.trailT > 0.05) {
          j.trailT = 0;
          this.onTrail(j.position);
        }
        if (j.position.y <= 0) {
          this.onCrash(j.position.clone().setY(0));
          this.scene.remove(j.group);
          this.jets.splice(i, 1);
          continue;
        }
      } else {
        if (j.mode === 'attack') {
          j.waypoint.copy(monster).add(j.offset).setY(J.altitude + j.offset.y);
          const dm = j.position.distanceTo(monster);
          if (!j.salvoFired && dm >= J.salvoMin && dm <= J.salvoMax) {
            j.salvoFired = true;
            for (let k = 0; k < J.rocketsPerSalvo; k++) {
              const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, 250 + Math.random() * 250, (Math.random() - 0.5) * 200));
              this.fire(j.position.clone(), aim, J.damage);
            }
          }
          if (j.position.distanceTo(j.waypoint) < 300) {
            j.mode = 'exit';
            j.waypoint.copy(j.position).addScaledVector(j.dir, J.exitDistance).setY(J.altitude);
          }
        } else if (j.position.distanceTo(j.waypoint) < 250) {
          j.mode = 'attack';
          j.salvoFired = false;
        }
        _desired.subVectors(j.waypoint, j.position).normalize();
        const turn = steerToward(j.dir, _desired, J.turnRate * dt);
        const targetBank = -Math.sign(turn) * Math.min(1, Math.abs(turn) / (J.turnRate * dt + 1e-6)) * 0.9;
        j.bank += (targetBank - j.bank) * (1 - Math.exp(-4 * dt));
        j.position.addScaledVector(j.dir, J.speed * dt);
      }

      j.group.lookAt(_look.copy(j.position).add(j.dir));
      j.group.rotateZ(j.bank);
    }
  }
}
```

- [ ] **Step 7: Wire the enemies and monster damage into GameScene**

In `src/GameScene.ts`:

```ts
// fields
private director: SpawnDirector;
private tanks: TankFleet;
private jets: JetSquadron;
private rng = mulberry32(CONFIG.world.seed + 7);

// constructor (after projectiles and particles)
this.director = new SpawnDirector(this.rng);
const fire = (from: THREE.Vector3, to: THREE.Vector3, damage: number, kind: 'shell' | 'rocket') => {
  if (kind === 'shell') this.projectiles.fireShell(from, to, damage);
  else this.projectiles.fireRocket(from, to, damage);
  this.particles.emit('fire', from, 2, 0.3);
};
this.tanks = new TankFleet(this.scene, this.city.layout, this.onTargetDestroyed, (f, t, d) => fire(f, t, d, 'shell'));
this.jets = new JetSquadron(this.scene, this.onTargetDestroyed, (f, t, d) => fire(f, t, d, 'rocket'));
this.jets.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.3);
this.jets.onCrash = (p) => {
  this.particles.explosion(p, 2);
  this.particles.ring('dust', p, 120, 12);
  this.rig.addTrauma(0.3);
};

// replace enemyTargets()
enemyTargets(): Target[] {
  return [...this.tanks.targets(), ...this.jets.targets()].filter((t) => t.isAlive());
}

// in onTargetDestroyed, add (before Task 10's EXP):
if (target.kind === 'tank') this.particles.explosion(target.position, 1);
if (target.kind === 'jet') this.particles.explosion(target.position, 1.2);

// in onProjectileHit, replace the shell/rocket branch
this.particles.explosion(h.point, 0.6);
if (this.monster.alive) {
  this.monster.hp = Math.max(0, this.monster.hp - h.damage);
  this.monster.flash();
  this.rig.addTrauma(0.05);
}

// in update(), while playing, before updateMonster:
for (const kind of this.director.update(dt, { tanks: this.tanks.count(), jets: this.jets.count() })) {
  if (kind === 'tank') this.tanks.spawn(this.monster.position, this.rng);
  else this.jets.spawn(this.monster.position, this.rng);
}
this.tanks.update(dt, this.monster.position);
this.jets.update(dt, this.monster.position);
```

Run `this.jets.update` even outside `playing`, during `dying`, so crashing jets finish. Task 10 handles the state split.

- [ ] **Step 8: Verify the build and check by hand**

Run: `npm run build && npm test` (both pass). In `npm run dev`:
- Within a few seconds, tanks roll along the roads toward the monster, stop, and lob arcing shells that burst on its body, making it flash.
- After 30 s, jets scream past at head height firing rockets, then bank and loop back.
- Tapping a tank stomps it if close, or spikes it if far.
- Tapping a jet spikes it, and it spirals down smoking and explodes on the ground.
- Check `renderer.info.render.calls` in a busy moment (log temporarily). The count should stay under 150.

Take screenshots (`npm run shot -- http://localhost:5173/ 40000`) so jets appear. **Sixth checkpoint: enemies' look and readability at monster scale.** If tanks read as specks, raise `CONFIG.tank.size`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add spawn director, road-driving tanks, strafing jets, monster damage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Progression, level-up flow, regen, death, restart, HUD events

Delivers the run's game-side rules:
- **EXP and levels:** destruction earns EXP. Each level pauses the game for a choice of 3 upgrades from a pool of 7. Upgrades stack and change the stomp, spikes, health, regeneration and speed.
- **Death:** the monster regenerates, can die with a collapse animation, and the run ends with stats.
- **Restart:** resets everything.
- **Pause:** a `paused` state for SDK pause and resume.
- **HUD events:** the game emits throttled HUD snapshots for Task 11's React UI.

**Files:**
- Create: `src/systems/Progression.ts`, `src/systems/Progression.test.ts`
- Modify: `src/GameScene.ts`

**Interfaces:**
- Consumes: `UpgradeOffer`, `RunStats`, `HudSnapshot` (from `GameEvents`), `shuffle`, `mulberry32`, everything wired in Tasks 3–9.
- Produces:
  - `type UpgradeId = 'damage' | 'attackSpeed' | 'vitality' | 'regen' | 'stompRadius' | 'multiShot' | 'moveSpeed'`
  - `type Stats = { damageMult: number; cooldownMult: number; maxHpMult: number; regenBonus: number; stompRadiusMult: number; extraSpikes: number; moveSpeedMult: number }`
  - `BASE_STATS: Stats`, `UPGRADES: Record<UpgradeId, { title: string; desc: string; icon: string; apply(s: Stats): Stats }>`
  - `expToNext(level: number): number`
  - `class Progression { level: number; exp: number; stats: Stats; pendingLevels: number; constructor(rng: () => number); addExp(n: number): number; offer(): UpgradeOffer[]; choose(id: string): boolean; reset(): void }`
  - New public `GameScene` methods: `chooseUpgrade(id: string): void`, `pause(): void`, `resume(): void`, `restart(): void` (now a full reset)

- [ ] **Step 1: Write the failing tests**

`src/systems/Progression.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Progression, expToNext, UPGRADES, BASE_STATS } from './Progression';
import { mulberry32 } from '../util/rng';

describe('expToNext', () => {
  it('follows expBase * level^expExponent, rounded', () => {
    expect(expToNext(1)).toBe(40);
    expect(expToNext(2)).toBe(102);
    expect(expToNext(5)).toBeGreaterThan(expToNext(4));
  });
});

describe('Progression', () => {
  it('carries leftover EXP and queues one offer per level gained', () => {
    const p = new Progression(mulberry32(1));
    const gained = p.addExp(40 + 102 + 5);
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.exp).toBe(5);
    expect(p.pendingLevels).toBe(2);
  });

  it('offers 3 distinct upgrades from the pool', () => {
    const p = new Progression(mulberry32(2));
    const ids = p.offer().map((o) => o.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(Object.keys(UPGRADES)).toContain(id);
  });

  it('applies and stacks choices, consuming pending levels', () => {
    const p = new Progression(mulberry32(3));
    p.addExp(40 + 102);
    expect(p.choose('damage')).toBe(true);
    expect(p.choose('damage')).toBe(true);
    expect(p.stats.damageMult).toBeCloseTo(1.44);
    expect(p.pendingLevels).toBe(0);
  });

  it('ignores choices with no pending level or unknown ids (double-tap safe)', () => {
    const p = new Progression(mulberry32(4));
    expect(p.choose('damage')).toBe(false);
    p.addExp(40);
    expect(p.choose('nope')).toBe(false);
    expect(p.pendingLevels).toBe(1);
  });

  it('reset returns to level 1 with base stats', () => {
    const p = new Progression(mulberry32(5));
    p.addExp(500);
    p.choose('regen');
    p.reset();
    expect(p.level).toBe(1);
    expect(p.exp).toBe(0);
    expect(p.pendingLevels).toBe(0);
    expect(p.stats).toEqual(BASE_STATS);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/systems/Progression.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `Progression`**

`src/systems/Progression.ts`:

```ts
import { CONFIG } from '../config';
import type { UpgradeOffer } from '../GameEvents';
import { shuffle } from '../util/rng';

export type UpgradeId = 'damage' | 'attackSpeed' | 'vitality' | 'regen' | 'stompRadius' | 'multiShot' | 'moveSpeed';

export type Stats = {
  damageMult: number;
  cooldownMult: number;
  maxHpMult: number;
  regenBonus: number;
  stompRadiusMult: number;
  extraSpikes: number;
  moveSpeedMult: number;
};

export const BASE_STATS: Stats = {
  damageMult: 1,
  cooldownMult: 1,
  maxHpMult: 1,
  regenBonus: 0,
  stompRadiusMult: 1,
  extraSpikes: 0,
  moveSpeedMult: 1,
};

export const UPGRADES: Record<UpgradeId, { title: string; desc: string; icon: string; apply(s: Stats): Stats }> = {
  damage: { title: 'Acid Venom', desc: '+20% damage', icon: '🗡️', apply: (s) => ({ ...s, damageMult: s.damageMult * 1.2 }) },
  attackSpeed: { title: 'Frenzy', desc: 'Attacks 15% faster', icon: '⚡', apply: (s) => ({ ...s, cooldownMult: s.cooldownMult * 0.85 }) },
  vitality: { title: 'Thick Carapace', desc: '+20% max HP, heal 30%', icon: '🛡️', apply: (s) => ({ ...s, maxHpMult: s.maxHpMult * 1.2 }) },
  regen: { title: 'Mutagen', desc: '+3 HP per second', icon: '🧬', apply: (s) => ({ ...s, regenBonus: s.regenBonus + 3 }) },
  stompRadius: { title: 'Quake Stomp', desc: '+20% stomp radius', icon: '💥', apply: (s) => ({ ...s, stompRadiusMult: s.stompRadiusMult * 1.2 }) },
  multiShot: { title: 'Barbed Volley', desc: '+1 spike per shot', icon: '🎯', apply: (s) => ({ ...s, extraSpikes: s.extraSpikes + 1 }) },
  moveSpeed: { title: 'Long Strides', desc: '+15% move speed', icon: '🦿', apply: (s) => ({ ...s, moveSpeedMult: s.moveSpeedMult * 1.15 }) },
};

export function expToNext(level: number): number {
  return Math.round(CONFIG.progression.expBase * Math.pow(level, CONFIG.progression.expExponent));
}

export class Progression {
  level = 1;
  exp = 0;
  stats: Stats = { ...BASE_STATS };
  pendingLevels = 0;

  constructor(private rng: () => number) {}

  reset(): void {
    this.level = 1;
    this.exp = 0;
    this.stats = { ...BASE_STATS };
    this.pendingLevels = 0;
  }

  /** Adds EXP, levelling as many times as it covers. Returns levels gained (each needs a choice). */
  addExp(n: number): number {
    this.exp += n;
    let gained = 0;
    while (this.exp >= expToNext(this.level)) {
      this.exp -= expToNext(this.level);
      this.level++;
      gained++;
    }
    this.pendingLevels += gained;
    return gained;
  }

  offer(): UpgradeOffer[] {
    const ids = shuffle(Object.keys(UPGRADES) as UpgradeId[], this.rng).slice(0, CONFIG.progression.offerCount);
    return ids.map((id) => ({ id, title: UPGRADES[id].title, desc: UPGRADES[id].desc, icon: UPGRADES[id].icon }));
  }

  /** Applies an upgrade if a level is pending. Returns false (no-op) otherwise. */
  choose(id: string): boolean {
    if (this.pendingLevels <= 0 || !(id in UPGRADES)) return false;
    this.stats = UPGRADES[id as UpgradeId].apply(this.stats);
    this.pendingLevels--;
    return true;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/systems/Progression.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Integrate progression, stats, regen, death, restart, pause and HUD emission in GameScene**

In `src/GameScene.ts`:

```ts
// fields
private progression = new Progression(mulberry32(CONFIG.world.seed + 13));
private runTime = 0;
private dyingT = 0;
private hudT = 0;
private stateBeforePause: GameState = 'playing';
```

Replace `onTargetDestroyed`:

```ts
private onTargetDestroyed = (target: Target, exp: number): void => {
  if (target.kind === 'tank') this.particles.explosion(target.position, 1);
  if (target.kind === 'jet') this.particles.explosion(target.position, 1.2);
  if (target.kind !== 'building') this.kills++;
  if (!this.monster.alive) return;
  this.progression.addExp(exp);
  this.events.emit('expGain', exp);
  if (this.progression.pendingLevels > 0 && this.state === 'playing') this.enterLevelUp();
};

private enterLevelUp(): void {
  this.setState('levelup');
  this.events.emit('levelUpOffer', this.progression.offer());
  this.emitHud();
}

/** Called by the React level-up cards. */
chooseUpgrade(id: string): void {
  if (this.state !== 'levelup' || !this.progression.choose(id)) return;
  const s = this.progression.stats;
  const m = this.monster;
  const newMax = Math.round(CONFIG.monster.maxHp * s.maxHpMult);
  if (id === 'vitality') m.hp = Math.min(newMax, m.hp + newMax * 0.3);
  m.maxHp = newMax;
  this.emitHud();
  if (this.progression.pendingLevels > 0) this.events.emit('levelUpOffer', this.progression.offer());
  else this.setState('playing');
}

pause(): void {
  if (this.state === 'paused' || this.state === 'gameover') return;
  this.stateBeforePause = this.state;
  this.setState('paused');
}

resume(): void {
  if (this.state === 'paused') this.setState(this.stateBeforePause);
}

restart(): void {
  this.city.reset();
  this.tanks.clear();
  this.jets.clear();
  this.projectiles.clear();
  this.particles.clear();
  this.monster.reset();
  this.progression.reset();
  this.director.reset();
  this.rig.reset();
  this.order = null;
  this.markers.setTarget(null);
  this.kills = 0;
  this.runTime = 0;
  this.dyingT = 0;
  this.setState('playing');
  this.emitHud();
}

private emitHud(): void {
  const m = this.monster;
  this.events.emit('hud', {
    hp: Math.ceil(m.hp),
    maxHp: m.maxHp,
    exp: this.progression.exp,
    expToNext: expToNext(this.progression.level),
    level: this.progression.level,
    timeSec: Math.floor(this.runTime),
  });
}

private startDying(): void {
  this.monster.alive = false;
  this.order = null;
  this.markers.setTarget(null);
  this.dyingT = 0;
  this.setState('dying');
  this.particles.ring('dust', this.monster.position, 400, 30);
  this.rig.addTrauma(0.8);
}
```

Apply stats in `updateMonster` and `fireSpikes`/`meleeImpact`. Let `const s = this.progression.stats;` and:
- `m.moveToward(d.moveTo, dt, s.moveSpeedMult)`
- `m.startMelee(s.cooldownMult)` and `m.consumeSpike(s.cooldownMult)`
- In `meleeImpact`: `r = CONFIG.monster.meleeRadius * s.stompRadiusMult` and `dmg = CONFIG.monster.meleeDamage * s.damageMult`
- In `fireSpikes`: `count = 1 + s.extraSpikes` and damage `CONFIG.monster.spikeDamage * s.damageMult`
- Regen, at the end of `updateMonster`: `m.hp = Math.min(m.maxHp, m.hp + (CONFIG.monster.regenPerSec + s.regenBonus) * dt);`

Restructure `update()` by state:

```ts
private update = () => {
  this.animationFrameId = requestAnimationFrame(this.update);
  const dt = clampDelta(this.clock.getDelta());
  const frozen = this.state === 'levelup' || this.state === 'paused' || this.state === 'loading';

  if (!frozen) {
    this.elapsed += dt;
    if (this.state === 'playing') {
      this.runTime += dt;
      for (const kind of this.director.update(dt, { tanks: this.tanks.count(), jets: this.jets.count() })) {
        if (kind === 'tank') this.tanks.spawn(this.monster.position, this.rng);
        else this.jets.spawn(this.monster.position, this.rng);
      }
      this.tanks.update(dt, this.monster.position);
      this.updateMonster(dt);
      if (this.monster.hp <= 0 && this.monster.alive) this.startDying();
    }
    if (this.state === 'dying') {
      this.dyingT += dt;
      this.monster.pose.collapse = Math.min(1, this.dyingT / CONFIG.monster.deathTime);
      if (this.dyingT >= CONFIG.monster.deathTime) {
        this.setState('gameover');
        this.events.emit('gameOver', {
          timeSec: Math.floor(this.runTime),
          kills: this.kills,
          buildings: this.city.destroyedCount(),
          level: this.progression.level,
        });
      }
    }
    this.jets.update(dt, this.monster.position);
    this.projectiles.update(dt);
    this.city.update(dt);
    this.monster.animate(dt, this.elapsed);
    this.particles.update(dt);
    this.markers.update(dt);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 1 / CONFIG.hudHz;
      this.emitHud();
    }
  }

  this.rig.update(frozen ? 0 : dt, this.monster.position);
  this.lighting.follow(this.monster.position);
  this.lighting.followCamera(this.camera);
  this.pixel.render(this.scene, this.camera);
};
```

Also in `onProjectileHit`, ignore monster damage unless `this.state === 'playing'`.

- [ ] **Step 6: Verify the build and check by hand**

Run: `npm run build && npm test` (both pass). In `npm run dev`, temporarily log the emitted events (`game.events.on('levelUpOffer', console.log)` in App) and call `game.chooseUpgrade(id)` from the console, via `window.game` exposed temporarily in dev only. Check:
- Destroying about 8 buildings triggers a level-up that freezes the world.
- Choosing resumes play.
- Setting `CONFIG.monster.maxHp` to 50 temporarily makes the monster collapse and emit `gameOver`.
- `game.restart()` restores the city and clears enemies.

Revert the temporary changes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add progression, level-up flow, regen, death, restart, HUD events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: React HUD — HP/EXP bars, level-up cards, game over, safe area, lifecycle pause

Delivers the on-screen UI:
- **HUD:** an HP bar, an EXP bar with level badge and `+EXP` pops, and a run timer.
- **Level-up cards:** in a row in landscape, stacked in portrait.
- **Game-over panel:** shows the stats, with a Play Again button.

Everything stays inside the safe area. The SDK pause/resume lifecycle pauses the game.

**Files:**
- Create: `src/ui/Hud.tsx`, `src/ui/LevelUpCards.tsx`, `src/ui/GameOver.tsx`
- Modify: `src/App.tsx`, `src/style.css`

**Interfaces:**
- Consumes: the `GameScene` events `stateChange`, `hud`, `expGain`, `levelUpOffer` and `gameOver`; `GameScene.chooseUpgrade`, `restart`, `pause` and `resume`; `RundotGameAPI.system.getSafeArea()`; `RundotGameAPI.lifecycles.onPause/onResume`.
- Produces: the React components `Hud({ hud, expPop })`, `LevelUpCards({ offers, onPick })`, `GameOver({ stats, onRestart })`.

- [ ] **Step 1: Implement the components**

`src/ui/Hud.tsx`:

```tsx
import type { HudSnapshot } from '../GameEvents';

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Hud({ hud, expPop }: { hud: HudSnapshot; expPop: { amount: number; key: number } | null }) {
  const hpPct = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
  const expPct = Math.max(0, Math.min(1, hud.exp / hud.expToNext));
  return (
    <div className="hud-top">
      <div className="hud-row">
        <div className="hud-level">LV {hud.level}</div>
        <div className="hud-bars">
          <div className={`bar bar-hp${hpPct < 0.3 ? ' low' : ''}`}>
            <div className="bar-fill" style={{ transform: `scaleX(${hpPct})` }} />
            <span className="bar-label">{hud.hp} / {hud.maxHp}</span>
          </div>
          <div className="bar bar-exp">
            <div className="bar-fill" style={{ transform: `scaleX(${expPct})` }} />
          </div>
        </div>
        <div className="hud-time">{fmtTime(hud.timeSec)}</div>
      </div>
      {expPop && (
        <div key={expPop.key} className="exp-pop">
          +{expPop.amount} EXP
        </div>
      )}
    </div>
  );
}
```

`src/ui/LevelUpCards.tsx`:

```tsx
import type { UpgradeOffer } from '../GameEvents';

export function LevelUpCards({ offers, onPick }: { offers: UpgradeOffer[]; onPick: (id: string) => void }) {
  return (
    <div className="overlay levelup">
      <div className="overlay-title">Mutation</div>
      <div className="cards">
        {offers.map((o, i) => (
          <button key={o.id} className="card" style={{ animationDelay: `${i * 60}ms` }} onClick={() => onPick(o.id)}>
            <span className="card-icon">{o.icon}</span>
            <span className="card-title">{o.title}</span>
            <span className="card-desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

`src/ui/GameOver.tsx`:

```tsx
import type { RunStats } from '../GameEvents';

export function GameOver({ stats, onRestart }: { stats: RunStats; onRestart: () => void }) {
  const t = `${Math.floor(stats.timeSec / 60)}:${String(stats.timeSec % 60).padStart(2, '0')}`;
  return (
    <div className="overlay gameover">
      <div className="overlay-title">Repelled</div>
      <div className="stats">
        <div><span>Survived</span><b>{t}</b></div>
        <div><span>Kills</span><b>{stats.kills}</b></div>
        <div><span>Buildings</span><b>{stats.buildings}</b></div>
        <div><span>Level</span><b>{stats.level}</b></div>
      </div>
      <button className="btn-primary" onClick={onRestart}>Play Again</button>
    </div>
  );
}
```

- [ ] **Step 2: Wire them into `App.tsx` (no `useEffect`; mount through a `useCallback` ref)**

```tsx
import { useRef, useState, useCallback } from 'react';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { GameScene } from './GameScene';
import type { GameState, HudSnapshot, RunStats, UpgradeOffer } from './GameEvents';
import { Hud } from './ui/Hud';
import { LevelUpCards } from './ui/LevelUpCards';
import { GameOver } from './ui/GameOver';
import './style.css';

const EMPTY_HUD: HudSnapshot = { hp: 1, maxHp: 1, exp: 0, expToNext: 1, level: 1, timeSec: 0 };

function applySafeArea(el: HTMLElement): void {
  try {
    const { top, right, bottom, left } = RundotGameAPI.system.getSafeArea();
    el.style.setProperty('--safe-top', `${top}px`);
    el.style.setProperty('--safe-right', `${right}px`);
    el.style.setProperty('--safe-bottom', `${bottom}px`);
    el.style.setProperty('--safe-left', `${left}px`);
  } catch {
    // Safe area unavailable before SDK init; CSS env() fallbacks apply.
  }
}

function App() {
  const gameRef = useRef<GameScene | null>(null);
  const [state, setState] = useState<GameState>('loading');
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [offers, setOffers] = useState<UpgradeOffer[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [expPop, setExpPop] = useState<{ amount: number; key: number } | null>(null);

  const sceneRef = useCallback((container: HTMLDivElement | null) => {
    if (!container || gameRef.current) return;
    const game = new GameScene(container);
    gameRef.current = game;
    game.events.on('stateChange', setState);
    game.events.on('hud', setHud);
    game.events.on('levelUpOffer', setOffers);
    game.events.on('gameOver', setStats);
    game.events.on('expGain', (amount) => setExpPop((p) => ({ amount, key: (p?.key ?? 0) + 1 })));
    // The constructor already entered 'playing' before these subscriptions existed.
    setState(game.getState());
    try {
      RundotGameAPI.lifecycles.onPause(() => game.pause());
      RundotGameAPI.lifecycles.onResume(() => game.resume());
    } catch {
      // Lifecycle hooks unavailable outside the RUN host.
    }
  }, []);

  const hudRef = useCallback((el: HTMLDivElement | null) => {
    if (el) applySafeArea(el);
  }, []);

  const pick = useCallback((id: string) => gameRef.current?.chooseUpgrade(id), []);
  const restart = useCallback(() => {
    setStats(null);
    gameRef.current?.restart();
  }, []);

  return (
    <div className="app-container">
      <div ref={sceneRef} className="scene-container" />
      <div ref={hudRef} className="hud">
        {state !== 'loading' && <Hud hud={hud} expPop={expPop} />}
        {state === 'levelup' && offers.length > 0 && <LevelUpCards offers={offers} onPick={pick} />}
        {state === 'gameover' && stats && <GameOver stats={stats} onRestart={restart} />}
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Add the styles to `src/style.css`**

```css
.hud {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.hud-top {
  position: absolute;
  top: calc(var(--safe-top) + 10px);
  left: calc(var(--safe-left) + 10px);
  right: calc(var(--safe-right) + 10px);
  contain: content;
}

.hud-row { display: flex; align-items: center; gap: 8px; max-width: 560px; margin: 0 auto; }
.hud-level, .hud-time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.hud-level { color: var(--color-primary); }
.hud-bars { flex: 1; display: flex; flex-direction: column; gap: 4px; }

.bar {
  position: relative;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.bar-exp { height: 7px; }
.bar-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transition: transform 200ms ease-out;
}
.bar-hp .bar-fill { background: var(--color-primary); }
.bar-hp.low .bar-fill { background: #ff5a3c; }
.bar-exp .bar-fill { background: var(--color-secondary); }
.bar-label {
  position: relative;
  display: block;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.exp-pop {
  margin: 6px auto 0;
  width: max-content;
  font-weight: 700;
  color: var(--color-secondary);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  animation: exp-pop 700ms ease-out forwards;
}
@keyframes exp-pop {
  0% { transform: translateY(6px) scale(0.8); opacity: 0; }
  20% { transform: translateY(0) scale(1.15); opacity: 1; }
  100% { transform: translateY(-14px) scale(1); opacity: 0; }
}

.overlay {
  position: absolute;
  inset: 0;
  padding: calc(var(--safe-top) + 24px) calc(var(--safe-right) + 16px) calc(var(--safe-bottom) + 24px) calc(var(--safe-left) + 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(3px);
  pointer-events: auto;
  contain: content;
}
.overlay-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-primary);
  text-shadow: 0 0 12px rgba(155, 226, 45, 0.45);
}

.cards { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 360px; }
@media (min-aspect-ratio: 1/1) {
  .cards { flex-direction: row; max-width: 720px; }
  .card { flex: 1; }
}
.card {
  display: grid;
  grid-template-columns: 44px 1fr;
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  text-align: left;
  min-height: 64px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  animation: card-in 260ms ease-out both;
  transition: transform 100ms ease-out;
}
.card:active { transform: scale(0.95); }
.card:hover { border-color: var(--color-primary); }
.card-icon { grid-row: span 2; font-size: 30px; text-align: center; }
.card-title { font-weight: 700; color: var(--color-primary); }
.card-desc { font-size: 12px; color: var(--color-text-muted); }
@keyframes card-in {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-variant-numeric: tabular-nums; }
.stats div { display: flex; justify-content: space-between; gap: 16px; }
.stats span { color: var(--color-text-muted); }
.stats b { color: var(--color-text); }

.btn-primary {
  min-height: 48px;
  padding: 12px 32px;
  border-radius: 4px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  background: var(--color-primary);
  color: #0d1110;
  font: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.btn-primary:active { transform: scale(0.95); }
```

- [ ] **Step 4: Verify the build and take screenshots**

Run: `npm run build && npm test` (both pass) and `npm run shot`.
Expected:
- The HUD sits at the top on both sizes with the level badge, HP and EXP bars, and the timer.
- Text is legible, and on the phone nothing is under the notch area.

In the dev server, check a level-up and a game over by hand:
- The cards are stacked on the phone viewport and in a row on desktop.
- Tapping a card resumes play.
- Play Again resets everything.

**Seventh checkpoint: show the user the HUD screenshots.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add HUD, level-up cards, game over, safe area, lifecycle pause

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Performance check, tuning pass, README, deploy to RUN.world

Delivers a private RUN.world build the user can play on a phone and on
desktop, with a `?debug=1` overlay for checking performance on real devices.

**Files:**
- Create: `src/systems/DebugOverlay.ts`
- Modify: `src/GameScene.ts`, `README.md`
- Create (CLI-generated, committed): `game.config.json`

**Interfaces:**
- Produces: `class DebugOverlay { constructor(container: HTMLElement); update(dt: number, info: THREE.WebGLInfo): void; dispose(): void }`. It is only created when the URL contains `debug=1`.

- [ ] **Step 1: Add the debug overlay**

`src/systems/DebugOverlay.ts`:

```ts
import type * as THREE from 'three';

/** FPS + draw calls + triangles, refreshed twice a second. Enabled with ?debug=1. */
export class DebugOverlay {
  private el = document.createElement('div');
  private frames = 0;
  private t = 0;

  constructor(container: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'absolute', left: '4px', bottom: '4px', padding: '4px 6px', font: '11px monospace',
      color: '#9be22d', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none', zIndex: '10',
    });
    container.appendChild(this.el);
  }

  update(dt: number, info: THREE.WebGLInfo): void {
    this.frames++;
    this.t += dt;
    if (this.t < 0.5) return;
    this.el.textContent = `${Math.round(this.frames / this.t)} fps · ${info.render.calls} calls · ${Math.round(info.render.triangles / 1000)}k tris`;
    this.frames = 0;
    this.t = 0;
  }

  dispose(): void {
    this.el.remove();
  }
}
```

In `GameScene`, add the field `private debug: DebugOverlay | null = null;`. Create the overlay in the constructor body, after `this.container` is assigned. Don't use a field initializer: with `useDefineForClassFields`, field initializers run before parameter properties are set.

```ts
if (new URLSearchParams(location.search).has('debug')) this.debug = new DebugOverlay(this.container);
```

In `update()`, measure the raw delta before clamping so the FPS figure is honest:

```ts
const raw = this.clock.getDelta();
const dt = clampDelta(raw);
// ... existing body ...
this.pixel.render(this.scene, this.camera);
this.debug?.update(raw, this.pixel.renderer.info);
```

Add `this.debug?.dispose();` to `dispose()`.

`renderer.info` resets on every `render()` call. To count both passes (scene and upscale quad), set `this.renderer.info.autoReset = false;` in the `PixelRenderer` constructor and call `this.renderer.info.reset();` as the first line of `PixelRenderer.render()`.

- [ ] **Step 2: Measure performance**

Run `npm run dev`, then `npm run shot -- "http://localhost:5173/?debug=1" 45000`. This gives jets and a busy wave.
Expected: the overlay in both screenshots shows **under 150 calls**. Software rendering in headless Chrome means the FPS number there is meaningless; real FPS is checked on the phone in Step 6.

If the draw calls are too high, the likely causes are jets (5 meshes each) or per-building materials. Merge each jet's parts into one geometry with `BufferGeometryUtils.mergeGeometries` before going further.

- [ ] **Step 3: Tuning pass with the user**

Show the latest screenshots, and tune only the values in `src/config.ts` the user asks about. The likely knobs are:

| Knob | Effect |
|---|---|
| `render.pixelScale` | how chunky the pixels are |
| `camera.defaultPitch`, `shoulderHeight`, `shoulderOffset`, `lookAhead` | framing |
| `tank.size`, `jet.size` | readability at monster scale |
| `palette.*` | colours |
| `director.baseRate`, `rateGrowthPerMin`, `tank.damage`, `jet.damage`, `monster.maxHp` | difficulty |

Re-run `npm test` after any change, because the director tests read config values.

- [ ] **Step 4: Update `README.md`**

Replace the template README with:

```markdown
# AZRAGON

You are a skyscraper-sized alien that has crash-landed on Earth. Flatten the city while the military throws everything it has at you.

## Controls

| Action | Phone | Desktop |
|---|---|---|
| Walk | Tap ground | Click ground |
| Attack | Tap tank, jet, or building | Click it |
| Orbit camera | Drag | Drag (left or right button) |
| Zoom | — | Mouse wheel |

## Develop

npm install
npm run dev       # http://localhost:5173 (?debug=1 for fps/draw calls)
npm test          # unit tests
npm run shot      # phone + desktop screenshots into ./screenshots (dev server must be running)
npm run build

## Deploy

rundot login
npm run build && rundot deploy

Design spec: docs/superpowers/specs/. Implementation plan: docs/superpowers/plans/.
```

Put the command blocks inside the README in fenced `bash` code blocks.

- [ ] **Step 5: Register and deploy (ask the user before deploying)**

```bash
rundot whoami
```

If it reports that you're not logged in, ask the user to run `! rundot login` and wait.

**Ask the user to confirm before the first deploy.** Deploying uploads the build to RUN.world, privately and unlisted. After they confirm:

```bash
rundot init --name "AZRAGON" --description "Play a skyscraper-sized alien insect and flatten the city while humanity's military fights back." --build-path ./dist --orientation Both
npm run build
rundot deploy
```

Expected: the deploy prints a share URL and a QR code. Give the user both. `game.config.json` is created; commit it.

- [ ] **Step 6: Playtest on real devices**

Ask the user to open the share URL on their phone and on a desktop browser, both with `?debug=1` if the host passes query params through. Collect:
- the FPS on the phone (target 60, never below 30);
- whether tap versus drag feels right;
- whether tanks and jets are readable;
- their feedback on the look.

Fix issues by tuning `config.ts` first. Rebuild and redeploy with `npm run build && rundot deploy` after each fix round.

- [ ] **Step 7: Final verification and commit**

```bash
npm test && npm run build
git add -A
git commit -m "Add debug overlay, README, and RUN.world config; deploy milestone 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all unit tests pass (about 70) and the build succeeds. Report the share URL and the test counts to the user.
