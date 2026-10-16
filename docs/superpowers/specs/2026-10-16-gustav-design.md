# AZRAGON — Schwerer Gustav (land battleship)

## Goal

A new heavy ground enemy from level 1: a gigantic tracked "land battleship" named after the Schwerer Gustav. It crawls along the roads toward the monster, flattening any building it rolls into, and fires an enormous shell straight at the monster on a slow reload. It is powerful and hard to destroy: an early centrepiece fight that can't be mistaken for the ordinary tanks.

## Owner decisions (from brainstorming, 2026-10-16)

- **Not a railway gun.** The real Schwerer Gustav was a WWII railway gun; the owner chose a fictional rolling version, a gigantic tracked tank that drives the roads.
- **Spawning:** a regular spawn from **level 1**, **at most 2 alive**.
- **Attack:** a **direct hit on a slow reload**, like the tanks' shells (always hits; stop it by destroying it).
- **Smoke trail:** each shell leaves a thick smoke trail, so the player can follow it back to the gun.
- **Architecture:** a new `GustavFleet` enemy system modelled on `TankFleet` (approach A). A big-tank variant inside `TankFleet` (B) was rejected because it would tangle two very different units.

## Behaviour

All values below are starting values in `CONFIG.gustav`.

- **Spawning:** `CONFIG.spawns.gustav = { unlockLevel: 1, cost: 6, cap: 2, weight: 1 }`. Like a tank, it appears on the road nearest a random point on the spawn ring (`CONFIG.director.spawnRing`).
- **Movement:**
  - It follows the road network toward the monster at `speed` 25 m/s (about half a tank's speed), re-planning its route every few seconds as the tanks do.
  - Its hull turns toward its next waypoint at `turnRate`, so the huge body visibly swings round corners.
- **Flattening:** each frame, every standing building within `crushRadius` of its centre takes `crushDps`, enough to bring an ordinary building down in about a second. Landmarks take the same damage and survive or fall by their own HP.
- **Range:** within `range` 1100 m of the monster it stops and turns its gun toward the monster at `aimRate`.
- **Firing:**
  - Once aimed, it fires one shell every `fireCooldown` 10 s. The first shot comes 3–6 s after it first stops.
  - The shell is the new `gustav` projectile, with the same flight as a tank shell but much bigger. Its arc peaks at `shellArc` and it flies for `shellFlightTime`.
  - It hits the monster for `damage` 60 × difficulty `dmgMult`, through the same `damageMonster` path as tank shells (source `'shell'`, so Chitin Deflection can deflect it).
  - Each shot has a large muzzle flash and smoke, a recoil, and screen shake.
- **Smoke trail:**
  - The `gustav` shell emits thick smoke particles every `trailEvery` s along its flight.
  - The trail lingers about 3 s, long enough to read back to the gun from wherever the shell came from.
- **Toughness:**
  - `hp` 600 × difficulty `hpMult` (a tank has 30). It flashes on hits.
  - Destroyed, it explodes in a large multi-burst blast. Standing buildings within `deathBlastRadius` take heavy damage, and it gives `exp` 60.
- **Hit size:** `radius` is about 0.45 × `size`, so the monster's melee and targeting reach it at its hull's edge.

## Playtest revision (2026-10-16)

After the first look, the owner asked for these changes. They replace the matching items above.
- **Width:** the hull is narrowed to `width` 42 m, just wider than a 36 m road. Its length stays `size` 160 m, and the turret ring is smaller to match.
- **Colour:** bronze (`gustav` 0xb08d57), with darker bronze trim and worn bronze weathering. The tracks and the hazard band are unchanged.
- **Buildings:** it no longer knocks buildings down. There is no flattening while driving and no building damage from its death blast. The `crush*` and `deathBlast*` settings are gone.
- **The shell:**
  - **Shape:** shaped like a real shell: a steel body, a copper driving band and a brass nose cone, drawn pointing along its flight, `shellLength` 44 × `shellDiameter` 12 m.
  - **Flight:** it flies in a straight line, with no arc, at `shellSpeed` 1400 m/s, so about 0.8 s to the monster.
- **Recoil:** each shot kicks the turret back by `recoil` × size, easing forward over `recoilTime` 0.7 s. A blowback dust cloud was tried, then removed at the owner's request.
- **Second round of changes:**
  - **Speed:** 40 m/s, up from 25.
  - **HP:** 450, down from 600.
  - **Chemtrail:** the shell lays a puff every `trailSpacing` 12 m along its path. The puffs are the pale `contrail` particle (1.8 s; 4 s at first, then shortened so the trail clears faster), on their own particle layer of 300 so they never crowd out other dust.

## Visuals

- **Size:** `size` 160 m nose to tail, about 3.3× a tank.
- **Model:** `src/enemies/gustavModel.ts`, built in code like the tank. Its parts:
  - **Hull and tracks:** a long armoured hull riding on four separate track units (two per side, front and rear), each with road wheels and fenders, and a sloped bow.
  - **Gun carriage:** a tall central structure echoing the real Gustav's box-girder superstructure, with ladders, a crew platform and side vents.
  - **The gun:** one enormous barrel (about 0.9 × `size` long, thick at the breech, tapering, with a muzzle ring) on a turret that turns, raised slightly.
  - **Details:** exhaust stacks and stowage on the rear deck.
- **Palette:** a new `gustav*` palette group: dark panzer grey hull, darker tracks and wheels, rust-brown weathering patches, a yellow-and-black hazard band on the gun mantlet, and gunmetal fittings. It is distinct from the olive tanks, the tan artillery and the grey Ospreys.
- **Rendering:** two vertex-coloured instanced meshes, the hull and the turret with its gun, as `TankFleet` draws tanks. The flash uses the instance colour.
- **Shell:** the `gustav` projectile is about 4× a tank shell's size, so it is visible mid-flight.

## Integration

- `EnemyKind` / `ENEMY_KINDS` and `TargetKind` gain `'gustav'`.
- `CONFIG.readability.threatKinds` gains `'gustav'`, so off-screen arrows point to it.
- `Projectiles` gains the `gustav` shot kind: its size, a smoke trail through `onTrail`, and on arrival the same damage path as `'shell'`.
- `WorldContext` gains `fireGustavShell(from, to, damage)`. `GameScene` implements it as it does `fireShell`, plus the bigger muzzle effects.
- `GameScene` registers `GustavFleet` with the `EnemyRegistry`.

## Testing

Vitest, colocated:
- **`gustavModel.test.ts`:**
  - The hull sits on the ground, about `size` long, and is vertex-coloured.
  - The muzzle point is at the gun's tip, above the hull.
- **`GustavFleet.test.ts`:**
  - **Spawning:** it spawns on a road point with difficulty-scaled HP; a third spawn is refused while two are alive.
  - **Movement:** it drives toward the monster at `speed`, stops inside `range`, and doesn't fire before it has stopped and aimed.
  - **Firing:** it fires on the `fireCooldown` rhythm with `damage` × `dmgMult`.
  - **Flattening:** it damages standing buildings within `crushRadius` while moving, but not ones outside.
  - **Death:** it pays `exp` on death; `clear()` empties the scene.
- **`Projectiles` tests:** a `gustav` shell emits trail points during its flight and damages like a shell on arrival.
- **Spawn table tests:** `gustav` opens at level 1 and is capped at 2.

## Out of scope

- Railways, and the real Gustav's rail-gun behaviour.
- Sound effects.
- A health bar or name tag (it may be added later if it doesn't read as a boss).
- Balance beyond the starting values: the owner will tune them after a playtest. Two Gustavs at 60 damage per shot from level 1 is a deliberate, large rise in early difficulty.
