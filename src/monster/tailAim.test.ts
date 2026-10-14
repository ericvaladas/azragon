import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { tailAimPoints } from './tailAim';

const BASE = [
  new THREE.Vector3(0, 350, -380),
  new THREE.Vector3(0, 460, -446),
  new THREE.Vector3(0, 559, -330),
  new THREE.Vector3(0, 570, -176),
  new THREE.Vector3(0, 526, -66),
];
const dirOfTip = (p: THREE.Vector3[]) => p[p.length - 1]!.clone().sub(p[p.length - 2]!).normalize();
const segLen = (p: THREE.Vector3[], i: number) => p[i]!.distanceTo(p[i + 1]!);

describe('tailAimPoints', () => {
  it('leaves the tail at rest with no weight', () => {
    const p = tailAimPoints(BASE, new THREE.Vector3(800, 0, 900), 0);
    p.forEach((q, i) => expect(q.distanceTo(BASE[i]!)).toBeLessThan(1e-6));
  });

  it('at full weight the tip segment points straight at the target, ahead, beside or behind', () => {
    for (const target of [new THREE.Vector3(0, 0, 1500), new THREE.Vector3(1200, 100, 300), new THREE.Vector3(-900, 0, -1200), new THREE.Vector3(200, 900, 400)]) {
      const p = tailAimPoints(BASE, target, 1);
      const want = target.clone().sub(p[p.length - 2]!).normalize();
      expect(dirOfTip(p).dot(want)).toBeGreaterThan(0.999);
    }
  });

  it('keeps the root where it joins the body and every segment its length', () => {
    const p = tailAimPoints(BASE, new THREE.Vector3(1200, 0, 600), 1);
    expect(p[0]!.distanceTo(BASE[0]!)).toBeLessThan(1e-6);
    for (let i = 0; i < BASE.length - 1; i++) expect(segLen(p, i)).toBeCloseTo(segLen(BASE, i), 3);
  });

  it('swings the whole tail toward a target off to the side, so it is not aiming across its own back', () => {
    const p = tailAimPoints(BASE, new THREE.Vector3(1500, 0, 0), 1);
    expect(p[2]!.x).toBeGreaterThan(20);
  });

  it('moves part of the way at partial weight', () => {
    const target = new THREE.Vector3(0, 0, 1500);
    const full = dirOfTip(tailAimPoints(BASE, target, 1));
    const half = dirOfTip(tailAimPoints(BASE, target, 0.5));
    const rest = dirOfTip(BASE);
    expect(half.angleTo(full)).toBeLessThan(rest.angleTo(full));
    expect(half.angleTo(full)).toBeGreaterThan(0.01);
  });
});
