import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { OspreyNets } from './OspreyNets';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';

const O = CONFIG.osprey;
const DT = 0.05;
/** Longest a released net may take to reach the monster or the ground. */
const FALL = 4;

function makeCtx() {
  const destroyed: { t: Target; exp: number }[] = [];
  const snares: number[] = [];
  // A 120 m-wide block, the monster's full height, standing under the monster.
  const surface = (lx: number, lz: number) => (Math.abs(lx) < 60 && Math.abs(lz) < 60 ? 385 : 0);
  const monster = { position: new THREE.Vector3(), yaw: 0, surface, alive: true, airborne: false, bodyRadius: 84, width: 180, height: 385, leapTo: null as { x: number; z: number } | null };
  const ctx = {
    monster,
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 7,
    rng: mulberry32(3),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: () => {},
    damageBuildings: () => {},
    snareMonster: (d: number) => snares.push(d),
    fireShell: () => {},
    fireRocket: () => {},
    splash: () => {},
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, destroyed, snares, monster };
}

function spawned() {
  const scene = new THREE.Scene();
  const nets = new OspreyNets(scene);
  const c = makeCtx();
  nets.spawn(c.ctx);
  return { scene, nets, ...c };
}

/** Steps until `done` or `limit` seconds pass. */
function until(nets: OspreyNets, ctx: WorldContext, done: () => boolean, limit = 40): void {
  for (let t = 0; t < limit && !done(); t += DT) nets.update(DT, ctx);
}

const alive = (nets: OspreyNets) => nets.targets().filter((t) => t.isAlive());
const kill = (t: Target) => t.applyDamage(1e9);

describe('OspreyNets', () => {
  it('spawns a squad of four airborne Ospreys with difficulty-scaled HP, capped at one squad', () => {
    const { nets, ctx } = spawned();
    expect(nets.count()).toBe(1);
    expect(nets.targets()).toHaveLength(4);
    for (const t of nets.targets()) {
      expect(t.kind).toBe('osprey');
      expect(t.airborne).toBe(true);
    }
    nets.spawn(ctx);
    expect(nets.targets()).toHaveLength(4);
    expect(nets.netModes()).toEqual(['carried']);
  });

  it('drops the net with all four alive: it falls, lands and snares for the full duration', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    expect(snares).toEqual([]);
    until(nets, ctx, () => snares.length > 0, FALL);
    expect(snares).toEqual([CONFIG.snare.duration]);
    expect(nets.netModes()).toEqual(['snared']);
  });

  it('still snares with one Osprey shot down', () => {
    const { nets, ctx, snares, destroyed } = spawned();
    kill(nets.targets()[0]!);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]!.exp).toBe(O.exp);
    until(nets, ctx, () => snares.length > 0);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('aborts the moment a second Osprey is shot down: the net falls to the ground and fades', () => {
    const { nets, ctx, snares } = spawned();
    for (let t = 0; t < 2; t += DT) nets.update(DT, ctx);
    kill(nets.targets()[1]!);
    kill(nets.targets()[2]!);
    expect(nets.netModes()).toEqual(['falling']);
    until(nets, ctx, () => nets.netModes()[0] === 'ground', FALL);
    until(nets, ctx, () => nets.netModes().length === 0, O.groundLife + 0.2);
    expect(nets.netModes()).toEqual([]);
    until(nets, ctx, () => nets.count() === 0);
    expect(snares).toEqual([]);
    expect(nets.count()).toBe(0);
  });

  it('kills after release still pay and leave the net alone', () => {
    const { nets, ctx, snares, destroyed } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    for (const t of alive(nets)) kill(t);
    expect(destroyed).toHaveLength(4);
    until(nets, ctx, () => snares.length > 0, FALL);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('tears the snared net free when told the snare ended', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => snares.length > 0);
    nets.netTornFree();
    expect(nets.netModes()).toEqual(['ground']);
    until(nets, ctx, () => nets.netModes().length === 0, O.groundLife + 0.2);
    expect(nets.netModes()).toEqual([]);
  });

  it('a second landing replaces the first snared net', () => {
    const { nets, ctx, snares } = spawned();
    until(nets, ctx, () => snares.length > 0);
    until(nets, ctx, () => nets.count() === 0);
    nets.spawn(ctx);
    until(nets, ctx, () => snares.length > 1);
    expect(nets.netModes().filter((m) => m === 'snared')).toEqual(['snared']);
  });

  it('drapes on the leap landing point while the monster is in the air', () => {
    const { nets, ctx, snares, monster } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    monster.airborne = true;
    monster.leapTo = { x: 500, z: 0 };
    until(nets, ctx, () => snares.length > 0, FALL);
    expect(snares).toEqual([CONFIG.snare.duration]);
  });

  it('a net that lands on a dead monster lies on the ground instead of snaring', () => {
    const { nets, ctx, snares, monster } = spawned();
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    monster.alive = false;
    until(nets, ctx, () => nets.netModes()[0] !== 'falling', FALL);
    expect(nets.netModes()).toEqual(['ground']);
    expect(snares).toEqual([]);
  });

  it('the snared net hangs on the monster and travels with it', () => {
    const { nets, ctx, snares, monster } = spawned();
    until(nets, ctx, () => snares.length > 0);
    for (let t = 0; t < 1; t += DT) nets.update(DT, ctx);
    const top = () => Math.max(...nets.netPoints(0).map((p) => p.y));
    expect(top()).toBeGreaterThan(385);
    monster.position.x += 300;
    for (let t = 0; t < 1; t += DT) nets.update(DT, ctx);
    const xs = nets.netPoints(0).map((p) => p.x);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeGreaterThan(200);
    expect(top()).toBeGreaterThan(385);
  });

  it('leaves after the drop and despawns past exitDist', () => {
    const { nets, ctx } = spawned();
    until(nets, ctx, () => nets.count() === 0, 60);
    expect(nets.count()).toBe(0);
    expect(alive(nets)).toEqual([]);
  });

  it('clear removes every mesh', () => {
    const { scene, nets, ctx } = spawned();
    const before = scene.children.length;
    expect(before).toBeGreaterThan(0);
    until(nets, ctx, () => nets.netModes()[0] === 'falling');
    kill(nets.targets()[0]!);
    nets.clear();
    expect(scene.children).toHaveLength(0);
    expect(nets.count()).toBe(0);
    expect(nets.targets()).toHaveLength(0);
    expect(nets.netModes()).toEqual([]);
  });
});
