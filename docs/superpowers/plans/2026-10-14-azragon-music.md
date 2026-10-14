# AZRAGON Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an event-driven soundtrack and change the intro skip.
- The Intro plays from the first tap through the menus and the cutscene.
- Main gameplay 1 starts from its top on the Intro's next bar line when the silhouette reveal begins.
- Main gameplay 2 follows Main 1 and loops.
- Entering a menu brings the Intro back.
- A skip jumps to just before the reveal instead of to gameplay.

**Architecture:** The rules live in pure functions that are unit-tested:
- `src/audio/musicPlan.ts`: event → action rules and the Intro's bar grid.
- `src/intro/timeline.ts`: the skip rule and reveal crossing.

Two thin adapters do the side effects:
- `src/audio/Music.ts`: Web Audio. The Intro and Main 1 play from decoded `AudioBuffer`s on the audio clock. Main 2 streams from an `<audio>` element through a `MediaElementAudioSourceNode`.
- `IntroCinematic.ts`: the skip jump and the reveal callback.

`GameScene` connects them to the game: the first gesture, the reveal, entering a menu and starting the cutscene.

**Tech Stack:** TypeScript, Three.js, Web Audio API, Vitest (node environment, no DOM), ffmpeg (AAC encode), RUN.game SDK (`RundotGameAPI.cdn.fetchAsset`, `RundotGameAPI.error`).

**Spec:** `docs/superpowers/specs/2026-10-14-azragon-music-design.md`

## Global Constraints

- The repo root for every path and command below is `run-template-3d-react/`. The WAV masters are one level up, in `../Intro.wav`, `../Main gameplay 1.wav` and `../Main gameplay 2.wav`.
- Only compressed audio ships. No WAV file is committed or built. Music files go in `public/cdn-assets/audio/*.m4a`, encoded as AAC at 128 kb/s.
- Tracks are fetched with `RundotGameAPI.cdn.fetchAsset('audio/<name>.m4a', { timeout })`, never with StowKit and never with a raw `fetch`.
- React handles UI only. `useEffect` is banned. Music is a plain TypeScript class that never imports React.
- Pause, level-up, dying, game over and Play Again leave the music alone. Background or hidden tabs are left alone too: no suspend.
- Only `select` and `title` bring the Intro back.
- Never deploy (`rundot deploy`). Git is local only: commit on branch `music`, never push.
- Comments follow the house style: they say what the code does and the constraints it meets, never its history.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A menu during the handoff window.** Change Monster or Exit can happen after the reveal but before Main 1's scheduled bar line. The Intro must return, and Main 1 must never start late on its own. Two Intros must never play at once.
   - Pinned by a `musicPlan` sequence test in Task 2.
   - In Task 5, `Music.fadeOutTrack` stops a source that hasn't started yet, and `Music.handoff` keeps `this.intro` until Main 1 is scheduled.
   - Checked by hand in Task 6, flow 12.
2. **Play Again.** The cutscene replays, so the reveal fires while Main 1 or Main 2 is playing. Nothing may restart. Pinned in Task 2.
3. **A skip in the last half-second before the reveal** (`SKIP_TO ≤ t < EMERGE_TIME`). The skip finishes the intro without crossing `EMERGE_TIME` in `update`, so the reveal must still fire exactly once. Pinned by `skipAction` and the "one reveal per intro" tests in Task 3.
4. **The reveal arriving before the Intro has decoded** (a fast tapper on a slow connection). Main 1 must still start, at once, and the late Intro decode must not start it on top. Handled by the `playing` guard in `Music.startIntro` and the `intro === null` branch in `Music.handoff` (Task 5). Checked by hand in Task 6 by throttling the network.
5. **iOS refusing `audio.play()` for Main 2** about 3.5 minutes after the last gesture. Main 2 must start on the next tap or key press. Handled by the silent-WAV priming in `unlock()` and the `main2Pending` retry (Task 5). Checked on an iPhone in Task 6.

---

### Task 1: Encode the music files

**Files:**
- Create: `scripts/encode-music.sh`
- Create: `public/cdn-assets/audio/intro.m4a`, `public/cdn-assets/audio/main1.m4a`, `public/cdn-assets/audio/main2.m4a` (generated)

**Interfaces:**
- Produces: the CDN paths `audio/intro.m4a`, `audio/main1.m4a` and `audio/main2.m4a`, which Task 2's config refers to.

- [ ] **Step 1: Write the encode script**

```bash
#!/usr/bin/env bash
# Encodes the WAV masters (kept outside the repo) to the AAC files the game ships.
# Main 1 is cut after its final hit and a short part of its reverb tail (end point tuned by ear).
# Usage: scripts/encode-music.sh [masters dir, default ..]
set -euo pipefail
SRC="${1:-..}"
OUT="public/cdn-assets/audio"
MAIN1_END=207.9
MAIN1_FADE=0.3
mkdir -p "$OUT"
enc() { ffmpeg -hide_banner -loglevel error -y -i "$1" "${@:3}" -c:a aac -b:a 128k -movflags +faststart "$OUT/$2"; }
enc "$SRC/Intro.wav" intro.m4a
enc "$SRC/Main gameplay 1.wav" main1.m4a -t "$MAIN1_END" -af "afade=t=out:st=$(echo "$MAIN1_END - $MAIN1_FADE" | bc):d=$MAIN1_FADE"
enc "$SRC/Main gameplay 2.wav" main2.m4a
ls -l "$OUT"
```

- [ ] **Step 2: Run it**

Run: `chmod +x scripts/encode-music.sh && scripts/encode-music.sh`
Expected: three `.m4a` files listed, together under 10 MB.

- [ ] **Step 3: Check durations**

Run: `for f in public/cdn-assets/audio/*.m4a; do printf '%s ' "$f"; ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done`
Expected: intro ≈ 119.76, main1 ≈ 207.90, main2 ≈ 242.80 (each within 0.05 s).

- [ ] **Step 4: Commit**

```bash
git add scripts/encode-music.sh public/cdn-assets/audio
git commit -m "Music: AAC encodes of the Intro, Main 1 (trimmed) and Main 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Music rules and the Intro's bar grid

**Files:**
- Modify: `src/config.ts`: add a `music` block after the `intro` block, which closes just before `readability:` at about line 483.
- Create: `src/audio/musicPlan.ts`
- Test: `src/audio/musicPlan.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TrackId = 'intro' | 'main1' | 'main2'`
  - `type MusicEvent = 'unlock' | 'reveal' | 'menu' | 'main1Ended'`
  - `type MusicAction = { kind: 'none' } | { kind: 'startIntro'; fadeOut: 'main1' | 'main2' | null } | { kind: 'handoff' } | { kind: 'startMain2' }`
  - `musicStep(playing: TrackId | null, ev: MusicEvent): { playing: TrackId | null; action: MusicAction }`
  - `type BarGrid = { bpm: number; beatsPerBar: number; firstBar: number; loopStart: number; loopEnd: number }`
  - `barLength(g: BarGrid): number`
  - `songTime(elapsed: number, g: BarGrid): number`
  - `nextBarDelay(t: number, g: BarGrid, minLead: number): number`
  - `isBarLine(t: number, g: BarGrid): boolean`
  - `CONFIG.music` with the fields below.

The Intro grid values come from analysis of the master:
- Beats fall at 0.031 s + 0.5 k, which is 120 BPM.
- Low-end energy peaks on the slot starting at 0.031 s, so that is taken as the downbeat.
- The best loop seam, comparing the 4 bars leading into it, is loopStart 42.031 and loopEnd 96.031. Its similarity is 0.80.
- Runner-up seams: 44.031 → 98.031, 62.031 → 98.031 and 60.031 → 96.031.
- The fade-out begins at about 112 s.

- [ ] **Step 1: Add the config block**

In `src/config.ts`, insert after the `intro: { ... },` block (its last entry is `space: { ... }`, then `  },`):

```ts
  music: {
    /** Master volume, 0..1. */
    volume: 0.8,
    /** CDN fetch timeout (ms); each file is a few MB. */
    fetchTimeout: 60000,
    /**
     * The Intro: 120 BPM in 4/4, bar lines at firstBar + 2k s. It plays 0 → loopEnd once, then loops
     * loopStart → loopEnd; both are bar lines, before the fade-out (≈112 s). `offset`: seconds of encoder
     * priming left at the front of the decoded file (0 when the browser strips it).
     */
    intro: { file: 'audio/intro.m4a', bpm: 120, beatsPerBar: 4, firstBar: 0.031, loopStart: 42.031, loopEnd: 96.031, offset: 0 },
    /** Main gameplay 1: starts from its top on the reveal, plays once (the file ends after its final hit). */
    main1: { file: 'audio/main1.m4a', offset: 0 },
    /** Main gameplay 2: follows Main 1 and loops as a whole song. */
    main2: { file: 'audio/main2.m4a' },
    /** The Intro fades out over this long (s) from the bar line Main 1 starts on: one beat at 120 BPM. */
    handoffFade: 0.5,
    /** Gameplay music fades out over this long (s) when a menu brings the Intro back. */
    returnFade: 1.0,
    /** A bar line closer than this (s) is too soon to schedule on; the one after it is used. */
    minLead: 0.05,
  },
```

- [ ] **Step 2: Write the failing tests**

`src/audio/musicPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { barLength, isBarLine, musicStep, nextBarDelay, songTime, type BarGrid, type MusicEvent, type TrackId } from './musicPlan';

const G: BarGrid = { bpm: 120, beatsPerBar: 4, firstBar: 0.031, loopStart: 42.031, loopEnd: 96.031 };
const LEAD = 0.05;

/** Runs events in order from silence; returns each step's action kind and the final track. */
function run(events: MusicEvent[]): { kinds: string[]; playing: TrackId | null } {
  let playing: TrackId | null = null;
  const kinds: string[] = [];
  for (const ev of events) {
    const s = musicStep(playing, ev);
    playing = s.playing;
    kinds.push(s.action.kind);
  }
  return { kinds, playing };
}

describe('musicStep', () => {
  it('starts the Intro on the first gesture only', () => {
    expect(musicStep(null, 'unlock')).toEqual({ playing: 'intro', action: { kind: 'startIntro', fadeOut: null } });
    for (const t of ['intro', 'main1', 'main2'] as const) expect(musicStep(t, 'unlock').action.kind).toBe('none');
  });
  it('hands over from the Intro to Main 1 on the reveal, and ignores the reveal otherwise (Play Again)', () => {
    expect(musicStep('intro', 'reveal')).toEqual({ playing: 'main1', action: { kind: 'handoff' } });
    expect(musicStep('main1', 'reveal')).toEqual({ playing: 'main1', action: { kind: 'none' } });
    expect(musicStep('main2', 'reveal')).toEqual({ playing: 'main2', action: { kind: 'none' } });
    expect(musicStep(null, 'reveal')).toEqual({ playing: null, action: { kind: 'none' } });
  });
  it('starts Main 2 when Main 1 ends, and only then', () => {
    expect(musicStep('main1', 'main1Ended')).toEqual({ playing: 'main2', action: { kind: 'startMain2' } });
    for (const t of [null, 'intro', 'main2'] as const) expect(musicStep(t, 'main1Ended').action.kind).toBe('none');
  });
  it('brings the Intro back on a menu from gameplay music, fading the current track; no change from the Intro or silence', () => {
    expect(musicStep('main1', 'menu')).toEqual({ playing: 'intro', action: { kind: 'startIntro', fadeOut: 'main1' } });
    expect(musicStep('main2', 'menu')).toEqual({ playing: 'intro', action: { kind: 'startIntro', fadeOut: 'main2' } });
    expect(musicStep('intro', 'menu').action.kind).toBe('none');
    expect(musicStep(null, 'menu').action.kind).toBe('none');
  });
  it('walks a whole session: run, Play Again, Change Monster, a second run', () => {
    const r = run(['menu', 'unlock', 'menu', 'reveal', 'main1Ended', 'reveal', 'menu', 'reveal']);
    expect(r.kinds).toEqual(['none', 'startIntro', 'none', 'handoff', 'startMain2', 'none', 'startIntro', 'handoff']);
    expect(r.playing).toBe('main1');
  });
  it('brings the Intro back when a menu comes before Main 1 has started (handoff window)', () => {
    const r = run(['unlock', 'reveal', 'menu']);
    expect(r.kinds).toEqual(['startIntro', 'handoff', 'startIntro']);
    expect(r.playing).toBe('intro');
    expect(musicStep('main1', 'menu').action).toEqual({ kind: 'startIntro', fadeOut: 'main1' });
  });
});

describe('songTime', () => {
  it('runs straight through to loopEnd, then wraps round the loop region', () => {
    expect(songTime(10, G)).toBe(10);
    expect(songTime(96.031, G)).toBeCloseTo(42.031);
    expect(songTime(96.031 + 54 + 1, G)).toBeCloseTo(43.031);
    expect(songTime(96.031 + 54 * 3 + 0.5, G)).toBeCloseTo(42.531);
  });
});

describe('nextBarDelay', () => {
  it('waits for the next bar line', () => {
    expect(barLength(G)).toBe(2);
    expect(nextBarDelay(10, G, LEAD)).toBeCloseTo(0.031);
    expect(nextBarDelay(11, G, LEAD)).toBeCloseTo(1.031);
  });
  it('skips a bar line that is on or within minLead of now', () => {
    expect(nextBarDelay(10.031, G, LEAD)).toBeCloseTo(2);
    expect(nextBarDelay(10.02, G, LEAD)).toBeCloseTo(2.011);
    expect(nextBarDelay(0, G, LEAD)).toBeCloseTo(2.031);
  });
  it('lands on loopEnd near the end of the loop (the grid carries across the seam)', () => {
    expect(nextBarDelay(95.5, G, LEAD)).toBeCloseTo(0.531);
  });
  it('never waits longer than one bar plus minLead', () => {
    for (let t = 0; t < 96; t += 0.0137) {
      const d = nextBarDelay(t, G, LEAD);
      expect(d).toBeGreaterThanOrEqual(LEAD);
      expect(d).toBeLessThanOrEqual(2 + LEAD);
      expect(isBarLine(t + d, G)).toBe(true);
    }
  });
});

describe('CONFIG.music.intro', () => {
  const I = CONFIG.music.intro;
  it('loops between bar lines, before the fade-out', () => {
    expect(isBarLine(I.loopStart, I)).toBe(true);
    expect(isBarLine(I.loopEnd, I)).toBe(true);
    expect(I.loopStart).toBeLessThan(I.loopEnd);
    expect(I.loopEnd).toBeLessThanOrEqual(112);
  });
  it('fades the Intro out within a bar', () => {
    expect(CONFIG.music.handoffFade).toBeLessThanOrEqual(barLength(I));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/audio/musicPlan.test.ts`
Expected: FAIL. `./musicPlan` cannot be resolved.

- [ ] **Step 4: Implement `musicPlan.ts`**

```ts
/** The soundtrack's tracks: the calm Intro, then the fight music (Main 1 once, then Main 2 looping). */
export type TrackId = 'intro' | 'main1' | 'main2';
/** `unlock`: a user gesture. `reveal`: the silhouette reveal. `menu`: entering select or title. `main1Ended`: Main 1 played out. */
export type MusicEvent = 'unlock' | 'reveal' | 'menu' | 'main1Ended';
export type MusicAction =
  | { kind: 'none' }
  /** Start the Intro from its top, fading out `fadeOut` if it plays. */
  | { kind: 'startIntro'; fadeOut: 'main1' | 'main2' | null }
  /** Start Main 1 from its top on the Intro's next bar line; fade the Intro out from there. */
  | { kind: 'handoff' }
  | { kind: 'startMain2' };

/** Which track plays after `ev`, and what to do about it. Events that don't apply to `playing` change nothing. */
export function musicStep(playing: TrackId | null, ev: MusicEvent): { playing: TrackId | null; action: MusicAction } {
  switch (ev) {
    case 'unlock':
      if (playing === null) return { playing: 'intro', action: { kind: 'startIntro', fadeOut: null } };
      break;
    case 'reveal':
      if (playing === 'intro') return { playing: 'main1', action: { kind: 'handoff' } };
      break;
    case 'main1Ended':
      if (playing === 'main1') return { playing: 'main2', action: { kind: 'startMain2' } };
      break;
    case 'menu':
      if (playing === 'main1' || playing === 'main2') return { playing: 'intro', action: { kind: 'startIntro', fadeOut: playing } };
      break;
  }
  return { playing, action: { kind: 'none' } };
}

/** A track's bar grid: bar lines at firstBar + k bars (s); loopStart and loopEnd are bar lines. */
export type BarGrid = { bpm: number; beatsPerBar: number; firstBar: number; loopStart: number; loopEnd: number };

export const barLength = (g: BarGrid): number => (60 / g.bpm) * g.beatsPerBar;

/** Song position after `elapsed` s of playback from song time 0: straight through to loopEnd, then round the loop region. */
export function songTime(elapsed: number, g: BarGrid): number {
  if (elapsed < g.loopEnd) return elapsed;
  return g.loopStart + ((elapsed - g.loopEnd) % (g.loopEnd - g.loopStart));
}

/**
 * Seconds from song position `t` to the next bar line at least `minLead` away. The loop region starts and ends
 * on bar lines, so a bar line at or past loopEnd is the same musical moment as its loop-wrapped position.
 */
export function nextBarDelay(t: number, g: BarGrid, minLead: number): number {
  const bar = barLength(g);
  let next = g.firstBar + Math.ceil((t - g.firstBar) / bar - 1e-9) * bar;
  if (next - t < minLead) next += bar;
  return next - t;
}

/** True when `t` (s) is on the bar grid, within 1 ms. */
export function isBarLine(t: number, g: BarGrid): boolean {
  const bar = barLength(g);
  const k = (t - g.firstBar) / bar;
  return Math.abs(k - Math.round(k)) * bar < 0.001;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/audio/musicPlan.test.ts`
Expected: PASS, every test.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, and every test passes.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/audio/musicPlan.ts src/audio/musicPlan.test.ts
git commit -m "Music: event rules and the Intro's bar grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Skip rule and reveal crossing (timeline)

**Files:**
- Modify: `src/config.ts`: add `skipLead` to the `intro` block, after `riseTime: 1.4,`.
- Modify: `src/intro/timeline.ts`: add exports after `EMERGE_TIME` (around line 24).
- Test: `src/intro/timeline.test.ts`: add a `describe` block at the end.

**Interfaces:**
- Consumes: `EMERGE_TIME`, `IMPACT_TIME`, `INTRO_LENGTH` (already in `timeline.ts`).
- Produces:
  - `SKIP_TO: number`
  - `type SkipAction = { kind: 'jump'; to: number } | { kind: 'finish'; reveal: boolean }`
  - `skipAction(t: number): SkipAction`
  - `revealCrossed(prev: number, t: number): boolean`

- [ ] **Step 1: Add the config value**

In the `intro` block of `src/config.ts`, after `riseTime: 1.4,`:

```ts
    /** A skip lands this long (s) before `emerge`, so the reveal and the music change on it still play. */
    skipLead: 0.5,
```

- [ ] **Step 2: Write the failing tests**

Add `SKIP_TO, revealCrossed, skipAction` to the existing import from `./timeline` at the top of `src/intro/timeline.test.ts`, then append:

```ts
describe('skip', () => {
  it('lands just before the reveal, after the cloud has stopped being fed', () => {
    expect(SKIP_TO).toBeCloseTo(EMERGE_TIME - CONFIG.intro.skipLead);
    expect(SKIP_TO).toBeLessThan(EMERGE_TIME);
    expect(SKIP_TO).toBeGreaterThan(IMPACT_TIME + CONFIG.intro.reveal.feedFor);
  });
  it('jumps to SKIP_TO from anywhere before it, space scene included', () => {
    for (const t of [0, 2, CUT_TIME, IMPACT_TIME, SKIP_TO - 0.01]) expect(skipAction(t)).toEqual({ kind: 'jump', to: SKIP_TO });
  });
  it('finishes from SKIP_TO on, firing the reveal first when the clock has not reached it', () => {
    expect(skipAction(SKIP_TO)).toEqual({ kind: 'finish', reveal: true });
    expect(skipAction(EMERGE_TIME - 0.01)).toEqual({ kind: 'finish', reveal: true });
    expect(skipAction(EMERGE_TIME)).toEqual({ kind: 'finish', reveal: false });
    expect(skipAction(INTRO_LENGTH - 0.1)).toEqual({ kind: 'finish', reveal: false });
  });
});

describe('revealCrossed', () => {
  /** Steps the clock at 60 fps from 0, applying a skip at `skipAt` (and again at `skipAgainAt`); counts reveals. */
  function reveals(skipAt?: number, skipAgainAt?: number): number {
    let t = 0;
    let n = 0;
    const skip = (): boolean => {
      const a = skipAction(t);
      if (a.kind === 'jump') {
        t = a.to;
        return false;
      }
      if (a.reveal) n++;
      return true;
    };
    while (t < INTRO_LENGTH) {
      if (skipAt !== undefined && t >= skipAt) {
        skipAt = undefined;
        if (skip()) return n;
      }
      if (skipAgainAt !== undefined && t >= skipAgainAt) {
        skipAgainAt = undefined;
        if (skip()) return n;
      }
      const prev = t;
      t += 1 / 60;
      if (revealCrossed(prev, t)) n++;
    }
    return n;
  }
  it('fires exactly once per intro: watched, skipped, skipped twice, or skipped in the last half-second', () => {
    expect(reveals()).toBe(1);
    expect(reveals(1)).toBe(1);
    expect(reveals(8)).toBe(1);
    expect(reveals(1, 10.5)).toBe(1);
    expect(reveals(9.7)).toBe(1);
    expect(reveals(11)).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/intro/timeline.test.ts`
Expected: FAIL. `SKIP_TO` / `skipAction` / `revealCrossed` are not exported.

- [ ] **Step 4: Implement**

In `src/intro/timeline.ts`, after `export const EMERGE_TIME = S.emerge;`:

```ts
/** Where a skip lands: just before the reveal, so the reveal (and the music change on it) still plays. */
export const SKIP_TO = EMERGE_TIME - I.skipLead;

export type SkipAction = { kind: 'jump'; to: number } | { kind: 'finish'; reveal: boolean };

/** A skip at intro time `t`: before SKIP_TO, jump there; from SKIP_TO on, finish, firing the reveal first if the clock has not reached it. */
export function skipAction(t: number): SkipAction {
  if (t < SKIP_TO) return { kind: 'jump', to: SKIP_TO };
  return { kind: 'finish', reveal: t < EMERGE_TIME };
}

/** True on the frame the intro clock passes the start of the reveal (emerge). */
export function revealCrossed(prev: number, t: number): boolean {
  return prev < EMERGE_TIME && t >= EMERGE_TIME;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/intro/timeline.test.ts`
Expected: PASS, the new tests and all the existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/intro/timeline.ts src/intro/timeline.test.ts
git commit -m "Intro: skip lands just before the reveal; reveal crossing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Skip to the reveal in the cinematic, and the reveal callback

**Files:**
- Modify: `src/intro/IntroCinematic.ts`: `IntroHost`, the import from `./timeline`, `update()`, `skip()`, and a new `jumpTo()`.
- Modify: `src/GameEvents.ts`: add `skipHint` to `GameEventMap`.
- Modify: `src/GameScene.ts`: `startIntro()` and `skipIntro()` (around lines 460-470).
- Modify: `src/App.tsx`: skip-hint state (around lines 27-49 and 107).

**Interfaces:**
- Consumes: `SKIP_TO`, `skipAction`, `revealCrossed` (Task 3).
- Produces:
  - `IntroHost.onReveal?: () => void`, called once per intro when the reveal starts.
  - `IntroCinematic.skip(): boolean`, which returns true when the intro finished.
  - The `skipHint: boolean` game event.

`IntroCinematic` builds DOM elements, and the test environment is node with no DOM. That's why the rules were pinned in Task 3. This task is checked in the browser.

- [ ] **Step 1: Add the reveal callback to the host and fire it in `update`**

In `IntroHost`, after `particles: Particles;`:

```ts
  /** Called once per intro, when the reveal starts (the silhouette shows through the cloud). */
  onReveal?: () => void;
```

Add `revealCrossed, skipAction` to the import from `./timeline`.

In `update(dt)`, after `const t = (this.t += dt);`:

```ts
    if (revealCrossed(prev, t)) this.host.onReveal?.();
```

- [ ] **Step 2: Replace `skip()` and add `jumpTo()`**

Replace the whole `skip()` method, doc comment included, with:

```ts
  /**
   * Skip (tap, click or key). Before SKIP_TO the intro jumps there, with the crater, the crouched black monster
   * and its dust cloud as they would be then, and plays the reveal on from it. From SKIP_TO on it finishes now,
   * firing the reveal first if the clock has not reached it. Returns true when the intro is over.
   */
  skip(): boolean {
    if (!this.active) return true;
    const a = skipAction(this.t);
    if (a.kind === 'jump') {
      this.jumpTo(a.to);
      return false;
    }
    if (a.reveal) this.host.onReveal?.();
    this.host.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * X.outer);
    this.host.particles.clear();
    for (const r of this.rings) r.clear();
    this.finish();
    return true;
  }

  /**
   * Move the clock to `to` (after impact, before the reveal). From before impact, the crater is blasted at once
   * (no shock wave), the pod and space scene are gone, and the black, crouched monster stands under a fresh
   * cloud. The cloud, rings and boulders are then aged to `to` at 60 steps a second, fed as the watched intro
   * feeds them, so the reveal looks the same either way.
   */
  private jumpTo(to: number): void {
    const h = this.host;
    let from = this.t;
    if (from < IMPACT_TIME) {
      h.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * X.outer);
      h.particles.clear();
      for (const r of this.rings) r.clear();
      this.clearBoulders();
      this.pod.root.visible = false;
      this.flashEl.style.opacity = '0';
      this.blackEl.style.opacity = '0';
      h.monster.visible = true;
      h.monster.setSilhouette(1);
      for (let i = 0; i < I.reveal.cloud; i++) this.cloudPuff();
      from = IMPACT_TIME;
    }
    const step = 1 / 60;
    let feed = 0;
    for (let s = from; s < to; s += step) {
      const dt = Math.min(step, to - s);
      if (s < IMPACT_TIME + I.reveal.feedFor) {
        feed += dt * I.reveal.feedRate;
        for (; feed >= 1; feed--) this.cloudPuff();
      }
      h.particles.update(dt);
      for (const r of this.rings) r.update(dt);
      this.updateBoulders(s + dt, dt);
    }
    this.t = to;
    h.monster.pose.dip = I.crouchDip * monsterCrouch(to);
    h.monster.setSilhouette(silhouetteAt(to));
  }
```

- [ ] **Step 3: Add the skip-hint event**

In `GameEventMap` (`src/GameEvents.ts`), after `roster: ...;`:

```ts
  /** Whether the intro's skip hint shows: on when the intro starts, off once a skip has jumped to the reveal. */
  skipHint: boolean;
```

- [ ] **Step 4: Use the new skip in `GameScene`**

Replace `startIntro()` and `skipIntro()` with:

```ts
  private startIntro(): void {
    this.intro.start();
    this.setState('intro');
    this.events.emit('skipHint', true);
  }

  /** Skip (tap, click or key): jump to just before the reveal, or end the intro if that has happened. Public for scripted checks and the M4 menus. */
  skipIntro(): void {
    if (this.state !== 'intro') return;
    if (this.intro.skip()) this.endIntro();
    else this.events.emit('skipHint', false);
  }
```

- [ ] **Step 5: Show the hint only while `skipHint` is on (`src/App.tsx`)**

Next to the other `useState` calls:

```ts
  const [skipHint, setSkipHint] = useState(false);
```

Next to the other `game.events.on(...)` calls:

```ts
    game.events.on('skipHint', setSkipHint);
```

Change the hint line to:

```tsx
        {state === 'intro' && skipHint && <div className="skip-hint">{SKIP_HINT}</div>}
```

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, and every test passes.

- [ ] **Step 7: Check in the browser**

Run `npm run dev` and open the printed URL. Play to the cutscene each time, then check:
1. **Tap during the space scene.** The view cuts to the crater with the dust cloud, the monster crouched and black in it. About 0.5 s later the silhouette rises through the thinning cloud and colours in, then play starts. The skip hint disappears at the jump. There's no pod, flash or space scene after the jump.
2. **Tap during the fall.** Same as 1.
3. **Tap just after impact.** Boulders keep flying and the cloud doesn't pop. Then the same reveal plays.
4. **Tap twice quickly.** The second tap, during the reveal, starts play at once.
5. **Watch without tapping.** The cutscene is unchanged from before.

Compare the cloud after a skip with the watched one at the same moment. If it is clearly thinner or thicker, report it to the owner and do not tune it in this task.

- [ ] **Step 8: Commit**

```bash
git add src/intro/IntroCinematic.ts src/GameEvents.ts src/GameScene.ts src/App.tsx
git commit -m "Intro: a skip jumps to just before the reveal; reveal callback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The `Music` player and its wiring

**Files:**
- Create: `src/audio/Music.ts`
- Modify: `src/GameScene.ts`:
  - the import;
  - a `music` field;
  - gesture listeners in the constructor;
  - `onReveal` in the `IntroCinematic` host (line ≈202);
  - `prepareFight()` in `startIntro()`;
  - `enterMenu()` in `setState()` (line ≈547);
  - cleanup in `dispose()` (line ≈1624).
- Modify: `docs/superpowers/specs/2026-10-14-azragon-music-design.md`: the API list and the late-decode rule.

**Interfaces:**
- Consumes: `musicStep`, `nextBarDelay`, `songTime`, `MusicAction`, `MusicEvent`, `TrackId` and `CONFIG.music` (Task 2); `IntroHost.onReveal` (Task 4).
- Produces: `class Music { unlock(): void; reveal(): void; prepareFight(): void; enterMenu(): void; dispose(): void }`

`Music` is a thin adapter over Web Audio. It has no unit test, because the node test environment has no `AudioContext`, and it is checked in the browser in Task 6. All of its decisions come from `musicStep` and `nextBarDelay`, which Task 2 tested.

- [ ] **Step 1: Write `src/audio/Music.ts`**

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { CONFIG } from '../config';
import { musicStep, nextBarDelay, songTime, type MusicAction, type MusicEvent, type TrackId } from './musicPlan';

const M = CONFIG.music;
/** A two-sample silent WAV. Playing it inside the first gesture lets iOS play the Main 2 element later without one. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
type Decoded = 'intro' | 'main1';
type BufferTrack = { src: AudioBufferSourceNode; gain: GainNode };

const report = (e: unknown): void => RundotGameAPI.error('[music]', e);

/**
 * The soundtrack, driven by game events through musicStep.
 * - The first gesture starts the Intro.
 * - The silhouette reveal starts Main 1 on the Intro's next bar line.
 * - Main 2 follows Main 1 and loops.
 * - A menu brings the Intro back.
 *
 * The Intro and Main 1 play from decoded buffers, on the audio clock. Main 2 streams from an <audio> element
 * and is never fully decoded. A buffer is decoded only while its track is needed. The compressed bytes stay
 * cached so it can be decoded again.
 */
export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing: TrackId | null = null;
  private bytes: Record<Decoded, Promise<ArrayBuffer>>;
  private buffers: Partial<Record<Decoded, Promise<AudioBuffer>>> = {};
  /** The playing Intro; `zero` is the audio-clock time of its song time 0. */
  private intro: (BufferTrack & { zero: number }) | null = null;
  private main1: BufferTrack | null = null;
  private main2Blob: Promise<Blob>;
  private main2: { el: HTMLAudioElement; gain: GainNode; ready: boolean } | null = null;
  private main2Url: string | null = null;
  /** Main 2 should be playing but play() has not succeeded yet (blocked without a gesture, or still loading). */
  private main2Pending = false;
  private disposed = false;

  constructor() {
    const fetch = (file: string) => RundotGameAPI.cdn.fetchAsset(file, { timeout: M.fetchTimeout });
    this.bytes = { intro: fetch(M.intro.file).then((b) => b.arrayBuffer()), main1: fetch(M.main1.file).then((b) => b.arrayBuffer()) };
    this.main2Blob = fetch(M.main2.file);
    // Failures are reported where each promise is used; these keep an unused rejection from going unhandled.
    for (const p of [this.bytes.intro, this.bytes.main1, this.main2Blob]) p.catch(() => {});
  }

  /** Call on every user gesture (pointerdown, keydown). The first creates the audio graph and starts the Intro; any later one retries a blocked Main 2. */
  unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = M.volume;
      this.master.connect(this.ctx.destination);
      this.setUpMain2(this.ctx, this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(report);
    if (this.main2Pending) this.playMain2();
    this.send('unlock');
  }

  /** The silhouette reveal started. */
  reveal(): void {
    if (this.ctx) this.send('reveal');
  }

  /** The cutscene started: decode Main 1 now, so it is ready for the reveal's bar line. */
  prepareFight(): void {
    if (this.ctx && this.playing === 'intro') this.decode('main1').catch(report);
  }

  /** Entered the monster select or title screen. */
  enterMenu(): void {
    if (this.ctx) this.send('menu');
  }

  dispose(): void {
    this.disposed = true;
    this.main2?.el.pause();
    if (this.main2Url) URL.revokeObjectURL(this.main2Url);
    this.ctx?.close().catch(() => {});
  }

  private send(ev: MusicEvent): void {
    const next = musicStep(this.playing, ev);
    this.playing = next.playing;
    this.act(next.action);
  }

  private act(a: MusicAction): void {
    switch (a.kind) {
      case 'startIntro':
        if (a.fadeOut) this.fadeOutTrack(a.fadeOut, M.returnFade);
        this.startIntro();
        break;
      case 'handoff':
        this.handoff();
        break;
      case 'startMain2':
        this.playMain2();
        break;
    }
  }

  private decode(id: Decoded): Promise<AudioBuffer> {
    const ctx = this.ctx!;
    this.buffers[id] ??= this.bytes[id].then((b) => ctx.decodeAudioData(b.slice(0))).then((buf) => {
      if (import.meta.env.DEV) console.info(`[music] ${id} decoded: ${buf.duration.toFixed(3)} s at ${buf.sampleRate} Hz`);
      return buf;
    });
    // A failed decode is forgotten, so a later request tries again.
    this.buffers[id]!.catch(() => delete this.buffers[id]);
    return this.buffers[id]!;
  }

  private bufferTrack(buf: AudioBuffer): BufferTrack {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain).connect(this.master!);
    return { src, gain };
  }

  /** The Intro from its top, looping its loop region; it starts when decoded, unless the music has moved on by then. */
  private startIntro(): void {
    this.decode('intro')
      .then((buf) => {
        if (this.disposed || this.playing !== 'intro' || this.intro) return;
        const I = M.intro;
        const t = this.bufferTrack(buf);
        t.src.loop = true;
        t.src.loopStart = I.loopStart + I.offset;
        t.src.loopEnd = I.loopEnd + I.offset;
        const zero = this.ctx!.currentTime + 0.02;
        t.src.start(zero, I.offset);
        this.intro = { ...t, zero };
      })
      .catch(report);
  }

  /**
   * Main 1 from its top on the Intro's next bar line, while the Intro fades out from that line over
   * handoffFade. If the Intro never started, Main 1 starts at once. The Intro stays `this.intro` until Main 1
   * is scheduled, so a menu that arrives while Main 1 is still decoding keeps the Intro playing (no second one).
   */
  private handoff(): void {
    this.decode('main1')
      .then((buf) => {
        if (this.disposed || this.playing !== 'main1' || this.main1) return;
        const intro = this.intro;
        this.intro = null;
        if (!intro) delete this.buffers.intro;
        const now = this.ctx!.currentTime;
        const at = intro ? now + nextBarDelay(songTime(now - intro.zero, M.intro), M.intro, M.minLead) : now + 0.02;
        const t = this.bufferTrack(buf);
        t.src.onended = () => {
          if (this.main1?.src !== t.src) return;
          this.main1 = null;
          delete this.buffers.main1;
          this.send('main1Ended');
        };
        t.src.start(at, M.main1.offset);
        this.main1 = t;
        if (intro) {
          this.fadeOut(intro, at, M.handoffFade);
          intro.src.onended = () => delete this.buffers.intro;
        }
      })
      .catch(report);
  }

  /** Ramp a buffer track to silence from `at` over `dur` s, then stop it (a source not yet started never plays). */
  private fadeOut(t: BufferTrack, at: number, dur: number): void {
    const g = t.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0, at + dur);
    t.src.stop(at + dur);
  }

  /** Fade the gameplay track out over `dur` s from now, for a menu's return to the Intro. */
  private fadeOutTrack(id: 'main1' | 'main2', dur: number): void {
    const now = this.ctx!.currentTime;
    if (id === 'main1' && this.main1) {
      const t = this.main1;
      this.main1 = null;
      this.fadeOut(t, now, dur);
      t.src.onended = () => delete this.buffers.main1;
    }
    if (id === 'main2' && this.main2) {
      const m = this.main2;
      this.main2Pending = false;
      const g = m.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + dur);
      setTimeout(() => {
        if (this.playing === 'main2') return;
        m.el.pause();
        m.el.currentTime = 0;
      }, dur * 1000 + 50);
    }
  }

  /** The Main 2 element: primed with a silent clip inside the first gesture, then given the song once it has loaded. */
  private setUpMain2(ctx: AudioContext, master: GainNode): void {
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.src = SILENT_WAV;
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain).connect(master);
    const main2 = { el, gain, ready: false };
    this.main2 = main2;
    const primed = el.play().then(() => el.pause()).catch(() => {});
    Promise.all([primed, this.main2Blob])
      .then(([, blob]) => {
        if (this.disposed) return;
        this.main2Url = URL.createObjectURL(blob);
        el.src = this.main2Url;
        main2.ready = true;
        if (this.playing === 'main2') this.playMain2();
      })
      .catch(report);
  }

  /** Main 2 from its top at full volume. If it can't play yet, it is retried when it loads or on the next gesture. */
  private playMain2(): void {
    const m = this.main2;
    if (!m || this.playing !== 'main2') return;
    this.main2Pending = true;
    if (!m.ready) return;
    const now = this.ctx!.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(1, now);
    m.el.currentTime = 0;
    m.el
      .play()
      .then(() => {
        this.main2Pending = false;
      })
      .catch(() => {});
  }
}
```

- [ ] **Step 2: Wire it into `GameScene`**

1. **Import:** with the other imports:

```ts
import { Music } from './audio/Music';
```

2. **Fields:** with the other private fields (before the constructor):

```ts
  private music = new Music();
  /** Any pointer or key press: the first starts the music (browsers allow audio only after a gesture). */
  private onGesture = (): void => this.music.unlock();
```

3. **Reveal callback:** in the constructor, add `onReveal` to the `IntroCinematic` host object (line ≈202):

```ts
    this.intro = new IntroCinematic({ scene: this.scene, camera: this.camera, overlay: container, monster: this.monster, city: this.city, particles: this.particles, onReveal: () => this.music.reveal() });
```

4. **Gesture listeners:** in the constructor, just before `this.resizeObserver = new ResizeObserver(this.onResize);`:

```ts
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
```

5. **`startIntro()`:** after `this.events.emit('skipHint', true);`:

```ts
    this.music.prepareFight();
```

6. **`setState()`:** after `this.state = next;`:

```ts
    if (next === 'select' || next === 'title') this.music.enterMenu();
```

7. **`dispose()`:** at its start:

```ts
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    this.music.dispose();
```

- [ ] **Step 3: Bring the spec in line**

In `docs/superpowers/specs/2026-10-14-azragon-music-design.md`:
- Change "It exposes `unlock()`, `reveal()` and `enterMenu()`." to "It exposes `unlock()`, `reveal()`, `prepareFight()` (called when the cutscene starts, to decode Main 1) and `enterMenu()`."
- Change "If Main 1 isn't decoded at the reveal, it starts as soon as it is, without waiting for a bar line." to "If Main 1 isn't decoded at the reveal, it starts on the Intro's next bar line after it is ready, or at once if the Intro never started."

- [ ] **Step 4: Typecheck, test and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, every test passes, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/audio/Music.ts src/GameScene.ts docs/superpowers/specs/2026-10-14-azragon-music-design.md
git commit -m "Music: Intro from the first tap, Main 1 on the reveal's bar line, Main 2 looping, Intro back in menus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in the browser and by ear

**Files:** none, unless a check fails.

- [ ] **Step 1: Encoder offset.** Run `npm run dev`, open the page in Chrome, tap, and play to the cutscene. Read the console:
  - `[music] intro decoded` should be within 0.005 s of 119.760.
  - `[music] main1 decoded` should be within 0.005 s of 207.900.

  Repeat in Safari. If a browser shows about 0.044 s extra, it keeps the AAC priming. In that case, set `CONFIG.music.intro.offset` and `main1.offset` to the measured excess, and commit with the message "Music: AAC priming offset".

- [ ] **Step 2: Run through the flows** and note each result:
  1. **Title screen:** silent until the first tap, then the Intro plays.
  2. **Monster select:** the Intro continues uninterrupted.
  3. **Watch the cutscene:** Main 1 starts on a downbeat within 2 s of the silhouette appearing, and the Intro fades out over about half a second.
  4. **Skip early:** same as 3, starting from the jump.
  5. **Pause, level-up and dying:** the music does not change.
  6. **Game over, then Play Again:** the gameplay music keeps going through the replayed cutscene.
  7. **Game over, then Change Monster:** the gameplay music fades out over 1 s and the Intro starts from its top.
  8. **Pause, then Exit to title:** same as 7.
  9. **Main 1 to Main 2:** temporarily set the encode `MAIN1_END` to 20 in a scratch copy of the files, or wait the full 207.9 s. Main 2 starts right after Main 1's last hit.
  10. **Main 2 loop:** it loops start to end.
  11. **Network throttled to "Slow 3G" in DevTools:** reload, then tap PLAY quickly and skip. Music arrives late but in the right order. The Intro never plays over Main 1.
  12. **Handoff interrupted:** skip so the reveal plays, then immediately pause and Exit to title before Main 1 is heard. One Intro plays, with no doubled Intro and no Main 1 arriving later.

- [ ] **Step 3: iPhone check (Safari).** Do flows 1, 3 and 9. If Main 2 stays silent after Main 1, tap once: it must start (the `main2Pending` retry). Report what happened either way.

- [ ] **Step 4: Owner's ear checks.** Ask the owner to listen and confirm, or give new values for:
  - **The downbeat:** does Main 1 land on beat 1 of the Intro's bar? If not, add 0.5, 1.0 or 1.5 to `firstBar`, `loopStart` and `loopEnd`.
  - **The Intro's loop seam** at 96.031 → 42.031 s (it first plays about 96 s after the first tap). Runner-up seams: 44.031 → 98.031, 62.031 → 98.031 and 60.031 → 96.031.
  - **Main 1's end point** (`MAIN1_END` in `scripts/encode-music.sh`). Re-run the script after a change.
  - **The cloud after a skip** compared with the watched intro.

- [ ] **Step 5: Commit any tuning.**

```bash
git add -A src/config.ts scripts/encode-music.sh public/cdn-assets/audio
git commit -m "Music: tuning from the listening pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
