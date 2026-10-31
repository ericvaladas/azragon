# AZRAGON — The Insect's ultimate (Q): Spike Rain

## Goal

The Insect Titan's ultimate, on the shared Q slot the other three use (Devour, Ink Storm, Plasma Lance). The sky turns purple and the fog closes in; the Insect rears up on its hind legs and flails its four front legs like arms, beating its chest, while its tail fires a volley of spikes high into the air. They arc over and rain down across a large area in front of it, and everything they land on is destroyed.

## Owner decisions (from brainstorming, 2026-10-30)

- **Build-up:** the sky turns purple; the fog increases.
- **The Insect stands up on its hind legs and flails its four arms as if beating its chest.** (It has six legs: the back pair holds it up, the front four are the arms.)
- **Its tail fires a volley of spikes into the air** while it does, arching over and raining down across a large area in front of it.
- **What it does:** units under the rain explode; buildings crumble.
- **Reach:** the rain starts a bit in front of the Insect and reaches about as far as the Kaiju's Plasma Lance (1,400 m).
- **Where it falls:** in front of the Insect, wherever it is facing when Q is pressed.

## Calls made in the design (the owner can overrule)

- **Name:** Spike Rain.
- **The shared slot and its rules, as the other three:** Q, its own button, the same cooldown (`CONFIG.ultimate`); slow motion; the Insect cannot be hurt, controlled or act until it ends; its automatic strikes hold off (`autoStrikes`); no enemies spawn; level-ups wait for its end; Q does nothing while snared, airborne, dashing, dead, outside `playing`, during the level-up moment, or while an ultimate runs.
- **The area:** a wedge in front of the Insect, 100° across (50° either side of its facing), from 250 m out to 1,400 m. Fixed where the Insect stands and faces when Q is pressed.
- **The spikes land scattered all over the area**, unevenly (not in lines or rings), over about two seconds, so destruction ripples across it rather than happening all at once. Enough spikes fall that nothing in the area is missed: every live enemy and standing building inside the area at the moment the rain reaches it is hit.
- **Kills are loud:** the normal explosion for units and the normal collapse for buildings. Bosses (none exist yet) take the shared heavy ultimate damage (`bossDamage` × the damage multiplier) instead of dying.
- **Aircraft:** helicopters and jets whose ground point is inside the area are hit too, by spikes on their way down.
- **Camera:** pulls back to show the whole area, keeping the player's angle (as Plasma Lance does), then returns.
- **Sky:** a purple atmosphere blend (the same machinery as the other three), with the fog drawn in much closer so the edges of the city fade into purple haze.

## The sequence

Real seconds (not slowed); the world runs in slow motion, as for the other ultimates. All times are starting values in `CONFIG.insect.ultimate` (a new `insect` block in `CONFIG`).

| t (s) | Beat |
|---|---|
| 0 | Q pressed. World time eases to slow motion; the camera starts pulling back. |
| 0 – 1.5 | **Sky and fog:** the sky, light and fog blend to purple; the fog closes in. **Rear:** the Insect rears up onto its hind legs, slowly (on real time, as Plasma Lance's roar is), front four legs lifting free. |
| 1.0 – 3.0 | **Chest-beating:** the four front legs flail and beat at its chest, alternating. **Volley:** the tail fires spikes up into the sky one after another, fast, from the stinger tip. |
| 2.0 – 4.0 | **Rain:** the spikes come down across the area, scattered, each landing with a small impact; whatever it lands on (or beside) is destroyed. |
| 4.0 – 5.5 | **Recover:** the Insect drops back onto all six legs; the fog lifts, the sky clears, the camera returns, time eases back to normal. Control returns at the end. |

## Look

- **Purple sky:** a deep violet zenith and a dusky purple horizon, with purple fog much denser than the city's own, and dim violet light.
- **Spikes:** the Insect's existing spike look (its projectile colour, `kind.fx.spike`), drawn by the ultimate itself on real time (the game's projectiles run on slowed world time), many at once in one draw call. Each rises from the stinger, arcs high and falls steeply onto its landing point.
- **Impacts:** each spike lands with dust and debris; a hit unit or building gets its usual explosion or collapse.
- **The rear-up and chest-beating:** the body pitches up so it stands on the back pair of legs; the front four legs swing in and out at its chest, alternating left and right; the tail arcs up over the body, aiming high.

## Constraints

- No React for any of it; game classes only (the sequence its own class under `src/monsters/insect/`, owned by `GameScene` and registered through the existing `Ultimate` interface).
- Every number in `CONFIG` (`CONFIG.insect.ultimate`); colours in `CONFIG.palette` beside the Insect's existing colours, or a new `CONFIG.insect.colors`.
- Pooled, no per-frame allocation in the sequence; about 4 extra draw calls at most.
- Pause freezes it; restart, exit or death mid-sequence ends it cleanly (sky, fog, camera, time scale, pose, spikes).
- Devour, Ink Storm, Plasma Lance and the Insect's normal Stinger Spikes keep working exactly as before.

## Testing

- Unit tests for the pure parts: the timeline beats; the area (who is inside it: range band, angle and own radius, from the Insect's facing); the landing points (all inside the area, scattered, covering it); when the rain reaches each target; boss damage instead of a kill.
- A sequence test (as the other three) with a stub host: everything in the area destroyed during the rain, nothing outside touched, aircraft over the area hit, bosses hurt, cancel restoring everything, the effect ending with time scale 1.
- A browser check of each beat.

## Left to the builder

- The rear-up and chest-beating poses in `InsectBody`, and how the tail aims high.
- The spike count, flight time and arc height; the scatter pattern; how a landing finds what it hits.
- The exact purple colours and the fog distances.

## Out of scope

- Changing the Insect's normal Stinger Spikes or its passives.
