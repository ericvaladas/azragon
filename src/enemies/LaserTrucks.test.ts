import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LaserTrucks } from './LaserTrucks';
import type { WorldContext } from './types';
import type { Vec2 } from '../util/math';
import type { DamageSource } from '../combat';
import { CONFIG } from '../config';
import { pointSegmentDistance } from './beamMath';
import { spawnDirection } from '../systems/runaway';
import { mulberry32 } from '../util/rng';

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
    // Spawns pick a direction all round the monster, as when it isn't running away.
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: noop, emit: noop, explosion: noop },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
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

/** One truck parked in range at +Z (`dist` from the monster), so it deploys on the first update; it and its stowed cannon face the monster unless `heading` is given. */
function parked(ctx: WorldContext, dist = 800, heading = Math.PI) {
  const sys = new LaserTrucks(new THREE.Scene());
  sys.spawn(ctx);
  const t = (sys as unknown as { trucks: TruckView[] }).trucks[0]!;
  t.position.set(0, t.position.y, dist);
  t.heading = heading;
  t.aim.set(Math.sin(heading), 0, Math.cos(heading));
  return { sys, t };
}

/** The monster body point the trucks aim at. */
const body = (m: THREE.Vector3) => new THREE.Vector3(m.x, m.y + T.aimHeight * CONFIG.monster.scale, m.z);

const run = (sys: LaserTrucks, ctx: WorldContext, s: number) => {
  for (let t = 0; t < s; t += 0.05) sys.update(0.05, ctx);
};

describe('LaserTrucks', () => {
  it('keeps its road heading while deployed and firing: only the turret turns to the monster', () => {
    const { ctx } = makeCtx();
    // Parked side-on to the monster (heading east), as a truck on a cross street would be.
    const { sys, t } = parked(ctx, 800, Math.PI / 2);
    run(sys, ctx, T.deployTime + T.aimTime + T.lockTime + T.fireTime);
    expect(t.heading).toBeCloseTo(Math.PI / 2, 6);
    const toMonster = new THREE.Vector3(0, 0, -1);
    expect(new THREE.Vector3(t.aim.x, 0, t.aim.z).normalize().dot(toMonster)).toBeGreaterThan(0.9);
  });

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

  it('starts aiming from where the turret pointed when deployed, never snapping onto the monster', () => {
    const { ctx, monster } = makeCtx();
    const { sys, t } = parked(ctx, 700);
    let guard = 0;
    while (t.phase !== 'aiming' && guard++ < 200) sys.update(0.05, ctx);
    expect(t.phase).toBe('aiming');
    const deployed = t.aim.clone();
    monster.position.x = 400;
    sys.update(0.05, ctx);
    expect(t.aim.angleTo(deployed)).toBeLessThanOrEqual(T.trackRate * 0.05 + 1e-6);
  });

  it('swings the turret (not the body) onto the monster at a capped rate while deploying', () => {
    const { ctx } = makeCtx();
    const { sys, t } = parked(ctx, 800, Math.PI / 2);
    const start = t.aim.clone();
    run(sys, ctx, 0.2);
    expect(t.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(t.aim.angleTo(start)).toBeGreaterThan(0);
    expect(t.aim.angleTo(start)).toBeLessThanOrEqual(T.turnRate * 0.2 + 1e-6);
    run(sys, ctx, T.deployTime);
    const toMonster = new THREE.Vector3(0, 0, -1);
    expect(new THREE.Vector3(t.aim.x, 0, t.aim.z).normalize().dot(toMonster)).toBeGreaterThan(0.95);
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
