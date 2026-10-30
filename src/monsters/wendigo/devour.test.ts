import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { devourPhase, devourVictims } from './devour';

const U = CONFIG.wendigo.ultimate;
const target = (x: number, y = 0, extra: Partial<Target> = {}): Target => ({
  kind: y > 0 ? 'jet' : 'tank',
  position: new THREE.Vector3(x, y, 0),
  radius: 30,
  airborne: y > 0,
  isAlive: () => true,
  applyDamage: () => {},
  ...extra,
});

describe('devourPhase', () => {
  it('phases: slows, reddens and pulls back, then returns by the end', () => {
    expect(devourPhase(0).time).toBe(1);
    expect(devourPhase(1).time).toBeCloseTo(U.timeScale);
    expect(devourPhase(1).sky).toBe(1);
    expect(devourPhase(2).camera).toBe(1);
    const end = devourPhase(U.t.end);
    expect(end.done).toBe(true);
    expect(end.time).toBe(1);
    expect(end.sky).toBe(0);
    expect(end.camera).toBe(0);
    expect(devourPhase(2).bolts).toBe(true);
    expect(devourPhase(0.1).bolts).toBe(false);
    expect(devourPhase(4).bolts).toBe(false);
  });

  it('fades the circle in, raises the figures, then drags them under', () => {
    expect(devourPhase(0.4).circle).toBe(0);
    expect(devourPhase(U.t.circleTo).circle).toBe(1);
    expect(devourPhase(U.t.emergeFrom).emerge).toBe(0);
    expect(devourPhase(U.t.grasp).emerge).toBe(1);
    expect(devourPhase(U.t.dragFrom).drag).toBe(0);
    expect(devourPhase(U.t.dragTo).drag).toBe(1);
    expect(devourPhase(U.t.end).circle).toBe(0);
  });
});

describe('devourVictims', () => {
  const c = { x: 0, z: 0 };

  it('takes ground and air inside the circle, nothing outside', () => {
    const near = target(800);
    const jet = target(850, 400);
    const far = target(1000);
    const v = devourVictims(c, U.radius, [near, jet, far], U.maxFigures);
    expect(v.held).toEqual([near, jet]);
    expect(v.extra).toEqual([]);
  });

  it('bosses take damage, not the drag', () => {
    const boss = target(100, 0, { boss: true });
    const v = devourVictims(c, U.radius, [boss], U.maxFigures);
    expect(v.bosses).toEqual([boss]);
    expect(v.held).toEqual([]);
  });

  it('caps figures but takes everyone, the nearest held', () => {
    const tanks = Array.from({ length: 30 }, (_, i) => target(800 - i * 20));
    const v = devourVictims(c, U.radius, tanks, U.maxFigures);
    expect(v.held.length).toBe(U.maxFigures);
    expect(v.extra.length).toBe(6);
    expect(v.held[0]).toBe(tanks[29]);
  });

  it('skips the dead', () => {
    const dead = target(10, 0, { isAlive: () => false });
    expect(devourVictims(c, U.radius, [dead], U.maxFigures).held).toEqual([]);
  });
});
