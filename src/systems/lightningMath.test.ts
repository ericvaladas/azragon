import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { boltPath } from './lightningMath';

describe('boltPath', () => {
  it('bolt path: exact ends, segments + 1 points, inner points within jitter of the straight line', () => {
    const from = new THREE.Vector3(0, 3000, 0);
    const to = new THREE.Vector3(200, 0, -100);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = boltPath(from, to, 8, 60, rand, []);
    expect(out.length).toBe(9);
    expect(out[0]!.equals(from)).toBe(true);
    expect(out[8]!.equals(to)).toBe(true);
    const line = new THREE.Line3(from, to);
    const closest = new THREE.Vector3();
    for (const p of out.slice(1, -1)) expect(line.closestPointToPoint(p, false, closest).distanceTo(p)).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('reuses the vectors already in `out`', () => {
    const out = [new THREE.Vector3()];
    const first = out[0];
    boltPath(new THREE.Vector3(), new THREE.Vector3(0, 10, 0), 3, 1, Math.random, out);
    expect(out[0]).toBe(first);
  });
});
