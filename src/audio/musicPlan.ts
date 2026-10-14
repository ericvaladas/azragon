/** The soundtrack's tracks: the calm Intro, then the fight music (Main 1 once, then Main 2 looping). */
export type TrackId = 'intro' | 'main1' | 'main2';
/** `unlock`: a user gesture. `reveal`: the silhouette reveal. `menu`: entering select or title. `main1Ended`: Main 1 played out. */
export type MusicEvent = 'unlock' | 'reveal' | 'menu' | 'main1Ended';
export type MusicAction =
  | { kind: 'none' }
  /** Start the Intro from its top, fading out `fadeOut` if it plays. */
  | { kind: 'startIntro'; fadeOut: 'main1' | 'main2' | null }
  /** Crossfade from the Intro into Main 1, which starts from its top. */
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
