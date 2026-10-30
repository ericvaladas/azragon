import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import type { EnemySystem, WorldContext } from './types';
import { TankFleet } from './TankFleet';
import { JetSquadron } from './JetSquadron';
import { Blimps } from './Blimps';
import { SamSilos } from './SamSilos';
import { Artillery } from './Artillery';
import { LaserTrucks } from './LaserTrucks';
import { Helicopters } from './Helicopters';
import { NapalmBombers } from './NapalmBombers';
import { OspreyNets } from './OspreyNets';
import { GustavFleet } from './GustavFleet';

/** A context that answers anything: the fields the systems read, and a no-op for every other call. Explosions are counted. */
function makeCtx() {
  const count = { explosions: 0, destroyed: 0 };
  const base = {
    quiet: false,
    monster: { position: new THREE.Vector3(), yaw: 0, alive: true, airborne: false, bodyRadius: 100, width: 400, height: 400, leapTo: null, surface: () => 0 },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 10,
    rng: mulberry32(7),
    spawnDir: () => ({ x: 1, z: 0 }),
    particles: { ring: () => {}, emit: () => {}, explosion: () => count.explosions++ },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    onDestroyed: () => count.destroyed++,
    openGround: () => [{ x: 900, z: 0 }, { x: -900, z: 300 }],
  };
  const ctx = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) }) as unknown as WorldContext & { quiet: boolean };
  return { ctx, count };
}

const systems: [string, (s: THREE.Scene) => EnemySystem][] = [
  ['tank', (s) => new TankFleet(s)],
  ['jet', (s) => new JetSquadron(s)],
  ['blimp', (s) => new Blimps(s)],
  ['sam', (s) => new SamSilos(s)],
  ['artillery', (s) => new Artillery(s)],
  ['truck', (s) => new LaserTrucks(s)],
  ['heli', (s) => new Helicopters(s)],
  ['napalm', (s) => new NapalmBombers(s)],
  ['osprey', (s) => new OspreyNets(s)],
  ['gustav', (s) => new GustavFleet(s)],
];

describe('taken quietly (an ultimate)', () => {
  for (const [name, make] of systems) {
    it(`${name}: no explosion, no crash, gone, and its kill still reported`, () => {
      const { ctx, count } = makeCtx();
      const sys = make(new THREE.Scene());
      for (let i = 0; i < 5 && sys.targets().length === 0; i++) sys.spawn(ctx);
      // Some units can't be hit at first (a SAM silo still rising out of the ground): let them come up.
      for (let i = 0; i < 90 && !sys.targets().every((t) => t.isAlive()); i++) sys.update(1 / 30, ctx);
      count.explosions = 0;
      const all = [...sys.targets()];
      expect(all.length, `${name} spawned`).toBeGreaterThan(0);
      // Every unit is taken, so any explosion at all (death, crash, its own fire) is a failure.
      ctx.quiet = true;
      for (const t of all) t.applyDamage(1e9);
      ctx.quiet = false;
      for (let i = 0; i < 300; i++) sys.update(1 / 30, ctx);
      expect(count.explosions).toBe(0);
      expect(count.destroyed).toBe(all.length);
      for (const t of all) expect(t.isAlive()).toBe(false);
      expect(sys.targets()).toEqual([]);
    });
  }
});
