# AZRAGON — Milestone 4a Design: Title, Monster Select, Monster Architecture, Reptile Kaiju

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: milestones 1–3 (merged to `main`)

## Goal

Make AZRAGON a game you start from a menu and play as one of several monsters:

- A **title screen** and a **monster select** screen in front of the intro.
- The monster code reworked so the game can drive **any creature**. The Insect Titan moves onto it with unchanged behaviour.
- The first new creature, the **Reptile Kaiju**: its own body, gait, attacks, and signature upgrades.

Milestone 4 is split:

| Part | Scope |
|---|---|
| **4a** (this spec) | Menus, monster rework, Reptile Kaiju |
| 4b | Kraken |
| 4c | Stone Golem |

Each part ships playable and gets its own spec, plan and review.

## Flow and game states

```
title ──tap/key──▶ select ──PLAY──▶ intro ──▶ playing ──▶ dying ──▶ gameover
                     ▲                 ▲                                  │
                     │                 └────────── Play Again ────────────┤
                     └──────────────── Change Monster ────────────────────┘
```

- `GameState` gains `'title'` and `'select'`. The game now boots into `title` instead of starting the intro.
- **Hidden in `title` and `select`:** the HUD, ability buttons and edge arrows.
- **Inactive in `title` and `select`:**
  - gameplay input (taps, ability keys, pinch, drag);
  - enemies, spawning, abilities, passives and the run timer.
- **Play Again** restarts with the same monster; the intro replays (still skippable).
- **Change Monster** resets the world and returns to `select`.
- **Pause and resume** (RUN lifecycle) work in every state. Resuming returns to the state that was paused.

## Screens

### Title

- **Logo:** a large pixel-styled "AZRAGON" in the game's font, sharp and heavy, with a toxic-green accent.
- **Hint:** "Tap to start" (touch) or "Click or press any key" (desktop), pulsing.
- **Backdrop:** the real game city. The camera drifts slowly in a wide arc at a high angle. No monster or enemies are shown, and the crater is not blasted.
- **Transition:** any tap, click or plain key (the same rule as intro skip) moves to `select` with a short fade.

### Monster select

- **Diorama:** the selected monster stands on the crater floor, rendered by the game in the same pixel style.
  - The crater decal is shown here, but the city is not blasted. The decal is hidden again when PLAY starts the intro.
  - The camera orbits it slowly.
  - The monster idles (breathing, small shifts).
- **Switching:** left/right arrows (also keyboard ← →) and horizontal swipes. The current monster's model is replaced, and the panel crossfades.
- **Panel** at the bottom (dark translucent, game UI style):
  - the name and a one-line description;
  - three stat bars: **Toughness**, **Power**, **Speed**, each out of 5 pips;
  - the signature moves as icon + short label;
  - a big **PLAY** button.
- **Roster in 4a:** Insect Titan and Reptile Kaiju are selectable. Kraken and Stone Golem appear in the carousel as dark silhouette cards marked **Coming soon**, with PLAY disabled.
- **Remembered pick:**
  - The last selected monster is saved to `RundotGameAPI.appStorage` under key `azragon.monster`.
  - It is read once at boot. Reads and writes are wrapped in try/catch; any failure, or an unknown id, falls back to the Insect Titan.
- **Layout:** works in phone portrait and desktop landscape. Touch targets are at least 44 px.

### Game over

The panel shows the run stats as today, plus two buttons: **Play Again** (primary) and **Change Monster**.

## Monster architecture

### `MonsterKind`

All per-creature content lives in a `MonsterKind` definition, one module per creature under `src/monsters/<id>/`. Each definition provides:

- **Identity:** `id`, `name`, `blurb`, select-screen pip ratings, signature-move labels and icons.
- **Stats:** `maxHp`, `damageMult`, `moveSpeed`, `turnRate`, melee range and cooldown, ranged range and cooldown, foot radius and damage, and its size (height and footprint radius). The cocoon is sized from height and footprint.
- **Body (`MonsterBody`)**, a class that builds the model and animates it. It exposes only what the game needs:
  - `root`;
  - `animate(dt, time, motion state)`;
  - foot-landing events;
  - the world origin for its ranged attack;
  - a melee strike toward a point, which fires an impact event at contact;
  - an anti-air strike toward a target, which fires an impact event at contact;
  - poses for leap, dash, roar, crouch (used by the intro), collapse (death), hit flash and glow (level-up).
- **Attacks:**
  - `melee`: how a strike resolves (point and radius, or forward arc);
  - `ranged`: a projectile volley, or a beam that hits along a line;
  - `antiAir`: the base-kit flyer defence (Tail Swat or Snap Bite).
- **Signature upgrades:** the list of signature ability ids the creature's level-up pool offers, plus display names for the generic stat upgrades.

### Shared vs. per-monster

`GameScene` and the systems talk to the monster only through `Monster`, which wraps a `MonsterKind` plus its body. Movement, HP, cooldowns and the brain are shared logic. Insect-only parts (legs, stinger tip, tail) are no longer referenced outside the Insect's own module.

| Area | Shared by all monsters | Per monster |
|---|---|---|
| Locomotion | Walking along orders, turning, auto-targeting brain | Gait and animation |
| Actives | **Leap, Dash, Roar** (same mechanics and numbers; first active is Leap, the other two from level-ups) | Each performs them with its own pose |
| Auto attacks | — | Auto melee, auto ranged, anti-air base kit |
| Generic upgrades | damage, attack speed, vitality, regen, stomp radius, extra projectile, move speed | Each gets its own display names |
| Shared abilities | Dash, Roar, Shield Bubble, Reflect Shield, Overload | — |
| Signature abilities | — | Each monster's own list; never offered to another monster |

Difficulty, enemies, the city, EXP and the HUD are unchanged.

### Insect Titan

The Insect Titan becomes the first `MonsterKind` with no behaviour change. Its stats, kit and visuals are exactly as today, and every existing test still passes.

**Signatures:**
- Acid Footprints, Spike Storm, Brood Swarm, Spine Shield, Tail Swat+, Venom Nova, Acid Mortar;
- Chitin Deflection, Feeding Frenzy.

**Select pips** (Toughness / Power / Speed): 3 / 3 / 4.

### Intro

- The cocoon's length is computed from the selected monster's size, so the monster always fits inside.
- The crouch-and-stand emergence uses the monster body's crouch pose.
- The intro otherwise behaves as in milestone 3.

## Reptile Kaiju

### Look

- An upright two-legged reptile, slightly taller than the Insect.
- A heavy tail that drags and counter-swings, short clawed arms, a big jaw, and a row of jagged back plates.
- **Palette:** dark slate-green scales with a lighter belly; back plates and eyes glow cyan.
- **Rendering:** built from faceted primitives with toon materials, like the Insect.

### Movement

- **Gait:** a heavy two-legged stomp. Fewer, larger strides than the Insect, with the body swaying side to side and the tail swinging for balance.
- **Footfalls:** each one is a stomp: dust, a small shake, and crush damage over a wider foot radius than the Insect's.
- **Speed and turning:** moves about 15% slower and turns more slowly than the Insect.

### Base kit

| Move | Slot | Behaviour |
|---|---|---|
| **Claw Rake** | Auto melee | A forward swipe that hits every ground target and building in an arc in front, within melee range. |
| **Plasma Breath** | Auto ranged | The back plates light up from tail to head (a short charge, ~0.4 s), then a cyan beam fires at the target. The beam sweeps a little and hits every enemy and building along its line. Cooldown is longer than the spikes' (about 2.2 s at base). Upgrades add more breath damage (generic damage) and a faster recharge (attack speed). |
| **Snap Bite** | Anti-air | The neck lunges at a flyer within reach near head height, much like the Insect's Tail Swat. |

The extra-projectile upgrade gives the Kaiju a wider sweep instead of more spikes.

### Signature upgrades

| Kaiju upgrade | Mirrors | Behaviour |
|---|---|---|
| **Radiant Wake** | Acid Footprints | Glowing radioactive pools under each footfall. |
| **Plate Barrage** | Spike Storm | Plates fire homing cyan plasma bolts every few seconds. |
| **Thermal Plates** | Spine Shield | Plates zap incoming shells and missiles. |
| **Snap Bite+** | Tail Swat+ | Faster, harder bites that can chain targets. |
| **Heat Pulse** | Venom Nova | A cyan-orange heat ring every few seconds. |
| **Plasma Lob** | Acid Mortar | Arcing plasma globs aimed at artillery, SAMs and trucks. |
| **Meltdown** | (new) | Below 30% HP: +50% damage and breath recharges twice as fast; the plates glow brighter. |
| **Scale Armor** | Chitin Deflection | A chance to deflect hits. |
| **Primal Hunger** | Feeding Frenzy | Heals on each kill. |

**Implementation:** the mirrored upgrades reuse the Insect systems' logic and numbers, recoloured and re-skinned for the Kaiju (cyan/orange instead of acid green). Meltdown is new logic.

**Generic upgrade names:**

| Upgrade | Kaiju name |
|---|---|
| damage | Atomic Fury |
| attack speed | Rapid Breath |
| vitality | Ironscale Hide |
| regen | Rad Regeneration |
| stomp radius | Earthshaker |
| extra projectile | Wide Sweep (wider breath sweep) |
| move speed | Long Stride |

The Insect keeps today's names.

### Actives (shared mechanics)

| Active | Kaiju pose |
|---|---|
| **Leap** | A heavy jump that lands tail-first in a quake |
| **Dash** | A lowered-head shoulder charge |
| **Roar** | Head thrown back, plates flaring |

### Stats

| | Insect Titan | Reptile Kaiju |
|---|---|---|
| Max HP | 1000 | 1250 |
| Damage | ×1.0 | ×1.15 |
| Move speed | 1.0 | 0.85 |
| Turn rate | 1.0 | slower |
| Select pips (Toughness / Power / Speed) | 3 / 3 / 4 | 4 / 4 / 2 |

Final numbers live in `CONFIG` and will be tuned in playtest.

## Testing

### Unit tests (pure modules)

- **Monster interface:** `MonsterKind` and `Monster` behave correctly for both creatures. HP, damage, speed and cooldowns come from the kind.
- **Insect regression:** its numbers are pinned and unchanged.
- **Level-up pool:** each monster's pool offers only its own signatures plus the shared upgrades.
- **Biped gait:** alternating feet, foot-landing events, stride length scaling with speed.
- **Breath line hits:** which targets a beam segment hits (line-vs-circle with a width). Buildings and enemies are hit along the line, and nothing beyond range.
- **Claw Rake:** hits within the forward arc only.
- **Meltdown:** active below 30% HP only.
- **Menu state reducer:** valid transitions between title, select, intro, playing, gameover, Play Again and Change Monster.
- **Remembered pick:** parse/validate falls back to the Insect on bad or missing data.

### Scripted browser checks (GPU), phone and desktop

- Title → select → switch to the Kaiju (and back) → PLAY → intro → playing, for each monster, with screenshots.
- A Kaiju breath hits a line of tanks; Claw Rake flattens buildings in an arc.
- Game Over → Play Again keeps the monster; Change Monster returns to select.
- Pausing in each menu state, no page errors, and draw calls under 150 in every screen.
- The remembered pick survives a reload. The scripts stub `RundotGameAPI.appStorage` if it is unavailable in dev.

### Regression

All existing tests pass, and Insect gameplay is unchanged after the rework.

## Out of scope (4a)

- Kraken (4b) and Stone Golem (4c). They appear only as "Coming soon" cards.
- Monster unlocks or progression, audio, per-monster cocoon designs, and leaderboards.
