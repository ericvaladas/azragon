import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';

export type LaserPhase = 'idle' | 'tracking' | 'locked' | 'firing' | 'cooldown';
export type LaserState = { phase: LaserPhase; t: number; x: number; z: number; cooldownFor: number };

export const LASER_IDLE: LaserState = { phase: 'idle', t: 0, x: 0, z: 0, cooldownFor: 0 };

export function startLaser(s: LaserState, at: Vec2): LaserState {
  if (s.phase !== 'idle') return s;
  return { phase: 'tracking', t: 0, x: at.x, z: at.z, cooldownFor: 0 };
}

/** Advance one step. Tracking eases the strike point toward `target` at trackSpeed; later phases hold it. */
export function stepLaser(s: LaserState, dt: number, target: Vec2, roll: number): LaserState {
  const L = CONFIG.laser;
  const t = s.t + dt;
  switch (s.phase) {
    case 'idle':
      return s;
    case 'tracking': {
      const dx = target.x - s.x;
      const dz = target.z - s.z;
      const d = Math.hypot(dx, dz);
      const k = d > 1e-9 ? Math.min(1, (L.trackSpeed * dt) / d) : 0;
      const x = s.x + dx * k;
      const z = s.z + dz * k;
      return t >= L.trackTime ? { ...s, phase: 'locked', t: 0, x, z } : { ...s, t, x, z };
    }
    case 'locked':
      return t >= L.lockTime ? { ...s, phase: 'firing', t: 0 } : { ...s, t };
    case 'firing':
      return t >= L.fireTime
        ? { ...s, phase: 'cooldown', t: 0, cooldownFor: L.cooldownMin + roll * (L.cooldownMax - L.cooldownMin) }
        : { ...s, t };
    case 'cooldown':
      return t >= s.cooldownFor ? { ...LASER_IDLE } : { ...s, t };
  }
}

export function laserHits(s: LaserState, monster: Vec2): boolean {
  return s.phase === 'firing' && Math.hypot(monster.x - s.x, monster.z - s.z) <= CONFIG.laser.radius;
}
