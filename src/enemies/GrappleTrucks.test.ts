import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GrappleTrucks } from './GrappleTrucks';
import type { WorldContext } from './types';
import { CONFIG } from '../config';

const T = CONFIG.truck;

function makeCtx(over: Partial<{ airborne: boolean; alive: boolean; thrashDamage: number; tetherDurationMult: number }> = {}) {
  const monster = { position: new THREE.Vector3(0, 0, 0), alive: over.alive ?? true, airborne: over.airborne ?? false };
  const noop = () => {};
  const ctx = {
    monster,
    difficulty: { hpMult: 1, dmgMult: 1 },
    minutes: 0,
    rng: () => 0.5,
    particles: { ring: noop, emit: noop, explosion: noop },
    tetherDurationMult: over.tetherDurationMult ?? 1,
    thrashDamage: over.thrashDamage ?? 0,
    damageMonster: noop,
    damageBuildings: noop,
    fireShell: noop,
    fireRocket: noop,
    shake: noop,
    onDestroyed: noop,
  } as unknown as WorldContext;
  return { ctx, monster };
}

/** A truck already parked in range, so it anchors on the first update. */
function parkedTruck(ctx: WorldContext) {
  const sys = new GrappleTrucks(new THREE.Scene());
  sys.spawn(ctx);
  const truck = (sys as unknown as { trucks: { position: THREE.Vector3; hp: number; phase: string }[] }).trucks[0]!;
  truck.position.set(0, truck.position.y, 500);
  return { sys, truck };
}

const step = (sys: GrappleTrucks, ctx: WorldContext, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) sys.update(0.05, ctx);
};

describe('GrappleTrucks', () => {
  it('does not hook a monster that is mid-Leap; it hooks after landing', () => {
    const { ctx, monster } = makeCtx();
    const { sys } = parkedTruck(ctx);
    sys.update(0.05, ctx); // driving → anchoring
    monster.airborne = true;
    step(sys, ctx, T.anchorTime + T.harpoonTime + 0.5);
    expect(sys.tethered()).toBe(false);
    monster.airborne = false;
    step(sys, ctx, T.anchorTime + T.harpoonTime + 0.5);
    expect(sys.tethered()).toBe(true);
  });

  it('does not hook a dead monster', () => {
    const { ctx, monster } = makeCtx();
    const { sys } = parkedTruck(ctx);
    sys.update(0.05, ctx);
    monster.alive = false;
    step(sys, ctx, T.anchorTime + T.harpoonTime + T.cooldown + 1);
    expect(sys.tethered()).toBe(false);
  });

  it('Thrash damages the truck when its tether snaps by expiring, not only on Leap/Roar', () => {
    const { ctx } = makeCtx({ thrashDamage: 40 });
    const { sys, truck } = parkedTruck(ctx);
    step(sys, ctx, T.anchorTime + T.harpoonTime + 0.2);
    expect(sys.tethered()).toBe(true);
    const hp = truck.hp;
    step(sys, ctx, T.tetherTime + 0.2);
    expect(sys.tethered()).toBe(false);
    expect(truck.hp).toBe(hp - 40);
  });
});
