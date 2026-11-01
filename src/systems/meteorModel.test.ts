import { describe, it, expect } from 'vitest';
import { meteorGeometry } from './meteorModel';

describe('meteorGeometry', () => {
  const geo = meteorGeometry();
  const pos = geo.getAttribute('position');
  const key = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(4)).join(',');
  const verts = new Set(Array.from({ length: pos.count }, (_, i) => key(i)));

  it('is one gem: six distinct corners, a single top apex and a single bottom apex', () => {
    expect(verts.size).toBe(6);
    const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i));
    const top = Math.max(...ys);
    const bottom = Math.min(...ys);
    expect(new Set(Array.from({ length: pos.count }, (_, i) => i).filter((i) => pos.getY(i) === top).map(key)).size).toBe(1);
    expect(new Set(Array.from({ length: pos.count }, (_, i) => i).filter((i) => pos.getY(i) === bottom).map(key)).size).toBe(1);
  });

  it('is about one unit tall, centred, and vertex-coloured', () => {
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    expect(b.max.y - b.min.y).toBeGreaterThan(0.9);
    expect(b.max.y - b.min.y).toBeLessThan(1.1);
    expect(b.max.y + b.min.y).toBeCloseTo(0);
    expect(geo.getAttribute('color').count).toBe(pos.count);
  });
});
