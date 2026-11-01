import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ballistic, launchArc, spikeTargets } from './projectileMath';

describe('ballistic', () => {
  const a = new THREE.Vector3(0, 0, 0);
  const b = new THREE.Vector3(100, 50, 0);
  it('starts at from and ends at to', () => {
    expect(ballistic(a, b, 80, 0, new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    const end = ballistic(a, b, 80, 1, new THREE.Vector3());
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
  it('peaks arc above the straight line at the midpoint', () => {
    const mid = ballistic(a, b, 80, 0.5, new THREE.Vector3());
    expect(mid.y).toBeCloseTo(25 + 80);
  });
});

describe('spikeTargets', () => {
  it('primary first, then other distinct targets, then repeats primary', () => {
    expect(spikeTargets('p', ['a', 'b'], 1)).toEqual(['p']);
    expect(spikeTargets('p', ['a', 'p', 'b'], 3)).toEqual(['p', 'a', 'b']);
    expect(spikeTargets('p', ['a'], 3)).toEqual(['p', 'a', 'p']);
  });
});

describe('launchArc', () => {
  const from = new THREE.Vector3(10, 300, 20);
  const to = new THREE.Vector3(-400, 0, 900);
  // Facing along -X.
  const at = (t: number) => launchArc(from, -1, 0, to, 300, 1500, t, new THREE.Vector3());

  it('starts at the tube and ends exactly on the target', () => {
    expect(at(0).distanceTo(from)).toBeLessThan(1e-9);
    expect(at(1).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('leaves level along the facing, whichever side the target is on', () => {
    const p = at(0.01);
    const moved = p.clone().sub(from);
    expect(-moved.x).toBeGreaterThan(5);
    expect(Math.abs(moved.y)).toBeLessThan(0.1 * -moved.x);
    expect(Math.abs(moved.z)).toBeLessThan(0.1 * -moved.x);
  });

  it('climbs over and comes straight down onto the target', () => {
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, at(t).y);
    expect(peak).toBeGreaterThan(600);
    const p = at(0.99);
    expect(Math.hypot(p.x - to.x, p.z - to.z)).toBeLessThan(0.1 * p.y);
  });
});
