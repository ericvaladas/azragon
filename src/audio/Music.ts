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
  /** The Intro being handed over from, and the audio-clock time Main 1 starts; cleared once the Intro has stopped. */
  private handing: { intro: BufferTrack & { zero: number }; at: number } | null = null;
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

  /** Call on every user gesture (pointer or touch press and release, key). The first creates the audio graph and starts the Intro; any later one retries a blocked Main 2. */
  unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = M.volume;
      this.master.connect(this.ctx.destination);
      this.setUpMain2(this.ctx, this.master);
    }
    // Anything but running or closed: suspended before the first gesture, or 'interrupted' on iOS after a call or Siri.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(report);
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
          // The Intro is stopped after its fade by a timer, not by stop(at + fade): a menu before `at` keeps it playing.
          this.handing = { intro, at };
          this.rampDown(intro.gain, at, M.handoffFade);
          setTimeout(() => {
            if (this.handing?.intro === intro) this.handing = null;
            if (this.intro === intro || this.disposed) return;
            intro.src.stop();
            delete this.buffers.intro;
          }, (at + M.handoffFade - now) * 1000 + 100);
        }
      })
      .catch(report);
  }

  /** Ramp a gain to silence from `at` over `dur` s. */
  private rampDown(gain: GainNode, at: number, dur: number): void {
    const g = gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0, at + dur);
  }

  /** Fade the gameplay track out over `dur` s from now, for a menu's return to the Intro. */
  private fadeOutTrack(id: 'main1' | 'main2', dur: number): void {
    const now = this.ctx!.currentTime;
    if (id === 'main1' && this.main1) {
      const t = this.main1;
      const h = this.handing;
      this.main1 = null;
      t.src.onended = () => delete this.buffers.main1;
      if (h && now < h.at) {
        // Main 1 has not started: it never does, and the Intro it was taking over from plays on at full volume.
        this.handing = null;
        t.src.stop();
        h.intro.gain.gain.cancelScheduledValues(now);
        h.intro.gain.gain.setValueAtTime(1, now);
        this.intro = h.intro;
        return;
      }
      this.rampDown(t.gain, now, dur);
      t.src.stop(now + dur);
    }
    if (id === 'main2' && this.main2) {
      const m = this.main2;
      this.main2Pending = false;
      this.rampDown(m.gain, now, dur);
      setTimeout(() => {
        if (this.playing === 'main2') return;
        m.el.pause();
        m.el.currentTime = 0;
      }, dur * 1000 + 50);
    }
  }

  /**
   * The Main 2 element: play() on a silent clip inside the first gesture lets it play later without one (iOS).
   * The song replaces the clip as soon as it has downloaded, whether or not that play() has settled.
   */
  private setUpMain2(ctx: AudioContext, master: GainNode): void {
    const el = new Audio();
    el.preload = 'auto';
    el.src = SILENT_WAV;
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain).connect(master);
    const main2 = { el, gain, ready: false };
    this.main2 = main2;
    el.play().catch(() => {});
    this.main2Blob
      .then((blob) => {
        if (this.disposed) return;
        this.main2Url = URL.createObjectURL(blob);
        el.loop = true;
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
