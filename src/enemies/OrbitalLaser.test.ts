import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OrbitalLaser } from './OrbitalLaser';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import { spawnDirection } from '../systems/runaway';

const rig = () => {
  let damage = 0;
  const ctx = {
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(7),
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    shake: () => {},
    damageMonster: (n: number) => {
      damage += n;
    },
    damageBuildings: () => {},
  } as unknown as WorldContext & { retreating?: boolean };
  const laser = new OrbitalLaser(new THREE.Scene());
  laser.spawn(ctx);
  return { ctx, laser, damage: () => damage };
};
const run = (l: OrbitalLaser, c: WorldContext, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) l.update(0.05, c);
};

describe('OrbitalLaser retreat', () => {
  const L = CONFIG.laser;

  it('control: fires and damages a stationary monster with retreating unset', () => {
    const r = rig();
    run(r.laser, r.ctx, 10);
    expect(r.damage()).toBeGreaterThan(0);
  });

  it('stands down while retreating', () => {
    const r = rig();
    run(r.laser, r.ctx, L.trackTime * 0.5);
    expect(r.laser.current().phase).toBe('tracking');
    r.ctx.retreating = true;
    r.laser.update(0.05, r.ctx);
    expect(r.laser.current().phase).toBe('cooldown');
    run(r.laser, r.ctx, 10);
    expect(r.damage()).toBe(0);
    expect(r.laser.current().phase).not.toBe('firing');
  });

  it('starts no strike while retreating', () => {
    const r = rig();
    r.laser.clear();
    r.ctx.retreating = true;
    r.laser.spawn(r.ctx);
    expect(r.laser.count()).toBe(0);
  });
});
