import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ShieldFx } from './ShieldFx';
import { CONFIG } from '../config';

const B = CONFIG.passives.bubble;
const S = CONFIG.monster.scale;
const R = 520 * S;
const UP = new THREE.Vector3(1000, 0, -200);
/** Where the monster has walked to by the time the bubble lets go. */
const ELSEWHERE = new THREE.Vector3(1400, 0, -60);

/** A fresh ShieldFx and its dome (the first object it adds; the lattice rides on it as a child). */
function fx() {
  const scene = new THREE.Scene();
  const self = new ShieldFx(scene);
  return { self, dome: scene.children[0] as THREE.Mesh };
}

describe('ShieldFx', () => {
  it('shows the dome only from the moment the bubble goes up', () => {
    const { self, dome } = fx();
    self.update(0.1, UP, false);
    expect(dome.visible).toBe(false);
    self.startBubble();
    self.update(0.1, UP, true);
    expect(dome.visible).toBe(true);
  });

  it('hangs centred 300 × the monster scale above it at full size while the bubble is up', () => {
    const { self, dome } = fx();
    self.startBubble();
    self.update(B.build, UP, true);
    expect(dome.position.x).toBeCloseTo(UP.x, 6);
    expect(dome.position.y).toBeCloseTo(UP.y + 300 * S, 6);
    expect(dome.position.z).toBeCloseTo(UP.z, 6);
    expect(dome.scale.x).toBeCloseTo(R, 6);
  });

  it('fades out where the bubble let go, swelling as it dims, and hides when it is gone', () => {
    const { self, dome } = fx();
    self.startBubble();
    self.update(B.build, UP, true);
    self.update(0.1, ELSEWHERE, false);
    expect(dome.visible).toBe(true);
    // It holds its place instead of following the monster, and has started to give.
    expect(dome.position.x).toBeCloseTo(UP.x, 6);
    expect(dome.scale.x).toBeGreaterThan(R);
    expect(dome.scale.x).toBeLessThan(R * (1 + B.fadeSwell));
    self.update(B.fade, ELSEWHERE, false);
    expect(dome.visible).toBe(false);
  });

  it('catches a dome mid-fade and hangs on the monster again, swelling gone', () => {
    const { self, dome } = fx();
    self.startBubble();
    self.update(B.build, UP, true);
    self.update(0.1, ELSEWHERE, false); // fading, half-lit and swollen, held at UP
    self.startBubble();
    self.update(0.1, ELSEWHERE, true);
    expect(dome.visible).toBe(true);
    expect(dome.position.x).toBeCloseTo(ELSEWHERE.x, 6);
    expect(dome.scale.x).toBeCloseTo(R, 6);
  });

  it('clear() hides the dome at once, mid-fade included', () => {
    const { self, dome } = fx();
    self.startBubble();
    self.update(B.build, UP, true);
    self.update(0.1, UP, false);
    self.clear();
    expect(dome.visible).toBe(false);
  });
});
