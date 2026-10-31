import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BodyFrame } from '../types';
import { KaijuBody } from './KaijuBody';

const K = CONFIG.kaiju;
const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, blaze: 0, roar: 0, dashing: false,
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
    for (let i = 0; i < 30; i++) step({ carried: true, roar: 1 }, i);
    expect(tilt()).toBeLessThan(-0.4);
    const ahead = new THREE.Vector3(0, 0, 1200);
    for (let i = 30; i < 60; i++) step({ carried: true, lookAt: ahead }, i);
  });



  it("held by an ultimate, the roar follows the ultimate's own roar amount: head, jaws, tail and plates together", () => {
    const body = make();
    const tail = () => body['tailPts'][body['tailPts'].length - 1]!.y;
    body.animate({ ...base(), carried: true }, () => {});
    const tail0 = tail();
    const plate0 = body['plateMat'].emissiveIntensity;
    body.animate({ ...base(), carried: true, roar: 0.5 }, () => {});
    expect(body['jaw'].rotation.x).toBeCloseTo(0.4, 1);
    expect(tail() - tail0).toBeGreaterThan(10);
    expect(tail() - tail0).toBeLessThan(30);
    expect(body['plateMat'].emissiveIntensity - plate0).toBeCloseTo(1.1, 1);
    for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
    expect(body['jaw'].rotation.x).toBeGreaterThan(0.75);
    expect(body['neck'].rotation.x).toBeLessThan(-0.45);
  });

  it("held by an ultimate, the roar leans the Kaiju back by the ultimate's amount", () => {
    const body = make();
    body.animate({ ...base(), carried: true, roar: 1 }, () => {});
    const leaned = body['body'].rotation.x;
    const upright = make();
    upright.animate({ ...base(), carried: true, roar: 0 }, () => {});
    expect(leaned).toBeLessThan(upright['body'].rotation.x - 0.4);
  });

  it('the jaws stay open while it blazes', () => {
    const body = make();
    body.animate({ ...base(), blaze: 1 }, () => {});
    expect(body['jaw'].rotation.x).toBeGreaterThan(0.5);
  });
});
