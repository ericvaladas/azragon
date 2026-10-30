import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Target } from '../../combat';
import type { Particles } from '../../systems/Particles';
import { ShadowHands } from './ShadowHands';
import { DEVOUR_HAND_T, HAND_T } from './handMath';

const particles = { emit: () => {}, ring: () => {} } as unknown as Particles;
const unit = (x: number, y = 10): Target & { kill(): void } => {
  let alive = true;
  return {
    kind: 'tank', position: new THREE.Vector3(x, y, 0), radius: 30, airborne: y > 50,
    isAlive: () => alive, applyDamage: () => {}, kill: () => (alive = false),
  };
};
const husks = (h: ShadowHands) => (h as unknown as { husks: THREE.InstancedMesh }).husks;
const huskAt = (h: ShadowHands, i: number) => {
  const m = new THREE.Matrix4();
  husks(h).getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
};

describe('ShadowHands', () => {
  it('takes as many grabs as it was built for', () => {
    const h = new ShadowHands(new THREE.Scene(), { max: 24, husks: true });
    for (let i = 0; i < 30; i++) h.grab(unit(100 + i * 10), new THREE.Vector3());
    expect(h.count).toBe(24);
    expect(new ShadowHands(new THREE.Scene()).count).toBe(0);
  });

  it('with husks: a dark husk sits in the fist from the impact, on a taken victim, and is dragged under the ground', () => {
    const h = new ShadowHands(new THREE.Scene(), { max: 24, husks: true });
    const v = unit(400);
    const start = v.position.clone();
    h.grab(v, new THREE.Vector3());
    h.update(HAND_T.impact - 0.01, particles);
    expect(husks(h).count).toBe(0);
    v.kill();
    h.update(0.02, particles);
    expect(husks(h).count).toBe(1);
    expect(huskAt(h, 0).distanceTo(start)).toBeLessThan(60);
    // The real unit is left where it was (its system may reuse it); only the husk goes down.
    expect(v.position.equals(start)).toBe(true);
    h.update(HAND_T.drag - HAND_T.impact - 0.02, particles);
    expect(huskAt(h, 0).y).toBeLessThan(0);
  });

  it('a delayed hand waits before rising, and reports its victim once, the moment it closes', () => {
    const closed: Target[] = [];
    const h = new ShadowHands(new THREE.Scene(), { max: 4, husks: true, timing: DEVOUR_HAND_T, onImpact: (t) => closed.push(t) });
    const v = unit(400);
    h.grab(v, new THREE.Vector3(), 0.5);
    h.update(0.4, particles);
    expect((h as unknown as { core: THREE.InstancedMesh }).core.count).toBe(0);
    h.update(0.1 + DEVOUR_HAND_T.impact - 0.02, particles);
    expect(closed).toEqual([]);
    h.update(0.04, particles);
    expect(closed).toEqual([v]);
    h.update(0.5, particles);
    expect(closed).toEqual([v]);
  });

  it('reports whether any hand is still dragging, until the last drag ends', () => {
    const h = new ShadowHands(new THREE.Scene(), { max: 4, husks: true, timing: DEVOUR_HAND_T });
    expect(h.dragging()).toBe(false);
    h.grab(unit(400), new THREE.Vector3(), 0.3);
    expect(h.dragging()).toBe(true);
    h.update(0.3 + DEVOUR_HAND_T.drag - 0.05, particles);
    expect(h.dragging()).toBe(true);
    h.update(0.1, particles);
    expect(h.dragging()).toBe(false);
  });

  it('moves at a constant speed: a hand twice as far takes twice as long to close, and to drag its prize down', () => {
    const closed: [Target, number][] = [];
    let now = 0;
    const speed = 100;
    const h = new ShadowHands(new THREE.Scene(), { max: 4, husks: true, timing: DEVOUR_HAND_T, under: 1, speed, onImpact: (t) => closed.push([t, now]) });
    const near = unit(300, 100);
    const far = unit(-300, 200);
    h.grab(near, new THREE.Vector3());
    h.grab(far, new THREE.Vector3());
    const step = 1 / 120;
    for (; now < 5 && closed.length < 2; now += step) h.update(step, particles);
    const [a, b] = [closed.find(([t]) => t === near)![1], closed.find(([t]) => t === far)![1]];
    expect(a).toBeCloseTo(100 / speed, 1);
    expect(b).toBeCloseTo(200 / speed, 1);
    expect(h.dragging()).toBe(true);
    for (; now < 10 && h.dragging(); now += step) h.update(step, particles);
    // Down again at the same speed: the far hand's drag ends about 2 × 200 / speed after the start.
    expect(now).toBeCloseTo(DEVOUR_HAND_T.close + (2 * 200) / speed, 0);
  });
});
