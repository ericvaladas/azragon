import { describe, it, expect } from 'vitest';
import { coastDistance } from './coast';
import { coastDistance as tokyoCoastDistance, TOKYO_BAY, TOKYO_ISLAND } from './tokyo/layout';
import { isBay, isIsland, PITCH } from '../world/roads';

describe('coastDistance', () => {
  it('is metres inland from the coastline along the bay dir: offset at the origin, negative out at sea', () => {
    expect(coastDistance(TOKYO_BAY, 0, 0)).toBeCloseTo(2000);
    const far = 3000 * Math.SQRT1_2;
    expect(coastDistance(TOKYO_BAY, -far, -far)).toBeLessThan(0);
    expect(coastDistance({ dir: { x: 0, z: 1 }, offset: 2250, amp: 0, wavelength: 1500 }, 123, 2000)).toBeCloseTo(250);
  });

  it("agrees with isBay at every cell centre (off the island), and Tokyo's layout re-exports the same function", () => {
    const shore = { bay: TOKYO_BAY, island: TOKYO_ISLAND };
    for (let i = -40; i <= 20; i++) for (let j = -40; j <= 20; j++) {
      if (isIsland(shore, i, j)) continue;
      expect(isBay(shore, i, j), `${i},${j}`).toBe(coastDistance(TOKYO_BAY, PITCH * (i + 0.5), PITCH * (j + 0.5)) < 0);
    }
    expect(tokyoCoastDistance).toBe(coastDistance);
  });
});
