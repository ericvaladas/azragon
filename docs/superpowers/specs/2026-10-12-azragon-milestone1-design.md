# AZRAGON — Milestone 1 Design: Look & Core Loop

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review

## Game Summary

AZRAGON is a 3D game for RUN.world, playable on phones (touch) and desktop browsers (mouse). The player controls a giant alien
monster (roughly CN Tower height, ~550 m) that has crash-landed on Earth and is
destroying everything. Humanity responds with endless, escalating military waves.
The player earns EXP from destruction and picks permanent (per-run) upgrades on
level-up.

The full game is delivered in four playable milestones:

1. **Look & core loop** (this document)
2. Progression depth: larger upgrade pool, difficulty ramp, remaining enemy types
   (SAM silos, laser turrets, artillery, long-range missiles, player-invented tech)
3. Intro cinematic: space pod flight, atmospheric entry, clouds, impact, monster emerges
4. Title screen ("AZRAGON") and monster select (4 monsters)

Visual style is the top priority across all milestones. Milestone 1 locks it in.

## Milestone 1 Scope

In scope:

- One playable monster: the Insect Titan
- One generated city map
- Tap-to-move, tap-to-attack, drag-to-orbit camera
- Two enemy types: tanks and jets
- Spawn director with time-based escalation
- Monster health, slow regeneration, death
- EXP, levels, a level-up screen offering 3 upgrades from a small pool
- Game-over screen with survival time, destruction count, and level
- Deploy to RUN.world as a private build for phone testing

Out of scope (later milestones): title screen, monster select, intro cinematic,
additional enemy types, additional monsters, audio beyond placeholders, meta
progression between runs, leaderboards.

When the page loads, gameplay starts immediately with the monster standing in the
city. A "Play again" button on the game-over screen starts a new run.

## Visual Direction

Reference: _A Short Hike_ — low-poly geometry, low-resolution pixel textures,
the whole scene rendered at low resolution and upscaled with crisp pixels.

### Rendering pipeline

- The scene renders into a `WebGLRenderTarget` at a fraction of the canvas size,
  then a fullscreen quad draws it to the canvas with `NearestFilter`.
- The pixel scale is a single tunable constant (`PIXEL_SCALE`, default 3: one
  render pixel covers 3×3 screen CSS pixels). The internal height has a floor
  (~180 px) so very small screens stay readable.
- Materials use stepped toon lighting (`MeshToonMaterial` with a 2–3 step gradient
  map, `NearestFilter`) and flat vertex or base colors.
- Small textures (16–32 px) are drawn procedurally with Canvas 2D: building
  windows, road markings, grass speckle. They use `NearestFilter` and no mipmaps.
- A vertical gradient sky dome, and distance fog tinted toward the horizon color.
- One directional sun light with shadows covering only the area around the monster,
  plus a hemisphere light for fill.
- Renderer settings follow CLAUDE.md mobile guidance: no `setPixelRatio`, with
  the canvas sized correctly from its CSS size.

### Palette

- Ground: soft greens and ochres. Roads: warm grey. Buildings: a few muted
  pastel facade colors with darker roofs.
- Distance haze: blue-grey.
- Monster: acid green carapace, purple joints and accents, a glowing yellow-green
  stinger tip. It must contrast strongly with the city.
- Military: olive drab tanks, grey jets, orange-yellow muzzle flashes and fire.

### Scale

- Monster height ≈ 550 world units (1 unit = 1 m).
- Buildings 20–120 m tall, reaching the monster's shin to knee.
- Tanks ≈ 10 m long and jets ≈ 15 m long, scaled up about 1.5× from real life so
  they are readable at monster scale. This is a deliberate exaggeration.
- Camera: over the shoulder, behind and above the monster's back. Camera
  near/far planes are tuned to the scale to avoid depth precision problems.

### Juice

- Camera shake (trauma-based) on stomps, monster hits, and building collapses.
- A dust ring at each foot landing.
- Chunky pixel debris, fireballs, and smoke puffs from a pooled particle system.
- Buildings collapse by sinking and tilting with a dust cloud, then leave rubble.
- Hit flash on damaged enemies and on the monster.
- HUD juice is CSS-only: floating EXP numbers, an EXP bar pulse, and a level-up
  pop.

## Monster: Insect Titan

- Built entirely from code: a segmented thorax and abdomen (scaled boxes and
  low-segment cylinders), a head with mandibles, six multi-jointed legs, and a
  raised stinger tail curving over the back.
- The legs animate procedurally: an alternating tripod gait driven by distance
  travelled, with each foot lifting along an arc. When idle, the body sways and
  breathes, and the mandibles twitch.
- Movement: turns toward the destination at a capped turn rate, then walks at a
  set speed. It ignores collision with buildings: walking through a building
  damages it.

### Attacks

- **Stomp/slash (melee):** short range. Damages all targets within the stomp
  radius, centered in front of the monster. It is used against ground targets
  and buildings in range.
- **Stinger spike (ranged):** a projectile from the stinger tip. It homes lightly
  toward the target and is the only attack that can hit jets. It is used
  automatically when the target is out of melee range or airborne.
- Each attack has a cooldown, and upgrades modify both.

## Controls

All input goes through Pointer Events on the canvas, following CLAUDE.md
guidance: `touch-action: none` and no browser gestures.

- **Tap** (pointer up with movement < ~10 px and duration < ~300 ms):
  - Raycast against enemies first. Jets get an enlarged invisible hit volume so
    they can be tapped on a phone. Then buildings, then the ground.
  - Enemy or building hit → set it as the attack target. The monster approaches to
    range and attacks until the target is destroyed, then goes idle.
  - Ground hit → move order. This clears the attack target. A small pixel marker
    appears where the player tapped.
- **Drag** (movement past the threshold): horizontal drag orbits the camera's yaw
  around the monster, and vertical drag adjusts pitch within limits.
- **Idle auto-defense:** when the monster has no order, it automatically uses the
  ranged attack on the nearest enemy in range, so it fights back while the
  player is orbiting the camera.
### Desktop (first-class platform, not just a dev convenience)

- Left-click uses the same tap rules: move, or attack the clicked target.
- Left-drag or right-drag orbits the camera. The browser's right-click menu is
  disabled on the canvas.
- The mouse wheel zooms the camera between a near and far shoulder distance,
  within limits.
- Hovering over an enemy or building highlights it and changes the cursor, so
  players can see what they can click.
- All of this uses the same Pointer Events code path as touch: one input system,
  with hover and wheel added only for mouse pointers.

## Enemies

### Tank

- Spawns at the map edge and drives along roads toward the monster, stopping at
  firing range.
- Fires shells with a visible arc and an impact puff. Low HP. One stomp kills it.

### Jet

- Spawns far away at altitude and flies strafing passes past the monster's head
  and upper body. It fires rocket salvos on approach, then banks away and loops
  for another pass.
- Only the stinger spike can hit it. Medium HP.

### Spawn director

- Runs on elapsed run time. The spawn budget grows over time, and each enemy type
  has a cost.
- Tanks only for the first ~30 s, then jets are added.
- Caps on enemies alive at once keep mobile performance safe (initial target
  ~40 tanks and 8 jets). These caps are tunable constants.

## Progression

- EXP sources: tank, jet, and building, each with a fixed EXP value. Buildings
  give the least EXP per hit point but are always available.
- The EXP needed for each level follows a gently rising curve.
- On level-up, gameplay pauses and three upgrade cards are shown. Picking one
  resumes play.
- Milestone 1 upgrade pool (about 6): +damage, attack speed, +max HP / heal, regen,
  stomp radius, spike count (multi-shot), move speed. Duplicate picks stack.

## Health and Game Over

- The monster has max HP, takes damage from shells and rockets, and regenerates
  slowly.
- At 0 HP: a death animation (collapse with dust), then a game-over panel showing
  survival time, kills, buildings destroyed, level, and a "Play again" button.

## Architecture

The template's model is preserved. Three.js owns the scene and game loop,
`GameEvents` is the typed bridge, and React renders only the HUD and overlays.
`GameScene.ts` becomes a thin orchestrator.

```
src/
├── App.tsx                 # mounts game, HUD, level-up + game-over overlays
├── GameScene.ts            # orchestrator: owns systems, state machine, main loop
├── GameEvents.ts           # typed events (hp, exp, level-up offer, game over, stats)
├── config.ts               # all tunable constants (scale, speeds, HP, caps, PIXEL_SCALE)
├── render/
│   ├── PixelRenderer.ts    # low-res render target + nearest upscale
│   ├── Sky.ts              # gradient dome, fog setup
│   ├── Lighting.ts         # sun + hemisphere, shadow frustum follows monster
│   └── toon.ts             # gradient map + material factory
├── world/
│   ├── City.ts             # grid/road layout generation, instancing
│   ├── Building.ts         # building HP, damage, collapse
│   └── pixelTextures.ts    # procedural Canvas 2D textures
├── monster/
│   ├── InsectTitanModel.ts # geometry build
│   ├── LegRig.ts           # procedural tripod gait
│   └── Monster.ts          # movement, orders, attacks, HP
├── enemies/
│   ├── Tank.ts
│   ├── Jet.ts
│   └── SpawnDirector.ts
├── systems/
│   ├── Input.ts            # tap vs drag, raycast picking
│   ├── CameraRig.ts        # over-shoulder orbit + shake
│   ├── Projectiles.ts      # pooled shells, rockets, spikes
│   ├── Particles.ts        # pooled debris/dust/fire
│   └── Progression.ts      # EXP, levels, upgrade pool, applied modifiers
└── ui/
    ├── Hud.tsx             # HP bar, EXP bar, level, timer
    ├── LevelUpCards.tsx
    └── GameOver.tsx
```

Unit boundaries:

- The game logic (`Progression`, `SpawnDirector`, `Monster`, and the targeting
  logic in `Input`) works on plain data, with Three.js objects kept at the edges.
  This keeps the logic testable without a renderer.
- The systems talk through `GameScene`; there are no cross-imports between
  enemies and the monster. Damage goes through one shared `Damageable` interface.
- React never reads Three.js objects. It only consumes `GameEvents`.

### Template constraints (from CLAUDE.md)

- Any screen shape: the template's 9:16 cap on the app container is removed, so
  the game fills the window on phones (portrait) and on desktop (landscape).
  `CameraRig` adapts to the aspect ratio. In portrait, the monster sits in the
  lower third with sky and jets above it. In landscape, the horizontal field of
  view is held to a sensible range, so the camera doesn't zoom out absurdly.
- HUD layout responds to orientation. Level-up cards sit in a row in landscape
  and stack vertically in portrait. HUD elements stay inside the device's safe
  area (notches and home indicators) on phones.
- React: no `useEffect`. The game mounts through a `useCallback` ref, as in the
  existing `App.tsx`. React never manages game logic or Three.js objects.
- Orientation: models are built Y-up, facing +Z. +X is the model's left.
- Canvas DPI: no `renderer.setPixelRatio()`. `PixelRenderer` sizes its own target
  from the container's CSS size, measured with a `ResizeObserver`.
- Shadows: `castShadow` and `receiveShadow` are set on every mesh in the monster
  group.
- HUD style: replace the template's placeholder theme in `src/theme.ts` with an
  acid-green accent on dark translucent panels, use a pixel or sci-fi display
  font (e.g. Chakra Petch or Press Start 2P), and keep corners tight (2–6 px).
  Buttons use `:active` scale feedback, HUD numbers use tabular figures, and
  React updates are throttled to ~5–10 Hz.

### Performance budget (mid-range phone)

- The low-resolution render target cuts the number of pixels drawn by about 9×.
- Buildings are merged per city chunk or instanced. A destroyed building is
  swapped for a rubble instance.
- Projectiles and particles are pooled, with no per-frame allocations.
- Shadows cover only a tight area around the monster, at a low resolution.
- Target: 60 fps on a mid-range phone, never below 30 fps.

## RUN SDK Integration

- Keep the template's existing SDK initialization and preloader handling.
- Milestone 1 uses no storage, leaderboard, or analytics features. Before writing
  any SDK code, read the relevant docs in `.rundot-docs` first.
- Deploy flow: `rundot init --name "AZRAGON" --description "..."` once, then
  `npm run build` and `rundot deploy`. The game stays private and unlisted.

## Testing and Verification

- Unit tests (Vitest, added as a dev dependency) for the logic: Progression
  (EXP curve, upgrade application, stacking), SpawnDirector (budget growth, caps,
  unlock timing), tap/drag classification, and target-selection rules.
- `npm run build` (tsc + vite) passes after each piece.
- Visual verification: run the dev server, capture screenshots at a phone
  portrait size (390×844) and a desktop size (1440×900), and review the look with
  the user before tuning further.
- Final check: deploy, then play both on a real phone and in a desktop browser
  with the mouse.

## Open Tuning Questions (resolved during implementation, not blockers)

- The exact `PIXEL_SCALE` value. Decide from screenshots on a phone.
- The camera shoulder offset and default pitch.
- Numeric balance (HP, damage, spawn rates). Starts as constants in `config.ts`.
