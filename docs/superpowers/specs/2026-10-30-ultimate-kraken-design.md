# AZRAGON — The Kraken's ultimate (Q): Ink Storm

## Goal

The Kraken's ultimate, on the shared Q slot built for the Wendigo's Devour (`docs/superpowers/specs/2026-10-29-ultimate-wendigo-design.md`). A storm breaks over the city; the Kraken tears debris out of the ground with every tentacle, leaps high into the air, floods the ground below with ink that kills everything under it, and hurls the debris at the aircraft around it.

## Owner decisions (from brainstorming, 2026-10-30)

- **Look:** the sky turns dark and it starts raining; the Kraken grabs debris with every tentacle, jumps into the air, squirts ink clouds onto the ground beneath it.
- **The ink kills every enemy under it**, and **destroys the buildings under it**.
- **The debris is thrown at nearby aircraft, killing them.** Any chunk with no aircraft to hit is thrown down into the ink.
- **Name:** Ink Storm.
- **No lightning for now:** the storm is the dark sky and the rain; Devour's lightning is added later only if it needs more flair.

## Calls made in the design (the owner can overrule)

- **The shared slot and its rules, as Devour:** Q, its own button, 100 s cooldown on plain game time (`CONFIG.ultimate`, `startReady` true for now); slow motion and the camera pulling back; the Kraken cannot be hurt, cannot be controlled and cannot act until it ends; no enemies spawn; level-ups wait for its end; Q does nothing while snared, airborne, dashing, dead, outside `playing`, during the level-up moment, or while an ultimate runs.
- **The ink's reach:** a circle of 900 m radius (Devour's) centred where the Kraken jumped; an enemy is under it if its ground point is within the radius plus its own radius. Aircraft are not under the ink (it is on the ground).
- **"Nearby aircraft":** every live airborne enemy whose ground point is within the same 900 m, at any altitude. Eight chunks (one per tentacle): the nearest eight aircraft get one each; with more than eight, the rest are spared.
- **Kills:** ink kills are quiet (no explosion; the unit vanishes under the ink, as Devour's victims do); a chunk that hits an aircraft makes the normal explosion (a rock smashing a plane should look like it).
- **Bosses** (none exist yet): a boss under the ink, or hit by a chunk, takes the same heavy damage Devour gives (`bossDamage` × the damage multiplier) instead of dying.
- **The storm:** a dark slate sky (not Devour's red) and heavy rain that falls only while the ultimate runs.
- **The Kraken lands back where it jumped**, at the centre of the ink.

## The sequence

Real seconds (not slowed); all times are starting values in `CONFIG.kraken.ultimate`.

| t (s) | Beat |
|---|---|
| 0 | Q pressed. World time eases to slow motion; the camera starts pulling back (the Devour camera, keeping the player's angle). |
| 0 – 0.8 | **Storm:** the sky, fog and lights blend to the storm atmosphere. Rain fades in from 0.3 s. |
| 0.5 – 1.4 | **Grab:** all eight tentacles plunge into the ground around the Kraken and tear out a chunk of debris each, with dust and rubble bursting up. Each arm then holds its chunk. |
| 1.4 – 2.2 | **Leap:** the Kraken crouches and launches straight up, arms trailing with their chunks, to its peak (about 600 m) at about 2.2 s. |
| 2.2 – 3.0 | **Ink:** at the top it squirts ink down from its siphon in a spray of jets that land across the circle and billow into a spreading black cloud covering it. As the cloud reaches each enemy and building under it, that one is taken (enemies quietly, buildings collapse), nearest the centre first. |
| 2.4 – 3.0 | **Throw:** one after another, each tentacle hurls its chunk: at its aircraft (which is destroyed when the chunk reaches it), or, with no aircraft for it, down into the ink. |
| 3.0 – 3.8 | **Fall:** the Kraken drops back down and lands at the centre with a heavy impact (dust, shake). |
| 3.8 – 4.8 | **Outro:** the ink thins away, the rain stops, the sky clears, the camera returns, time eases back to normal. Control returns at the end. |

## Look

- **Storm atmosphere:** a blend (the same machinery as Devour's blood sky, keeping the city's sun direction) to a near-black slate-blue zenith, a dark grey-blue horizon, dark grey fog and dimmed cold light. Colours in `CONFIG.kraken.colors`.
- **Rain:** pooled, thin, slightly slanted streaks falling around the camera's view, many at once, in one draw call; fading in and out with the storm. Splashes are optional.
- **Debris chunks:** the Kraken's existing hurled-rubble look (`fireChunk` / `CONFIG.kraken.colors.chunk`), held at each tentacle tip from the grab until its throw.
- **Ink:** the Kraken's existing ink look (`InkFx`), scaled up: jets from the siphon down to many points across the circle, each bursting into billowing clouds that together cover it, darker and denser than its everyday ink, then thinning away in the outro.
- **The leap:** the Kraken's body launches straight up and falls back to the same spot; its arms trail below it holding their chunks.

## The shared slot: from one ultimate to several

Devour was wired into `GameScene` directly. This spec generalises it: each monster kind names its ultimate (`ultimate: { id, label }`), and `GameScene` runs whichever one the kind has through one interface (start, the time scale it asks for, update on real time, cancel, dispose), with the shared rules (slow motion, invulnerability, no spawning, level-ups waiting, Q's guards, the camera's input lock) applied once for every ultimate. Devour moves onto that interface unchanged in behaviour.

## Constraints

- No React for any of it; game classes only (the sequence its own class under `src/monsters/kraken/`, owned by `GameScene`).
- Every number in `CONFIG` (`CONFIG.kraken.ultimate`); colours in `CONFIG.kraken.colors`.
- Pooled, no per-frame allocation; about 10 extra draw calls at most (rain 1, plus the ink and chunks).
- Pause freezes it; restart, exit or death mid-sequence ends it cleanly (sky, camera, time scale, rain, ink, chunks, the Kraken back on the ground).
- The Wendigo's Devour keeps working exactly as before.

## Testing

- Unit tests for the pure parts: the timeline beats; who is under the ink (ground only, inside the radius); the aircraft each chunk goes to (nearest eight, none twice); boss damage instead of a kill.
- A sequence test (as Devour's) with a stub host: kills under the ink nearest first during the ink beat, chunks reaching their aircraft, leftover chunks into the ink, cancel restoring everything, the effect ending with time scale 1.
- A browser check of each beat.

## Left to the builder

- The tentacle grab and hold, the leap's height curve, the rain streak look, the ink jets' spread pattern, splash details.

## Out of scope

- The Insect's and the Kaiju's ultimates.
- Lightning in the storm (a later addition if wanted).
