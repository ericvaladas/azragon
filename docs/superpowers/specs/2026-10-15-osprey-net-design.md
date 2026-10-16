# AZRAGON — Osprey Net squads

## Goal

A new enemy for the mid-early game: a squad of four V-22 Ospreys carrying a giant net between them, which they drop onto the monster to snare it. The net does no damage. While the monster is snared, the rest of the army gets free hits.

The squad has to read at a glance as something other than a tank or artillery piece: large aircraft in formation with a net strung between them. The player answers it with anti-air and ranged attacks during a short, visible window.

## Owner decisions (from brainstorming, 2026-10-15)

- Unlocks at **level 7** (the slot left free by the 2026-10-15 rebalance). **One squad at a time.**
- **Four Ospreys**, one per corner of the net, in a square formation.
- **The net always lands unless the squad is shot down.** The monster cannot dodge it by walking away: the squad tracks the monster right up to release.
- **One Osprey shot down:** the other three carry on and the drop still snares. The lost corner sags.
- **Two or more shot down:** the drop aborts. The net falls harmlessly to the ground and the survivors peel off.
- **Snared = heavy slow:** about 30% walk speed, no leap or dash. Every attack still works.
- **Breaking free:** the snare lasts about 6 s, and each attack the monster makes tears it about 1 s sooner.
- **No HUD element.** The net draped on the monster is the only sign the monster is snared. The leap and dash buttons use the greyed-out look they already have when unavailable.
- **Architecture:** a new `OspreyNets` enemy system plus a small reusable snare module owned by `GameScene` (approach A). The other approaches were rejected: a general status-effect framework (B) is more than this needs, and reusing `Helicopters` (C) doesn't fit the formation or the shared net.

## Squad behaviour

Each squad runs through these phases in order. The phase durations and distances below are starting values, kept in `CONFIG.osprey`.

1. **Approach.** The squad spawns `spawnDist` (2600 m) from the monster on a random bearing. It flies toward the monster's current position at `cruiseSpeed` (220 m/s) and `cruiseAltitude` (650 m), in a tight square (`tightHalf`, 45 m from the centre to each Osprey). The rotor pods point forward (plane mode). The phase ends when the squad's centre is within `arriveDist` (150 m) of the monster horizontally.
2. **Position** (`positionTime`, 4 s). The pods swivel up to helicopter mode. The formation widens to `netHalf`, sized to the current monster (`bodyRadius × 1.8`). The squad descends to the drop altitude: the current monster's standing height (`kind.stats.size.height`) plus `dropClearance` (160 m; was 120 m before the cloth revision). Throughout this phase the squad's centre follows the monster, at up to `trackSpeed` (400 m/s). This is the window in which the Ospreys are low enough for anti-air attacks to reach them and can be targeted with ranged attacks.
3. **Release.** At the end of positioning:
   - **3 or 4 Ospreys alive:** the net drops and snares the monster (see *The net*).
   - **2 or fewer alive:** the drop aborts. This check also runs the moment the second Osprey is destroyed during the approach or positioning, so an abort can happen before release time.
4. **Leave.** The survivors turn straight away from the monster (or keep their heading if they are right over it), climb back to `cruiseAltitude` and fly out at `cruiseSpeed`, pods tilting forward again. They despawn `exitDist` (2600 m) from the monster. A squad never makes a second pass.

During the leave phase the Ospreys are still targets. Killing them still pays EXP.

**Osprey stats** (starting values): `hp` 100 each (the same as a helicopter), scaled by difficulty like every enemy. `exp` 15 each. `hitRadius` 80 m. Ospreys never fire weapons.

**Spawning:** `CONFIG.spawns.osprey = { unlockLevel: 7, cost: 8, cap: 1, weight: 2 }`. `count()` returns 1 while a squad exists (any phase), so the cap of 1 holds back a new squad until the current one has left the map.

## The net

- **While carried:** dark rope lines in a grid strung between the corner Ospreys' positions, sagging in the middle. If a corner's Osprey is gone, that corner hangs down below the others.
- **On release:** the net falls over `dropTime` (0.6 s) from the squad onto the monster, spreading as it falls. When it lands, the snare starts, the screen shakes briefly (`shake` 0.4) and dust bursts out at the monster's feet.
- **Snared:** the net becomes a draped dome over the monster, sized from its `bodyRadius`, `size.width` and `size.height`, and follows the monster's position. It stays until the snare ends.
- **Tearing free:** when the snare ends, the dome is removed and shreds burst outward, using the existing particle presets.
- **Aborted drop:** the net falls to the ground below the squad's centre, lies flat for `groundLife` (4 s), then fades out over the last second. It has no effect on the monster.
- **Monster mid-leap at release:** the net falls toward the leap's landing point, and the snare starts when the monster lands.

## Net physics (revision, 2026-10-15)

After the first playtest, the owner asked for a realistic fall. Two changes followed:
- **Flying in spread:** the squad now spawns already spread to the net's width and carries the net open the whole way in.
- **The net is cloth:** it is simulated (`src/enemies/cloth.ts`), not blended to a fixed dome.

How the cloth works:
- **Structure:** the 9×9 grid of points is joined by ropes to its row, column and diagonal neighbours. Verlet integration runs in 1/60 s substeps, with 8 rope passes per substep. The settings are in `CONFIG.osprey.cloth`.
- **Carried:** the corners are pinned `cable` m under their Ospreys, and the ropes are 15% longer than the span so the net sags. A lost Osprey's corner simply drops. A carried net does not touch the monster; `dropClearance` is raised to 160 m so it hangs clear.
- **Released onto the monster:**
  - The free net is pulled back over the monster (or over a leap's landing point) as it falls.
  - The snare starts the moment the net touches the monster, or the ground if it misses.
  - While snared, rope resting on the monster above `catchFrac` × its height catches and moves with it; the rest hangs.
- **Torn free, death, a newer net, or an aborted drop:** the net is released, falls to the ground through the monster, and fades out over `groundLife`.
- **What the net lands on:** the monster's top surface is a height map (`src/systems/heightfield.ts`), built by raycasting straight down over the monster's meshes in its own frame. It is built once per run, when the first squad spawns. This replaces the hand-placed spheres considered during design: it fits all four monsters with no tuning. It doesn't follow limb animation.

## The snare (`src/systems/snare.ts`)

A small state object with no Three.js dependency, owned by `GameScene`:

- `start(duration)`: snares for `duration`. If a snare is already active, it resets the remaining time to `duration`. Snares never stack.
- `update(dt)`: counts down. When the time runs out, the snare ends and `update` reports the end, so the net's tear-free burst can play.
- `onAttack()`: takes `perAttack` (1 s) off the remaining time, but never so far that the snare would end sooner than `minDuration` (2 s) after it started.
- `speedMult`: `CONFIG.snare.speedMult` (0.3) while active, 1 otherwise.
- `blocksMobility`: true while active (no leap, no dash).
- `clear()`: ends the snare silently, with no tear-free burst.

`CONFIG.snare = { duration: 6, perAttack: 1, minDuration: 2, speedMult: 0.3 }`.

**What counts as an attack** for `onAttack()`: player-driven monster attacks, counted when each attack starts or fires:
- **Counted:** melee strikes (including the kraken's and wendigo's variants), each ranged shot or breath fire, anti-air strikes (bite, tail, lash, hands), tail sweeps, and Roar (the only active ability usable while snared, since Leap and Dash are blocked).
- **Not counted:** passive auto-damage such as Nova, Mortar, Grip and auras.

## Integration

- `EnemyKind` gains `'osprey'`, and it joins `ENEMY_KINDS`.
- `WorldContext` gains `snareMonster(duration: number): void`. `GameScene` implements it by starting the snare, or, if the monster is airborne, by queueing the snare to start when the monster lands.
- `WorldContext.monster` also exposes, read-only, what the squad needs to size itself: `bodyRadius`, `width` and `height` (standing size), and while leaping, the landing point (`leapTo`).
- In `GameScene`:
  - Walking uses `moveSpeedMult × snare.speedMult`.
  - Leap and dash refuse to start while `snare.blocksMobility`. Their buttons use the existing unavailable look.
  - Each counted attack calls `snare.onAttack()`.
  - The snare clears on monster death, run restart and return to the menu.
- `OspreyNets` owns the Osprey meshes and the net meshes, and draws the snared dome from the monster's position while the snare is active. `GameScene` tells it when the snare ends, through a method like `netTornFree()`, so it can play the burst and remove the dome.
- The off-screen threat arrows include Ospreys like the other enemy kinds.

## Visuals

- **Osprey** (`src/enemies/ospreyModel.ts`, built in code like the tank and jet):
  - **Fuselage and tail:** a boxy fuselage with a high straight wing and a twin-fin tail.
  - **Details:** dark cockpit windows and a rear cargo ramp.
  - **Rotors:** an engine pod at each wingtip, each carrying a three-blade rotor. The pod and rotor are separate parts, so the pod can swivel between forward (0°) and up (90°).
  - **Colour:** a light navy grey, with darker trim and gunmetal rotors. This keeps them distinct from the olive tanks and helicopters and the tan artillery.
- **Rendering:** one group per Osprey, as for the napalm bombers, with its own material for the hit flash. Rotors spin; a blurred disc shows at speed, as on the helicopters.
- **Net:** a line grid (8×8 cells) in hemp-tan rope (`netRope`), light enough to read over the monsters' dark hides, rebuilt each frame from its corner positions and sag. It is one mesh per squad, plus one for the snared dome.

## Testing

Vitest, colocated:

- **`ospreyMath.test.ts`:**
  - The phase sequence and timings.
  - Formation offsets: a square, tight on approach, widening to `netHalf` while positioning.
  - Drop altitude from the monster's height.
  - Survivors decide the outcome: 4 or 3 alive release, 2 or fewer abort, including an abort as soon as the second Osprey dies.
  - A release while the monster is mid-leap targets the leap's landing point.
- **`snare.test.ts`:**
  - It lasts `duration`.
  - `onAttack` shortens it by `perAttack`, never below `minDuration` from the start.
  - A second `start` resets the time rather than stacking.
  - `speedMult` and `blocksMobility` are set only while active.
  - `update` reports the end once; `clear` ends it silently.
- **`ospreyModel.test.ts`:** the geometry has vertex colours and sensible bounds, and a pod's swivel angle moves its rotor from in front of the pod to above it.
- **`spawnTable` and `SpawnDirector` tests:** `osprey` opens at level 7 and is capped at one squad.
- **In the browser:** the owner checks the look and feel.

## Out of scope

- Sound effects (the game has none yet).
- Any HUD element for the snare.
- Osprey weapons, or Ospreys carrying anything other than the net.
- Making the snare reusable by other enemies now. The module is generic, but only the Ospreys use it in this milestone.
