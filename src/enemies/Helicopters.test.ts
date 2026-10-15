import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Helicopters } from './Helicopters';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';

function makeCtx(over: Partial<{ hpMult: number }> = {}) {
  const destroyed: { t: Target; exp: number }[] = [];
  const rockets: { from: THREE.Vector3; to: THREE.Vector3; damage: number }[] = [];
  const ctx = {
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: over.hpMult ?? 1, dmgMult: 1 },
    level: 2,
    rng: mulberry32(11),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: () => {},
    damageBuildings: () => {},
    fireShell: () => {},
    fireRocket: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => rockets.push({ from, to, damage }),
    splash: () => {},
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, destroyed, rockets };
}

describe('Helicopters', () => {
  it('spawns airborne, live targets on the spawn ring with hp scaled by difficulty', () => {
    const { ctx } = makeCtx({ hpMult: 1.5 });
    const h = new Helicopters(new THREE.Scene());
    h.spawn(ctx);
    const [t] = h.targets();
    expect(t!.kind).toBe('heli');
    expect(t!.airborne).toBe(true);
    expect(t!.isAlive()).toBe(true);
    const d = Math.hypot(t!.position.x, t!.position.z);
    expect(d).toBeGreaterThanOrEqual(CONFIG.heli.spawnMin - 1e-6);
    expect(d).toBeLessThanOrEqual(CONFIG.heli.spawnMax + 1e-6);
    t!.applyDamage(CONFIG.heli.hp);
    expect(t!.isAlive()).toBe(true);
    t!.applyDamage(CONFIG.heli.hp * 0.5);
    expect(t!.isAlive()).toBe(false);
  });

  it('takes damage, dies at 0 hp, awards exp once, then falls out of the sky and is removed', () => {
    const { ctx, destroyed } = makeCtx();
    const h = new Helicopters(new THREE.Scene());
    h.spawn(ctx);
    const t = h.targets()[0]!;
    t.applyDamage(40);
    expect(t.isAlive()).toBe(true);
    t.applyDamage(60);
    expect(t.isAlive()).toBe(false);
    t.applyDamage(60);
    expect(destroyed).toEqual([{ t, exp: CONFIG.heli.exp }]);
    expect(h.count()).toBe(0);
    const y0 = t.position.y;
    h.update(0.5, ctx);
    expect(t.position.y).toBeLessThan(y0);
    for (let i = 0; i < 600 && h.targets().length > 0; i++) h.update(0.05, ctx);
    expect(h.targets().length).toBe(0);
  });

  it('never holds more than its cap', () => {
    const { ctx } = makeCtx();
    const h = new Helicopters(new THREE.Scene());
    for (let i = 0; i < CONFIG.spawns.heli.cap + 3; i++) h.spawn(ctx);
    expect(h.count()).toBe(CONFIG.spawns.heli.cap);
  });

  it('alternates orbit direction between spawns', () => {
    const { ctx } = makeCtx();
    const h = new Helicopters(new THREE.Scene());
    h.spawn(ctx);
    h.spawn(ctx);
    const dirs = h.orbitDirs();
    expect(dirs[0]).toBe(-dirs[1]!);
  });

  it('fires 2-rocket volleys of jet rockets at the monster once orbiting', () => {
    const { ctx, rockets } = makeCtx();
    const h = new Helicopters(new THREE.Scene());
    h.spawn(ctx);
    for (let i = 0; i < 40 * 20; i++) h.update(0.05, ctx);
    expect(rockets.length).toBeGreaterThanOrEqual(4);
    expect(rockets.length % 2).toBe(0);
    for (const r of rockets) {
      expect(r.damage).toBe(CONFIG.jet.damage);
      expect(Math.hypot(r.to.x, r.to.z)).toBeLessThan(200);
      expect(Math.abs(Math.hypot(r.from.x, r.from.z) - CONFIG.heli.radius)).toBeLessThan(40);
    }
  });
});
