import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';

const lum = (hex: number) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('crater colours', () => {
  it('are a dark, scorched earth (well darker than the old bright ochre), burnt darkest at the centre', () => {
    const P = CONFIG.palette;
    expect(lum(P.crater)).toBeLessThan(lum(P.ochre) * 0.45);
    expect(lum(P.craterScorch)).toBeLessThan(lum(P.crater));
    expect(lum(P.craterFleck)).toBeGreaterThan(lum(P.crater));
  });
});
