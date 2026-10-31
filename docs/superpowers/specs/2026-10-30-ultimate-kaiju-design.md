# AZRAGON — The Kaiju's ultimate (Q): Plasma Lance

## Goal

The Kaiju's ultimate, on the shared Q slot that Devour (`2026-10-29-ultimate-wendigo-design.md`) and Ink Storm (`2026-10-30-ultimate-kraken-design.md`) already use. The sky turns cyan and gravity seems to let go: small debris drifts up off the ground while the Kaiju's plates and vents blaze brighter and brighter. It rears back, plants its feet, and unleashes a huge beam from its mouth that sweeps across everything in front of it, from its right to its left. Everything the beam crosses is destroyed.

## Owner decisions (from brainstorming, 2026-10-30)

- **Build-up:** the sky turns cyan; small debris slowly starts levitating, as if gravity were reversed; the Kaiju's spikes (its back plates) and vents glow brighter.
- **The Kaiju rears back and plants its feet** before it fires.
- **The attack:** a powerful beam from its mouth, sweeping from the Kaiju's right to its left.
- **It sweeps across the front, wherever the Kaiju is facing** when Q is pressed. It does not clear a full circle, unlike Devour and Ink Storm.
- **Longer range than Devour** (Devour's circle is 900 m).
- **What it does:** buildings explode and crumble, ground units explode, aircraft are cut down.
- **The beam vaporizes the floating debris** as it sweeps through it.

## Calls made in the design (the owner can overrule)

- **Name:** Plasma Lance (the Kaiju's normal ranged attack is Plasma Breath).
- **The shared slot and its rules, as the other two:** Q, its own button, the same cooldown (`CONFIG.ultimate`); slow motion; the Kaiju cannot be hurt, controlled or act until it ends; no enemies spawn; level-ups wait for its end; Q does nothing while snared, airborne, dashing, dead, outside `playing`, during the level-up moment, or while an ultimate runs.
- **Reach:** 1,400 m from the Kaiju, over a 120° wedge centred on its facing (60° either side). It starts at the Kaiju's right edge (−X side, see CLAUDE.md: +X is the model's left) and ends at its left edge.
- **Who it hits:** every live enemy and standing building whose ground point is inside the wedge (within the range plus its own radius), at the moment the sweeping beam's bearing passes over it. Aircraft are hit at any altitude, so the beam reads as a blade carving across the whole sector. Destruction follows the beam across the screen rather than happening all at once.
- **Nothing blocks the beam:** it passes through buildings and units to its full range; the wedge's apex, facing and range are fixed where the Kaiju stands when Q is pressed.
- **Slow motion:** the same world time scale as Ink Storm (0.25), with the Kaiju's own beats (glow, rear, beam, sweep) on real time as the other two do.
- **Kills are loud:** the normal explosion for units, the normal destruction for buildings (unlike Devour and Ink Storm's quiet takes). Bosses (none exist yet) take the shared heavy ultimate damage (`bossDamage` × the damage multiplier) instead of dying.
- **Debris:** small pieces scattered over the ground across the wedge and a little beyond it, rising slowly from the start of the build-up. Each piece inside the wedge is vaporized (a flash and sparks) as the beam passes its bearing. Pieces outside the wedge drift back down at the end.
- **Camera:** pulls back and up behind the Kaiju, keeping its facing, so the whole wedge is in view, then returns to the player's view at the end (the shared pull used by the other two).
- **While firing:** the beam lights the scene and keeps the camera shaking gently.
- **Sky:** a cyan atmosphere blend (the same machinery as Devour's blood sky and Ink Storm's storm), bright rather than dark. Colours in `CONFIG.kaiju.colors`.

## The sequence

Real seconds (not slowed); the world runs in slow motion. All times are starting values in `CONFIG.kaiju.ultimate`.

| t (s) | Beat |
|---|---|
| 0 | Q pressed. World time eases to slow motion; the camera starts pulling back behind the Kaiju. |
| 0 – 0.8 | **Sky:** the sky, fog and lights blend to cyan. |
| 0.3 – 2.0 | **Lift:** the debris starts rising off the ground, slowly at first, drifting and tumbling. **Glow:** the plates and vents brighten steadily to a blaze. |
| 1.5 – 2.0 | **Rear:** the Kaiju rears back, chest and head lifting and tilting back, and plants its feet wide. It stays planted until the end. |
| 2.0 | **Fire:** it snaps forward and the beam erupts from its mouth at its right edge, angled down into the ground near the far end of its range. |
| 2.0 – 4.5 | **Sweep:** the head and neck turn steadily to its left, carrying the beam across the wedge. Wherever it passes: buildings explode and crumble, units explode, aircraft are cut down, floating debris is vaporized, and a glowing scar is carved into the ground. |
| 4.5 – 6.0 | **Recover:** the beam cuts out; the Kaiju settles back to standing; leftover debris drifts down; the glow fades; the sky clears; the camera returns; time eases back to normal. Control returns at the end. |

## Look

- **Cyan sky:** a bright cyan zenith and pale cyan horizon and fog, with cool light. It should read as unnatural and charged, not as a clear day.
- **Debris:** small rubble pieces in the city's rubble colours, one instanced draw. They rise a few tens of metres while slowly tumbling, scattered unevenly.
- **Glow:** the existing plate and vent glow (`KaijuBody`: the plates' emissive already follows the breath charge, and the vents flare), driven up past anything the normal attacks reach.
- **The beam:** much thicker and brighter than Plasma Breath, in the Kaiju's plasma cyan with a white core, from the jaws to the ground near the far end of the range. It flickers and pulses while it fires.
- **Scar:** a glowing line burned into the ground along the swept path, fading during the recovery.
- **Vaporizing:** each debris piece the beam touches vanishes in a flash and a few sparks.

## Constraints

- No React for any of it; game classes only (the sequence its own class under `src/monsters/kaiju/`, owned by `GameScene` and registered as one of its ultimates through the existing `Ultimate` interface).
- Every number in `CONFIG` (`CONFIG.kaiju.ultimate`); colours in `CONFIG.kaiju.colors`.
- Pooled, no per-frame allocation in the sequence; about 6 extra draw calls at most (debris, beam, scar, plus particles from the existing systems).
- Pause freezes it; restart, exit or death mid-sequence ends it cleanly (sky, camera, time scale, glow, pose, debris, beam, scar).
- Devour and Ink Storm keep working exactly as before.
- The Kaiju's normal Plasma Breath is unchanged.

## Testing

- Unit tests for the pure parts: the timeline beats; the wedge (who is inside it: range, angle and own radius, measured from the Kaiju's facing, right edge first); when the sweep reaches each bearing; boss damage instead of a kill.
- A sequence test (as the other two) with a stub host: targets destroyed in sweep order, each as the beam passes it; nothing outside the wedge touched; aircraft hit at altitude; debris inside the wedge vaporized and outside it set down; cancel restoring everything; the effect ending with time scale 1.
- A browser check of each beat.

## Left to the builder

- The rear-back pose and how the neck carries the sweep (the neck already turns for Plasma Breath, within ±1.6 rad).
- The beam's exact geometry, flicker and lighting; the scar's look; the debris count, scatter, heights and tumble.
- Particle choices for explosions, vaporizing and the beam's impact on the ground.
- How a large target's own size widens the bearing at which the beam catches it.

## Out of scope

- The Insect's ultimate.
- Changing Plasma Breath or any other existing Kaiju attack.
