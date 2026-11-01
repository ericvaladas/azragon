import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { InsectTitanModel } from './InsectTitanModel';

/** Straight out behind and down (body space). */
const BRACE = new THREE.Vector3(0, -Math.sin(0.9), -Math.cos(0.9));
const pts = (m: InsectTitanModel) => (m['tailPts'] as THREE.Vector3[]).map((p) => p.clone());
const lengths = (ps: THREE.Vector3[]) => ps.slice(1).map((p, i) => p.distanceTo(ps[i]!));
/** Total turning along the tail (rad): how curled it is. */
const curl = (ps: THREE.Vector3[]) => {
  let sum = 0;
  for (let i = 2; i < ps.length; i++) {
    const a = ps[i - 1]!.clone().sub(ps[i - 2]!).normalize();
    const b = ps[i]!.clone().sub(ps[i - 1]!).normalize();
    sum += Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  }
  return sum;
};

describe('InsectTitanModel tail brace', () => {
  it('uncurls: every segment keeps its length and the curl only lessens as the brace grows', () => {
    const m = new InsectTitanModel();
    m.updateTail(0);
    const base = lengths(pts(m));
    let prev = Infinity;
    for (const w of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      m.updateTail(0, null, 0, null, 0, BRACE, w);
      const ps = pts(m);
      lengths(ps).forEach((l, i) => expect(l).toBeCloseTo(base[i]!, 3));
      const c = curl(ps);
      expect(c).toBeLessThanOrEqual(prev + 1e-6);
      prev = c;
    }
    expect(prev).toBeLessThan(1e-3);
  });

  it('fully braced, the tail lies straight along the brace direction', () => {
    const m = new InsectTitanModel();
    m.updateTail(0, null, 0, null, 0, BRACE, 1);
    const ps = pts(m);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!.clone().sub(ps[i - 1]!).normalize().dot(BRACE)).toBeGreaterThan(0.9999);
  });

  it('the root swings round over the back, never down through the body', () => {
    const m = new InsectTitanModel();
    for (const w of [0.2, 0.4, 0.6, 0.8]) {
      m.updateTail(0, null, 0, null, 0, BRACE, w);
      const ps = pts(m);
      // The first segment heads backward (−z) the whole way.
      expect(ps[1]!.z - ps[0]!.z).toBeLessThan(0);
    }
  });
});
