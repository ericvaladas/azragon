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
- **Transition:** a plain crossfade, started the moment the reveal begins. A bar-aligned version (Main 1 started on the Intro's next bar line, from decoded buffers) was built and compared by ear on 2026-10-14. The owner heard no difference, so the simpler, lower-memory streamed version was kept.

## Tracks

All three masters are 48 kHz, stereo, 16-bit PCM WAVs.

| Track | Length | Notes |
|---|---|---|
| Intro | 111.61 s (updated 2026-10-14) | ≈1 s quiet start; fades out over its last ≈6 s. Loops as a whole file. |
| Main gameplay 1 | 209.56 s, cut to 207.9 s | Quiet build-up opening (≈−24 dB for its first ≈14 s). Hard stop at ≈207.3 s, then a reverb tail; the file is cut at 207.9 s with a 0.3 s fade. |
| Main gameplay 2 | 242.80 s | ≈1 s quiet start; fades out over the last ≈10 s. Loops as a whole file. |

## Music behaviour

```
first tap ─► INTRO (loops)
                │  silhouette reveal (only while INTRO plays): crossfade
                ▼
             MAIN 1 (from 0 s, once) ── ends ──► MAIN 2 (loops)
                ▲                                    │
                └──── enter select / title: back to INTRO ◄┘
```

| Event | Music now | Result |
|---|---|---|
| First user gesture (pointer, touch or key) | nothing | Intro starts from 0 s |
| Silhouette reveal | Intro | the Intro fades out and Main 1 fades in from 0 s, both over `crossfade` (1 s), starting at once |
| Silhouette reveal | Main 1 / Main 2 (Play Again) | no change |
| Main 1 ends | Main 1 | Main 2 starts at once; no fade |
| Enter `select` or `title` | Main 1 / Main 2 | the current track fades out over `returnFade` (1 s); the Intro starts from 0 s |
| Enter `select` or `title` | Intro | no change |
| Pause, level-up, dying, game over, intro (Play Again) | any | no change |

A track told to play while it is still fading out (a menu straight after the reveal) carries on from where it is and fades back up, rather than restarting.

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
| `src/audio/musicPlan.ts` | Pure logic with no Web Audio: the event → action rules in the table above | — |
| `src/audio/Music.ts` | Owns the `AudioContext`, one `<audio>` element and gain node per track. Loads the tracks and carries out the actions `musicPlan` returns | `musicPlan`, `RundotGameAPI.cdn` |
| `GameScene.ts` | Creates `Music`. Calls `music.unlock()` on every gesture, `music.reveal()` from the intro's `onReveal`, and `music.enterMenu()` when the state becomes `select` or `title` | `Music` |
| `IntroCinematic.ts` | New skip rule, `onReveal` callback | timeline |
| `intro/timeline.ts` | Exports `SKIP_TO`, `skipAction` and `revealCrossed` | config |
| `config.ts` | `music` block: per-track file, volume, fetch timeout, `crossfade`, `returnFade`. `intro.skipLead` | — |

`Music` holds no knowledge of game states. It exposes `unlock()`, `reveal()`, `enterMenu()` and `dispose()`. It is a plain TypeScript class, with no React and no hooks, as the project's rules require.

### Playback

- **Every track streams.** Each has an `HTMLAudioElement` → `MediaElementAudioSourceNode` → its own `GainNode` → master `GainNode` → destination. The browser decodes a little at a time, so no track is ever held fully decoded. The Intro and Main 2 loop as whole files (`loop = true`); Main 1's `ended` event starts Main 2.
- **Volume** goes through the gain nodes, because iOS ignores an element's own `volume`. Fades are gain ramps on the audio clock. The master gain is a fixed config value; a mute or volume control is out of scope.
- **Unlock:** browsers block audio until a user gesture. `unlock()` runs on every `pointerdown`, `pointerup`, `touchend` and `keydown` (touch counts as a gesture only on release). The first creates the audio graph, plays a silent clip on each element inside the gesture (so iOS lets it play later without one), and starts the Intro. Any later gesture resumes a context that is not running (including iOS's `interrupted` state after a call or Siri) and retries a track whose `play()` was refused. The loading screen and the title before the first tap are silent; that is unavoidable on web.

### Loading and memory

- **Files:** only compressed audio ships; no WAV file is in the repo or the build. The WAV masters are encoded with ffmpeg's `aac` encoder to `public/cdn-assets/audio/*.m4a` at 128 kb/s, about 9.3 MB in total. The Main 1 cut happens here. `scripts/encode-music.sh` records the exact ffmpeg commands. The WAV masters stay outside the repo.
- **Loading:** every track is fetched at boot with `RundotGameAPI.cdn.fetchAsset('audio/<name>.m4a')`, the SDK's documented path for CDN audio. Each blob gets an object URL that becomes its element's `src`, replacing the silent clip as soon as it has downloaded. Loading never blocks the game.
- **Memory:** a few MB for the compressed files; nothing is fully decoded.
- **Not ready in time:** a track that has not downloaded when it is due starts as soon as it has. A fetch failure logs through `RundotGameAPI.error()`, and the game carries on without that track.

## Testing

- **`musicPlan` unit tests (vitest):** every row of the event table, including Play Again's reveal while Main is playing, entering select while the Intro already plays, and a menu straight after the reveal.
- **Timeline and skip tests:**
  - `SKIP_TO` is before `EMERGE_TIME`;
  - a skip from any `t < SKIP_TO` lands on `SKIP_TO`;
  - a skip at `t ≥ SKIP_TO` finishes;
  - `onReveal` fires once per intro in both the watched and the skipped case.
- **`Music`:** a thin adapter. It is checked in the browser, not with a mocked Web Audio.
- **By ear and eye (owner):**
  - Main 1's end cut;
  - the skipped reveal's cloud matching the watched one;
  - the feel of the crossfade;
  - on an iPhone: the Intro on the first tap, and Main 2 after Main 1.

## Out of scope

Sound effects, a volume or mute setting, more intensity layers, music changes on pause, level-up or game over, and pausing music while the game is in the background. The browser or app host may still silence a background page on its own; the game does nothing either way.

## Risks

- **iOS media elements.** Each element is primed with a silent clip inside the first gesture, then given its song. If iOS refuses `play()` later anyway, the track starts on the next tap.
- **`globe-geography` conflict.** That branch, unmerged, also changes the intro (`worldMap`). The skip work in `IntroCinematic` may need a small merge.
