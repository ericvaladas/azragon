import { describe, it, expect } from 'vitest';
import { MUSIC_KEY, loadMusicOn, parseMusicOn, saveMusicOn } from './musicPref';

describe('music preference', () => {
  it('is on unless "off" was saved', () => {
    expect(parseMusicOn(null)).toBe(true);
    expect(parseMusicOn(undefined)).toBe(true);
    expect(parseMusicOn('on')).toBe(true);
    expect(parseMusicOn('junk')).toBe(true);
    expect(parseMusicOn('off')).toBe(false);
  });

  it('loads and saves through the store, surviving a missing or failing store', async () => {
    const data = new Map<string, string>();
    const store = { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => void data.set(k, v) };
    expect(await loadMusicOn(store)).toBe(true);
    await saveMusicOn(store, false);
    expect(data.get(MUSIC_KEY)).toBe('off');
    expect(await loadMusicOn(store)).toBe(false);
    await saveMusicOn(store, true);
    expect(await loadMusicOn(store)).toBe(true);
    const failing = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } };
    expect(await loadMusicOn(failing)).toBe(true);
    await expect(saveMusicOn(failing, false)).resolves.toBeUndefined();
    expect(await loadMusicOn(null)).toBe(true);
  });

  it('uses a storage key the RUN SDK accepts (no dots, no leading __)', () => {
    expect(MUSIC_KEY).not.toContain('.');
    expect(MUSIC_KEY.startsWith('__')).toBe(false);
  });
});
