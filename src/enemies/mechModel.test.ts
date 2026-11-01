import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MECH_PIVOTS, mechParts, type MechParts } from './mechModel';

const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

/** Where each part's origin sits on the standing mech. */
function pivotOf(name: keyof MechParts): THREE.Vector3 {
  const P = MECH_PIVOTS;
  switch (name) {
    case 'legL': return new THREE.Vector3(P.hipX, P.hipY, 0);
    case 'legR': return new THREE.Vector3(-P.hipX, P.hipY, 0);
    case 'pelvis': return new THREE.Vector3(0, P.hipY, 0);
    case 'torso': return new THREE.Vector3(0, P.waistY, 0);
    case 'head':
    case 'visor': return new THREE.Vector3(0, P.neckY, 0);
    case 'armL': return new THREE.Vector3(P.shoulderX, P.shoulderY, 0);
    case 'armR': return new THREE.Vector3(-P.shoulderX, P.shoulderY, 0);
  }
}

const placed = (parts: MechParts, name: keyof MechParts) => bounds(parts[name]).translate(pivotOf(name));

describe('mech model', () => {
  it('parts are vertex-coloured and stand one unit tall', () => {
    const parts = mechParts();
    const all = new THREE.Box3();
    for (const name of Object.keys(parts) as (keyof MechParts)[]) all.union(placed(parts, name));
    expect(all.min.y).toBeCloseTo(0, 2);
    expect(all.max.y).toBeGreaterThan(0.98);
    expect(all.max.y).toBeLessThan(1.02);
    // About 0.45 of its height across (CONFIG.mech.width), and much less deep than tall.
    expect(all.max.x - all.min.x).toBeGreaterThan(0.38);
    expect(all.max.x - all.min.x).toBeLessThan(0.52);
    expect(all.max.z - all.min.z).toBeLessThan(0.5);
  });

  it('fists reach below the hips and in front of the torso', () => {
    const parts = mechParts();
    const torso = placed(parts, 'torso');
    for (const arm of ['armL', 'armR'] as const) {
      const b = placed(parts, arm);
      expect(b.min.y).toBeLessThan(MECH_PIVOTS.hipY);
      expect(b.max.z).toBeGreaterThan(torso.max.z);
    }
    // The left arm hangs on the model's left (+X), the right arm on its right.
    expect(placed(parts, 'armL').min.x).toBeGreaterThan(0);
    expect(placed(parts, 'armR').max.x).toBeLessThan(0);
  });

  it('feet stand on the ground under the hips', () => {
    const parts = mechParts();
    for (const leg of ['legL', 'legR'] as const) expect(placed(parts, leg).min.y).toBeCloseTo(0, 3);
    expect(placed(parts, 'legL').min.x).toBeGreaterThan(0);
  });

  it('every part has a color attribute', () => {
    const parts = mechParts();
    for (const g of Object.values(parts)) {
      const c = g.getAttribute('color');
      expect(c).toBeDefined();
      expect(c.count).toBe(g.getAttribute('position').count);
    }
  });
});
