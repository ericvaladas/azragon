import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { demonGeometry, demonPose, DEMON_GRASP } from './demonModel';

const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

describe('demon figure model', () => {
  it('stands 1 tall on the ground facing +Z, the claws its most forward part', () => {
    const g = demonGeometry();
    const b = bounds(g);
    expect(b.min.y).toBeCloseTo(0, 2);
    expect(b.max.y).toBeCloseTo(1, 1);
    // The claws reach out ahead of the head and body.
    expect(b.max.z).toBeGreaterThan(0.3);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let front = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > b.max.z - 0.05) front = Math.max(front, pos.getY(i));
    expect(front).toBeGreaterThan(0.5);
  });

  it('is vertex coloured', () => {
    expect(demonGeometry().getAttribute('color')).toBeDefined();
  });
});

describe('demonPose', () => {
  it('rises by the grasp, clutches at it, sinks only over the drag', () => {
    expect(demonPose(0).rise).toBe(0);
    expect(demonPose(DEMON_GRASP).rise).toBe(1);
    expect(demonPose(DEMON_GRASP - 0.05).clutch).toBe(0);
    expect(demonPose(DEMON_GRASP + 0.05).clutch).toBeGreaterThan(0);
    expect(demonPose(0.5).sink).toBe(0);
    expect(demonPose(1).sink).toBe(1);
    expect(demonPose(1).clutch).toBe(1);
  });
});

describe('DemonFigures', () => {
  it('closes the claws (and the husk) on the victim at the grasp, ground or air, and sinks it under by the end', async () => {
    const { DemonFigures } = await import('./DemonFigures');
    const figs = new DemonFigures(new THREE.Scene());
    const centre = new THREE.Vector3(0, 0, 0);
    const victims = [new THREE.Vector3(500, 10, -300), new THREE.Vector3(-200, 400, 600)];
    for (const v of victims) figs.spawn(v, 30, centre);
    const husks = (figs as unknown as { husks: THREE.InstancedMesh }).husks;
    const at = (i: number) => {
      const m = new THREE.Matrix4();
      husks.getMatrixAt(i, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    };
    figs.update(DEMON_GRASP + 0.1);
    victims.forEach((v, i) => expect(at(i).distanceTo(v)).toBeLessThan(1e-6));
    figs.update(1);
    for (let i = 0; i < victims.length; i++) expect(at(i).y).toBeLessThan(0);
  });
});
