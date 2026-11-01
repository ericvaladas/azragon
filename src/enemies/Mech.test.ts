import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Mech } from './Mech';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { DamageSource, Target } from '../combat';
import type { Vec2 } from '../util/math';

const M = CONFIG.mech;
const DT = 0.05;
/** Centre-to-centre distance at which the mech's and the test monster's surfaces touch. */
const CONTACT = M.radius + CONFIG.monster.bodyRadius;
/** Just inside punch reach. */
const IN_REACH = CONTACT + M.punchReach - 20;

function makeCtx(opts: { hpMult?: number; rng?: () => number } = {}) {
  const hits: { amount: number; source: DamageSource }[] = [];
  const rockets: { from: THREE.Vector3; to: THREE.Vector3; damage: number }[] = [];
  const crushes: { p: Vec2; r: number; amount: number }[] = [];
  const destroyed: { t: Target; exp: number }[] = [];
  const monster = { position: new THREE.Vector3(0, 0, 0), yaw: 0, alive: true, airborne: false, bodyRadius: CONFIG.monster.bodyRadius, height: CONFIG.monster.height, width: 200, leapTo: null, surface: () => 0 };
  const ctx = {
    monster,
    difficulty: { hpMult: opts.hpMult ?? 1, dmgMult: 1 },
    level: 5,
    rng: opts.rng ?? mulberry32(7),
    // The mech always arrives from +X.
    spawnDir: () => ({ x: 1, z: 0 }),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    damageMonster: (amount: number, source: DamageSource) => hits.push({ amount, source }),
    damageBuildings: (p: Vec2, r: number, amount: number) => crushes.push({ p: { ...p }, r, amount }),
    fireRocket: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => rockets.push({ from: from.clone(), to: to.clone(), damage }),
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, hits, rockets, crushes, destroyed, monster };
}

function run(mech: Mech, c: ReturnType<typeof makeCtx>, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    each?.();
    mech.update(DT, c.ctx);
  }
}

const body = (mech: Mech) => mech.targets()[0]!;
const distTo = (mech: Mech, p: THREE.Vector3) => Math.hypot(body(mech).position.x - p.x, body(mech).position.z - p.z);

/** Summons the mech, then puts the monster `d` m straight in front of it. */
function faceOff(mech: Mech, c: ReturnType<typeof makeCtx>, d: number): void {
  mech.summon(c.ctx);
  const p = body(mech).position;
  // Summoned at +X of the monster and facing it, so "in front" is toward -X.
  c.monster.position.set(p.x - d, 0, p.z);
}

describe('Mech', () => {
  it('summon places it spawnDistance away facing the monster with scaled HP', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ hpMult: 1.4 });
    c.monster.position.set(100, 0, -50);
    expect(mech.current()).toBeNull();
    mech.summon(c.ctx);
    expect(mech.count()).toBe(1);
    const t = body(mech);
    expect(t.kind).toBe('mech');
    expect(t.boss).toBe(true);
    expect(t.airborne).toBe(false);
    expect(t.radius).toBe(M.radius);
    expect(t.position.x).toBeCloseTo(100 + M.spawnDistance, 3);
    expect(t.position.z).toBeCloseTo(-50, 3);
    expect(t.position.y).toBeGreaterThan(M.height * 0.5);
    expect(mech.current()).toEqual({ hp: 9000 * 1.4, maxHp: 9000 * 1.4 });
    expect(mech.yaw()).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('spawn() refuses', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    expect(mech.spawn(c.ctx)).toBe(false);
    expect(mech.count()).toBe(0);
  });

  it('walks in and stops near the monster', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    run(mech, c, 120);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(CONTACT + M.punchReach);
    // Walking crushes buildings around its feet.
    expect(c.crushes.length).toBeGreaterThan(0);
    expect(c.crushes[0]!.r).toBe(M.crushRadius);
  });

  it('a punch misses an airborne monster', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ rng: () => 0.9 });
    faceOff(mech, c, IN_REACH);
    c.monster.airborne = true;
    run(mech, c, 1);
    expect(c.hits.filter((h) => h.source === 'melee')).toEqual([]);
  });

  it('a punch lands on a grounded monster in front', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ rng: () => 0.9 });
    faceOff(mech, c, IN_REACH);
    run(mech, c, 1);
    expect(c.hits.filter((h) => h.source === 'melee')).toEqual([{ amount: M.punchDamage, source: 'melee' }]);
  });

  it('a slam hits all round', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ rng: () => 0.1 });
    faceOff(mech, c, IN_REACH);
    run(mech, c, 0.2);
    // The monster steps behind it during the wind-up: a slam is radial.
    const p = body(mech).position;
    c.monster.position.set(p.x + 100, 0, p.z);
    run(mech, c, 1.2);
    expect(c.hits.filter((h) => h.source === 'melee')).toEqual([{ amount: M.slamDamage, source: 'melee' }]);
  });

  it('dashes when the monster is far', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    // Engage first: the monster comes within dashTrigger once.
    faceOff(mech, c, 1000);
    run(mech, c, DT);
    const p = body(mech).position;
    c.monster.position.set(p.x - 2500, 0, p.z);
    run(mech, c, 6);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(CONTACT + M.stopGap + 100);
    expect(distTo(mech, c.monster.position)).toBeGreaterThanOrEqual(CONTACT);
  });

  it('stops with a small gap between the bodies, whatever the monster\'s size', () => {
    for (const bodyRadius of [60, CONFIG.monster.bodyRadius, 160]) {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx();
      c.monster.bodyRadius = bodyRadius;
      // Starts inside dashTrigger, so it walks in (no dash) and then fights where it stopped.
      faceOff(mech, c, 1000);
      let minGap = Infinity;
      run(mech, c, 40, () => {
        minGap = Math.min(minGap, distTo(mech, c.monster.position) - M.radius - bodyRadius);
      });
      const gap = distTo(mech, c.monster.position) - M.radius - bodyRadius;
      expect(minGap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(M.stopGap + 1);
    }
  });

  it('a punch thrown at a bigger monster lands from further off', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ rng: () => 0.9 });
    c.monster.bodyRadius = 200;
    faceOff(mech, c, M.radius + 200 + M.punchReach - 20);
    run(mech, c, 1);
    expect(c.hits.filter((h) => h.source === 'melee')).toEqual([{ amount: M.punchDamage, source: 'melee' }]);
  });

  it('walks in rather than dashing before it has engaged', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    const x0 = body(mech).position.x;
    run(mech, c, 3);
    expect(x0 - body(mech).position.x).toBeLessThan(M.approachSpeed * 3 + 1);
  });

  it('engages after engageAfter s even when the monster stays far away, and dashes at it', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    let t = 0;
    let firstDash: number | null = null;
    let last = body(mech).position.x;
    // The monster flees at the mech's own approach pace, holding it about spawnDistance away.
    run(mech, c, M.engageAfter + 5, () => {
      const p = body(mech).position;
      if (firstDash === null && last - p.x > M.approachSpeed * DT * 2) firstDash = t;
      last = p.x;
      c.monster.position.set(p.x - M.spawnDistance, 0, p.z);
      t += DT;
    });
    expect(firstDash).not.toBeNull();
    expect(firstDash!).toBeGreaterThanOrEqual(M.engageAfter);
    expect(firstDash!).toBeLessThanOrEqual(M.engageAfter + 3);
  });

  it('fires rocket volleys and barrages over time', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    faceOff(mech, c, 1200);
    // The monster keeps backing off so the mech stays at about 1200 m (inside dashTrigger, outside melee).
    run(mech, c, 60, () => {
      const p = body(mech).position;
      const d = distTo(mech, c.monster.position);
      if (d < 1100) c.monster.position.set(p.x - 1200, 0, p.z);
    });
    expect(c.rockets.length).toBeGreaterThanOrEqual(M.rocketsPerVolley);
    expect(c.rockets[0]!.damage).toBe(M.rocketDamage);
    expect(c.hits.some((h) => h.source === 'artillery' && h.amount === M.barrageDamage)).toBe(true);
  });

  it('reports its death exactly once', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    const t = body(mech);
    t.applyDamage(1e9);
    t.applyDamage(1e9);
    run(mech, c, 1);
    expect(c.destroyed.length).toBe(1);
    expect(c.destroyed[0]!.t).toBe(t);
    expect(t.isAlive()).toBe(false);
    expect(mech.current()).toBeNull();
    expect(mech.targets()).toEqual([]);
  });

  it('a dead mech never attacks', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    faceOff(mech, c, IN_REACH);
    body(mech).applyDamage(1e9);
    run(mech, c, 5);
    expect(c.hits).toEqual([]);
    expect(c.rockets).toEqual([]);
  });

  it('removed after dying and the wreck sinking', () => {
    const scene = new THREE.Scene();
    const mech = new Mech(scene);
    const c = makeCtx();
    mech.summon(c.ctx);
    body(mech).applyDamage(1e9);
    run(mech, c, M.dyingTime + 1);
    expect(mech.count()).toBe(1);
    run(mech, c, M.wreckTime);
    expect(mech.count()).toBe(0);
    expect(mech.current()).toBeNull();
    expect(scene.children.every((o) => !o.visible || o.type !== 'Group')).toBe(true);
  });

  it('a stale reference from an earlier mech cannot hurt the next one', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    const old = body(mech);
    mech.clear();
    expect(old.isAlive()).toBe(false);
    mech.summon(c.ctx);
    old.applyDamage(500);
    expect(mech.current()).toEqual({ hp: M.hp, maxHp: M.hp });
    expect(c.destroyed).toEqual([]);
  });

  it('clear removes it at once', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    mech.summon(c.ctx);
    run(mech, c, 1);
    mech.clear();
    expect(mech.count()).toBe(0);
    expect(mech.current()).toBeNull();
    expect(mech.targets()).toEqual([]);
  });
});
