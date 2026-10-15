import { describe, it, expect } from 'vitest';
import { MUSIC_KEY, VOLUME_KEY, loadMusicOn, loadVolume, parseMusicOn, parseVolume, saveMusicOn, saveVolume } from './musicPref';

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

  it('reads the volume as 0..1, full when missing or invalid', () => {
    expect(parseVolume(null)).toBe(1);
    expect(parseVolume(undefined)).toBe(1);
    expect(parseVolume('')).toBe(1);
    expect(parseVolume('junk')).toBe(1);
    expect(parseVolume('0')).toBe(0);
    expect(parseVolume('0.4')).toBe(0.4);
    expect(parseVolume('3')).toBe(1);
    expect(parseVolume('-1')).toBe(0);
  });

  it('loads and saves the volume through the store, surviving a missing or failing store', async () => {
    const data = new Map<string, string>();
    const store = { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => void data.set(k, v) };
    expect(await loadVolume(store)).toBe(1);
    await saveVolume(store, 0.25);
    expect(await loadVolume(store)).toBe(0.25);
    const failing = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } };
    expect(await loadVolume(failing)).toBe(1);
    await expect(saveVolume(failing, 0.5)).resolves.toBeUndefined();
    expect(await loadVolume(null)).toBe(1);
  });

  it('uses storage keys the RUN SDK accepts (no dots, no leading __)', () => {
    for (const k of [MUSIC_KEY, VOLUME_KEY]) {
      expect(k).not.toContain('.');
      expect(k.startsWith('__')).toBe(false);
    }
    expect(MUSIC_KEY).not.toContain('.');
    expect(MUSIC_KEY.startsWith('__')).toBe(false);
  });
});
