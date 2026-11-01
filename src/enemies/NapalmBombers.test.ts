import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { NapalmBombers } from './NapalmBombers';
import { bombReleases, impactPoints, newRun } from './napalmMath';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { DamageSource, Target } from '../combat';
import { spawnDirection } from '../systems/runaway';

const N = CONFIG.napalm;
const DT = 0.05;

function makeCtx(over: Partial<{ hpMult: number }> = {}) {
  const destroyed: { t: Target; exp: number }[] = [];
  const hits: { amount: number; source: DamageSource }[] = [];
  const ctx = {
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: over.hpMult ?? 1, dmgMult: 1 },
    level: 6,
    rng: mulberry32(7),
    // Spawns pick a direction all round the monster, as when it isn't running away.
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: (amount: number, source: DamageSource) => hits.push({ amount, source }),
    damageBuildings: () => {},
    fireShell: () => {},
    fireRocket: () => {},
    splash: () => {},
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, destroyed, hits };
}

/** Seconds into a run when the first bomb leaves the bomber. */
const firstRelease = () => bombReleases(newRun({ x: 0, z: 0 }, 0))[0]!.t;
const lastLanding = () => {
  const r = bombReleases(newRun({ x: 0, z: 0 }, 0));
  return r[r.length - 1]!.t + r[r.length - 1]!.fall;
};

function run(sys: NapalmBombers, ctx: WorldContext, seconds: number, each?: () => void) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    sys.update(DT, ctx);
    each?.();
  }
}

describe('NapalmBombers', () => {
  it('spawns an airborne napalm target spawnDist out at altitude with hp scaled by difficulty', () => {
    const { ctx } = makeCtx({ hpMult: 2 });
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    const [t] = sys.targets();
    expect(t!.kind).toBe('napalm');
    expect(t!.airborne).toBe(true);
    expect(t!.radius).toBe(N.hitRadius);
    expect(Math.hypot(t!.position.x, t!.position.z)).toBeCloseTo(N.spawnDist, 3);
    expect(t!.position.y).toBeCloseTo(N.altitude, 6);
    t!.applyDamage(N.hp * 2 - 1);
    expect(t!.isAlive()).toBe(true);
    t!.applyDamage(1);
    expect(t!.isAlive()).toBe(false);
  });

  it('never holds more than its cap', () => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    for (let i = 0; i < 5; i++) sys.spawn(ctx);
    expect(sys.count()).toBe(CONFIG.spawns.napalm.cap);
  });

  it('drops a line of bombs over the aim point that leave burning patches on the planned points', () => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    // The monster walks away after the spawn; the aim point stays where it was.
    ctx.monster.position.set(5000, 0, 5000);
    run(sys, ctx, lastLanding() + 0.2);
    expect(sys.bombsDropped()).toBe(N.bombs);
    const patches = sys.patches();
    expect(patches.length).toBe(N.bombs);
    const plan = impactPoints(sys.runs()[0]!);
    for (const p of patches) {
      const d = Math.min(...plan.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
      expect(d).toBeLessThan(N.speed * DT + 1);
    }
  });

  it('burns the monster standing in the fire at dps through ctx.damageMonster as napalm, and the patches burn out', () => {
    const { ctx, hits } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    run(sys, ctx, lastLanding() + 0.1);
    hits.length = 0;
    run(sys, ctx, 4);
    expect(hits.every((h) => h.source === 'napalm')).toBe(true);
    // Burns in ticks (so the hit flash pulses rather than holding the monster white), each a tick's worth of dps.
    expect(hits.length).toBeGreaterThanOrEqual(Math.floor(4 / N.burnTick) - 1);
    expect(hits.length).toBeLessThanOrEqual(Math.ceil(4 / N.burnTick));
    for (const h of hits) expect(h.amount).toBeCloseTo(N.dps * N.burnTick, 6);
    const total = hits.reduce((s, h) => s + h.amount, 0);
    // One patch's dps, not six stacked.
    expect(Math.abs(total - N.dps * 4)).toBeLessThanOrEqual(N.dps * N.burnTick + 1e-6);
    run(sys, ctx, N.patchLife);
    expect(sys.patches().length).toBe(0);
    hits.length = 0;
    run(sys, ctx, 1);
    expect(hits.length).toBe(0);
  });

  it('flies on past the aim point and is removed exitDist beyond it, without looping back', () => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    const t = sys.targets()[0]!;
    let maxD = 0;
    const end = (N.spawnDist + N.exitDist) / N.speed;
    run(sys, ctx, end - 0.5, () => {
      if (sys.targets().length) maxD = Math.max(maxD, Math.hypot(t.position.x, t.position.z));
    });
    expect(sys.count()).toBe(1);
    run(sys, ctx, 1);
    expect(sys.count()).toBe(0);
    expect(sys.targets().length).toBe(0);
    expect(maxD).toBeLessThanOrEqual(N.exitDist + 1);
  });

  it('shot down before its release drops nothing, awards exp once, then falls and is removed', () => {
    const { ctx, destroyed, hits } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    run(sys, ctx, firstRelease() - 1);
    const t = sys.targets()[0]!;
    t.applyDamage(N.hp);
    t.applyDamage(N.hp);
    expect(t.isAlive()).toBe(false);
    expect(destroyed).toEqual([{ t, exp: N.exp }]);
    expect(sys.count()).toBe(0);
    const y0 = t.position.y;
    sys.update(0.5, ctx);
    expect(t.position.y).toBeLessThan(y0);
    run(sys, ctx, 20);
    expect(sys.targets().length).toBe(0);
    expect(sys.bombsDropped()).toBe(0);
    expect(sys.patches().length).toBe(0);
    expect(hits.length).toBe(0);
  });

  it('clear removes bombers, bombs and patches', () => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    run(sys, ctx, lastLanding());
    sys.clear();
    expect(sys.targets().length).toBe(0);
    expect(sys.patches().length).toBe(0);
  });
});

describe('NapalmBombers retreat', () => {
  const retreatable = (ctx: WorldContext) => ctx as WorldContext & { retreating?: boolean };
  const dropsBeforeLanding = (retreating: boolean) => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    retreatable(ctx).retreating = retreating;
    run(sys, ctx, lastLanding() + 0.2);
    return sys.bombsDropped();
  };

  it('attacks nothing while retreating (and does drop bombs with it unset)', () => {
    expect(dropsBeforeLanding(false)).toBe(N.bombs);
    expect(dropsBeforeLanding(true)).toBe(0);
  });

  it('keeps fires already burning, with bombs already falling still landing', () => {
    const { ctx } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    run(sys, ctx, firstRelease() + 0.5);
    const released = sys.bombsDropped();
    expect(released).toBeGreaterThan(0);
    retreatable(ctx).retreating = true;
    run(sys, ctx, 3);
    expect(sys.bombsDropped()).toBe(released);
    expect(sys.patches().length).toBeGreaterThan(0);
  });

  it('flies off and is removed past exitDistance without a kill', () => {
    const { ctx, destroyed } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    retreatable(ctx).retreating = true;
    run(sys, ctx, 3);
    expect(sys.targets().length).toBe(1);
    run(sys, ctx, 40);
    expect(sys.targets().length).toBe(0);
    expect(destroyed).toEqual([]);
  });
});

describe('NapalmBombers dropped units', () => {
  const retreatable = (ctx: WorldContext) => ctx as WorldContext & { retreating?: boolean };

  it('clear marks every bomber dead, and damage to one reports no kill', () => {
    const { ctx, destroyed } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    const all = [...sys.targets()];
    expect(all.length).toBeGreaterThan(0);
    sys.clear();
    for (const t of all) {
      expect(t.isAlive()).toBe(false);
      t.applyDamage(1e9);
    }
    expect(destroyed).toEqual([]);
  });

  it('an escaped bomber is dead, and damage to it reports no kill', () => {
    const { ctx, destroyed } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    const t = sys.targets()[0]!;
    retreatable(ctx).retreating = true;
    run(sys, ctx, 43);
    expect(sys.targets().length).toBe(0);
    expect(t.isAlive()).toBe(false);
    t.applyDamage(1e9);
    expect(destroyed).toEqual([]);
  });

  it('a bomber that finishes its run and flies out is dead', () => {
    const { ctx, destroyed } = makeCtx();
    const sys = new NapalmBombers(new THREE.Scene());
    sys.spawn(ctx);
    const t = sys.targets()[0]!;
    run(sys, ctx, 120);
    expect(sys.targets().length).toBe(0);
    expect(t.isAlive()).toBe(false);
    t.applyDamage(1e9);
    expect(destroyed).toEqual([]);
  });
});
