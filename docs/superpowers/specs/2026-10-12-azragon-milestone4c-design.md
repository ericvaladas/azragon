# AZRAGON — Milestone 4c Design: The Magma Golem

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: milestones 4a and 4b (merged): monster architecture (`MonsterKind` / `MonsterBody`), title, select, the Reptile Kaiju, the Kraken

## Goal

Make the Magma Golem the fourth and last playable monster.

- **Role:** a slow, near-unbreakable tank. Its stone shell is cracked over a molten core, and it gets more dangerous the more it is hit.
- **Select screen:** it replaces the "Stone Golem — Coming soon" card. After this milestone every roster card is playable.

**Lessons carried over from the Kaiju and the Kraken:**

- **Attacking never interrupts the player's path.** The Golem never stops or turns to attack. Fist attacks fit into the walk.
- **Animation sells the creature.** Movement must read as a giant rock ape knuckle-walking through the city.
- **Visual style is the top priority.**

## Name

- The roster card is renamed from "Stone Golem" to **Magma Golem**.
- New blurb: *"A mountain with a furnace for a heart. Slow, crushing, and it only gets hotter."*

## Look

- **Shape:** a hunched knuckle-walker.
  - About as tall as the Kaiju at the shoulders, but much wider and heavier.
  - Massive shoulders and forearms end in boulder fists.
  - Short, thick legs.
  - A small head sinks between the shoulders, with glowing slit eyes.
- **Rock:** dark basalt plates, built from faceted chunky primitives with toon materials, matching the rest of the game.
- **Magma:**
  - Glowing orange seams run between the plates.
  - The bright molten core shows through a crack in the chest.
  - The seams', core's and eyes' glow is driven by **heat** (see Molten Core). At rest it pulses gently.
- **Vents:**
  - Two or three chimney vents on the back trail smoke and embers. Magma Lob, Ember Storm and Pyroclast fire from these.
  - Smaller vents on the shoulders fire Vent Burst and Vent Flak.
- **Palette:**
  - Basalt near-black and brown-grey.
  - Magma orange (about `#ff6a1a`).
  - Core yellow-white (about `#ffc23a`).

## Movement: the knuckle-walk

- **Gait:** a four-beat cycle: left fist, right foot, right fist, left foot.
  - The shoulders roll.
  - The body sways and pitches with each fist plant.
- **Plants are stomps:**
  - Every fist plant and footfall produces dust, a small shake and magma sparks.
  - It crushes buildings and ground enemies under it, through the existing foot-crush path with the Golem's foot radius and damage.
- **Speed and turning:**
  - The slowest of the four monsters.
  - It turns slowly toward its travel direction.
  - Attacks never stop or turn it.
- **Idle:** heavy breathing; the seams pulse with the core.

**Stats** (tunable in `CONFIG.golem`; first pass, tuned in playtest):

| | Insect | Kaiju | Kraken | Golem |
|---|---|---|---|---|
| Max HP | 1000 | 1250 | 1100 | 1450 |
| Damage multiplier | ×1.0 | ×1.15 | ×1.1 | ×1.2 |
| Move speed | 130 | 140 | 125 | 110 |
| Select pips (Toughness / Power / Speed) | 3 / 3 / 4 | 4 / 4 / 3 | 3 / 4 / 3 | 5 / 4 / 2 |

## Base kit

| Slot | Move | Behaviour |
|---|---|---|
| Auto melee | **Molten Fist** | The fists are also the Golem's front feet, so attacks fit into the walk:<br>• **Ahead:** a ground target within reach, in front, becomes the target of the next fist plant. That fist swings onto it as a heavy slam: splash damage to ground enemies and buildings around the impact, with a magma splash.<br>• **Side or rear:** for a ground target outside the front arc, the nearer arm makes a sweeping backhand. It hits every ground enemy and building in an arc on that side, within reach.<br>• **Standing still:** the nearer fist slams the target directly.<br>The walk never stops or turns for a strike. |
| Auto ranged | **Magma Lob** | A glowing magma bomb arcs from a back vent to the ranged target (range about 1400 m).<br>• Landing deals splash damage to ground enemies and buildings.<br>• It leaves a **lava pool** that burns ground enemies for a few seconds. This reuses the acid-pool system, recoloured.<br>• Ground targets only, like the Kraken's Hurl.<br>• The extra-projectile upgrade adds one more bomb per volley, from another vent. |
| Anti-air | **Vent Burst** | A magma geyser jets from a shoulder vent at a jet or blimp within reach. It uses the same anti-air timing and damage path as Tail Swat, Snap Bite and Tentacle Lash. |

## Signature upgrades

Each signature mirrors an existing mechanic and reuses its logic and numbers, recoloured to magma orange and ember. As with the Kraken, there is no Brood Swarm. Molten Core is the one new mechanic.

| Upgrade | Mechanic | Behaviour |
|---|---|---|
| **Lava Footprints** | acid | Every fist plant and footfall leaves a burning lava pool. |
| **Ember Storm** | storm | Every few seconds the back vents erupt in a volley of homing embers. |
| **Vent Flak** | spines | Shoulder vents spit magma flak that intercepts incoming shells and missiles within its radius. |
| **Vent Burst+** | swat | Faster, harder geysers that hit more flyers. |
| **Eruption** | nova | Both fists slam the ground and a ring of magma bursts outward, hitting everything around the Golem. |
| **Pyroclast** | mortar | Arcing magma bombs at artillery, SAMs and trucks. |
| **Basalt Skin** | chitin | A chance to deflect hits. |
| **Stoke the Fire** | frenzy | Heals on each kill. |
| **Molten Core** | new | See below. |

### Molten Core (new)

- **Heat** runs from 0 to 1:
  - Damage the Golem takes (after deflection and shields) raises it, in proportion to the damage.
  - It cools back toward 0 over a few seconds.
- **Bonus damage:** heat multiplies all of the Golem's damage, up to a per-rank maximum at full heat.
- **Burn aura:** above half heat, a burning aura damages ground enemies within a radius around the Golem every tick. The radius and damage per second rise with rank.
- **Visuals:**
  - The seams, core and eyes glow brighter with heat.
  - At full heat, embers stream off the body.
  - The body shows heat only while Molten Core is taken. Otherwise it keeps its normal pulse.
- **Ranks** raise the maximum damage bonus and the aura's radius.
- First-pass numbers live in `CONFIG.passives.core` and are tuned in playtest.

**Shared** (unchanged): Leap, Dash and Roar; Shield Bubble, Reflect Shield and Overload; and the generic stat upgrades.

**Generic stat upgrades** get Golem names:

| Upgrade | Golem name |
|---|---|
| damage | Molten Fury |
| attack speed | Open Vents |
| vitality | Bedrock |
| regen | Reforge |
| stomp radius | Tremor (bigger plant radius) |
| extra projectile | Twin Vents (+1 bomb) |
| move speed | Landslide |

## Shared actives, as the Golem

| Active | How the Golem does it |
|---|---|
| **Leap** | It crouches on its fists and launches, then lands fists-first in a magma-splashed crater. |
| **Dash** | A shoulder-down gallop on all fours. |
| **Roar** | It rears onto its legs and pounds its chest; the seams flare and every vent erupts. |

## Intro and select

- **Cocoon:** sized from the Golem's measured size by the existing `podLengthFor`.
- **Emergence:** it rises out of the crouch, pushing up on its fists.
- **Select diorama:**
  - The Golem idles, breathing heavily while its seams pulse.
  - It is a wide body, so the select camera framing (`frameHeight`) must be checked and tuned on phone and desktop.
- **Roster:** `golem` becomes playable as the Magma Golem. All four cards are playable.

## Architecture fit

This reuses the 4a/4b architecture.

**New code:**
- `src/monsters/golem/`:
  - `GolemBody` and `kind`.
  - Pure helpers, with tests:
    - the knuckle-walk gait: limb phases and plant events;
    - fist strikes: the choice between slam-on-next-plant, side backhand and standing slam, plus the backhand hit arc;
    - the Molten Core heat model.
- `CONFIG.golem`.

**Generalisations, kept minimal:**

| Need | Change |
|---|---|
| Fists that attack within the walk | A new melee shape, `{ kind: 'fist' }`. Like the Kraken's `arms`, the body exposes a small fist-strike hook (`MonsterBody.fists?`).<br>• `GameScene` asks it to strike at a target.<br>• The body schedules the strike into the gait.<br>• The strike's impact event tells `GameScene` where and how to apply damage: a point splash for a slam, a side arc for a backhand. |
| Magma Lob | A new ranged kind, `'lob'`. It reuses the mortar's arcing projectile and spawns a recoloured lava pool on landing (the acid-pool system). Bombs launch from the back vents (`launchOrigin`). |
| Vent Burst | A new anti-air kind, `'geyser'`, on the shared anti-air timing and damage path. |
| Molten Core | A new passive, `'core'`, in `Progression` and `Passives`.<br>• Damage taken feeds the heat state.<br>• Its bonus folds into the existing damage multiplier (`dmgMult`).<br>• A new `heat` value in `BodyFrame` drives the glow. |
| Golem effects | Golem `fx` colours. A magma/ember particle preset is added if the existing fire and spark presets don't read well. |

The Insect, Kaiju and Kraken behave exactly as before.

## Testing

**Unit tests (pure):**
- Knuckle-walk gait: the four-beat limb order, and each limb plants once per cycle.
- Fist strikes:
  - ahead → next plant;
  - side or rear → backhand on the nearer side;
  - standing → direct slam;
  - the backhand arc's hit test.
- Molten Core heat model:
  - heats in proportion to damage taken, and cools over time;
  - clamped to 0..1;
  - bonus and aura per rank;
  - no aura below half heat.
- `GOLEM`:
  - stats, kit and level-up pool;
  - no Brood, Meltdown or Sucker Grip;
  - Molten Core present.

**Scripted browser checks:**
- Select the Golem, play and walk. Screenshots of the select screen (phone and desktop), mid-walk and the intro cocoon.
- A tank ahead dies to a fist slam while the Golem keeps walking with its heading unchanged.
- A tank to the side dies to a backhand.
- Magma Lob kills a distant tank and leaves a lava pool.
- Vent Burst downs a jet.
- With Molten Core taken, being hit raises heat and the aura burns a nearby enemy.
- Vent Flak intercepts shells.
- Play Again and Change Monster leave no Golem state behind.
- No page errors; draw calls under 150.

**Regression:** all existing tests pass. The Insect, Kaiju and Kraken behave as before.

## Out of scope

Audio, balance beyond first-pass numbers (tuned in playtest), and any further monsters.
