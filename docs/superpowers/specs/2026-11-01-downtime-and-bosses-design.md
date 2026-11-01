# AZRAGON — Downtime and boss fights

## Why

A run starts at full intensity and never lets up. After a few minutes that gets tiring and then boring. This feature gives a run a rhythm: a stretch of fighting the army, a short break to breathe, a boss fight that's the high point of the cycle, another short breather, and then the army comes back. The first break also includes a one-time story beat: a meteor falls from the sky and gives the monster its ultimate.

## Goals

- A repeating cycle: **3 min of army → ~20 s of downtime → boss fight → 10 s of downtime → army again**.
- Downtime should feel like a real rest. The army **retreats and leaves the map**, nothing new spawns, and calmer music plays.
- The **first** break has a short **cutscene**. The camera pans up to the sky, a small sparkly alien-diamond **meteor** streaks down and crash-lands nearby, and the camera returns to the monster. **Walking onto the meteor grants the monster its ultimate.** The boss fight then begins.
- The boss is a **man-made giant mech**: something humans could believably build, and a fair opponent for the kaiju.
- Beating the boss gives **enough EXP for exactly one level-up**.

## Non-goals (for now)

- **Different bosses.** Every boss fight uses the same mech. New bosses come later.
- **Extra boss rewards** beyond the one level-up. To be decided later.
- **On-screen hints or text** about phases ("the army retreats…", "boss incoming"). There are none.
- **New music.** The calm track is `rest1`; the boss fight has `boss1`.

## Anti-goals (a failure even if it technically works)

- The break isn't actually restful: stray shots keep landing, or units hang around attacking.
- The mech feels unfair: attacks that can't be read or dodged, or so much HP that the fight drags on.
- The mech feels like a re-skinned tank: no melee, no presence, or it never pursues the monster.
- The player gets stuck: the first break never ends because the meteor can't be found or reached.
- The cutscene feels long or takes control away for too long.

## The cycle

The run gets a new **phase** inside the `playing` state. The `GameState` values stay as they are. Pause, level-up and dying keep working on top of every phase.

| Phase | Lasts | What happens |
|---|---|---|
| `army` | 3 min (`CONFIG.cycle.armyTime` 180 s) | Today's game: the spawn director runs and enemies pursue. |
| `retreat` | `CONFIG.cycle.breakTime` ≈ 20 s | No spawns. Every live unit retreats and leaves. Music crossfades to `rest1`. On the first cycle only: the meteor cutscene, then the meteor waits to be picked up. |
| `boss` | until the mech dies | The mech spawns and fights. No regular spawns. Music crossfades to `boss1`. |
| `recover` | `CONFIG.cycle.recoverTime` 10 s | No spawns. Music is `rest1`. |
| → `army` | | The 3-minute clock starts again from zero. |

- **The 3-minute clock only counts `army` time.** It doesn't run during the other phases, while paused, or in the level-up cards. The first break comes 3 min into a run.
- **Difficulty carries over.** It keeps following the player's level as it does now. When the army returns it resumes at the current strength, not reset. The spawn director's budget does **not** build up during the other phases, so no flood arrives when the army returns. This is the same rule ultimates already follow (`enemies.update(..., spawning=false)`).
- **Buildings still give EXP** in every phase, so smashing the city during a break or the boss fight is a valid way to level up.
- **The first break's ending:** the boss comes only once the meteor has been picked up. If the player hasn't picked it up within `CONFIG.meteor.graceTime` (≈ 25 s after it lands), the boss comes anyway and the meteor stays where it is until collected. **[Builder's call, open to change]** This keeps the run from stalling.
- **The opening tank wave** (`CONFIG.opening`) and the **runaway tank waves** (`CONFIG.runaway`) only fire in the `army` phase.
- **Ultimates during non-army phases** work as usual. Spawning is already suppressed in those phases.
- **Death in any phase** is the normal game over. A restart resets the cycle, re-locks the ultimate, and removes the meteor and the mech.

### Retreat

When `army` ends, every live enemy switches to a **retreat** mode:

- **It stops attacking.** It fires nothing new and starts no new attack runs, laser charges or net drops. Projectiles already in flight still land. **[Owner left open; builder's call]**
- **It leaves.** Ground units drive away from the monster (along roads where they use roads). Aircraft and blimps turn away and fly out. Each one is removed quietly once it's beyond its exit distance (about the fog's far edge, `CONFIG.fog.far`) **or** after `CONFIG.cycle.retreatTimeout` seconds, so the field is clear by the time the boss arrives.
- **Fixed emplacements** (SAM silos, artillery, the orbital laser) can't drive away. They go quiet, then pack up: they sink into the ground or fade out over a second or two. **[Builder's call]**
- **Retreating units can still be killed** and give their normal EXP. They don't fight back. **[Builder's call, chosen as more fun than making them untouchable]**
- This is a new method on `EnemySystem`, e.g. `retreat(ctx)`, implemented by every system in `ENEMY_KINDS`, and possibly a per-unit `retreating` flag that each system's update respects.

### Music

There are no new tracks. The plan in `src/audio/musicPlan.ts` changes:

- **`main1` loops** during `army`.
- **`boss1` loops** during `boss`.
- **`rest1` is the calm track** for `retreat` and `recover`.
- Phase changes crossfade between the two, using the fade machinery `Music.ts` already has.
- The intro and menu behaviour is unchanged.

## The meteor (first break only)

### Cutscene

It starts a few seconds into the first `retreat` phase (`CONFIG.meteor.cutsceneDelay`, ≈ 3 s), so the retreat has visibly begun first.

1. The camera eases up from the monster's normal follow view to look at the sky above the city. This is a blend of the camera rig's pose, not a cut.
2. The meteor appears high up as a bright sparkling streak with a glowing trail, and falls at a slant toward a point **in the near distance**: on open ground about `CONFIG.meteor.landDistance` (≈ 900–1300 m) from the monster, inside fog range so it's visible. Use `ctx.openGround` for the spot so it lands somewhere reachable and not on water or inside a landmark.
3. Impact: a flash, a dust and shard burst, a shockwave ring, screen shake, and any buildings right at the impact point are flattened.
4. The camera eases back to the monster's follow view.

- The whole cutscene takes about 5–7 s (`CONFIG.meteor.cutscene*` timings). The player can't control the monster during it, and world time keeps running. Nothing can attack the monster then anyway, because everything is retreating.
- The camera rig already has a cinematic pull (`pullK`/`pullTo`), and the ultimates already take over the camera. The cutscene should take control in the same way: the player can't drag or zoom while it runs.

### Look

- A **small** crystal, about a building's footprint (≈ 80–120 m across), that reads as a sparkling alien diamond rather than a rock. It's faceted with sharp angles, possibly a cluster of a few crystal spikes, built in code from faceted, vertex-coloured parts in the usual way.
- Its colour is an alien cyan-violet that doesn't clash with any monster's palette. New `CONFIG.palette` entries are `meteor`, `meteorGlow` and so on.
- On the ground it sits in a small crater, rotates or bobs slightly, pulses a glow, and gives off occasional sparkle particles, so it reads as "go here" without on-screen text.
- An edge arrow or chevron points to it while it's off screen. The game already has `EdgeArrows`/`Chevrons`, and an arrow isn't a text hint.

### Pickup

- It's picked up when the monster's body comes within `CONFIG.meteor.pickupRadius` of it. Landing a Leap on it also counts.
- Pickup is a short burst of light and particles into the monster plus the level-up aura (`LevelUpAura`). The meteor disappears.
- **This unlocks the ultimate.** Its button appears and it is **ready at once**, so the player can use it against the mech. **[Builder's call]**
- The boss fight starts a few seconds after pickup (`CONFIG.meteor.bossDelay` ≈ 3 s).

### The ultimate is locked until then

- Today every monster has its ultimate from the start (`abilities.setRank('ultimate', 1)`, `CONFIG.ultimate.startReady: true`). After this change a run starts with the ultimate **locked** (rank 0, no button). The meteor grants it (rank 1, ready).
- Once unlocked, it stays unlocked for the rest of the run and recharges on its normal `CONFIG.ultimate.cooldown`.
- A debug or config switch (e.g. `CONFIG.ultimate.startUnlocked`) can keep it unlocked from the start for testing ultimates.

## The boss: the mech

### Look

- It's believably human-built military hardware: a giant bipedal **combat mech** in the military olive and gunmetal family, with yellow-and-black hazard stripes (`gustavHazard` exists already), panel lines, rivets and warning lights. It should look like it belongs to the same army as the tanks and the Gustav.
- **It's about as tall as the monster** (the monster is ~550 m × `MONSTER_SCALE`), so it reads as an even match: heavy reverse-jointed or straight legs, a thick armoured torso, a small cockpit-like head with a glowing visor slit, **shoulder missile pods** and **two big arms built for punching** (heavy fists or hammer forearms).
- It's built in code as one model file (`mechModel.ts`) from faceted, vertex-coloured parts. Unlike the units, it needs **separately posed parts** (legs, torso, arms) so it can walk and swing. These could be separate meshes in a small hierarchy rather than one instanced geometry, since there's only ever one mech. New palette entries are `mech`, `mechDark`, `mechMetal` and so on.
- **Arrival:** it **walks in** from beyond the fog. It's too large to be air-dropped (owner's decision). It starts out of sight, around the fog's far edge, and its heavy footfalls (shake and dust) announce it before it comes into view and strides toward the monster.

### Behaviour

It's a melee brawler that pursues the monster, with ranged attacks as backup.

- **Walking:** it strides toward the monster at a steady pace, about a tank's speed or a bit more. Each footfall gives a small screen shake and dust. It knocks down buildings it walks into, which helps it feel huge, though this is tunable.
- **Melee (its main attack):** within punch range it uses a **telegraphed** strike. There's a visible wind-up (the arm pulls back, the visor flares, maybe a warning light), then the swing. A Leap or Dash during the wind-up avoids it. My suggestion is two moves:
  - **a punch:** a short wind-up and moderate damage, in front of it,
  - **a ground slam:** a longer wind-up and heavier damage in a radius, with a shockwave ring.
  - **[Builder's call]**
- **Dash (gap closer):** if the monster is more than `CONFIG.mech.dashTrigger` away (it ran off to farm buildings, say), the mech crouches briefly as a tell, then **dashes** toward the monster at high speed, flattening buildings along the way, and stops short of it. It's on a cooldown so it can't chain-dash.
- **Regular missiles:** every few seconds, between other moves, it fires a small volley of missiles **like the jets' rockets** at the monster (`ctx.fireRocket`). These are the ordinary chip damage.
- **Occasional missile barrage:** less often (`CONFIG.mech.barrageCooldown`, every 15–20 s or so), the shoulder pods launch a larger arcing salvo that comes down on **marked** ground spots around and on the monster, like the artillery's markers. Moving out of them avoids it.
- **Damage taken:** it takes damage from all the monster's attacks (melee, breath and ranged, leap landings, dash crush, ultimates, passives) through the normal `Target` path. It flashes on hits.
- **Fairness target:** a level-appropriate monster that fights it head-on and dodges reasonably should beat it in roughly **60–90 s**. HP and damage scale with `ctx.difficulty` like other enemies. Starting values go in `CONFIG.mech` and get tuned in playtesting.

### Health bar

- A boss health bar is shown along the top of the HUD for the whole fight. It drains smoothly, follows the theme, and uses an icon or the mech's silhouette, not a text label. **[Builder's call]** This is game feedback, not an on-screen hint.

### Defeat

- It staggers: sparks, small explosions across its body, and the visor flickering out. It then collapses in a large multi-burst explosion with heavy shake, and the wreck sinks or burns out after a while.
- **The reward:** EXP equal to exactly what's needed for the next level (`expToNext(level) − exp`), so the player levels up once, with the usual level-up moment and cards.
- The `recover` phase starts when it dies.

## Architecture notes

- The cycle is a **pure, testable state machine** (e.g. `src/systems/cycle.ts`). It takes the elapsed time and events (meteor collected, boss dead, restart) and returns the phase and transitions. `GameScene` drives it and reacts to transitions: it toggles spawning, orders the retreat, starts the cutscene, spawns the boss and changes the music.
- The mech is its own system (e.g. `src/enemies/Mech.ts` + `mechModel.ts` + `mechMath.ts`). It can be an `EnemySystem` in the registry (kind `'mech'`, with no spawn table entry and spawned only by the cycle) so targeting, damage and kills work for free.
- The meteor is its own small class (e.g. `src/systems/Meteor.ts`) with the cutscene's camera blend in a pure helper.
- New HUD data (the boss health bar) goes through `GameEventMap`, e.g. a `boss` event carrying `{ hp, max }`, or `null` when there's no boss. It's throttled like `hud`.
- All tuning goes in `CONFIG.cycle`, `CONFIG.meteor` and `CONFIG.mech`.
- **The 3-minute clock is separate.** It's a new army-only clock. `runTime` stays as total time, because the HUD timer, game-over and analytics `timeSec`, the opening wave and the runaway gate all read it.
- **Ultimates against the mech:** the mech's `Target` sets `boss: true`, so the four ultimates deal it `bossDamage` through `hurtBoss` instead of killing it outright. That path already exists.
- **The mech's kill pays only the level-up EXP,** not a normal `exp` value on top.
- **The mech's height** matches the standard monster height (550 × `MONSTER_SCALE`), not the current monster's, so it's the same mech whichever monster is chosen.
- **Every break lasts the same:** about 20 s in `retreat` and 10 s in `recover`. Only the first break has the meteor.

## Left to the builder

Exact timings, HP, damage, speeds and ranges; the mech's exact silhouette and move set within the brief above; the meteor's exact shape and particles; how each enemy kind animates its retreat; and the order the work is split into.

## Owner revision (2026-11-01): a quadruped mech

The owner asked for a quadruped mech in the spirit of a spider-tank concept they shared, as a style reference only, not a copy. This replaces the humanoid look and the fist-based moves above. Its size, HP, timings, damage, tuning, the health bar and the dodge rules are unchanged.

- **Body:**
  - four long, splayed legs, each with an armoured hip, an upper segment, and a long tapered blade-like lower leg ending in a spike foot;
  - a compact hull slung between the hips;
  - a turret on top with a sensor head and a red eye or visor;
  - a tall box missile launcher on one side of the turret with rows of glowing tube caps (the barrage);
  - twin long-barrel cannons on the other side, aimed forward (the rockets);
  - antennas and glowing coolant canisters under the hull.
  
  It stands about the monster's height but is wider.
- **Colours:** white and gunmetal-black armour with cyan-blue glows, replacing the olive. It is still man-made, but cleaner and more high-tech than the army.
- **Walk:** diagonal legs step in pairs and the hull stays level with a slight bob. Footfalls still shake the camera and crush buildings.
- **Punch → front-leg stab:** it rears one front leg back, then spikes it forward, with the same wind-up, reach and dodge timing.
- **Slam → rear-up stomp:** it lifts both front legs high and crashes them down, with a shockwave ring all round.
- **Dash:** it crouches low on all four legs, then lunges.
- **Death:** the legs buckle outward, and the hull drops and explodes.
