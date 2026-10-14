import { describe, it, expect } from 'vitest';
import { musicStep, type MusicEvent, type TrackId } from './musicPlan';

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
