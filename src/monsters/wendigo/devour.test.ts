import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { devourPhase, devourVictims, devourWorldLength } from './devour';

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
    expect(devourPhase(U.t.cameraIn).camera).toBe(1);
    expect(devourPhase(U.t.cameraIn / 2).camera).toBeLessThan(1);
    const end = devourPhase(U.t.end);
    expect(end.done).toBe(true);
    expect(end.time).toBe(1);
    expect(end.sky).toBe(0);
    // The camera is still on its way back when the sequence hands control back, and home by outroFrom + cameraOut.
    expect(end.camera).toBeGreaterThan(0);
    expect(devourPhase(U.t.outroFrom + U.t.cameraOut).camera).toBe(0);
    expect(devourPhase(2).bolts).toBe(true);
    expect(devourPhase(0.1).bolts).toBe(false);
    expect(devourPhase(4).bolts).toBe(false);
  });

  it('fades the circle in, and out with the outro', () => {
    expect(devourPhase(0.4).circle).toBe(0);
    expect(devourPhase(U.t.circleTo).circle).toBe(1);
    expect(devourPhase(U.t.end).circle).toBe(0);
  });
});

describe('devourWorldLength', () => {
  it('is the sequence in world seconds: shorter than real time, longer than all of it slowed', () => {
    const w = devourWorldLength();
    expect(w).toBeLessThan(U.t.end);
    expect(w).toBeGreaterThan(U.t.end * U.timeScale);
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
