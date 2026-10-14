# AZRAGON — Music: event-driven soundtrack and skip-to-reveal

## Goal

Music in the game is driven by game events. The calm Intro track plays across the menus and the cutscene. The fight music comes in on the moment the monster's silhouette appears through the smoke. That moment is the only thing that starts the fight music, so it comes in on cue whether the player watches the cutscene or skips it.

This is the game's first audio. Sound effects are out of scope.

## Owner decisions (from brainstorming)

- Three tracks, all composed by the owner in Suno. The WAV masters are in the folder above the repo (`../Intro.wav`, `../Main gameplay 1.wav`, `../Main gameplay 2.wav`).
- **Intro** plays from the first tap, through the title screen, monster select and the cutscene.
- **Main gameplay 1** starts **from its beginning** on the silhouette reveal. It plays once.
- **Main gameplay 2** starts as Main 1 ends. There is no crossfade between them. Main 2 then loops start to end, as a whole song, for the rest of the run.
- Pause, level-up, death, game over and Play Again (which replays the cutscene) leave the music alone.
- Entering **monster select** switches back to the Intro. Entering the **title** from the pause menu's exit does the same, by extension of this rule.
- **Skip** no longer jumps to gameplay. It jumps to just before the reveal, so the reveal still plays and still starts the fight music.

## Measured tracks

All three are 48 kHz, stereo, 16-bit PCM WAVs. They were measured with librosa beat tracking.

| Track | Length | Tempo | Notes |
|---|---|---|---|
| Intro | 119.76 s | **120.0 BPM, steady** (beats within ~10 ms of a fixed grid) | First tracked beat at ≈4.04 s. Loud from 0 s. Fades out from ≈106 s. |
| Main gameplay 1 | 209.56 s | ≈132.5 → 136 BPM, drifts up slowly | Quiet build-up opening (≈−27 dB rising). Hard stop at ≈207.3 s, a reverb tail to ≈208 s, then near-silence. |
| Main gameplay 2 | 242.80 s | Steady, swung feel (≈90 or ≈170 BPM depending on how it's counted) | ≈1 s quiet start. Fades out over the last ≈10 s. |

Only the Intro's beat grid is used in code. The other two tracks never need beat alignment.

## Music behaviour

### Tracks and when they play

```
first tap ─► INTRO (loops its loop region)
                │  silhouette reveal (only while INTRO plays)
                ▼  waits for the Intro's next bar line
             MAIN 1 (from 0 s, once) ── its trimmed end ──► MAIN 2 (loops whole file)
                ▲                                              │
                └──────── enter select / title: back to INTRO ◄┘
```

| Event | Music now | Result |
|---|---|---|
| First user gesture (pointer or key) | nothing | Intro starts from 0 s |
| Silhouette reveal | Intro | Main 1 starts from 0 s on the Intro's next bar line; the Intro fades out over `handoffFade` (one beat) |
| Silhouette reveal | Main 1 / Main 2 (Play Again) | no change |
| Main 1 reaches its end point | Main 1 | Main 2 starts at once; no fade |
| Enter `select` or `title` | Main 1 / Main 2 | the current track fades out over `returnFade`; the Intro starts from 0 s |
| Enter `select` or `title` | Intro | no change |
| Pause, level-up, dying, game over, intro (Play Again) | any | no change |

### The Intro's bar grid and loop

- The grid is `bpm` 120, `beatsPerBar` 4, and `firstBeat` ≈4.04 s. It is a config value, set exactly from the measured beats.
- The tracker can find beats, but it can't tell which beat is beat 1 of the bar. During implementation, `firstBeat` is checked by ear and moved 1–3 beats if needed. The transitions should land on the bar's downbeat.
- **Loop region:** `loopEnd` is a bar line before the fade-out, about 104 s. `loopStart` is a bar line where the music matches what comes just before `loopEnd`. Candidate pairs are picked by comparing audio similarity at bar lines, then confirmed by ear. The Intro plays 0 → `loopEnd` once, then loops `loopStart` → `loopEnd`.
- **Next bar line:** the Intro's current musical position is mapped through the loop back to song time. The next grid line where `(songTime − firstBeat)` is a whole number of bars is found, and Main 1 is scheduled at the matching audio-clock time. If the reveal lands within `minLead` (≈50 ms) of a bar line, the following bar is used, so the start is never scheduled in the past.
- **Worst-case delay:** one bar, 2.0 s, after the reveal starts. The reveal itself lasts 2.0 s (emerge at 10 s, done at 12 s). Main 1's first beat therefore lands between the silhouette appearing and the start of play.

### Main 1's end

The Main 1 file is trimmed at encode time to keep its hard stop plus a short part of the reverb tail. The end point is ≈207.9 s, tuned by ear. Main 2 is scheduled on the audio clock for the instant Main 1's buffer ends, so there's no gap.

## Skip to the reveal

The intro clock `t` runs 0 → 12 s. The reveal phase `emerge` starts at 10 s. The silhouette shows through the cloud from there, holds black for 1.1 s, and fades into colour by 11.8 s.

New skip rule, in `IntroCinematic.skip()`:

- **`t < skipTo`** (`skipTo` = `emerge − skipLead`, with `skipLead` ≈0.5 s, a config value): **jump** to `t = skipTo`. The scene is rebuilt as it would be at that time:
  - the crater is blasted instantly (the existing `instant` blast path);
  - the pod is gone and the impact rings are done;
  - the monster is in place, crouched as `monsterCrouch(skipTo)` gives;
  - the dust cloud is respawned dense enough to hide the monster, as it does naturally at that time. Its density is tuned by eye against the watched intro.

  The cinematic then plays on from `skipTo`. The normal crossing of `emerge` fires the reveal.
- **`t ≥ skipTo`**, which includes a second tap during the reveal: finish the intro now, as today.

The skip hint stays visible until the jump. After that, it hides. A second tap still works.

**The reveal event.** `IntroCinematic` reports the frame where `t` crosses `EMERGE_TIME` through a new host callback (`onReveal`). `GameScene` forwards it to the music. A jump never lands past `emerge`, so the reveal fires exactly once per intro, watched or skipped.

## Architecture

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/audio/musicPlan.ts` | Pure logic with no Web Audio: the event → action rules in the table above, Intro position-in-loop mapping, next-bar time | config only |
| `src/audio/Music.ts` | Owns the `AudioContext`, gain nodes and buffer sources. Loads and decodes tracks, carries out the actions `musicPlan` returns, frees buffers | `musicPlan`, `RundotGameAPI.cdn` |
| `GameScene.ts` | Creates `Music`. Calls `music.unlock()` on the first gesture, `music.reveal()` from the intro's `onReveal`, and `music.enterMenu()` when the state becomes `select` or `title` | `Music` |
| `IntroCinematic.ts` | New skip rule, `onReveal` callback | timeline |
| `intro/timeline.ts` | Exports `SKIP_TO`, and helpers the skip needs (e.g. the cloud state at `t`) | config |
| `config.ts` | `music` block: per-track file, gain, grid, loop points, end trim, fades. `intro.skipLead` | — |

`Music` holds no knowledge of game states. It exposes `unlock()`, `reveal()`, `enterMenu()` and `setHidden(hidden)`. It is a plain TypeScript class, with no React and no hooks, as the project's rules require.

### Playback

- **Web Audio**, with `AudioBufferSourceNode` → per-track `GainNode` → master `GainNode` → destination. Buffer sources give sample-exact scheduling on the audio clock, which the bar-line start and the Main 1 → Main 2 handoff need. Fades are gain ramps on the audio clock.
- **Unlock:** browsers block audio until a user gesture. `AudioContext.resume()` is called on the first `pointerdown` or `keydown` anywhere, and the Intro starts then. The loading screen and the title before the first tap are silent; that is unavoidable on web.
- **Hidden tab or app:** the context is suspended while `document.hidden` and resumed when the page is visible. This is not a game-state change, so it doesn't break the "pause leaves music alone" rule.
- **Volume:** a fixed master gain from config. A mute or volume control is out of scope.

### Loading and memory

- **Files:** only compressed audio ships; no WAV file is in the repo or the build. The WAV masters are encoded with ffmpeg's `aac` encoder to `public/cdn-assets/audio/*.m4a` at 128 kb/s. That is about 9 MB in total, against 110 MB of WAVs. The Main 1 trim happens here. A script, `scripts/encode-music.sh`, records the exact ffmpeg commands. The WAV masters stay outside the repo.
- **Loading:** `RundotGameAPI.cdn.fetchAsset('audio/<name>.m4a')`, then `arrayBuffer()`, then `decodeAudioData`. This is the SDK's documented path for CDN audio. Audio is not packed in StowKit, because StowKit audio doesn't give decoded buffers for clock scheduling. Loading never blocks the game. The Intro is fetched at boot, and Main 1 and Main 2 right after it.
- **Encoder offset:** AAC adds priming samples at the start. Browsers that honour the MP4 edit list strip them. During implementation, a decoded file is checked in Chrome and Safari against the WAV, and any remaining offset is made a per-track config value, so the grid and loop points stay exact.
- **Memory (RAM at runtime, not download size):** the browser decodes each compressed file into raw samples in memory before it can schedule it, and decoded PCM is large: 48 kHz stereo float is ≈23 MB per minute. That puts Intro at ≈46 MB, Main 1 at ≈80 MB and Main 2 at ≈93 MB. Only the playing track or tracks are kept decoded:
  - The compressed bytes of all three stay cached, about 9 MB.
  - The Intro and Main 1 are decoded when needed: the Intro at unlock, Main 1 when the cutscene starts.
  - Main 2 is decoded while Main 1 plays.
  - A buffer is dropped once its track has stopped and faded.

  The peak is two tracks at once, ≈170 MB in the Main 1 → Main 2 window. If phone testing shows that's too much, the fallback is to stream Main 2 through an `<audio>` element. It needs no exact scheduling: its start can be ~tens of ms late with no audible problem.
- **Not ready in time:** if the Intro isn't decoded at unlock, it starts when ready. If Main 1 isn't decoded at the reveal, it starts as soon as it is, without waiting for a bar line. A decode or fetch failure logs through `RundotGameAPI.error()`, and the game carries on silent.

## Testing

- **`musicPlan` unit tests (vitest):**
  - every row of the event table, including Play Again's reveal while Main is playing and entering select while the Intro already plays;
  - loop-position mapping before and after the first loop;
  - next-bar time on and near a bar line (the `minLead` rule);
  - the Main 1 → Main 2 handoff time.
- **Timeline and skip tests:**
  - `SKIP_TO` is before `EMERGE_TIME`;
  - a skip from any `t < SKIP_TO` lands on `SKIP_TO`;
  - a skip at `t ≥ SKIP_TO` finishes;
  - `onReveal` fires once per intro in both the watched and the skipped case.
- **`Music`:** a thin adapter. It is checked in the browser, not with a mocked Web Audio.
- **By ear and eye (owner):**
  - the downbeat of the Intro grid;
  - the Intro loop seam;
  - Main 1's end trim;
  - the skipped reveal's cloud matching the watched one;
  - the feel of the handoff.

## Out of scope

Sound effects, a volume or mute setting, more intensity layers, and music changes on pause, level-up or game over.

## Risks

- **Suno drift.** Main 1 and Main 2 aren't on a fixed grid. The design avoids needing their grids.
- **Phone memory** for decoded audio. See the fallback above.
- **`globe-geography` conflict.** That branch, unmerged, also changes the intro (`worldMap`). The skip work in `IntroCinematic` may need a small merge.
