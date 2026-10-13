import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { selectPose, titlePose } from './menuCamera';

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
