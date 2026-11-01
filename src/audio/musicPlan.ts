/** The gameplay tracks, all looping: Main 1 for fighting the army, Rest 1 for the breaks, Boss 1 for the boss fight. */
export type GameTrack = 'main1' | 'rest1' | 'boss1';
/** The soundtrack's tracks: the calm Intro for the menus and cutscene, then the gameplay tracks. */
export type TrackId = 'intro' | GameTrack;
/** `unlock`: a user gesture. `reveal`: the silhouette reveal. `menu`: entering select or title. `calm`: a break began. `fight`: the army fight began or resumed. `boss`: the boss fight began. */
export type MusicEvent = 'unlock' | 'reveal' | 'menu' | 'calm' | 'fight' | 'boss';
export type MusicAction =
  | { kind: 'none' }
  /** Start the Intro from its top, fading out `fadeOut` if it plays. */
  | { kind: 'startIntro'; fadeOut: GameTrack | null }
  /** Crossfade from the Intro into Main 1, which starts from its top. */
  | { kind: 'handoff' }
  /** Crossfade between two gameplay tracks; `to` starts from its top. */
  | { kind: 'crossfade'; from: GameTrack; to: GameTrack };

const isGameTrack = (t: TrackId | null): t is GameTrack => t === 'main1' || t === 'rest1' || t === 'boss1';

/** Crossfades into `to` from any other gameplay track; no change from the Intro, silence or `to` itself. */
function toTrack(playing: TrackId | null, to: GameTrack): { playing: TrackId | null; action: MusicAction } {
  if (isGameTrack(playing) && playing !== to) return { playing: to, action: { kind: 'crossfade', from: playing, to } };
  return { playing, action: { kind: 'none' } };
}

/** Which track plays after `ev`, and what to do about it. Events that don't apply to `playing` change nothing. */
export function musicStep(playing: TrackId | null, ev: MusicEvent): { playing: TrackId | null; action: MusicAction } {
  switch (ev) {
    case 'unlock':
      if (playing === null) return { playing: 'intro', action: { kind: 'startIntro', fadeOut: null } };
      break;
    case 'reveal':
      if (playing === 'intro') return { playing: 'main1', action: { kind: 'handoff' } };
      break;
    case 'calm':
      return toTrack(playing, 'rest1');
    case 'fight':
      return toTrack(playing, 'main1');
    case 'boss':
      return toTrack(playing, 'boss1');
    case 'menu':
      if (isGameTrack(playing)) return { playing: 'intro', action: { kind: 'startIntro', fadeOut: playing } };
      break;
  }
  return { playing, action: { kind: 'none' } };
}
