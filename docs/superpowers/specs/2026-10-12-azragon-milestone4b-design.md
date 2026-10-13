# AZRAGON — Milestone 4b Design: The Kraken

Date: 2026-10-12
Status: Approved in conversation; pending written-spec review
Builds on: milestone 4a (merged): monster architecture (`MonsterKind` / `MonsterBody`), title, select, the Reptile Kaiju

## Goal

Make the Kraken the third playable monster.

- **Role:** a 360° many-armed brawler that hauls itself through the city on its tentacles.
- **Select screen:** it replaces the Kraken "Coming soon" card.

**Lessons carried over from the Kaiju:**

- **Attacking never interrupts the player's path.** Tentacles strike independently. The body never turns or stops to attack.
- **Animation sells the creature.** Movement must read as a giant octopus pulling itself along.

## Look

- **Mantle:** a large bulbous mantle carried low over the street, sitting just above building-top height at its lowest. It is deep crimson-purple with darker mottled spots.
- **Eyes:** two big glowing amber eyes at the front, with a slit pupil.
- **Tentacles:** eight long tentacles, each a tapering chain of faceted segments.
  - The top is the mantle colour; the underside is pale (suggested by a lighter stripe of segments).
  - Tips are thin.
- **Style:** toon materials, matching the rest of the game.

## Movement: the tentacle crawl

- **Arm roles:** the eight arms share a rolling crawl cycle.
  - At any moment 2–3 front/side arms are **pulling**. They reach ahead, plant their tips on the ground, and drag back as the mantle surges forward.
  - The rest are **free**. They trail and writhe and are available to strike.
- **Plants are footfalls:**
  - Each plant produces dust and a small shake.
  - It crushes buildings and ground enemies under the tip, using the existing foot-crush path with the Kraken's foot radius and damage.
- **Mantle motion:**
  - The mantle surges and bobs with each pull, tilting slightly into the direction of travel.
  - When idle, it breathes, and the free arms curl.
- **Heading:**
  - The body turns to face its travel direction at a moderate rate.
  - Facing does not matter for attacks, which come from every side.
- **Stats** (tunable in `CONFIG.kraken`; Insect / Kaiju shown for reference):

| | Insect | Kaiju | Kraken |
|---|---|---|---|
| Max HP | 1000 | 1250 | 1100 |
| Damage multiplier | ×1.0 | ×1.15 | ×1.1 |
| Move speed | 130 | 140 | 125 |
| Select pips (Toughness / Power / Speed) | 3 / 3 / 4 | 4 / 4 / 3 | 3 / 4 / 3 |

## Base kit

| Slot | Move | Behaviour |
|---|---|---|
| Auto melee | **Tentacle Slam** (360°) | Every **free** tentacle independently picks a ground target within reach (about 450 m), on any side. A pulling tentacle never strikes. The arm rears up, then slams its tip down on the target. On impact it damages ground enemies and buildings in a small radius around the tip. Each tentacle has its own cooldown, so several slams can land at once on different targets. Damage scales with how many targets are around and how many arms are free. |
| Auto ranged | **Hurl** | A free tentacle tears up a chunk of rubble or wreckage beside the Kraken, whips it overhead and throws it in a high arc at the ranged target. On landing it deals splash damage to ground enemies and buildings, with debris and dust. It is heavy and lobbed, distinct from the Insect's homing spikes and the Kaiju's line beam. Range is about 1400 m. The extra-projectile upgrade adds one more chunk per throw, from another free arm. |
| Anti-air | **Tentacle Lash** | Uses the same anti-air timing and damage path as Tail Swat and Snap Bite. One tentacle whips straight up at a jet or blimp within reach. |

## Signature upgrades

Each signature mirrors an existing mechanic and reuses its logic and numbers, recoloured to the Kraken's ink (dark violet-black) and amber. Sucker Grip is the one new mechanic.

| Upgrade | Mechanic | Behaviour |
|---|---|---|
| **Ink Trail** | acid | Planted tentacles leave corrosive ink slicks. |
| **Barrage** | storm | Every few seconds, all free tentacles hurl debris at once, homing on the nearest enemies. |
| **Ink Cloud** | spines | Shoots down incoming shells and missiles within its radius, shown as dark ink puffs where they are caught. Taken and ranked like any upgrade. |
| **Lash+** | swat | Faster anti-air lashes that hit more flyers. |
| **Whirlpool** | nova | A pulse where all tentacles spin outward together, hitting everything around the Kraken. |
| **Deep Throw** | mortar | Lobbed chunks at artillery, SAMs and trucks. |
| **Thick Hide** | chitin | Chance to deflect hits. |
| **Devour** | frenzy | Heals on each kill. |
| **Sucker Grip** | new | When a pulling tentacle plants, it also grabs and crushes the nearest ground enemy within a short radius of the tip. Ranks raise the radius and damage. |

**Shared** (unchanged): Leap, Dash and Roar; Shield Bubble, Reflect Shield and Overload; and the generic stat upgrades.

**Generic stat upgrades** get Kraken names:

| Upgrade | Kraken name |
|---|---|
| damage | Crushing Coils |
| attack speed | Frenzied Arms |
| vitality | Leviathan Bulk |
| regen | Regrowth |
| stomp radius | Wide Grip (larger slam radius) |
| extra projectile | More Arms (+1 hurled chunk) |
| move speed | Undertow |

## Shared actives, as the Kraken

| Active | How the Kraken does it |
|---|---|
| **Leap** | The arms coil and launch the mantle, which lands arms-first in a splat. |
| **Dash** | The arms pull in a rapid surge. |
| **Roar** | The mantle rears up, the arms spread, and the eyes flare. |

## Intro and select

- **Cocoon:** sized from the Kraken's measured size by the existing `podLengthFor`.
- **Emergence:** the arms unfurl from the crouch pose.
- **Select diorama:** the Kraken idles with writhing arms. The select camera already frames by height and aspect; the Kraken is wide and low, so the camera framing must be checked and tuned.
- **Roster:** `kraken` becomes playable. The Stone Golem stays "Coming soon".

## Architecture fit

This reuses the 4a architecture.

**New code:**
- `src/monsters/kraken/` with `KrakenBody`, `kind`, pure crawl-gait and tentacle-strike helpers, and their tests.
- `CONFIG.kraken`.

**Generalisations, kept minimal:**

| Need | Change |
|---|---|
| Per-tentacle strikes | Tentacle Slam is a new melee shape, `{ kind: 'multi' }`. Arm selection, per-arm cooldowns and the strike timeline live in the Kraken's body/kind module. They are exposed through a small hook, so `GameScene` asks the body which arms are free and starts arm strikes; it resolves damage on each strike's impact event. |
| Free-arm launch points | Hurl, Barrage and Deep Throw launch from a free tentacle tip (`launchOrigin`), using the existing per-call cycling pattern. |
| Kraken effects | A new particle kind, `'ink'`, and Kraken `fx` colours. |

The Insect and Kaiju behave exactly as before.

## Testing

**Unit tests (pure):**
- Crawl gait: each arm's role over a cycle; 2–3 arms pulling at any time; plant events once per pull per arm.
- Tentacle target assignment: free arms only; one target per arm; nearest within reach; respects per-arm cooldowns.
- The hurl arc.
- `KRAKEN` stats, kit and pool: no Brood, no Meltdown, Sucker Grip present.
- Sucker Grip selection.

**Scripted browser checks:**
- Select the Kraken, play and crawl.
- Tanks placed on several sides die to simultaneous slams without the Kraken turning or stopping.
- A hurl kills a distant target.
- A lash downs a jet.
- Ink Cloud intercepts shells.
- Screenshots of the select screen, a mid-crawl pose and the intro cocoon.
- No page errors; draw calls under 150.

**Regression:** all existing tests pass, and the Insect and Kaiju are unchanged.

## Out of scope

The Stone Golem (4c), audio, and balance beyond first-pass numbers (tuned in playtest).
