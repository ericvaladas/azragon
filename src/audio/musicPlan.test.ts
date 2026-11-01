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
    for (const t of ['intro', 'main1', 'rest1', 'boss1'] as const) expect(musicStep(t, 'unlock').action.kind).toBe('none');
  });
  it('hands over from the Intro to Main 1 on the reveal, and ignores the reveal otherwise (Play Again)', () => {
    expect(musicStep('intro', 'reveal')).toEqual({ playing: 'main1', action: { kind: 'handoff' } });
    expect(musicStep('main1', 'reveal')).toEqual({ playing: 'main1', action: { kind: 'none' } });
    expect(musicStep('rest1', 'reveal')).toEqual({ playing: 'rest1', action: { kind: 'none' } });
    expect(musicStep(null, 'reveal')).toEqual({ playing: null, action: { kind: 'none' } });
  });
  it('calm crossfades Main 1 and Boss 1 into Rest 1', () => {
    expect(musicStep('main1', 'calm')).toEqual({ playing: 'rest1', action: { kind: 'crossfade', from: 'main1', to: 'rest1' } });
    expect(musicStep('boss1', 'calm')).toEqual({ playing: 'rest1', action: { kind: 'crossfade', from: 'boss1', to: 'rest1' } });
  });
  it('fight crossfades Rest 1 and Boss 1 into Main 1', () => {
    expect(musicStep('rest1', 'fight')).toEqual({ playing: 'main1', action: { kind: 'crossfade', from: 'rest1', to: 'main1' } });
    expect(musicStep('boss1', 'fight')).toEqual({ playing: 'main1', action: { kind: 'crossfade', from: 'boss1', to: 'main1' } });
  });
  it('boss crossfades Main 1 and Rest 1 into Boss 1', () => {
    expect(musicStep('main1', 'boss')).toEqual({ playing: 'boss1', action: { kind: 'crossfade', from: 'main1', to: 'boss1' } });
    expect(musicStep('rest1', 'boss')).toEqual({ playing: 'boss1', action: { kind: 'crossfade', from: 'rest1', to: 'boss1' } });
  });
  it('calm, fight and boss change nothing from the Intro, silence or their own track', () => {
    for (const t of [null, 'intro', 'rest1'] as const) expect(musicStep(t, 'calm')).toEqual({ playing: t, action: { kind: 'none' } });
    for (const t of [null, 'intro', 'main1'] as const) expect(musicStep(t, 'fight')).toEqual({ playing: t, action: { kind: 'none' } });
    for (const t of [null, 'intro', 'boss1'] as const) expect(musicStep(t, 'boss')).toEqual({ playing: t, action: { kind: 'none' } });
  });
  it('brings the Intro back on a menu from each gameplay track, fading that track; no change from the Intro or silence', () => {
    for (const t of ['main1', 'rest1', 'boss1'] as const) {
      expect(musicStep(t, 'menu')).toEqual({ playing: 'intro', action: { kind: 'startIntro', fadeOut: t } });
    }
    expect(musicStep('intro', 'menu').action.kind).toBe('none');
    expect(musicStep(null, 'menu').action.kind).toBe('none');
  });
  it('Play Again after dying mid-boss lands on Main 1', () => {
    expect(run(['unlock', 'reveal', 'boss', 'fight']).playing).toBe('main1');
  });
  it('walks a session: unlock, reveal, calm, boss, calm, fight, menu', () => {
    const r = run(['unlock', 'reveal', 'calm', 'boss', 'calm', 'fight', 'menu']);
    expect(r.kinds).toEqual(['startIntro', 'handoff', 'crossfade', 'crossfade', 'crossfade', 'crossfade', 'startIntro']);
    expect(r.playing).toBe('intro');
  });
  it('walks a whole session: run, Play Again, Change Monster, a second run', () => {
    const r = run(['menu', 'unlock', 'menu', 'reveal', 'calm', 'reveal', 'menu', 'reveal']);
    expect(r.kinds).toEqual(['none', 'startIntro', 'none', 'handoff', 'crossfade', 'none', 'startIntro', 'handoff']);
    expect(r.playing).toBe('main1');
  });
  it('brings the Intro back when a menu comes before Main 1 has started (handoff window)', () => {
    const r = run(['unlock', 'reveal', 'menu']);
    expect(r.kinds).toEqual(['startIntro', 'handoff', 'startIntro']);
    expect(r.playing).toBe('intro');
    expect(musicStep('main1', 'menu').action).toEqual({ kind: 'startIntro', fadeOut: 'main1' });
  });
});
