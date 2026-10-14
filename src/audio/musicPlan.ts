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
