import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { CONFIG } from '../config';
import { musicStep, type MusicAction, type MusicEvent, type TrackId } from './musicPlan';

const M = CONFIG.music;
/** A two-sample silent WAV. Playing it inside the first gesture lets iOS play each element later without one. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
type Stream = { el: HTMLAudioElement; gain: GainNode; ready: boolean; pending: boolean };

const report = (e: unknown): void => RundotGameAPI.error('[music]', e);

/**
 * The soundtrack, driven by game events through musicStep.
 * - The first gesture starts the Intro, which loops as a whole file.
 * - The silhouette reveal crossfades the Intro into Main 1 at once, over `crossfade` s.
 * - Main 2 follows Main 1 and loops.
 * - A menu brings the Intro back.
 *
 * Every track streams from its CDN URL in an <audio> element routed through a gain node (iOS ignores an element's
 * own volume), so none is ever fully downloaded up front or decoded. Safari plays media only from a URL it can
 * range-request with a real audio type, which a blob URL from fetchAsset is not.
 */
export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing: TrackId | null = null;
  private srcs: Record<TrackId, Promise<string>>;
  private streams: Partial<Record<TrackId, Stream>> = {};
  private disposed = false;
  private muted = false;

  constructor() {
    const resolve = (file: string) => RundotGameAPI.cdn.resolveAssetUrl(file);
    this.srcs = { intro: resolve(M.intro.file), main1: resolve(M.main1.file), main2: resolve(M.main2.file) };
    // Failures are reported where each promise is used; these keep an unused rejection from going unhandled.
    for (const p of Object.values(this.srcs)) p.catch(() => {});
  }

  /** Call on every user gesture. The first creates the audio graph and starts the Intro; any later one retries a blocked track. */
  unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : M.volume;
      this.master.connect(this.ctx.destination);
      for (const id of ['intro', 'main1', 'main2'] as const) this.setUp(id);
    }
    // Anything but running or closed: suspended before the first gesture, or 'interrupted' on iOS after a call or Siri.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(report);
    for (const id of ['intro', 'main1', 'main2'] as const) if (this.streams[id]?.pending) this.play(id);
    this.send('unlock');
  }

  /** Silence the music or bring it back (a short fade). The tracks keep playing underneath, so the soundtrack stays in step with the game. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(muted ? 0 : M.volume, now + 0.25);
  }

  /** The silhouette reveal started. */
  reveal(): void {
    if (this.ctx) this.send('reveal');
  }

  /** Entered the monster select or title screen. */
  enterMenu(): void {
    if (this.ctx) this.send('menu');
  }

  dispose(): void {
    this.disposed = true;
    for (const s of Object.values(this.streams)) s.el.pause();
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
        if (a.fadeOut) this.fadeOut(a.fadeOut, M.returnFade);
        this.play('intro');
        break;
      case 'handoff':
        this.fadeOut('intro', M.crossfade);
        this.play('main1', M.crossfade);
        break;
      case 'startMain2':
        this.play('main2');
        break;
    }
  }

  /** An element primed with a silent clip inside the first gesture (iOS), given its song's URL once it has resolved. */
  private setUp(id: TrackId): void {
    const ctx = this.ctx!;
    const el = new Audio();
    // A cross-origin element feeds Web Audio silence unless fetched with CORS.
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = SILENT_WAV;
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain).connect(this.master!);
    const s: Stream = { el, gain, ready: false, pending: false };
    this.streams[id] = s;
    el.play().catch(() => {});
    this.srcs[id]
      .then((url) => {
        if (this.disposed) return;
        el.loop = id !== 'main1';
        el.src = url;
        if (id === 'main1') el.onended = () => this.playing === 'main1' && this.send('main1Ended');
        s.ready = true;
        if (s.pending) this.play(id);
      })
      .catch(report);
  }

  /** `id` from its top (or on from where it is, if still sounding), fading in over `fadeIn` s (0: full at once). Retried when it loads or on the next gesture if it can't play yet. */
  private play(id: TrackId, fadeIn = 0): void {
    const s = this.streams[id];
    if (!s || this.playing !== id) return;
    s.pending = true;
    if (!s.ready) return;
    const g = s.gain.gain;
    const now = this.ctx!.currentTime;
    // A track still sounding (caught mid-fade-out) carries on from where it is; a stopped one starts from its top.
    const sounding = !s.el.paused;
    g.cancelScheduledValues(now);
    g.setValueAtTime(fadeIn > 0 ? (sounding ? g.value : 0) : 1, now);
    if (fadeIn > 0) g.linearRampToValueAtTime(1, now + fadeIn);
    if (!sounding) s.el.currentTime = 0;
    s.el
      .play()
      .then(() => {
        s.pending = false;
      })
      .catch(() => {});
  }

  /** Fade `id` to silence over `dur` s, then pause it and rewind it (unless it has become the playing track again). */
  private fadeOut(id: TrackId, dur: number): void {
    const s = this.streams[id];
    if (!s) return;
    s.pending = false;
    const g = s.gain.gain;
    const now = this.ctx!.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + dur);
    setTimeout(() => {
      if (this.playing === id) return;
      s.el.pause();
      s.el.currentTime = 0;
    }, dur * 1000 + 50);
  }
}
