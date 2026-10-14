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
    expect(nextBarDelay(9.9, G, LEAD)).toBeCloseTo(0.131);
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
