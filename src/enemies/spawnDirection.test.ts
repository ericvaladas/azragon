import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import type { Vec2 } from '../util/math';
import type { Target } from '../combat';
import type { EnemySystem, WorldContext } from './types';
import { TankFleet } from './TankFleet';
import { GustavFleet } from './GustavFleet';
import { LaserTrucks } from './LaserTrucks';
import { Blimps } from './Blimps';
import { JetSquadron } from './JetSquadron';
import { Artillery } from './Artillery';
import { Helicopters } from './Helicopters';
import { NapalmBombers } from './NapalmBombers';
import { OspreyNets } from './OspreyNets';
import { SamSilos } from './SamSilos';

/** Every spawn asks for this direction: due +z of the monster at the origin. */
const AHEAD = { x: 0, z: 1 };

const ctx = (): WorldContext =>
  ({
    monster: { position: new THREE.Vector3(), yaw: 0, surface: () => 0, alive: true, airborne: false, bodyRadius: 84, width: 180, height: 385, leapTo: null },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 10,
    rng: mulberry32(13),
    blocked: () => false,
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    // Four sites behind or beside the monster and one ahead of it.
    openGround: () => [
      { x: 0, z: -900, rubble: true },
      { x: -900, z: 0, rubble: true },
      { x: 900, z: 0, rubble: false },
      { x: 600, z: -600, rubble: true },
      { x: 0, z: 900, rubble: false },
    ],
    spawnDir: () => AHEAD,
    damageMonster: () => {},
    damageBuildings: () => {},
    snareMonster: () => {},
    fireShell: () => {},
    fireRocket: () => {},
    fireGustavShell: () => {},
    splash: () => {},
    shake: () => {},
    onDestroyed: () => {},
  }) as unknown as WorldContext;

const systems: [string, (s: THREE.Scene) => EnemySystem][] = [
  ['tanks', (s) => new TankFleet(s)],
  ['Gustavs', (s) => new GustavFleet(s)],
  ['laser trucks', (s) => new LaserTrucks(s)],
  ['blimps', (s) => new Blimps(s)],
  ['jets', (s) => new JetSquadron(s)],
  ['artillery', (s) => new Artillery(s)],
  ['helicopters', (s) => new Helicopters(s)],
  ['napalm bombers', (s) => new NapalmBombers(s)],
  ['Ospreys', (s) => new OspreyNets(s)],
  ['SAM silos', (s) => new SamSilos(s)],
];

describe('enemies spawn along ctx.spawnDir', () => {
  for (const [name, make] of systems) {
    it(`${name} appear in the given direction from the monster`, () => {
      const sys = make(new THREE.Scene());
      sys.spawn(ctx());
      const units: readonly Target[] = sys.targets();
      expect(units.length).toBeGreaterThan(0);
      for (const t of units) {
        const d = Math.hypot(t.position.x, t.position.z);
        expect(d).toBeGreaterThan(0);
        expect((t.position.x * AHEAD.x + t.position.z * AHEAD.z) / d).toBeGreaterThan(0.8);
      }
    });
  }
});
