# AZRAGON — Milestone 3 Design: Intro Cinematic

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: milestones 1–2 (merged to `main`)

## Goal

A roughly 15-second, skippable intro that plays at the start of every run. The
alien cocoon pod flies through space at Earth, burns through re-entry, falls
through clouds, and crashes into the city, carving the crater. Then the
monster bursts out and gameplay begins seamlessly. It must look as good as the
game: same pixel renderer, toon shading, and palette.

In milestone 4 it will play after monster select. For now it plays on game
load and on every Play Again.

## Timeline

| t (s) | Phase | Content |
|---|---|---|
| 0.0–3.5 | `space` | Starfield and pixel-art Earth in the lower half (ocean blue, land green/ochre, white cloud swirls, cyan atmosphere rim). Camera behind the pod; Earth grows as the pod streaks toward it. |
| 3.5–5.5 | `reentry` | The pod's nose glows orange, then white-hot. A flame sheath streams back past the camera, embers fly, and shake grows. At the end the screen washes white-orange (full-screen flash), and **the scene cuts to the game world under the flash** (cut at t = 5.5). |
| 5.5–8.5 | `clouds` | Falling through thick pixel cloud banks high above the city, with fire and smoke trailing. Cloud sprites whip past the camera. |
| 8.5–10.5 | `descent` | The clouds part and the city appears below. The camera swings wider to show the pod streaking toward the crater site. |
| 10.5–11.0 | `impact` | Flash, heavy shake, a large shockwave ring, and buildings in the crater radius collapsing outward. Dust, debris, and fire rise. This creates the crater. |
| 11.0–13.0 | `settle` | Dust thins. The cocoon is visible half-buried in the crater, its seams pulsing. |
| 13.0–15.0 | `emerge` | The seams split with light, shell fragments burst out, and the monster rises from the cocoon. The camera glides into the gameplay over-the-shoulder pose and arrives exactly on it at t = 15. |
| 15.0 | `done` | Gameplay starts. The HUD fades in and the run timer starts; the opening tank ring arrives 5 s later. |

All phase boundaries live in `CONFIG.intro`.

## Visuals

- **Pod (cocoon):** a faceted, egg-shaped dark chitin shell (dark purple-brown) with glowing acid-green seams. It shares the monster's palette. It is about 60% of the monster's height, so it reads as the monster curled up inside.
- **Space scene:** a separate `THREE.Scene` holding:
  - a star particle field (points);
  - an Earth sphere with a procedural Canvas 2D pixel texture (oceans, continents, cloud swirls) and a slightly larger back-face rim sphere for the atmosphere glow;
  - the pod.

  It uses the same `PixelRenderer` and toon materials.
- **Re-entry:**
  - The pod's emissive ramps from orange to white.
  - Flame-sheath particles (fire layer) stream backward.
  - Shake trauma ramps up.
  - A full-screen flash overlay (DOM div with opacity) peaks at the cut.
- **Clouds:** instanced flat, pixel-textured cloud billboards in a band about 1,500–4,000 m above the city, around the descent path. Fog is temporarily denser while inside them.
- **Impact:**
  - a big shockwave ring (reusing `Shockwave`);
  - city buildings within the crater radius destroyed via a new `City.blast(center, r)`, rubble only, no EXP;
  - dust, debris, and fire bursts;
  - a crater decal that appears at impact.
- **Emerge:**
  - The pod splits into 4–6 shell fragments that fly outward with a green light burst.
  - The monster rises from below the crater floor up to standing (root y from −300 × scale to 0) while the legs settle.

## Architecture

- **`intro/timeline.ts` (pure):**
  - `phaseAt(t): { phase, k }`, where k is the progress within the phase, 0..1;
  - `INTRO_LENGTH`;
  - `CUT_TIME`;
  - `podPath(t)` for the game-world pod position after the cut;
  - `cameraPath(t, gameplayPose)`, the camera position and look target, which must equal the gameplay pose at t = `INTRO_LENGTH`.
- **`intro/SpaceScene.ts`:** builds and animates the space scene (Earth, stars, pod) for t < `CUT_TIME`.
- **`intro/IntroCinematic.ts`:** orchestrates phases, effects, and the cut, and owns the cloud layer, pod, and fragments in the game scene. API: `start()`, `update(dt)`, `skip()`, `done`, `dispose()`.
- **`GameScene`:**
  - **State:** a new `GameState` value, `'intro'`. In `intro`, enemies, spawning, passives, abilities, HUD emission, and gameplay input are off. A tap or key calls `skip()`.
  - **Start and restart:** the constructor and `restart()` start the intro, and `onIntroDone()` enters `playing`.
  - **Rendering:** `render()` chooses the space scene or the game scene based on the intro.
- **`City`:**
  - The crater area is no longer pre-cleared at generation. `clearRadius` keeps only the ground decal, so buildings stand there until the impact.
  - `City.blast(center, r)` collapses the standing buildings in the radius without awarding EXP.
  - If the intro is skipped, the blast is applied instantly.
- **UI:** a skip hint ("Tap to skip" on touch, "Click or press any key to skip" on desktop), a flash overlay, and the HUD hidden during `intro`.

## Skip and restart

- **Skip:** jumps straight to the end state: crater blasted, pod gone (fragments cleared), monster standing at the origin, camera at the gameplay pose, state `playing`.
- **Restart:** "Play Again" resets the world as today, then replays the intro.

## Testing

- **Unit tests:**
  - `phaseAt` boundaries and k;
  - `CUT_TIME` inside the re-entry flash;
  - `cameraPath` ending exactly on the gameplay pose;
  - `podPath` landing at the crater centre at impact time;
  - the skip state transition (a pure intro state reducer, if it's factored out).
- **Scripted browser checks (GPU):**
  - screenshots at the midpoint of each phase, phone and desktop;
  - skipping at several random times lands in `playing` with the monster at the origin and no errors;
  - restart replays the intro;
  - the city around the crater is standing before the impact and rubble after it.
- **Regression:** the existing 175 tests still pass, and gameplay is unchanged after the intro.

## Out of scope

Title screen, monster select (milestone 4), audio, and other monsters' pods.
