import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Blimps } from './Blimps';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';
import { spawnDirection } from '../systems/runaway';

const B = CONFIG.blimp;
const DT = 0.1;

function makeCtx() {
  const destroyed: { t: Target; exp: number }[] = [];
  const blasts: number[] = [];
  const ctx = {
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 4,
    rng: mulberry32(2),
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: (amount: number) => blasts.push(amount),
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext & { retreating?: boolean };
  return { ctx, blasts, destroyed };
}

const run = (b: Blimps, ctx: WorldContext, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += DT) b.update(DT, ctx);
};

describe('Blimps retreat', () => {
  it('detonates on the monster with retreating unset', () => {
    const { ctx, blasts } = makeCtx();
    const b = new Blimps(new THREE.Scene());
    b.spawn(ctx);
    run(b, ctx, B.spawnDist / B.speed + 10);
    expect(blasts).toEqual([B.damage]);
  });

  it('never blasts while retreating, even starting in trigger range', () => {
    const { ctx, blasts } = makeCtx();
    const b = new Blimps(new THREE.Scene());
    b.spawn(ctx);
    const blimp = b.targets()[0]!;
    blimp.position.set(0, B.headHeight * CONFIG.monster.scale, B.triggerDist - 20);
    ctx.retreating = true;
    run(b, ctx, 20);
    expect(blasts).toEqual([]);
    expect(Math.hypot(blimp.position.x, blimp.position.z)).toBeGreaterThan(B.triggerDist);
  });

  it('flies off and is removed past exitDistance without a kill', () => {
    const { ctx, destroyed, blasts } = makeCtx();
    const b = new Blimps(new THREE.Scene());
    b.spawn(ctx);
    ctx.retreating = true;
    run(b, ctx, (CONFIG.cycle.exitDistance - B.spawnDist) / B.speed - 5);
    expect(b.targets().length).toBe(1);
    run(b, ctx, 15);
    expect(b.targets().length).toBe(0);
    expect(destroyed).toEqual([]);
    expect(blasts).toEqual([]);
  });
});

describe('Blimps dropped units', () => {
  it('clear marks every blimp dead, and damage to one reports no kill', () => {
    const { ctx, destroyed } = makeCtx();
    const b = new Blimps(new THREE.Scene());
    b.spawn(ctx);
    b.spawn(ctx);
    const all = [...b.targets()];
    b.clear();
    for (const t of all) {
      expect(t.isAlive()).toBe(false);
      t.applyDamage(1e9);
    }
    expect(destroyed).toEqual([]);
  });

  it('an escaped blimp is dead, and damage to it reports no kill', () => {
    const { ctx, destroyed } = makeCtx();
    const b = new Blimps(new THREE.Scene());
    b.spawn(ctx);
    const blimp = b.targets()[0]!;
    ctx.retreating = true;
    run(b, ctx, (CONFIG.cycle.exitDistance - B.spawnDist) / B.speed + 10);
    expect(b.targets().length).toBe(0);
    expect(blimp.isAlive()).toBe(false);
    blimp.applyDamage(1e9);
    expect(destroyed).toEqual([]);
  });
});
