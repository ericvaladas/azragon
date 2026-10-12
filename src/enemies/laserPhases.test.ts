import { describe, it, expect } from 'vitest';
import { LASER_IDLE, laserHits, startLaser, stepLaser, type LaserState } from './laserPhases';
import { CONFIG } from '../config';

const L = CONFIG.laser;
const run = (s: LaserState, seconds: number, target = { x: 0, z: 0 }, roll = 0.5) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) s = stepLaser(s, 0.05, target, roll);
  return s;
};

describe('orbital laser phases', () => {
  it('starts tracking at the given point, only from idle', () => {
    const s = startLaser(LASER_IDLE, { x: 300, z: 0 });
    expect(s).toMatchObject({ phase: 'tracking', x: 300, z: 0, t: 0 });
    expect(startLaser(s, { x: 0, z: 0 })).toBe(s);
  });

  it('tracks toward the target no faster than trackSpeed', () => {
    const s = stepLaser(startLaser(LASER_IDLE, { x: 300, z: 0 }), 0.5, { x: 0, z: 0 }, 0.5);
    expect(s.x).toBeCloseTo(300 - L.trackSpeed * 0.5);
  });

  it('goes tracking → locked → firing → cooldown → idle on schedule', () => {
    let s = startLaser(LASER_IDLE, { x: 0, z: 0 });
    s = run(s, L.trackTime + 0.01);
    expect(s.phase).toBe('locked');
    s = run(s, L.lockTime + 0.01);
    expect(s.phase).toBe('firing');
    s = run(s, L.fireTime + 0.01);
    expect(s.phase).toBe('cooldown');
    expect(s.cooldownFor).toBeCloseTo(L.cooldownMin + 0.5 * (L.cooldownMax - L.cooldownMin));
    s = run(s, s.cooldownFor + 0.06);
    expect(s.phase).toBe('idle');
  });

  it('freezes the point once locked', () => {
    let s = run(startLaser(LASER_IDLE, { x: 0, z: 0 }), L.trackTime + 0.01);
    const { x, z } = s;
    s = stepLaser(s, 0.2, { x: 999, z: 999 }, 0.5);
    expect(s.x).toBe(x);
    expect(s.z).toBe(z);
  });

  it('hits only while firing and inside the radius', () => {
    let s = run(startLaser(LASER_IDLE, { x: 0, z: 0 }), L.trackTime + L.lockTime + 0.2);
    expect(s.phase).toBe('firing');
    expect(laserHits(s, { x: s.x + L.radius - 1, z: s.z })).toBe(true);
    expect(laserHits(s, { x: s.x + L.radius + 1, z: s.z })).toBe(false);
    s = { ...s, phase: 'locked' };
    expect(laserHits(s, { x: s.x, z: s.z })).toBe(false);
  });
});
