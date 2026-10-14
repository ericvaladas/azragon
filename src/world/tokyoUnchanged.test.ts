import { describe, it, expect } from 'vitest';
import { TOKYO } from '../cities/tokyo';
import { generateChunk } from './chunks';

/** FNV-1a over a string, as hex. */
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};

describe('Tokyo chunks', () => {
  it('generate exactly the content recorded before Toronto\'s corridor and lawns (chunks x −5..5, z −8..4), with no lawns', () => {
    let all = '';
    for (let cx = -5; cx <= 5; cx++) for (let cz = -8; cz <= 4; cz++) {
      const { lawns, ...rest } = generateChunk(TOKYO, 1337, cx, cz);
      expect(lawns, `${cx},${cz}`).toEqual([]);
      all += fnv(JSON.stringify(rest));
    }
    expect(fnv(all)).toBe('9a170801');
  });
});
