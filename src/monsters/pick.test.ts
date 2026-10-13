import { describe, it, expect } from 'vitest';
import { PICK_KEY, loadPick, parsePick, savePick, type PickStore } from './pick';

const store = (value: string | null, fail = false): PickStore & { saved: Record<string, string> } => {
  const saved: Record<string, string> = {};
  return {
    saved,
    getItem: async () => {
      if (fail) throw new Error('no storage');
      return value;
    },
    setItem: async (k, v) => {
      if (fail) throw new Error('no storage');
      saved[k] = v;
    },
  };
};

describe('pick', () => {
  it('parses a saved monster id and falls back to the Insect on anything else', () => {
    expect(parsePick('insect')).toBe('insect');
    expect(parsePick(null)).toBe('insect');
    expect(parsePick(undefined)).toBe('insect');
    expect(parsePick('kraken')).toBe('insect');
    expect(parsePick('{"x":1}')).toBe('insect');
  });
  it('loads through the store, surviving a missing or failing store', async () => {
    expect(await loadPick(store('insect'))).toBe('insect');
    expect(await loadPick(store('garbage'))).toBe('insect');
    expect(await loadPick(store(null, true))).toBe('insect');
    expect(await loadPick(null)).toBe('insect');
  });
  it('saves under the azragon key and never throws', async () => {
    const s = store(null);
    await savePick(s, 'insect');
    expect(s.saved[PICK_KEY]).toBe('insect');
    await expect(savePick(store(null, true), 'insect')).resolves.toBeUndefined();
    await expect(savePick(null, 'insect')).resolves.toBeUndefined();
  });

  it('uses a storage key the RUN SDK accepts (no dots, no leading __)', () => {
    expect(PICK_KEY).not.toContain('.');
    expect(PICK_KEY.startsWith('__')).toBe(false);
    expect(PICK_KEY.length).toBeGreaterThan(0);
  });
});
