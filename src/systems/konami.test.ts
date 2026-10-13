import { describe, it, expect } from 'vitest';
import { KONAMI, KonamiTracker } from './konami';

const key = (code: string) => ({ code, repeat: false });
const last = (xs: boolean[]) => xs[xs.length - 1];

describe('KonamiTracker', () => {
  it('fires on the last key of the full sequence', () => {
    const t = new KonamiTracker();
    const results = KONAMI.map((c) => t.push(key(c)));
    expect(results.slice(0, -1).every((r) => !r)).toBe(true);
    expect(last(results)).toBe(true);
  });

  it('resets after firing, so the sequence must be entered again', () => {
    const t = new KonamiTracker();
    KONAMI.forEach((c) => t.push(key(c)));
    expect(t.push(key('KeyA'))).toBe(false);
    expect(last(KONAMI.map((c) => t.push(key(c))))).toBe(true);
  });

  it('a wrong key breaks the sequence', () => {
    const t = new KonamiTracker();
    const seq = [...KONAMI.slice(0, 5), 'KeyX', ...KONAMI.slice(5)];
    expect(seq.some((c) => t.push(key(c)))).toBe(false);
  });

  it('an extra leading Up still matches (restarts mid-sequence)', () => {
    const t = new KonamiTracker();
    expect(last(['ArrowUp', ...KONAMI].map((c) => t.push(key(c))))).toBe(true);
  });

  it('ignores key repeats', () => {
    const t = new KonamiTracker();
    t.push(key('ArrowUp'));
    t.push({ code: 'ArrowUp', repeat: true });
    expect(last(KONAMI.slice(1).map((c) => t.push(key(c))))).toBe(true);
  });
});
