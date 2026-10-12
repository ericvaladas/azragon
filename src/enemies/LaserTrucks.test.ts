import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LaserTrucks } from './LaserTrucks';
import type { WorldContext } from './types';
import type { DamageSource } from '../combat';
import { CONFIG } from '../config';

const T = CONFIG.truck;

function makeCtx() {
  const monster = { position: new THREE.Vector3(0, 0, 0), alive: true, airborne: false };
  const hits: { amount: number; source: DamageSource }[] = [];
  const noop = () => {};
  const ctx = {
    monster,
    difficulty: { hpMult: 1, dmgMult: 1 },
    minutes: 0,
    rng: () => 0.5,
    particles: { ring: noop, emit: noop, explosion: noop },
    damageMonster: (amount: number, source: DamageSource) => hits.push({ amount, source }),
    damageBuildings: noop,
    fireShell: noop,
    fireRocket: noop,
    shake: noop,
    onDestroyed: noop,
  } as unknown as WorldContext;
  return { ctx, monster, hits };
}

/** One truck parked in range at +Z, so it deploys on the first update. */
function parked(ctx: WorldContext) {
  const sys = new LaserTrucks(new THREE.Scene());
  sys.spawn(ctx);
  const t = (sys as unknown as { trucks: { position: THREE.Vector3; phase: string }[] }).trucks[0]!;
  t.position.set(0, t.position.y, 800);
  return { sys, t };
}

const run = (sys: LaserTrucks, ctx: WorldContext, s: number) => {
  for (let t = 0; t < s; t += 0.05) sys.update(0.05, ctx);
};

describe('LaserTrucks', () => {
  it('deploys, aims, locks, fires, then recharges', () => {
    const { ctx } = makeCtx();
    const { sys, t } = parked(ctx);
    sys.update(0.05, ctx);
    expect(t.phase).toBe('deploying');
    run(sys, ctx, T.deployTime);
    expect(t.phase).toBe('aiming');
    run(sys, ctx, T.aimTime);
    expect(t.phase).toBe('locked');
    run(sys, ctx, T.lockTime);
    expect(t.phase).toBe('firing');
    run(sys, ctx, T.fireTime);
    expect(t.phase).toBe('cooldown');
  });

  it('burns a monster that stays in the beam, with the beam damage source', () => {
    const { ctx, hits } = makeCtx();
    const { sys } = parked(ctx);
    run(sys, ctx, T.deployTime + T.aimTime + T.lockTime + T.fireTime + 0.2);
    const total = hits.reduce((s, h) => s + h.amount, 0);
    expect(hits.every((h) => h.source === 'beam')).toBe(true);
    expect(total).toBeGreaterThan(T.dps * T.fireTime * 0.8);
  });

  it('misses a monster that steps aside after the line locks', () => {
    const { ctx, monster, hits } = makeCtx();
    const { sys } = parked(ctx);
    run(sys, ctx, T.deployTime + T.aimTime + 0.1);
    monster.position.x = 300;
    run(sys, ctx, T.lockTime + T.fireTime);
    expect(hits).toEqual([]);
  });

  it('reports the beam threat while locked or firing on the monster', () => {
    const { ctx } = makeCtx();
    const { sys } = parked(ctx);
    run(sys, ctx, T.deployTime + 0.1);
    expect(sys.threatening(ctx.monster.position)).toBe(false);
    run(sys, ctx, T.aimTime);
    expect(sys.threatening(ctx.monster.position)).toBe(true);
  });
});
