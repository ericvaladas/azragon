import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { PODS, bodyGeometry, podGeometry, rotorDiscGeometry, rotorGeometry, rotorHubAt } from './ospreyModel';

const S = CONFIG.osprey.size;
const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('Osprey model', () => {
  it('is a vertex-coloured airframe about `size` long, with the pods at the wingtips', () => {
    const body = bodyGeometry();
    expect(body.getAttribute('color')).toBeDefined();
    expect(podGeometry().getAttribute('color')).toBeDefined();
    const b = bounds(body);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.9 * S);
    expect(b.max.z - b.min.z).toBeLessThan(1.1 * S);
    expect(PODS[0].x).toBeCloseTo(b.max.x, 0);
    expect(PODS[1].x).toBeCloseTo(b.min.x, 0);
  });

  it('swivels the rotor hub from in front of its pod (tilt 0) to above it (tilt π/2)', () => {
    const pivot = PODS[0];
    const fwd = rotorHubAt(pivot, 0, new THREE.Vector3());
    expect(fwd.z).toBeGreaterThan(pivot.z);
    expect(fwd.y).toBeCloseTo(pivot.y, 6);
    const up = rotorHubAt(pivot, Math.PI / 2, new THREE.Vector3());
    expect(up.y).toBeGreaterThan(pivot.y);
    expect(up.z).toBeCloseTo(pivot.z, 6);
  });

  it('sizes the rotors so the two discs clear each other between the wingtips', () => {
    const r = bounds(rotorGeometry());
    const radius = Math.max(r.max.x, r.max.y);
    expect(bounds(rotorDiscGeometry()).max.x).toBeCloseTo(radius, 0);
    expect(PODS[0].x - PODS[1].x).toBeGreaterThan(2 * radius);
  });
});
