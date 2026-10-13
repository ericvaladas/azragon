import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { blobFlightTime, blobPoint, CLOUD, cloudPuff, JET } from './inkMath';

describe('blobFlightTime', () => {
  it('scales with distance at the jet speed', () => {
    const d = JET.speed * 0.2;
    expect(blobFlightTime(d)).toBeCloseTo(0.2);
  });

  it('is clamped so close shots still show a flight and far ones arrive fast', () => {
    expect(blobFlightTime(0)).toBe(JET.minTime);
    expect(blobFlightTime(1e6)).toBe(JET.maxTime);
    // Every Ink Cloud radius (500–700 m) arrives within a quarter second.
    for (const r of [500, 600, 700]) expect(blobFlightTime(r)).toBeLessThanOrEqual(0.25);
  });
});

describe('blobPoint', () => {
  const from = new THREE.Vector3(0, 100, 0);
  const to = new THREE.Vector3(600, 300, 0);

  it('starts at the siphon and ends at the shell', () => {
    expect(blobPoint(from, to, 0, new THREE.Vector3()).distanceTo(from)).toBeCloseTo(0);
    expect(blobPoint(from, to, 1, new THREE.Vector3()).distanceTo(to)).toBeCloseTo(0);
  });

  it('arcs up above the straight line mid-flight (a lobbed squirt, not a beam)', () => {
    const mid = blobPoint(from, to, 0.5, new THREE.Vector3());
    expect(mid.x).toBeCloseTo(300);
    expect(mid.y).toBeGreaterThan(200 + 10);
  });

  it('clamps k to 0..1', () => {
    expect(blobPoint(from, to, -1, new THREE.Vector3()).distanceTo(from)).toBeCloseTo(0);
    expect(blobPoint(from, to, 2, new THREE.Vector3()).distanceTo(to)).toBeCloseTo(0);
  });
});

describe('cloudPuff', () => {
  const out = { scale: 0, alpha: 0 };

  it('is invisible before its delay and after the cloud life', () => {
    expect(cloudPuff(0.05, 0.1, out).alpha).toBe(0);
    expect(cloudPuff(CLOUD.life, 0, out).alpha).toBe(0);
    expect(cloudPuff(CLOUD.life + 1, 0, out).scale).toBe(0);
  });

  it('billows out quickly then keeps swelling slowly', () => {
    const s0 = cloudPuff(0.02, 0, out).scale;
    const s1 = cloudPuff(CLOUD.growTime, 0, out).scale;
    const s2 = cloudPuff(CLOUD.fadeStart, 0, out).scale;
    expect(s0).toBeLessThan(s1);
    expect(s1).toBeLessThan(s2);
    expect(s1).toBeGreaterThan(0.9);
  });

  it('holds full opacity until fadeStart, then thins out monotonically to zero', () => {
    expect(cloudPuff(0.3, 0, out).alpha).toBe(1);
    expect(cloudPuff(CLOUD.fadeStart, 0, out).alpha).toBe(1);
    let prev = 1;
    for (let t = CLOUD.fadeStart + 0.05; t < CLOUD.life; t += 0.05) {
      const a = cloudPuff(t, 0, out).alpha;
      expect(a).toBeLessThan(prev);
      prev = a;
    }
    expect(cloudPuff(CLOUD.life - 1e-3, 0, out).alpha).toBeLessThan(0.02);
  });

  it('lingers about 1.5–2 s', () => {
    expect(CLOUD.life).toBeGreaterThanOrEqual(1.5);
    expect(CLOUD.life).toBeLessThanOrEqual(2.2);
    expect(CLOUD.fadeStart).toBeGreaterThan(0.6);
  });

  it('a delayed puff runs the same curve shifted by its delay (and still ends by the cloud life + delay)', () => {
    const a = cloudPuff(0.5, 0, { scale: 0, alpha: 0 });
    const b = cloudPuff(0.6, 0.1, { scale: 0, alpha: 0 });
    expect(b.scale).toBeCloseTo(a.scale);
    expect(b.alpha).toBeCloseTo(a.alpha);
  });
});
