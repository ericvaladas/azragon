# AZRAGON — Ultimate ability (Q), starting with the Wendigo's

## Goal

Every monster gets an **ultimate**: one ability on the **Q** key, on a long cooldown, that looks epic and devastating. It is the panic button for the late game, when the army is overwhelming, and the trump card in a future 1-vs-1 boss fight. This spec builds the shared ultimate slot and the **Wendigo's** ultimate; the other monsters' ultimates come later, one spec each, on the same slot.

## Owner decisions (from brainstorming, 2026-10-29)

- **Key and cadence:** activated with **Q**, on a **long timed cooldown**, like a Q ultimate in other games (the owner cited Overwatch).
- **When it matters:** late game against an overwhelming army; later, a boss fight.
- **Look (the owner's picture):** the sky turns dark red, lightning strikes around, a black circle fades in on the ground, shadowy demonic creatures emerge from the ground, grasp every enemy and pull them down into the darkness.
- **Scope:** only enemies **inside the circle** are taken. **Aircraft** over the circle are grabbed too. **Buildings** inside the circle are destroyed.
- **Bosses** (none exist yet) caught in the circle take **heavy damage** instead of being dragged down.
- **Pacing:** the world goes into **slow motion** and the **camera pulls back** for the sequence.
- **Name:** the Wendigo's ultimate is **Devour**.
- **Cooldown:** **100 s**. In the finished game it **starts on its full cooldown** (the first Devour is ready 100 s into a run). **Until the ability is finalized it starts ready**, for easy debugging: a `CONFIG.ultimate.startReady` flag, `true` for now, flipped to `false` to finish.

## Calls made in the design (the owner can overrule)

- **Owned from the start of every run**, no level-up pick needed.
- **Neither Haste When Hurt nor Attack Speed speeds up the cooldown** (`CONFIG.ultimate.cooldown`): it runs on plain game time so the ultimate stays rare.
- **Circle radius 900 m** (Roar covers 600 m), measured horizontally from the monster's position at the moment Q is pressed. The circle does not follow the monster.
- **The monster is invulnerable** from the press until the sequence ends (it cannot be hit while the player watches a cinematic in slow motion). It cannot move, attack, leap or dash during it.
- **Lightning is visual only.** All the damage belongs to the circle, so what it does stays readable.
- Q does nothing (no cooldown spent) while snared, airborne (mid-leap), dashing, dead, outside `playing`, or during the level-up moment (the slow-motion beat before the cards).
- The press **blocks the level-up moment** for its duration: EXP earned from the ultimate's kills is banked and the level-up starts after the sequence ends.

## The sequence (Wendigo)

Timeline in **real seconds** (not slowed), so its length does not stretch with the slow motion. All times are starting values in `CONFIG.wendigo.ultimate`.

| t (s) | Beat |
|---|---|
| 0 | Q pressed. World time eases to `timeScale` 0.25 over 0.2 s. The camera starts pulling back (see Camera). The Wendigo rears into its howl pose (the existing Roar pose, `howlPose`), held for the whole sequence. |
| 0 – 0.6 | **Blood sky:** sky zenith and horizon, fog colour and the two lights blend from the city's atmosphere to the blood atmosphere (below). |
| 0.3 – 3.8 | **Lightning:** a bolt every 0.15–0.35 s at a random point within 1.3 × the circle radius (some inside, some just outside). Each: a jagged bolt from high in the sky to the ground, a white-red flash on the scene light for 0.08 s, a small screen shake, dust and ember particles, and a scorch decal that fades over 2 s. |
| 0.5 – 1.3 | **Black circle** fades in on the ground: near-black, with a ragged, slowly turning rim and a faint deep-red inner glow. It is drawn over roads, the crater decal and pools (polygon offset). |
| 1.2 – 1.9 | **Figures emerge:** one figure under each enemy inside the circle (ground or air), rising out of the black. Figures for aircraft rise taller and reach up. If more enemies than figures (cap below), the nearest enemies get figures; the rest are taken with a burst of shadow at 2.6 s (they still die). |
| 1.9 – 2.4 | **Grasp:** each figure closes its claws on its victim. The victim stops moving (held in place) and flashes. |
| 2.4 – 3.4 | **Drag down:** figures sink back into the circle pulling their victims with them; victims are killed (see Damage) as they go under, with shadow smoke and dark mist. **Buildings** inside the circle collapse over this second, staggered by distance from the centre (nearest first). |
| 3.4 – 4.4 | The circle drains away, the sky and lights blend back to the city's atmosphere, the camera returns, world time eases back to 1 over the last 0.4 s. |
| 4.4 | Sequence over: the monster can act again; any banked level-up starts. |

## Damage and scope

- **Who is inside:** every live enemy target whose horizontal distance from the circle centre is ≤ `radius` + the target's own radius, at the grasp beat (1.9 s), airborne or not, at any altitude.
- **Enemies:** killed outright (the same `applyDamage(1e9)` used by Roar on flyers). They give their normal EXP.
- **Bosses:** none exist yet. The design must leave a clear hook: a target marked as a boss takes `bossDamage` (starting 2000 × the monster's damage multiplier) instead of dying, and is not held or dragged (its figure grasps and sinks alone). Until bosses exist the hook is untested by gameplay but covered by a unit test.
- **Buildings:** every standing building inside the radius is destroyed (full damage) during the drag-down beat, giving its normal EXP.
- **Enemies entering the circle after the grasp beat** are not taken.
- **The monster** takes no damage during the sequence.

## Look

### Blood atmosphere
- A fixed atmosphere, blended to and from with the existing `Atmosphere` / `applyAtmosphere` machinery: sky zenith near-black red (e.g. `0x2a0306`), horizon deep blood red (`0x8a0e10`), fog a dark red, the hemisphere and sun lights dimmed and tinted red. Colours go in `CONFIG.wendigo.colors` (palette rule).
- The blend must restore the city's own atmosphere exactly afterwards (including after a pause, a restart or a death mid-sequence).

### Lightning
- Bolts are pooled line or thin-quad geometry (no per-bolt allocation), jagged with 6–10 segments and one or two short forks, drawn bright (white core, red edge) and visible for ~0.12 s each, then fading.
- At most ~4 bolts visible at once.

### Black circle
- One mesh, scaled to the radius, fading via opacity; the same treatment as the old withering aura (ragged rim, slow turn) but near-black with a deep-red glow toward the rim.

### Demonic figures
- Built in code like every other model (`*Model.ts`, faceted parts, vertex colours), drawn as `InstancedMesh`es, pooled. **Distinct from the Shadow Hands:** whole hunched, emaciated humanoid silhouettes (head, horned or antlered, torso, two long arms with claws), black with a faint violet-red rim and a smoky shell, and glowing eye points.
- A figure rises from below the ground plane, reaches for its victim, closes its claws on it, then sinks, carrying it. Figure size scales a little with the victim (tank vs. blimp).
- **Cap:** at most `maxFigures` (starting 24) at once, so draw calls stay low (a few `InstancedMesh`es for all figures).
- **Dragging the victim:** the victim should visibly go down with the figure. The enemy systems own their meshes, so the builder chooses how: either an enemy-system hook that holds a unit at a point and lowers it, or the victim is killed at the grasp and a dark husk of its shape (or its silhouette) sinks in the figure's claws. The player must see something pulled under the ground, not just a unit vanishing.

### Camera
- Pulls back and up over 0.8 s (ease-in-out) to a framing that shows the whole circle: distance about `cameraDistance` (starting 2.2 × the default distance, beyond the player's normal max zoom) and a steeper pitch. It holds, then returns over 0.8 s to the player's own orbit (yaw, pitch and zoom as they were before Q).
- Player drag and zoom are ignored during the sequence.

### Audio
- None in this spec (the game has music only). Leave room for a future sound cue.

## The ultimate slot (shared by every monster)

- A fifth active ability, `ultimate`, alongside Leap, Dash, Roar and Shield Bubble in `Abilities`: owned from the start, cooldown from `CONFIG.ultimate.cooldown`, its own button and key. At the start of each run (and on restart) its cooldown is 0 when `CONFIG.ultimate.startReady` is true, else the full cooldown.
- **Key:** `KeyQ` → `ultimate` in `abilityKey`.
- **Button:** its own round button, **larger** than the others and **set apart** from the row (it is the one to notice), labelled with the ultimate's name (the Wendigo's: "Devour"), key hint "Q", the same countdown sweep, and a glow in the accent colour when ready. Phone layout: it must fit beside the existing row inside 360 px wide.
- **Per monster:** the monster kind names its ultimate (`ultimate: { id, label }` or similar on `MonsterKind`). A monster without one yet has no button and Q does nothing; only the Wendigo has one after this spec.
- The ultimate's cooldown ticks on plain game time (not `cdDt`).

## Constraints

- No React state, effects or hooks for any of it: the sequence is a game-side class (e.g. `WendigoUltimate`) owned by `GameScene`; React shows only the button.
- Everything numeric in `CONFIG` (`CONFIG.ultimate` for the slot, `CONFIG.wendigo.ultimate` for this sequence).
- Performance: the whole effect adds no more than ~10 draw calls at its peak and allocates nothing per frame.
- The slow motion uses the game's existing time scale path (the level-up moment's), and the two must not fight: the ultimate's slow motion wins while it runs.
- Pausing mid-sequence freezes it; resuming continues it. Restart, exit to title or death mid-sequence ends it cleanly (sky, camera, time scale, figures, circle all restored or cleared).

## Testing

- Unit tests (Vitest) for the pure parts: the timeline (which beat at a given real time), who is inside the circle (ground, air, boss, outside), the atmosphere blend (endpoints exact), Q's guards (snared, airborne, cooling down), and the cooldown ignoring the Haste rate.
- Visual check in the dev server (`npm run dev`) on the Wendigo late in a run with a crowded field.

## Left to the builder

- Exact figure geometry and animation curves, bolt shapes, circle shader details, how victims are visibly dragged (see Figures), the ultimate button's exact styling within the UI guidelines.

## Out of scope

- The other three monsters' ultimates (each its own spec, same slot).
- Bosses themselves (only the damage hook).
- Sound.
