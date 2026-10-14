import { describe, it, expect } from 'vitest';
import { CITIES, forcedCity, pickCity } from './index';
import { TOKYO } from './tokyo';
import { TORONTO } from './toronto';

describe('pickCity', () => {
  it('holds Tokyo and Toronto, and can return either', () => {
    expect(CITIES).toHaveLength(2);
    expect(CITIES[0]).toBe(TOKYO);
    expect(CITIES[1]).toBe(TORONTO);
    expect(pickCity(() => 0)).toBe(TOKYO);
    expect(pickCity(() => 0.49)).toBe(TOKYO);
    expect(pickCity(() => 0.5)).toBe(TORONTO);
    expect(pickCity(() => 0.999)).toBe(TORONTO);
  });
});

describe('forcedCity (dev ?city= override)', () => {
  it('follows the listed ids run by run, cycling through the list', () => {
    const s = '?city=tokyo,toronto,tokyo';
    expect([0, 1, 2, 3, 4].map((run) => forcedCity(s, run))).toEqual([TOKYO, TORONTO, TOKYO, TOKYO, TORONTO]);
    expect(forcedCity('?city=toronto', 7)).toBe(TORONTO);
  });

  it('ignores case and spaces, and skips unknown ids', () => {
    expect(forcedCity('?city=%20Toronto%20', 0)).toBe(TORONTO);
    expect(forcedCity('?city=paris,TOKYO', 0)).toBe(TOKYO);
    expect(forcedCity('?debug&city=toronto', 0)).toBe(TORONTO);
  });

  it('is null (so the run picks at random) without the parameter, when it is empty, or when no id is known', () => {
    for (const s of ['', '?', '?debug', '?city=', '?city=,', '?city=paris', '?city=paris,rome']) expect(forcedCity(s, 0), s).toBeNull();
  });
});
