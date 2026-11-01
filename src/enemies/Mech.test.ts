import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Mech } from './Mech';
import { MECH_PIVOTS as PV } from './mechModel';
import type { MechRig } from './mechPose';
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
  const cannons: { from: THREE.Vector3; to: THREE.Vector3; damage: number }[] = [];
  const shakes: number[] = [];
  const vents: { kind: string; at: THREE.Vector3; dir: THREE.Vector3 }[] = [];
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
    particles: { ring: () => {}, explosion: () => {}, emit: () => {}, vent: (kind: string, at: THREE.Vector3, dx: number, dy: number, dz: number) => vents.push({ kind, at: at.clone(), dir: new THREE.Vector3(dx, dy, dz) }) },
    roads: { nearest: (p: Vec2) => p, nearestLand: (p: Vec2) => p, path: (_a: Vec2, b: Vec2) => [b] },
    damageMonster: (amount: number, source: DamageSource) => hits.push({ amount, source }),
    damageBuildings: (p: Vec2, r: number, amount: number) => crushes.push({ p: { ...p }, r, amount }),
    fireRocket: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => rockets.push({ from: from.clone(), to: to.clone(), damage }),
    fireCannon: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => cannons.push({ from: from.clone(), to: to.clone(), damage }),
    shake: (amount: number) => shakes.push(amount),
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, hits, rockets, cannons, shakes, vents, crushes, destroyed, monster };
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
      const c = makeCtx({ rng: () => 0.9 });
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

  it('fires cannon volleys and barrages over time', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    faceOff(mech, c, 1200);
    // The monster keeps backing off so the mech stays at about 1200 m (inside dashTrigger, outside melee).
    run(mech, c, 60, () => {
      const p = body(mech).position;
      const d = distTo(mech, c.monster.position);
      if (d < 1100) c.monster.position.set(p.x - 1200, 0, p.z);
    });
    expect(c.cannons.length).toBeGreaterThanOrEqual(M.rocketsPerVolley);
    expect(c.cannons[0]!.damage).toBe(M.rocketDamage);
    expect(c.rockets).toEqual([]);
    expect(c.hits.some((h) => h.source === 'artillery' && h.amount === M.barrageDamage)).toBe(true);
  });

  it('the barrage missiles leave its launcher and come down on their circles', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    // Each smoke puff along a missile's arc, and where the mech stood as it was laid.
    const trails: { at: THREE.Vector3; mech: THREE.Vector3 }[] = [];
    (c.ctx.particles as { emit: unknown }).emit = (kind: string, at: THREE.Vector3) => {
      if (kind === 'trail') trails.push({ at: at.clone(), mech: body(mech).position.clone() });
    };
    faceOff(mech, c, 1200);
    run(mech, c, 30, () => {
      if (distTo(mech, c.monster.position) < 1100) c.monster.position.set(body(mech).position.x - 1200, 0, body(mech).position.z);
    });
    expect(c.hits.some((h) => h.source === 'artillery')).toBe(true);
    // The first puff of the first missile is up on the mech, near its launcher, not high over the target.
    const first = trails[0]!;
    expect(Math.hypot(first.at.x - first.mech.x, first.at.z - first.mech.z)).toBeLessThan(M.height);
    expect(first.at.y).toBeLessThan(M.height * 2);
    // Later puffs come down near the ground, far out by the monster.
    expect(trails.some((t) => t.at.y < M.height * 0.5 && Math.hypot(t.at.x - t.mech.x, t.at.z - t.mech.z) > 600)).toBe(true);
  });

  it('each barrage missile leaves level along its facing and lands on its circle as it fills', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    const launches: THREE.Vector3[] = [];
    const puffs: THREE.Vector3[] = [];
    let heading = 0;
    (c.ctx.particles as { emit: unknown }).emit = (kind: string, at: THREE.Vector3) => {
      if (kind === 'smoke' && launches.length === 0) {
        launches.push(at.clone());
        heading = mech.yaw();
      }
      if (kind === 'trail') puffs.push(at.clone());
    };
    faceOff(mech, c, 1200);
    run(mech, c, 30, () => {
      if (distTo(mech, c.monster.position) < 1100) c.monster.position.set(body(mech).position.x - 1200, 0, body(mech).position.z);
    });
    const from = launches[0]!;
    const first = puffs[0]!.clone().sub(from);
    const ahead = first.x * Math.sin(heading) + first.z * Math.cos(heading);
    expect(ahead).toBeGreaterThan(0);
    expect(Math.abs(first.y)).toBeLessThan(ahead * 0.25);
  });

  it('a cannon volley alternates the barrels, each shot flashing, venting backward, kicking and shaking', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    const rig = (mech as unknown as { rig: MechRig }).rig;
    faceOff(mech, c, 1200);
    let kicked = 0;
    let shots = 0;
    let heading = 0;
    // One update per step: right after a shot the barrels sit fully back.
    for (let t = 0; t < 12 && c.cannons.length < M.rocketsPerVolley; t += DT) {
      const p = body(mech).position;
      if (distTo(mech, c.monster.position) < 1100) c.monster.position.set(p.x - 1200, 0, p.z);
      mech.update(DT, c.ctx);
      if (c.cannons.length > shots) {
        shots = c.cannons.length;
        kicked = rig.barrelOffset;
        heading = mech.yaw();
      }
    }
    expect(c.cannons.length).toBeGreaterThanOrEqual(2);
    expect(c.rockets).toEqual([]);
    // Upper barrel then lower, each near the top of the mech, the shell leaving far ahead of its body centre.
    const a = c.cannons[0]!;
    const b = c.cannons[1]!;
    const drop = (PV.muzzleY[0]! - PV.muzzleY[1]!) * M.height;
    expect(a.from.y - b.from.y).toBeGreaterThan(drop * 0.5);
    expect(a.from.y).toBeGreaterThan((PV.bodyY + PV.muzzleY[1]!) * M.height * 0.9);
    expect(kicked).toBeGreaterThan(M.cannonRecoil * 0.5);
    const smoke = c.vents.filter((v) => v.kind === 'ventSmoke');
    const flash = c.vents.filter((v) => v.kind === 'muzzleFlash');
    expect(smoke.length).toBe(c.cannons.length);
    expect(flash.length).toBe(c.cannons.length);
    const back = smoke[0]!.dir;
    expect(back.x * Math.sin(heading) + back.z * Math.cos(heading)).toBeLessThan(-0.9);
    // The breech sits behind the muzzle.
    expect(smoke[0]!.at.distanceTo(a.from)).toBeGreaterThan((PV.muzzleZ - PV.breechZ) * M.height * 0.8);
    expect(c.shakes.length).toBeGreaterThanOrEqual(c.cannons.length);
    // The barrels ease home after the volley.
    run(mech, c, M.cannonRecoilTime + 2 * DT);
    expect(rig.barrelOffset).toBe(0);
  });

  describe('evading', () => {
    type Evading = { action: string; heading: number; evadeCd: number; meleeCd: number; x: number; z: number; root: THREE.Group };
    const inner = (mech: Mech) => mech as unknown as Evading;
    const hopRoll = M.evadeChance * M.hopChance - 0.01;
    const stepRoll = M.evadeChance * M.hopChance + 0.01;

    /** Fights at punch reach until it starts `move`, its stand-off held; returns where it stood and its heading. */
    function fightUntil(mech: Mech, c: ReturnType<typeof makeCtx>, move: string) {
      faceOff(mech, c, IN_REACH);
      for (let t = 0; t < 30; t += DT) {
        const was = { x: inner(mech).x, z: inner(mech).z, heading: inner(mech).heading };
        mech.update(DT, c.ctx);
        if (inner(mech).action === move) return was;
      }
      throw new Error(`no ${move}`);
    }

    function finish(mech: Mech, c: ReturnType<typeof makeCtx>, move: string): void {
      for (let t = 0; inner(mech).action === move && t < 5; t += DT) mech.update(DT, c.ctx);
    }

    it('a sidestep goes sideways by sidestepDistance, keeping its facing on the monster', () => {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: () => stepRoll });
      const was = fightUntil(mech, c, 'sidestep');
      finish(mech, c, 'sidestep');
      const dx = inner(mech).x - was.x;
      const dz = inner(mech).z - was.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(M.sidestepDistance, 0);
      // All of it across the facing it had.
      expect(Math.abs(dx * Math.sin(was.heading) + dz * Math.cos(was.heading))).toBeLessThan(1);
      const aim = Math.atan2(c.monster.position.x - inner(mech).x, c.monster.position.z - inner(mech).z);
      expect(Math.abs(Math.atan2(Math.sin(aim - inner(mech).heading), Math.cos(aim - inner(mech).heading)))).toBeLessThan(0.5);
      expect(inner(mech).evadeCd).toBeGreaterThan(0);
    });

    it('a hopback jumps straight away from the monster, peaks at hopHeight and lands with a crush', () => {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: () => hopRoll });
      const was = fightUntil(mech, c, 'hopback');
      const before = distTo(mech, c.monster.position);
      c.crushes.length = 0;
      let peak = 0;
      for (let t = 0; inner(mech).action === 'hopback' && t < 5; t += 0.01) {
        mech.update(0.01, c.ctx);
        peak = Math.max(peak, inner(mech).root.position.y);
      }
      expect(Math.hypot(inner(mech).x - was.x, inner(mech).z - was.z)).toBeCloseTo(M.hopDistance, 0);
      expect(distTo(mech, c.monster.position)).toBeGreaterThan(before + M.hopDistance * 0.9);
      expect(peak).toBeGreaterThan(M.hopHeight * 0.95);
      expect(peak).toBeLessThanOrEqual(M.hopHeight + 1e-6);
      expect(inner(mech).root.position.y).toBe(0);
      expect(c.crushes.some((x) => x.amount >= M.crushDps * M.hopCrush)).toBe(true);
    });

    it('stays a hittable ground target through a hopback', () => {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: () => hopRoll });
      fightUntil(mech, c, 'hopback');
      expect(body(mech).airborne).toBe(false);
      const hp = (body(mech) as unknown as { hp: number }).hp;
      body(mech).applyDamage(10);
      expect((body(mech) as unknown as { hp: number }).hp).toBe(hp - 10);
    });

    it('never moves onto blocked ground: it takes another way, or none', () => {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: () => hopRoll });
      // Everything behind the mech (it stands at +X of the monster, facing −X) is blocked, so it sidesteps instead.
      (c.ctx as { blocked?: (x: number, z: number) => boolean }).blocked = (x) => x > c.monster.position.x + IN_REACH + 10;
      const was = fightUntil(mech, c, 'sidestep');
      finish(mech, c, 'sidestep');
      expect(inner(mech).x).toBeLessThanOrEqual(was.x + 10);

      const stuck = new Mech(new THREE.Scene());
      const d = makeCtx({ rng: () => hopRoll });
      (d.ctx as { blocked?: (x: number, z: number) => boolean }).blocked = () => true;
      faceOff(stuck, d, IN_REACH);
      for (let t = 0; t < 12; t += DT) {
        stuck.update(DT, d.ctx);
        expect(['sidestep', 'hopback']).not.toContain(inner(stuck).action);
      }
    });

    it('waits evadeCooldown between evades, in a close fight about one every 8 to 12 s', () => {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: mulberry32(11) });
      faceOff(mech, c, IN_REACH);
      const starts: number[] = [];
      const ends: number[] = [];
      let last = 'walk';
      const seconds = 600;
      for (let t = 0; t < seconds; t += DT) {
        const p = body(mech).position;
        if (distTo(mech, c.monster.position) > IN_REACH) c.monster.position.set(p.x - IN_REACH, 0, p.z);
        (body(mech) as unknown as { hp: number }).hp = M.hp;
        mech.update(DT, c.ctx);
        const a = inner(mech).action;
        const evading = a === 'sidestep' || a === 'hopback';
        if (evading && last !== a) starts.push(t);
        if (!evading && (last === 'sidestep' || last === 'hopback')) ends.push(t);
        last = a;
      }
      for (let i = 1; i < starts.length; i++) expect(starts[i]! - ends[i - 1]!).toBeGreaterThanOrEqual(M.evadeCooldown - 2 * DT);
      const every = seconds / starts.length;
      expect(every).toBeGreaterThan(8);
      expect(every).toBeLessThan(12);
    });
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
