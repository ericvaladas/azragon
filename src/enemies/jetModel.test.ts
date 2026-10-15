import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { burnerGeometry, jetGeometry } from './jetModel';

describe('jet model', () => {
  it('is about CONFIG.jet.size long, nose toward +Z, and fits inside the hit radius', () => {
    const box = new THREE.Box3().setFromBufferAttribute(jetGeometry().getAttribute('position') as THREE.BufferAttribute);
    const S = CONFIG.jet.size;
    expect(box.max.z).toBeCloseTo(0.5 * S, 3);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.9 * S);
    expect(box.max.z - box.min.z).toBeLessThan(1.1 * S);
    expect(box.max.x - box.min.x).toBeLessThan(S);
    for (const v of [box.min, box.max]) expect(v.length()).toBeLessThan(CONFIG.jet.hitRadius);
  });

  it('vertex-colours the airframe and puts the afterburner behind the nozzle', () => {
    expect(jetGeometry().getAttribute('color')).toBeDefined();
    const flame = new THREE.Box3().setFromBufferAttribute(burnerGeometry().getAttribute('position') as THREE.BufferAttribute);
    expect(flame.max.z).toBeLessThan(-0.45 * CONFIG.jet.size);
  });
});
