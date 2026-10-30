import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { DevourHands } from './DevourHands';

const unit = (y: number, radius = 30): Target => ({
  kind: y > 50 ? 'jet' : 'tank', position: new THREE.Vector3(300, y, 0), radius, airborne: y > 50,
  isAlive: () => true, applyDamage: () => {},
});
/** Seconds from the rise starting (no delay) until the hand takes its victim. */
const reachTime = (t: Target) => {
  let took = -1;
  let now = 0;
  const hands = new DevourHands(new THREE.Scene(), () => (took = now));
  hands.grab(t, new THREE.Vector3(), 0);
  for (; now < 20 && took < 0; now += 1 / 240) hands.update(1 / 240);
  return took;
};

describe('DevourHands', () => {
  it('reaches a flyer in airRiseTime, however high it is', () => {
    for (const y of [300, 650]) expect(reachTime(unit(y))).toBeCloseTo(CONFIG.wendigo.ultimate.hand.airRiseTime, 1);
  });

  it('rises to a ground target at its own steady speed', () => {
    const t = reachTime(unit(10));
    expect(t).toBeGreaterThan(CONFIG.wendigo.ultimate.hand.airRiseTime);
    expect(t).toBeLessThan(5);
    expect(CONFIG.wendigo.ultimate.hand.riseSpeed).toBeGreaterThan(0);
  });

  it('makes every hand the same size, whatever it grabs', () => {
    const hands = new DevourHands(new THREE.Scene(), () => {});
    hands.grab(unit(10, 30), new THREE.Vector3(), 0);
    hands.grab(unit(600, 90), new THREE.Vector3(), 0);
    const [a, b] = (hands as unknown as { hands: { hs: number }[] }).hands;
    expect(a!.hs).toBe(b!.hs);
  });

  it('sinks back under from a flyer in airSinkTime, however high it grabbed it', () => {
    for (const y of [300, 650]) {
      const hands = new DevourHands(new THREE.Scene(), () => {});
      hands.grab(unit(y), new THREE.Vector3(), 0);
      const h = (hands as unknown as { hands: { state: { phase: string } }[] }).hands[0]!;
      let now = 0;
      for (; now < 30 && h.state.phase !== 'sink'; now += 1 / 240) hands.update(1 / 240);
      const from = now;
      for (; now < 30 && hands.count > 0; now += 1 / 240) hands.update(1 / 240);
      expect(now - from).toBeCloseTo(CONFIG.wendigo.ultimate.hand.airSinkTime, 1);
    }
  });

  it('reaches up on a whole, nearly straight arm that moves as one piece, its shoulder just under the ground at the grasp', () => {
    for (const y of [10, 650]) {
      const hands = new DevourHands(new THREE.Scene(), () => {});
      hands.grab(unit(y), new THREE.Vector3(), 0);
      const h = (hands as unknown as { hands: { state: { phase: string }; upper: number; fore: number }[] }).hands[0]!;
      const joints = (hands as unknown as { joints: THREE.InstancedMesh }).joints;
      const at = (i: number) => {
        const m = new THREE.Matrix4();
        joints.getMatrixAt(i, m);
        return new THREE.Vector3().setFromMatrixPosition(m);
      };
      // Mid-rise, then at the grasp: the same shape, only moved.
      for (let t = 0; t < 0.2; t += 1 / 240) hands.update(1 / 240);
      const early = at(1).sub(at(0));
      for (let t = 0; t < 20 && h.state.phase !== 'close'; t += 1 / 240) hands.update(1 / 240);
      const shoulder = at(0);
      const elbow = at(1);
      expect(elbow.clone().sub(shoulder).distanceTo(early)).toBeLessThan(1e-3);
      // The shoulder just under the ground, the elbow an upper arm up from it.
      expect(shoulder.y).toBeLessThanOrEqual(0);
      expect(shoulder.y).toBeGreaterThan(-40);
      expect(elbow.distanceTo(shoulder)).toBeCloseTo(h.upper, 3);
      // Nearly straight: the forearm turns less than 25° from the upper arm's line.
      const arms = (hands as unknown as { arms: THREE.InstancedMesh }).arms;
      const m = new THREE.Matrix4();
      const dirOf = (i: number) => {
        arms.getMatrixAt(i, m);
        return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m.extractRotation(m)));
      };
      expect(dirOf(0).angleTo(dirOf(1))).toBeLessThan(0.44);
    }
  });
});
