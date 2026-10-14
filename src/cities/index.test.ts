import { describe, it, expect } from 'vitest';
import { CITIES, pickCity } from './index';
import { TOKYO } from './tokyo';

describe('pickCity', () => {
  it('picks from the city list; with only Tokyo, always Tokyo', () => {
    expect(CITIES).toEqual([TOKYO]);
    for (const r of [0, 0.3, 0.999]) expect(pickCity(() => r)).toBe(TOKYO);
  });
});
