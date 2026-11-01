import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TankFleet } from './TankFleet';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';
import type { Vec2 } from '../util/math';

const T = CONFIG.tank;
const DT = 0.1;

function makeCtx() {
  const shells: number[] = [];
  const destroyed: { t: Target; exp: number }[] = [];
  const monster = { position: new THREE.Vector3(0, 0, 0), alive: true, airborne: false };
  const ctx = {
    monster,
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 1,
    rng: mulberry32(9),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    fireShell: (_f: THREE.Vector3, _t: THREE.Vector3, damage: number) => shells.push(damage),
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext & { retreating?: boolean };
  return { ctx, shells, destroyed, monster };
}

const run = (f: TankFleet, ctx: WorldContext, s: number) => {
  for (let t = 0; t < s - 1e-9; t += DT) f.update(DT, ctx);
};

describe('TankFleet retreat', () => {
  it('fires nothing while retreating', () => {
    const f = new TankFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, T.range - 100, c.ctx);
    c.ctx.retreating = true;
    run(f, c.ctx, 20);
    expect(c.shells).toEqual([]);
  });

  it('drives away and is removed past exitDistance without a kill', () => {
    const f = new TankFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, T.range - 100, c.ctx);
    c.ctx.retreating = true;
    const tank = f.targets()[0]!;
    const dist = () => Math.hypot(tank.position.x, tank.position.z);
    let last = dist();
    for (let s = 0; s < 5; s++) {
      run(f, c.ctx, 1);
      expect(dist()).toBeGreaterThan(last);
      last = dist();
    }
    run(f, c.ctx, 200);
    expect(f.count()).toBe(0);
    expect(c.destroyed).toEqual([]);
  });

  it('still reports a kill made while retreating', () => {
    const f = new TankFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 500, c.ctx);
    c.ctx.retreating = true;
    f.update(DT, c.ctx);
    f.targets()[0]!.applyDamage(1e9);
    expect(c.destroyed).toHaveLength(1);
    expect(c.destroyed[0]!.exp).toBe(T.exp);
  });
});

describe('TankFleet dropped units', () => {
  it('clear marks every tank dead, and damage to one reports no kill', () => {
    const f = new TankFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, 500, c.ctx);
    f.spawnAt(200, 500, c.ctx);
    const all = [...f.targets()];
    f.clear();
    for (const t of all) {
      expect(t.isAlive()).toBe(false);
      t.applyDamage(1e9);
    }
    expect(c.destroyed).toEqual([]);
  });

  it('an escaped tank is dead, and damage to it reports no kill', () => {
    const f = new TankFleet(new THREE.Scene());
    const c = makeCtx();
    f.spawnAt(0, T.range - 100, c.ctx);
    const tank = f.targets()[0]!;
    c.ctx.retreating = true;
    run(f, c.ctx, 200);
    expect(f.count()).toBe(0);
    expect(tank.isAlive()).toBe(false);
    tank.applyDamage(1e9);
    expect(c.destroyed).toEqual([]);
  });
});
