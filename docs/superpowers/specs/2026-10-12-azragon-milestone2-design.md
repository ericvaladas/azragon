# AZRAGON — Milestone 2 Design: Threats, Abilities & Pacing

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: `2026-10-12-azragon-milestone1-design.md` (merged to `main`)

## Goals

1. **The first minute is exciting.** The monster starts out feeling overpowered: fast,
   hard-hitting, and quick to level. It has things to smash right away.
2. **The military catches up.** New enemy types unlock over time, and enemies get
   tougher and more numerous. A decent player dies at around 8 minutes. Every
   enemy type has appeared by minute 5.
3. **Builds are interesting.** Level-ups offer automatic abilities as well as stat
   boosts, plus two active abilities on buttons.
4. **Threats are readable.** Every new attack is telegraphed before it lands.
   Enemies have markers, and off-screen threats get edge arrows.

Out of scope: title screen, monster select, intro cinematic, other monsters,
audio, the laser turret, cruise missiles, and meta-progression between runs.

## 1. Pacing & Feel

### Baseline monster (replaces M1 values)

| Stat | M1 | M2 |
|---|---|---|
| Move speed | 70 × scale (56 m/s) | 90 m/s |
| Turn rate | 1.4 rad/s | 2.4 rad/s |
| Melee cooldown | 1.2 s | 0.7 s |
| Spike cooldown | 0.9 s | 0.5 s |
| Spike damage | 40 | 45 (one spike kills a base tank) |

All values stay in `src/config.ts`.

### EXP curve

The first level-up arrives at about 15 s of normal play. A typical player reaches
level 4–5 (Roar unlock) within about 60 s, and later levels slow down.
Starting values: `expBase` 20, `expExponent` 1.55, tuned by playtest.

### Opening

At 0:05, a ring of 8 tanks spawns on the roads at about 1.2 km, all converging.
This runs once per run, outside the spawn budget.

### Unlock timeline (run time)

| Time | Enemy |
|---|---|
| 0:00 | Tanks |
| 0:20 | Jets |
| 0:45 | Kamikaze blimps |
| 1:30 | SAM silos |
| 2:30 | Artillery batteries |
| 3:30 | Grappling trucks |
| 4:30 | Orbital laser |
| 5:00–8:00 | All types; escalation continues |

### Difficulty scaling

`difficulty(tMinutes)` returns multipliers applied at spawn time:

- Enemy HP: `1 + 0.25·t`
- Enemy damage: `1 + 0.15·t`
- Spawn budget rate: the existing linear growth, plus the per-type unlocks above.

Per-type caps on enemies alive at once keep performance safe.

## 2. New Enemies

Every enemy is built from code primitives in the pixel/toon style. Repeated
enemies use instancing where counts can exceed about 4. Every attack is
telegraphed.

### Kamikaze blimp (0:45)

- **Look:** fat grey-white envelope, red warning stripe, gondola, blinking red light.
- **Behavior:** drifts toward the monster's head height at about 40 m/s.
  Airborne target.
- **Attack:** detonates on reaching the monster. Heavy damage and a big fireball.
- **Counter:** spikes, Brood Swarm, Spike Storm. Roar knocks down blimps within
  its radius.
- **Stats:** HP about 4 spikes, high EXP, cap 6.

### SAM silo (1:30)

- **Spawn:** a round hatch appears in the ground near the monster (600–1400 m)
  with a dust burst.
- **Cycle:** rise over 1 s, stay up for 6 s, sink over 1 s, stay hidden for
  4–6 s, repeat. It can be targeted only while raised.
- **Attack:** once per raised phase, a volley of 4 homing missiles toward the
  monster's upper body. Missiles are slow (about 300 m/s), airborne, and can be
  targeted. Spikes and auto-defense shoot them down; each destroyed missile
  gives a little EXP.
- **Stats:** armored (high HP), high EXP, cap 4.

### Artillery battery (2:30)

- **Spawn:** 2–3 guns spawn as a battery 2.5–3.5 km away, inside the fog. An
  edge arrow points to it.
- **Attack:** every 6 s, a salvo of N strikes (N grows with time, starting at 3).
  Each strike shows a red ground circle (radius about 90 m) that fills over 2 s,
  then a shell lands with an explosion. Damage applies if the monster's root is
  inside a circle at impact.
- **Counter:** walk or Leap out of circles, or destroy the guns (fragile up close).
- **Cap:** 2 batteries.

### Grappling truck (3:30)

- **Look:** long flatbed truck with a giant harpoon cannon.
- **Behavior:** drives on roads like a tank. In range (about 900 m), it stops,
  deploys anchors (dust and ground crack), then fires the harpoon. A taut cable
  then runs from the truck to the monster's body.
- **Tether:** while tethered, the monster cannot move more than
  `tetherLength` (its distance at hook time + 50 m) from any anchoring truck.
  Movement is clamped against every active tether.
- **Breaking free:**
  - The tether expires after 6 s (shorter with Thrash).
  - Killing the truck, Leap, or Roar snaps it instantly.
  - A truck re-fires after a 4 s cooldown.
- **Stats:** HP about 2 tanks, cap 4.

### Orbital laser (4:30)

- **Phases:** `idle` → `tracking` (2.5 s) → `locked` (0.4 s) → `firing` (1.5 s)
  → `cooldown` (20–30 s).
- **Tracking:** a faint pale beam from the sky marks a point that follows the
  monster's position with lag (it eases toward it, about 120 m/s max).
- **Locked:** the beam brightens and the point stops moving.
- **Firing:** a blinding white-cyan column (radius about 110 m). It deals damage
  per second while the monster's root is inside, with screen shake. It leaves a
  scorched decal that fades over 10 s.
- **Limits:** at most one laser at a time. It cannot be destroyed; it is dodged.

### Enemy readability

- A small pixel chevron above every live enemy, in one instanced mesh.
- Screen-edge arrows (DOM) for off-screen threats: artillery, SAM silos,
  trucks, blimps. Fed by a `threats` event at 10 Hz.

## 3. Abilities

### Active (buttons)

**Leap** (available from the start, cooldown 8 s)

- **Aim:**
  - Tap the button, or press Space on desktop, to enter aim mode. The monster
    crouches and a target ring follows the pointer on desktop or appears on the
    next tap.
  - Tap a ground point within 1000 m to jump; points farther away clamp to max
    range.
  - Tapping the button again cancels.
- **Arc:** parabolic, 1.1 s, peak height about 260 m. The monster is untargetable
  mid-air, so the laser and artillery miss.
- **Landing:** damages ground units and buildings within 260 m, with a dust ring,
  debris and shake.
- **Tethers:** Leap snaps all tethers.

**Roar** (unlocks at level 5, cooldown 20 s)

- **Trigger:** one tap, or R on desktop.
- **Effect:** a 1.2 s animation (head raised, mandibles spread) with an expanding
  shockwave ring to 600 m. It damages ground units and buildings and kills
  blimps and jets within the radius (they crash). It breaks all tethers.

**Buttons:** bottom-right, inside the safe area, 64 px round, a radial cooldown
sweep, and a pulse when ready. Roar shows a lock icon with "LV 5" until it
unlocks. Desktop key hints sit on the buttons.

### Automatic (level-up cards, ranks I–III)

| Ability | Rank I | Per extra rank |
|---|---|---|
| Acid Footprints | Each foot landing leaves an acid puddle (r 60 m, 3 s) that burns ground units for 30 dps | +20% radius, +1 s |
| Spike Storm | Every 6 s, fire 6 homing spikes at distinct targets in range | +3 spikes, −1 s interval |
| Chitin Deflection | 15% chance an incoming shell/rocket/missile/blimp blast deals no damage (ping and sparks) | +15% (max 45%) |
| Feeding Frenzy | +6 HP per kill (buildings excluded) | +6 HP |
| Brood Swarm | Every 10 s, release 3 insect drones that hunt air targets for 8 s (contact damage 40) | +2 drones |
| Thrash | Tethers last 50% as long; each snap deals 40 damage to its truck | Tether duration 30% (II), 15% (III) |

### Level-up offers

- **Pool:** the 7 M1 stat upgrades plus the 6 abilities. An ability at rank III
  is no longer offered.
- **Guarantee:** each of the first three level-ups includes at least one ability.
- **Card label:** cards show the rank they would grant (e.g. "Acid Footprints II").

## 4. Architecture

### Enemy systems

A common interface replaces per-type wiring in `GameScene`:

```ts
interface EnemySystem {
  readonly kind: EnemyKind;
  spawn(ctx: SpawnContext): void;
  update(dt: number, ctx: WorldContext): void;
  targets(): readonly Target[];
  count(): number;
  clear(): void;
}
```

- **Migration:** `TankFleet` and `JetSquadron` are adapted to this interface.
- **New systems:** `Blimps`, `SamSilos` (owns its missiles as targetable entities),
  `Artillery`, `GrappleTrucks`, `OrbitalLaser`.
- **Context:** `WorldContext` carries the monster position and state, plus
  callbacks (`damageMonster`, `fireShell`, `fireRocket`, particles, shake, the
  tether registry).

### Pure modules (unit-tested)

| Module | Responsibility |
|---|---|
| `enemies/spawnTable.ts` | Per-kind unlock time, cost, cap, weight; `difficulty(t)` multipliers |
| `enemies/SpawnDirector.ts` | Generalized to the table: returns `EnemyKind[]` |
| `monster/tether.ts` | `clampToTethers(from, to, tethers)` → allowed position |
| `monster/leap.ts` | Arc position at time t, range clamp, landing time |
| `enemies/laserPhases.ts` | Orbital laser state machine and tracking step |
| `enemies/artilleryMath.ts` | Strike fill timing, hit test |
| `systems/abilities.ts` | Active ability cooldowns, unlock by level, aim state |
| `systems/Progression.ts` | Extended: ability ranks, max-rank exclusion, early-ability guarantee |

### Runtime modules

`systems/Passives.ts` (Spike Storm and Brood timers, deflection roll, frenzy
heal), `systems/AcidPools.ts`, `systems/BroodDrones.ts`, `systems/Chevrons.ts`.
`Monster` gains leap, roar and crouch poses.

### Damage to the monster

All damage to the monster goes through one function,
`GameScene.damageMonster(amount, source)`. It applies the difficulty damage
multiplier, rolls deflection for projectile sources, then applies HP loss, the
hit flash and death.

### UI

- `ui/AbilityButtons.tsx` (React, from an `abilities` event at 10 Hz).
- `ui/EdgeArrows.tsx` (from the `threats` event).
- A "TETHERED" HUD warning.
- `Input` gains an aim mode for Leap, plus keyboard Space and R.

### Performance

The draw-call budget stays under 150. New repeated meshes are instanced:
blimps, chevrons, acid pools, drones, and artillery circles.

## 5. Testing

- **Unit tests:** every pure module above (spawn table and difficulty, tether
  clamp, leap arc, laser phases, artillery timing and hit test, ability
  cooldowns and unlock, progression ranks and guarantees).
- **Scripted browser checks:** fast-forward the run clock and check that each
  enemy type spawns on schedule. Leap and Roar must work by button and key.
  Tethers block movement, and Leap snaps them. The laser damages only inside
  its column.
- **Look checks:** screenshots of each enemy, each telegraph, both abilities and
  the new HUD, at phone and desktop sizes.
- The existing 76 tests stay green.

## Open tuning (not blockers)

Exact HP, damage, cooldown and EXP numbers start as listed and are tuned in
playtests via `config.ts`.
