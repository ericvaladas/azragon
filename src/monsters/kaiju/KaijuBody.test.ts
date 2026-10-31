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

  it("a carried Kaiju's head follows lookAt at once, with no turn-rate lag", () => {
    const at = new THREE.Vector3(Math.sin(0.9) * 1000, 0, Math.cos(0.9) * 1000);
    const carried = make();
    carried.animate({ ...base(), carried: true, lookAt: at }, () => {});
    expect(carried['neckYaw']).toBeCloseTo(0.9, 1);
    const free = make();
    free.animate({ ...base(), lookAt: at }, () => {});
    expect(free['neckYaw']).toBeLessThanOrEqual(K.neck.turnRate / 60 + 1e-9);
  });
});
