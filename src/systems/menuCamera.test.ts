import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { frameHeight, rosterFrameHeight, selectPose, titlePose } from './menuCamera';

const pose = () => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

describe('menu camera', () => {
  it('title: circles the city centre high up, looking at it', () => {
    const T = CONFIG.menu.title;
    const a = titlePose(0, pose());
    const b = titlePose(10, pose());
    expect(Math.hypot(a.pos.x, a.pos.z)).toBeCloseTo(T.radius);
    expect(a.pos.y).toBeCloseTo(T.height);
    expect(a.look.length()).toBeCloseTo(0);
    expect(a.pos.distanceTo(b.pos)).toBeGreaterThan(10);
  });
  it('select: orbits the monster at a distance scaled to its height, aimed at its chest', () => {
    const S = CONFIG.menu.select;
    const small = selectPose(1, 300, 1.6, pose());
    const big = selectPose(1, 600, 1.6, pose());
    expect(Math.hypot(small.pos.x, small.pos.z)).toBeCloseTo(300 * S.distance + S.pad);
    expect(Math.hypot(big.pos.x, big.pos.z)).toBeGreaterThan(Math.hypot(small.pos.x, small.pos.z));
    expect(small.look.y).toBeCloseTo(300 * 0.45);
    expect(selectPose(0, 300, 1.6, pose()).pos.distanceTo(selectPose(2, 300, 1.6, pose()).pos)).toBeGreaterThan(10);
  });
  it('select: portrait orbits farther than landscape, landscape is unchanged', () => {
    const S = CONFIG.menu.select;
    const wide = selectPose(1, 300, 1.6, pose());
    const tall = selectPose(1, 300, 0.46, pose());
    expect(Math.hypot(wide.pos.x, wide.pos.z)).toBeCloseTo(300 * S.distance + S.pad);
    expect(Math.hypot(tall.pos.x, tall.pos.z)).toBeGreaterThan(Math.hypot(wide.pos.x, wide.pos.z) * 1.5);
    expect(tall.look.y).toBeLessThan(wide.look.y);
  });
});

describe('frameHeight', () => {
  it('frames tall monsters by height and wide, low ones by their width', () => {
    expect(frameHeight({ width: 484, length: 451, height: 344 })).toBe(344);
    expect(frameHeight({ width: 180, length: 617, height: 385 })).toBe(385);
    expect(frameHeight({ width: 760, length: 760, height: 300 })).toBeCloseTo(760 * 0.55);
  });
});

describe('rosterFrameHeight', () => {
  it('frames every monster by the biggest one, so the select camera holds still between picks', () => {
    const sizes = [{ width: 484, length: 451, height: 344 }, { width: 760, length: 760, height: 300 }, { width: 180, length: 617, height: 385 }];
    expect(rosterFrameHeight(sizes)).toBeCloseTo(760 * 0.55);
  });
});
