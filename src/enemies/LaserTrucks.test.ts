import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LaserTrucks } from './LaserTrucks';
import type { WorldContext } from './types';
import type { DamageSource } from '../combat';
import { CONFIG } from '../config';
import { pointSegmentDistance } from './beamMath';

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

type TruckView = { position: THREE.Vector3; phase: string; heading: number; aim: THREE.Vector3; muzzle: THREE.Vector3; beamEnd: THREE.Vector3 };

/** One truck parked in range at +Z (`dist` from the monster), so it deploys on the first update; it faces the monster unless `heading` is given. */
function parked(ctx: WorldContext, dist = 800, heading = Math.PI) {
  const sys = new LaserTrucks(new THREE.Scene());
  sys.spawn(ctx);
  const t = (sys as unknown as { trucks: TruckView[] }).trucks[0]!;
  t.position.set(0, t.position.y, dist);
  t.heading = heading;
  return { sys, t };
}

/** The monster body point the trucks aim at. */
const body = (m: THREE.Vector3) => new THREE.Vector3(m.x, m.y + T.aimHeight * CONFIG.monster.scale, m.z);

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

  it('turns the aim at no more than trackRate, starting from the truck heading', () => {
    const { ctx, monster } = makeCtx();
    const { sys, t } = parked(ctx, 700);
    run(sys, ctx, T.deployTime + 0.05);
    expect(t.phase).toBe('aiming');
    const prev = new THREE.Vector3();
    let maxRate = 0;
    for (let s = 0; s < T.aimTime; s += 0.05) {
      prev.copy(t.aim);
      monster.position.x += 130 * 0.05;
      sys.update(0.05, ctx);
      if (t.phase === 'aiming') maxRate = Math.max(maxRate, prev.angleTo(t.aim) / 0.05);
    }
    expect(maxRate).toBeGreaterThan(T.trackRate * 0.9);
    expect(maxRate).toBeLessThanOrEqual(T.trackRate + 1e-6);
  });

  it('starts aiming from the forward heading, never snapping onto the monster', () => {
    const { ctx, monster } = makeCtx();
    const { sys, t } = parked(ctx, 700);
    run(sys, ctx, T.deployTime);
    monster.position.x = 400;
    while (t.phase !== 'aiming') sys.update(0.05, ctx);
    const fwd = new THREE.Vector3(Math.sin(t.heading), 0, Math.cos(t.heading));
    expect(t.aim.angleTo(fwd)).toBeLessThanOrEqual(T.trackRate * 0.05 + 1e-6);
  });

  it('turns the body toward the monster at a capped rate', () => {
    const { ctx } = makeCtx();
    const { sys, t } = parked(ctx, 800, Math.PI / 2);
    run(sys, ctx, 0.2);
    expect(t.heading).toBeGreaterThan(Math.PI / 2);
    expect(t.heading - Math.PI / 2).toBeLessThanOrEqual(T.turnRate * 0.2 + 1e-6);
    run(sys, ctx, T.deployTime);
    expect(Math.abs(Math.abs(t.heading) - Math.PI)).toBeLessThan(1e-6);
  });

  it('a monster walking across the line at mid range slips out of the sight line before lock and is missed', () => {
    const { ctx, monster, hits } = makeCtx();
    const { sys, t } = parked(ctx, 700);
    run(sys, ctx, T.deployTime + 0.05);
    expect(t.phase).toBe('aiming');
    while (t.phase === 'aiming') {
      monster.position.x += 120 * 0.05;
      sys.update(0.05, ctx);
    }
    expect(t.phase).toBe('locked');
    expect(pointSegmentDistance(body(monster.position), t.muzzle, t.beamEnd)).toBeGreaterThan(T.hitRadius);
    expect(sys.threatening(monster.position)).toBe(false);
    for (let s = 0; s < T.lockTime + T.fireTime; s += 0.05) {
      monster.position.x += 120 * 0.05;
      sys.update(0.05, ctx);
    }
    expect(hits).toEqual([]);
  });

  it('still locks onto a slow monster', () => {
    const { ctx, monster } = makeCtx();
    const { sys, t } = parked(ctx, 700);
    run(sys, ctx, T.deployTime + 0.05);
    while (t.phase === 'aiming') {
      monster.position.x += 30 * 0.05;
      sys.update(0.05, ctx);
    }
    expect(sys.threatening(monster.position)).toBe(true);
  });

  it('locks onto a stationary monster even when it arrives facing 90° away', () => {
    const { ctx, monster } = makeCtx();
    const { sys } = parked(ctx, 1100, Math.PI / 2);
    run(sys, ctx, T.deployTime + T.aimTime + 0.1);
    expect(sys.threatening(monster.position)).toBe(true);
  });

  it('never produces NaN with the monster directly on top of the truck', () => {
    const { ctx, monster } = makeCtx();
    const { sys, t } = parked(ctx, 800);
    run(sys, ctx, T.deployTime + 0.1);
    monster.position.set(t.position.x, 0, t.position.z);
    run(sys, ctx, T.aimTime);
    expect([t.aim.x, t.aim.y, t.aim.z, t.beamEnd.x, t.heading].every(Number.isFinite)).toBe(true);
  });
});
