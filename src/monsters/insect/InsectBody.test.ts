import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { BodyFrame } from '../types';
import { InsectBody } from './InsectBody';

const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, blaze: 0, roar: 0, dashing: false,
  tailSweep: null, lookAt: null, charge: 0, heat: 0, flash: false, glow: 0,
});
/** The chest point the arms beat at (body space), as InsectBody has it. */
const chest = (body: InsectBody) => new THREE.Vector3(0, 520, 260).applyMatrix4(body['model'].body.matrix);

describe('InsectBody for Spike Rain', () => {
  it('reared up, it stands on its back legs: the body pitches up and the front four feet leave the ground', () => {
    const pose = (roar: number) => {
      const body = new InsectBody();
      for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar }, () => {});
      return body;
    };
    const up = pose(1);
    const down = pose(0);
    expect(up['model'].body.rotation.x).toBeLessThan(down['model'].body.rotation.x - 0.5);
    for (let i = 0; i < 4; i++) expect(up.feet[i]!.y).toBeGreaterThanOrEqual(150);
    expect(Math.abs(up.feet[4]!.y)).toBeLessThan(10);
    expect(Math.abs(up.feet[5]!.y)).toBeLessThan(10);
  });

  it('the front four beat at the chest, alternating sides', () => {
    const body = new InsectBody();
    const d0: number[] = [];
    const d1: number[] = [];
    for (let i = 0; i < 120; i++) {
      body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
      const c = chest(body);
      d0.push(body.feet[0]!.distanceTo(c));
      d1.push(body.feet[1]!.distanceTo(c));
    }
    expect(Math.max(...d0) - Math.min(...d0)).toBeGreaterThanOrEqual(60);
    // Over the first beat, legs 0 and 1 come closest to the chest at different moments.
    const firstMin = (d: number[]) => d.slice(0, 45).indexOf(Math.min(...d.slice(0, 45)));
    expect(Math.abs(firstMin(d0) - firstMin(d1)) / 60).toBeGreaterThan(0.15);
  });

  it('its mouth is at the front of the head, between the mandibles, ahead of the stinger curled over its back', () => {
    const body = new InsectBody();
    body.animate(base(), () => {});
    const mouth = body.root.worldToLocal(body.sprayFrom(new THREE.Vector3()));
    const stinger = body.root.worldToLocal(body.rangedOrigin(new THREE.Vector3()));
    expect(Math.abs(mouth.x)).toBeLessThan(5);
    expect(mouth.z).toBeGreaterThan(stinger.z + 100);
    expect(mouth.y).toBeGreaterThan(100);
  });

  it('reared up, its mandibles open wide', () => {
    const body = new InsectBody();
    body.animate({ ...base(), carried: true, roar: 1 }, () => {});
    expect(Math.abs(body['model'].mandibles[0]!.rotation.y)).toBeGreaterThanOrEqual(0.5);
  });

  it('not carried, nothing changes', () => {
    const body = new InsectBody();
    for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, roar: 1 }, () => {});
    for (let i = 0; i < 4; i++) expect(Math.abs(body.feet[i]!.y)).toBeLessThan(10);
  });
});
