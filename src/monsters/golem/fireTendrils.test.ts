import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickTendril } from './FireTendrils';

describe('pickTendril', () => {
  const roots = [new THREE.Vector3(150, 600, 0), new THREE.Vector3(-150, 600, 0), new THREE.Vector3(0, 650, -150)];

  it('lashes with the tendril whose root is nearest the flyer', () => {
    expect(pickTendril(roots, new THREE.Vector3(900, 800, 100))).toBe(0);
    expect(pickTendril(roots, new THREE.Vector3(-900, 800, 100))).toBe(1);
    expect(pickTendril(roots, new THREE.Vector3(0, 900, -1200))).toBe(2);
  });
});
