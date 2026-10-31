import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BodyFrame } from '../types';
import { KaijuBody } from './KaijuBody';

const K = CONFIG.kaiju;
const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, blaze: 0, dashing: false,
  tailSweep: null, lookAt: null, charge: 0, heat: 0, flash: false, glow: 0,
});
const make = () => {
  const body = new KaijuBody();
  body.root.scale.setScalar(CONFIG.monster.scale);
  body.root.updateMatrixWorld(true);
  return body;
};

describe('KaijuBody for Plasma Lance', () => {
  it('blaze drives the plates and vents past anything Plasma Breath reaches', () => {
    const body = make();
    body.animate({ ...base(), charge: 1 }, () => {});
    const plate = body['plateMat'].emissiveIntensity;
    const vent = body['ventMats'][0]!.emissiveIntensity;
    body.animate({ ...base(), blaze: 1 }, () => {});
    expect(body['plateMat'].emissiveIntensity).toBeGreaterThanOrEqual(plate * 1.5);
    expect(body['ventMats'][0]!.emissiveIntensity).toBeGreaterThanOrEqual(vent * 1.5);
  });

  it("a carried Kaiju's head turns at the carried rate (fast enough for the sweep), never in one jump", () => {
    const at = new THREE.Vector3(Math.sin(0.9) * 1000, 0, Math.cos(0.9) * 1000);
    const carried = make();
    carried.animate({ ...base(), carried: true, lookAt: at }, () => {});
    expect(carried['neckYaw']).toBeCloseTo(K.neck.carriedTurnRate / 60);
    const free = make();
    free.animate({ ...base(), lookAt: at }, () => {});
    expect(free['neckYaw']).toBeLessThanOrEqual(K.neck.turnRate / 60 + 1e-9);
    // The sweep crosses its wedge in world time faster than the normal neck turns.
    const sweepRate = (2 * CONFIG.kaiju.ultimate.halfAngle) / ((CONFIG.kaiju.ultimate.t.sweepTo - CONFIG.kaiju.ultimate.t.fire) * CONFIG.kaiju.ultimate.timeScale);
    expect(K.neck.carriedTurnRate).toBeGreaterThan(sweepRate * 1.5);
  });

  it("the roar lifts the head and lets it down at the neck's pace, without snapping", () => {
    const body = make();
    const tilt = () => body['neck'].rotation.x;
    let last = tilt();
    const step = (f: Partial<BodyFrame>, i: number) => {
      body.animate({ ...base(), time: i / 60, ...f }, () => {});
      expect(Math.abs(tilt() - last)).toBeLessThan(K.neck.carriedTurnRate / 60 + 0.01);
      last = tilt();
    };
    for (let i = 0; i < 30; i++) step({ carried: true, roaring: true }, i);
    expect(tilt()).toBeLessThan(-0.4);
    const ahead = new THREE.Vector3(0, 0, 1200);
    for (let i = 30; i < 60; i++) step({ carried: true, lookAt: ahead }, i);
  });

  it("held by an ultimate, the roar plays slowly: the head rises at the neck's normal pace and the jaws ease open", () => {
    const body = make();
    const tilt0 = body['neck'].rotation.x;
    body.animate({ ...base(), carried: true, roaring: true }, () => {});
    expect(Math.abs(body['neck'].rotation.x - tilt0)).toBeLessThanOrEqual(K.neck.turnRate / 60 + 0.01);
    expect(body['jaw'].rotation.x).toBeLessThan(0.3);
    for (let i = 1; i < 40; i++) body.animate({ ...base(), time: i / 60, carried: true, roaring: true }, () => {});
    expect(body['neck'].rotation.x).toBeLessThan(-0.45);
    expect(body['jaw'].rotation.x).toBeGreaterThan(0.7);
  });

  it('the jaws stay open while it blazes', () => {
    const body = make();
    body.animate({ ...base(), blaze: 1 }, () => {});
    expect(body['jaw'].rotation.x).toBeGreaterThan(0.5);
  });
});
