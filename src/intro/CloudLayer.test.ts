import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import { cloudSpecs } from './CloudLayer';

const C = CONFIG.intro.clouds;

describe('cloudSpecs', () => {
  it('scatters the configured number of clouds through the band around the drop path', () => {
    const specs = cloudSpecs(mulberry32(5));
    expect(specs).toHaveLength(C.count);
    for (const s of specs) {
      expect(s.y).toBeGreaterThanOrEqual(C.minY);
      expect(s.y).toBeLessThanOrEqual(C.maxY);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(C.spreadX);
      expect(s.z).toBeGreaterThanOrEqual(C.minZ);
      expect(s.z).toBeLessThanOrEqual(C.maxZ);
      expect(s.size).toBeGreaterThanOrEqual(C.minSize);
      expect(s.size).toBeLessThanOrEqual(C.maxSize);
    }
    expect(cloudSpecs(mulberry32(5))).toEqual(specs);
  });
});
