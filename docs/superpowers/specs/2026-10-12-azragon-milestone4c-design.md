# AZRAGON — Milestone 4c Design: The Wendigo (internally `golem`)

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: milestones 4a and 4b (merged): monster architecture (`MonsterKind` / `MonsterBody`), title, select, the Reptile Kaiju, the Kraken

> **Revised 2026-10-13:** the fourth monster began as the Magma Golem. It is now the **Wendigo**, a folklore horror of black magic, death and decay. Every mechanic and number is unchanged except where noted. The back tendrils are gone; Shadow Hands replaces them. Magma Lob and Pyroclast became gazes (Dread Gaze, Evil Eye): nothing is lobbed and nothing travels. The code keeps the id `golem` and the config block `CONFIG.golem`.

## Goal

Make the Wendigo the fourth and last playable monster.

- **Role:** a slow, near-unbreakable tank that gets more dangerous the more it is hurt.
- **Select screen:** it replaces the "Coming soon" card. After this milestone every roster card is playable.

**Lessons carried over from the Kaiju and the Kraken:**

- **Attacking never interrupts the player's path.** It never stops or turns to attack; claw strikes fit into the walk.
- **Animation sells the creature.**
- **Visual style is the top priority.** Its powers read as dark magic, death and decay: scary, not silly, and **nothing that looks like a beam or laser**.

## Name

- **Wendigo.** Blurb: *"A starved thing from the deep woods. Every kill only makes it hungrier."*

## Look

- **Body:** gaunt and hunched, stalking on very long, sinewy arms with bony clawed hands; tight olive-grey skin over the ribs and knuckled spine; digitigrade hind legs on cloven hooves.
- **Mane:** a ragged black mane of matted fur over the withers, neck, shoulders and chest.
- **Head:** a weathered deer skull with empty black sockets, carried low on a long neck, under a small gnarled rack hung with moss. The skull is its own mesh on a neck pivot so Dread Gaze can turn it.
- **No glow.** Its magic shows in the world around it: black fire, shadow, rot.
- **Effect palette** (`CONFIG.golem.colors`): black fire (near-black tongues, deep violet heart), black-violet shade smoke, rotting black-green, dark blood mist, bone white, pale ghost grey.

## Movement: the knuckle-walk

- **Gait:** a four-beat knuckle-walk: left hand, right foot, right hand, left foot.
  - The shoulders roll.
  - The body sways and pitches with each hand plant.
- **Plants are stomps:**
  - Every hand plant and footfall produces dust, dark shade smoke, crumbs of rot and a small shake.
  - It crushes buildings and ground enemies under it, through the existing foot-crush path with its own foot radius and damage.
- **Speed and turning:**
  - The slowest of the four monsters.
  - It turns slowly toward its travel direction.
  - Attacks never stop or turn it.
- **Idle:** slow, heavy breathing.

**Stats** (tunable in `CONFIG.golem`; first pass, tuned in playtest):

| | Insect | Kaiju | Kraken | Wendigo |
|---|---|---|---|---|
| Max HP | 1000 | 1250 | 1100 | 1450 |
| Damage multiplier | ×1.0 | ×1.15 | ×1.1 | ×1.2 |
| Move speed | 130 | 140 | 125 | 110 |
| Select pips (Toughness / Power / Speed) | 3 / 3 / 4 | 4 / 4 / 3 | 3 / 4 / 3 | 5 / 4 / 2 |

## Base kit

| Slot | Move | Behaviour |
|---|---|---|
| Auto melee | **Rending Claws** | The hands are also its front feet, so strikes fit into the walk:<br>• **Ahead:** a heavy slam onto the target: splash damage to ground enemies and buildings around it.<br>• **Side or rear:** a sweeping backhand that hits everything in an arc on that side, within reach.<br>• **Standing still:** the nearer hand slams the target directly.<br>Impacts throw dark blood mist and clots of rot. The walk never stops or turns for a strike. |
| Auto ranged | **Dread Gaze** | "It looks at you, and you burn with black fire." Ranged kind `'gaze'`; the old lob's range (about 1400 m), cooldown, ground-only targeting and damage.<br>• The skull turns to stare at the target (clamped yaw and pitch; the body's path and heading never change), then eases back.<br>• After a short beat (0.35 s) the target bursts into **black fire**: flickering near-black and deep violet flame tongues with smoke rising, hugging it.<br>• At the old lob's flight time (1.4 s) the fire flares: splash damage to ground enemies and buildings near the target, flames leaping onto them, and a lingering **patch of black fire** that burns ground enemies (the acid-pool system, recoloured).<br>• Nothing travels between the Wendigo and the target: no projectile, beam, line or streak.<br>• Twin Curse (+1) adds one more victim per volley. |
| Anti-air | **Shadow Hands** | Anti-air kind `'hands'`, on the shared anti-air timing and damage path (Tail Swat, Snap Bite, Tentacle Lash). See below. |

### Shadow Hands

For each flyer in reach (Shadow Hands+ grabs more at once, faster and harder, with Tail Swat+'s numbers):

- **Rise:** a roiling pool of shadow opens on the ground beyond the flyer, away from the Wendigo, set back by part of its altitude so the arm leans in. A long, near-black, jointed arm (seven tapering bones with knobbed joints and a smoky translucent shell) bursts out and lunges up, trembling and bowed at the elbow, arriving exactly on the shared impact time.
- **Grab:** long bony fingers, fanned wide during the lunge, snap shut around the flyer as the damage lands. The Wendigo lifts a claw toward it, beckoning.
- **Drag:** the fist crushes, then yanks the wreck down into the pool, folding the arm; a jet is dragged into the ground and explodes there.
- **Dissolve:** the arm sinks and breaks up into smoke; the pool closes. A flyer that survives is let go.
- **Implementation:** `src/monsters/golem/ShadowHands.ts`, with pure timeline, placement and arm-curve helpers in `handMath.ts`. Three instanced meshes (bones, smoke shell, pools): at most three draw calls, pooled.

## Signature upgrades

Each signature mirrors an existing mechanic and reuses its logic and numbers. As with the Kraken, there is no Brood Swarm. Ravenous Hunger is the one new mechanic.

| Upgrade | Mechanic | Behaviour |
|---|---|---|
| **Blighted Tracks** | acid | Every hand plant and footfall leaves a patch of black fire. |
| **Hungry Ghosts** | storm | Pale grey-white wisps rise off the body and home in, trailing short dark smoky tails. Soft, small and drifting: no streaks. |
| **Bone Ward** | spines | Bone-white shards fly from its back to the shells and missiles it stops. |
| **Shadow Hands+** | swat | More hands, faster and harder. |
| **Withering Ring** | nova | Both hands slam the ground and a broad, ragged band of black rot rolls outward, with dark smoke and rot thrown along it. |
| **Evil Eye** | mortar | A glance sets artillery, SAMs and trucks alight with black fire, as Dread Gaze does; it flares at the glob's flight time with the mortar's splash and numbers. Nothing is lobbed. |
| **Gaunt Hide** | chitin | A chance to deflect hits. |
| **Insatiable** | frenzy | Heals on each kill. |
| **Ravenous Hunger** | new (`'core'`) | See below. |

### Ravenous Hunger (new)

- **Hunger (heat)** runs from 0 to 1: damage taken raises it in proportion; it fades back over a few seconds.
- **Bonus damage:** hunger multiplies all of its damage, up to a per-rank maximum.
- **Withering aura:** above half, it withers ground enemies within a radius every tick; radius and damage rise with rank.
- **Visuals:** a dark miasma of smoke gathers about the body, thickening with hunger, with blood mist when starved. While the aura is on, a ragged patch of dead, blackened ground with a dark rim follows it, rot creeping along the rim.
- Numbers live in `CONFIG.passives.core`.

**Shared** (unchanged): Leap, Dash and Roar; Shield Bubble, Reflect Shield and Overload; and the generic stat upgrades.

**Generic stat upgrades** get Wendigo names:

| Upgrade | Wendigo name |
|---|---|
| damage | Bloodlust |
| attack speed | Frenzy |
| vitality | Undying |
| regen | Feast |
| stomp radius | Tremor (bigger plant radius) |
| extra projectile | Twin Curse (+1 gaze victim) |
| move speed | Stalker's Pace |

## Shared actives, as the Wendigo

| Active | How the Wendigo does it |
|---|---|
| **Leap** | It crouches on its hands and launches, then lands in a burst of rot and shade. |
| **Dash** | A low gallop on all fours. |
| **Roar** | It rears up, clawing at the sky; black miasma bursts off its back, and a ring of shadow and a band of rot roll out. Its Roar shockwave is shadow-coloured. |

## Intro and select

- **Cocoon:** sized from its measured size by the existing `podLengthFor`.
- **Emergence:** it rises out of the crouch, pushing up on its hands.
- **Select diorama:**
  - It idles, breathing heavily.
  - It is a wide body, so the select camera framing (`frameHeight`) must be checked and tuned on phone and desktop.
- **Roster:** `golem` becomes playable as the Wendigo. All four cards are playable.

## Architecture fit

This reuses the 4a/4b architecture.

**New code:**
- `src/monsters/golem/`:
  - `GolemBody` and `kind`.
  - Pure helpers, with tests:
    - the knuckle-walk gait: limb phases and plant events;
    - fist strikes: the choice between slam-on-next-plant, side backhand and standing slam, plus the backhand hit arc;
    - the Ravenous Hunger heat model;
    - the Shadow Hands timeline, placement and arm curve (`handMath`);
    - the Dread Gaze timeline (`gaze`).
- `CONFIG.golem`.

**Generalisations, kept minimal:**

| Need | Change |
|---|---|
| Fists that attack within the walk | A new melee shape, `{ kind: 'fist' }`. Like the Kraken's `arms`, the body exposes a small fist-strike hook (`MonsterBody.fists?`).<br>• `GameScene` asks it to strike at a target.<br>• The body schedules the strike into the gait.<br>• The strike's impact event tells `GameScene` where and how to apply damage: a point splash for a slam, a side arc for a backhand. |
| Dread Gaze / Evil Eye | A new ranged kind, `'gaze'`; `fx.mortarGaze` turns the mortar into the same gaze. `GameScene` keeps a list of cursed targets: black fire hugs each until it flares (damage, splash, fire patch via the acid-pool system). The skull looks via `BodyFrame.lookAt`. |
| Shadow Hands | A new anti-air kind, `'hands'`, on the shared anti-air timing and damage path; `ShadowHands` draws one hand per flyer hit. |
| Ravenous Hunger | A new passive, `'core'`, in `Progression` and `Passives`; its bonus folds into `dmgMult`. `WitherAura` draws the aura. |
| Wendigo effects | `fx` colours and options (`stormShot: 'wisp'`, `shards`, `poolLift`, `mortarGaze`). New particle presets `rot`, `shade`, `mist`, `bone`, `wisp`, `wraith`, `hexfire` and `hexember` (flame tongues drawn upright), and a dense `murk` layer for dark smoke. Cosmetic `wisp` and `shard` shots. `RotRing` draws the Withering Ring and Roar ground wave. |

The Insect, Kaiju and Kraken behave exactly as before.

## Testing

**Unit tests (pure):**
- Knuckle-walk gait: the four-beat limb order, and each limb plants once per cycle.
- Claw strikes (`fist`):
  - ahead → next plant;
  - side or rear → backhand on the nearer side;
  - standing → direct slam;
  - the backhand arc's hit test.
- Ravenous Hunger heat model:
  - heats in proportion to damage taken, and cools over time;
  - clamped to 0..1;
  - bonus and aura per rank;
  - no aura below half heat.
- `GOLEM`:
  - stats, kit and level-up pool;
  - no Brood, Meltdown or Sucker Grip;
  - Ravenous Hunger present; no player-facing text mentions magma, lava, vents, embers or any fire but black fire.

**Scripted browser checks:**
- Select the Wendigo, play and walk. Screenshots of the select screen (phone and desktop), mid-walk and the intro cocoon.
- A tank ahead dies to a claw slam while it keeps walking with its heading unchanged.
- A tank to the side dies to a backhand.
- Dread Gaze burns a distant tank and leaves a patch of black fire; the skull turns to it.
- Shadow Hands grabs a jet and drags it down; the jet dies.
- With Ravenous Hunger taken, being hit raises hunger and the aura withers a nearby enemy.
- Bone Ward intercepts shells.
- Play Again and Change Monster leave no Wendigo state (hands, gazes, aura, ring) behind.
- No page errors; draw calls under 150.

**Regression:** all existing tests pass. The Insect, Kaiju and Kraken behave as before.

## Out of scope

Audio, balance beyond first-pass numbers (tuned in playtest), and any further monsters.
