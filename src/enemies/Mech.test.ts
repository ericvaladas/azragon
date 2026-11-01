import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Mech } from './Mech';
import { MECH_PIVOTS as PV } from './mechModel';
import type { MechRig } from './mechPose';
import { PRESETS } from '../systems/Particles';
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
  /** Building damage that could pay EXP: the mech must never deal any. */
  const paid: { p: Vec2; r: number; amount: number }[] = [];
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
    damageBuildings: (p: Vec2, r: number, amount: number) => paid.push({ p: { ...p }, r, amount }),
    razeBuildings: (p: Vec2, r: number, amount: number) => crushes.push({ p: { ...p }, r, amount }),
    fireRocket: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => rockets.push({ from: from.clone(), to: to.clone(), damage }),
    fireCannon: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => cannons.push({ from: from.clone(), to: to.clone(), damage }),
    shake: (amount: number) => shakes.push(amount),
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext;
  return { ctx, hits, rockets, cannons, shakes, vents, crushes, paid, destroyed, monster };
}

function run(mech: Mech, c: ReturnType<typeof makeCtx>, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    each?.();
    mech.update(DT, c.ctx);
  }
}

const body = (mech: Mech) => mech.targets()[0]!;
/** Keeps the laser sequence out of a long fight that is testing something else. */
const noLaser = (mech: Mech) => {
  (mech as unknown as { laserCd: number }).laserCd = Infinity;
};
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
    expect(mech.current()).toEqual({ hp: M.hp * 1.4, maxHp: M.hp * 1.4 });
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
    noLaser(mech);
    run(mech, c, 120);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(CONTACT + M.punchReach);
    // Walking crushes buildings around its feet.
    expect(c.crushes.length).toBeGreaterThan(0);
    expect(c.crushes[0]!.r).toBe(M.crushRadius);
    expect(c.paid).toEqual([]);
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
    const stops = CONTACT + M.stopGap + M.dashStopShort;
    let dashed = false;
    for (let t = 0; t < 6 && !(dashed && !(mech as unknown as { dashing: boolean }).dashing); t += DT) {
      mech.update(DT, c.ctx);
      dashed ||= (mech as unknown as { dashing: boolean }).dashing;
    }
    expect(dashed).toBe(true);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(stops + 2);
    expect(distTo(mech, c.monster.position)).toBeGreaterThanOrEqual(stops - 1);
    expect((mech as unknown as { chasing: boolean }).chasing).toBe(true);
    // It walks the last stretch in.
    run(mech, c, M.dashStopShort / M.walkSpeed + M.moves.dash.recover + 1);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(CONTACT + M.punchReach);
    expect(c.crushes.length).toBeGreaterThan(0);
    expect(c.paid).toEqual([]);
  });

  it('ends a dash at once when the monster has come inside its stopping point', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    faceOff(mech, c, 1000);
    run(mech, c, DT);
    const p = body(mech).position;
    c.monster.position.set(p.x - 2500, 0, p.z);
    const i = mech as unknown as { dashing: boolean; x: number };
    for (let t = 0; t < 3 && !i.dashing; t += DT) mech.update(DT, c.ctx);
    expect(i.dashing).toBe(true);
    const stops = CONTACT + M.stopGap + M.dashStopShort;
    c.monster.position.set(i.x - (stops - 50), 0, p.z);
    const x = i.x;
    mech.update(DT, c.ctx);
    expect(i.dashing).toBe(false);
    expect(i.x).toBe(x);
  });

  it('holds its ground while the player backs off, then closes the gap after chaseDelay', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx({ rng: () => 0.9 });
    faceOff(mech, c, 1000);
    run(mech, c, 25);
    const stand = M.radius + c.monster.bodyRadius + M.stopGap;
    const dx = () => body(mech).position.x;
    // A small gap, inside chaseGap: it never sets out.
    const x0 = dx();
    c.monster.position.set(x0 - stand - M.chaseGap * 0.8, 0, body(mech).position.z);
    run(mech, c, 6);
    expect(dx()).toBeCloseTo(x0, 3);
    // Past chaseGap: it waits out chaseDelay, then walks back to stand.
    c.monster.position.set(x0 - stand - M.chaseGap - 100, 0, body(mech).position.z);
    run(mech, c, M.chaseDelay - 0.3);
    expect(dx()).toBeCloseTo(x0, 3);
    run(mech, c, 12);
    expect(distTo(mech, c.monster.position)).toBeLessThanOrEqual(stand + 1);
  });

  it('stops with a small gap between the bodies, whatever the monster\'s size', () => {
    for (const bodyRadius of [60, CONFIG.monster.bodyRadius, 160]) {
      const mech = new Mech(new THREE.Scene());
      const c = makeCtx({ rng: () => 0.9 });
      c.monster.bodyRadius = bodyRadius;
      // Starts inside dashTrigger, so it walks in (no dash) and then fights where it stopped.
      faceOff(mech, c, 1000);
      noLaser(mech);
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

  it('a barrage missile only leaves once its circle has filled, then lands at barrageMissileSpeed', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    let launchedAt = -1;
    let clock = 0;
    let paintedAt = -1;
    faceOff(mech, c, 1200);
    (c.ctx.particles as { emit: unknown }).emit = (kind: string) => {
      if (kind === 'smoke' && launchedAt < 0) launchedAt = clock;
    };
    const strikes = () => (mech as unknown as { strikes: unknown[] }).strikes;
    for (; clock < 30 && !c.hits.some((h) => h.source === 'artillery'); clock += DT) {
      const p = body(mech).position;
      if (distTo(mech, c.monster.position) < 1100) c.monster.position.set(p.x - 1200, 0, p.z);
      mech.update(DT, c.ctx);
      if (paintedAt < 0 && strikes().length > 0) paintedAt = clock;
    }
    expect(paintedAt).toBeGreaterThanOrEqual(0);
    expect(launchedAt - paintedAt).toBeGreaterThanOrEqual(M.barrageFill - DT);
    // At this speed the flight is well under a second over this range.
    expect(clock - launchedAt).toBeLessThan(2 * 1400 / M.barrageMissileSpeed + 0.5);
  });

  it('each barrage missile leaves level along its facing', () => {
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
    // The first puff sits at the tube mouth; the next shows which way it left.
    const first = puffs[1]!.clone().sub(from);
    const ahead = first.x * Math.sin(heading) + first.z * Math.cos(heading);
    expect(ahead).toBeGreaterThan(0);
    expect(Math.abs(first.y)).toBeLessThan(ahead * 0.25);
  });

  it('a cannon volley fires both barrels on one frame, each flashing and venting backward, with one kick and one shake', () => {
    const mech = new Mech(new THREE.Scene());
    const c = makeCtx();
    const rig = (mech as unknown as { rig: MechRig }).rig;
    faceOff(mech, c, 1200);
    let kicked = 0;
    let heading = 0;
    let shakesOnFrame = 0;
    // One update per step: right after a shot the barrels sit fully back.
    for (let t = 0; t < 12 && c.cannons.length < M.rocketsPerVolley; t += DT) {
      const p = body(mech).position;
      if (distTo(mech, c.monster.position) < 1100) c.monster.position.set(p.x - 1200, 0, p.z);
      const shakes = c.shakes.length;
      mech.update(DT, c.ctx);
      // The loop ends on the first frame that fires, so every shell here left on it.
      if (c.cannons.length > 0) {
        kicked = rig.barrelOffset;
        heading = mech.yaw();
        shakesOnFrame = c.shakes.length - shakes;
      }
    }
    expect(c.cannons.length).toBe(2);
    expect(shakesOnFrame).toBe(1);
    expect(c.rockets).toEqual([]);
    // One from the upper barrel and one from the lower, each near the top of the mech, the shell leaving far ahead of its body centre.
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
    // The barrels ease home after the volley, and the rest of the move fires nothing more.
    const R = M.moves.rockets;
    run(mech, c, Math.max(M.cannonRecoilTime, R.strike + R.recover) + 2 * DT);
    expect(M.rocketsPerVolley).toBe(2);
    expect(c.cannons.length).toBe(2);
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
      expect(c.paid).toEqual([]);
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
      noLaser(mech);
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

  it('blows apart after dyingTime and is removed inside its dust cloud, never sinking', () => {
    const scene = new THREE.Scene();
    const mech = new Mech(scene);
    const c = makeCtx();
    const puffs: string[] = [];
    let bursts = 0;
    let rings = 0;
    c.ctx.particles.emit = ((kind: string) => void puffs.push(kind)) as never;
    c.ctx.particles.explosion = (() => void bursts++) as never;
    c.ctx.particles.ring = ((kind: string) => void (kind === 'wreckBillow' && rings++)) as never;
    mech.summon(c.ctx);
    body(mech).applyDamage(1e9);
    const root = (mech as unknown as { root: THREE.Group }).root;
    let lowest = 0;
    const step = (s: number) => {
      for (let t = 0; t < s - 1e-9; t += DT) {
        mech.update(DT, c.ctx);
        lowest = Math.min(lowest, root.position.y);
      }
    };
    step(M.dyingTime - 2 * DT);
    expect(rings).toBe(0);
    expect(mech.count()).toBe(1);
    const before = bursts;
    const shakes = c.shakes.length;
    step(4 * DT);
    expect(bursts - before).toBeGreaterThanOrEqual(M.wreckBursts);
    expect(rings).toBe(1);
    expect(c.shakes.slice(shakes)).toContain(M.wreckShake);
    expect(puffs.filter((k) => k === 'wreckVeil').length).toBe(M.wreckVeils);
    expect(puffs.filter((k) => k === 'wreckBillow').length).toBe(M.wreckBillows);
    expect(mech.count()).toBe(1);
    step(M.wreckVanish);
    expect(mech.count()).toBe(0);
    expect(mech.current()).toBeNull();
    expect(lowest).toBe(0);
    expect(scene.children.every((o) => !o.visible || o.type !== 'Group')).toBe(true);
  });

  it('the cloud outlasts the wreck by seconds', () => {
    expect(PRESETS.veil.life).toBeGreaterThan(M.wreckVanish + 2);
    expect(PRESETS.billow.life).toBeGreaterThan(M.wreckVanish + 1.5);
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

  describe('laser', () => {
    type Lasering = {
      action: string; actT: number; x: number; z: number; heading: number; laserCd: number; engaged: boolean; meleeCd: number; barrageCd: number; rocketCd: number; rig: MechRig;
      laser: { phase: string | null; aim: THREE.Vector3; start: THREE.Vector3; end: THREE.Vector3; visible: boolean; streaks: THREE.LineSegments };
    };
    const inner = (mech: Mech) => mech as unknown as Lasering;
    const label = (mech: Mech) => (inner(mech).action === 'laser' ? inner(mech).laser.phase ?? 'charge' : inner(mech).action);
    const START = 700;

    /** Faces the monster off START m ahead with the laser ready and nothing else, and steps once so it starts. */
    function ready(c: ReturnType<typeof makeCtx>): Mech {
      const mech = new Mech(new THREE.Scene());
      faceOff(mech, c, START);
      const i = inner(mech);
      i.engaged = true;
      i.laserCd = 0;
      i.barrageCd = i.rocketCd = 99;
      mech.update(DT, c.ctx);
      expect(i.action).toBe('hopback');
      return mech;
    }

    /** Steps until the laser reaches `phase`. */
    function until(mech: Mech, c: ReturnType<typeof makeCtx>, phase: string): void {
      for (let t = 0; t < 20; t += DT) {
        if (label(mech) === phase) return;
        mech.update(DT, c.ctx);
      }
      throw new Error(`no ${phase}`);
    }

    /** Moves the monster off the mech's line, so the aim has to turn toward it. */
    const sideStep = (c: ReturnType<typeof makeCtx>, d: number) => c.monster.position.setZ(c.monster.position.z + d);

    it('waits laserFirst s after engaging', () => {
      const c = makeCtx();
      const mech = new Mech(new THREE.Scene());
      faceOff(mech, c, START);
      const i = inner(mech);
      i.engaged = true;
      i.barrageCd = i.rocketCd = i.meleeCd = 999;
      mech.update(DT, c.ctx);
      expect(i.laserCd).toBeGreaterThan(M.laserFirst - 1);
      expect(i.laserCd).toBeLessThanOrEqual(M.laserFirst);
    });

    it('hops twice, then charges, aims, locks, fires and recovers, and walks again on cooldown', () => {
      const c = makeCtx();
      const mech = ready(c);
      const seen: string[] = [];
      let lastT = -1;
      for (let t = 0; t < 20 && inner(mech).action !== 'walk'; t += DT) {
        const l = label(mech);
        if (seen[seen.length - 1] !== l || inner(mech).actT < lastT) seen.push(l);
        lastT = inner(mech).actT;
        mech.update(DT, c.ctx);
      }
      expect(seen).toEqual(['hopback', 'hopback', 'charge', 'aim', 'lock', 'fire', 'recover']);
      expect(inner(mech).laserCd).toBeGreaterThan(M.laserCooldown - 1);
    });

    it('backs off about two hop lengths and stays put from then on', () => {
      const c = makeCtx();
      const mech = ready(c);
      const x0 = inner(mech).x;
      until(mech, c, 'charge');
      expect(distTo(mech, c.monster.position)).toBeGreaterThan(START + M.hopDistance * 1.9);
      const x = inner(mech).x;
      expect(x - x0).toBeCloseTo(M.hopDistance * 2, -1);
      until(mech, c, 'recover');
      expect(inner(mech).x).toBe(x);
    });

    it('skips a blocked hop and carries on', () => {
      const c = makeCtx();
      // Clear for one hop from the start, blocked beyond it (the mech backs away toward +X).
      const mech = new Mech(new THREE.Scene());
      faceOff(mech, c, START);
      const i = inner(mech);
      const limit = i.x + M.hopDistance * 1.5;
      (c.ctx as { blocked?: (x: number, z: number) => boolean }).blocked = (x) => x > limit;
      i.engaged = true;
      i.laserCd = 0;
      i.barrageCd = i.rocketCd = 99;
      const x0 = i.x;
      mech.update(DT, c.ctx);
      until(mech, c, 'charge');
      expect(i.x - x0).toBeCloseTo(M.hopDistance, 0);
    });

    it('deals no damage before firing, then laserDps to a grounded monster on the line, as a beam', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'lock');
      c.shakes.length = 0;
      while (label(mech) === 'lock') {
        expect(c.hits).toEqual([]);
        mech.update(DT, c.ctx);
      }
      until(mech, c, 'recover');
      const total = c.hits.reduce((a, h) => a + h.amount, 0);
      expect(c.hits.every((h) => h.source === 'beam')).toBe(true);
      expect(c.hits[0]!.amount).toBeCloseTo(M.laserDps * DT, 6);
      expect(total).toBeGreaterThan(240);
      expect(total).toBeLessThan(310);
      expect(Math.max(...c.shakes)).toBeGreaterThanOrEqual(M.laserShake);
    });

    it('misses a monster that left the locked line, and one that leapt over it', () => {
      for (const leave of [(c: ReturnType<typeof makeCtx>) => sideStep(c, M.laserHitRadius * 2), (c: ReturnType<typeof makeCtx>) => c.monster.position.setY(CONFIG.abilities.leap.peak)]) {
        const c = makeCtx();
        const mech = ready(c);
        until(mech, c, 'lock');
        leave(c);
        until(mech, c, 'recover');
        expect(c.hits).toEqual([]);
      }
    });

    it('tracks at laserTrackRate while aiming, and the line holds still through the lock', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'aim');
      mech.update(DT, c.ctx);
      const was = inner(mech).laser.aim.clone();
      sideStep(c, 900);
      mech.update(DT, c.ctx);
      const turned = inner(mech).laser.aim.angleTo(was);
      expect(turned).toBeGreaterThan(0);
      expect(turned).toBeLessThanOrEqual(M.laserTrackRate * DT + 1e-6);
      until(mech, c, 'lock');
      const locked = inner(mech).laser.aim.clone();
      const end = inner(mech).laser.end.clone();
      sideStep(c, 900);
      until(mech, c, 'fire');
      expect(inner(mech).laser.aim.equals(locked)).toBe(true);
      expect(inner(mech).laser.end.distanceTo(end)).toBeLessThan(5);
    });

    it('starts the line at the eye and reaches laserLength at most', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'aim');
      mech.update(DT, c.ctx);
      const l = inner(mech).laser;
      const eye = inner(mech).rig.eye(new THREE.Vector3());
      expect(l.start.distanceTo(eye)).toBeLessThan(1e-6);
      expect(l.end.distanceTo(l.start)).toBeLessThanOrEqual(M.laserLength + 1e-6);
      expect(l.end.y).toBeGreaterThanOrEqual(-1e-6);
    });

    it('burns buildings along the beam with razeBuildings, paying no EXP', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'fire');
      c.crushes.length = 0;
      mech.update(DT, c.ctx);
      expect(c.crushes.some((x) => x.amount === M.laserBuildingDps * DT)).toBe(true);
      expect(c.paid).toEqual([]);
    });

    it('stops at once when it dies or is cleared mid-beam', () => {
      for (const stop of [(m: Mech) => body(m).applyDamage(1e9), (m: Mech) => m.clear()]) {
        const c = makeCtx();
        const mech = ready(c);
        until(mech, c, 'fire');
        expect(inner(mech).laser.visible).toBe(true);
        stop(mech);
        expect(inner(mech).laser.visible).toBe(false);
        c.hits.length = 0;
        mech.update(DT, c.ctx);
        expect(inner(mech).laser.visible).toBe(false);
        expect(c.hits).toEqual([]);
      }
    });

    it('flags a locked or firing line on the monster as a threat', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'aim');
      expect(mech.laserThreat(c.monster.position)).toBe(false);
      until(mech, c, 'lock');
      expect(mech.laserThreat(c.monster.position)).toBe(true);
    });

    it('draws streaks only during the charge, running in toward the eye', () => {
      const c = makeCtx();
      const mech = ready(c);
      const s = inner(mech).laser.streaks;
      expect(s.visible).toBe(false);
      until(mech, c, 'charge');
      mech.update(DT, c.ctx);
      expect(s.visible).toBe(true);
      expect(s.geometry.drawRange.count / 2).toBeGreaterThanOrEqual(M.laserStreaks[0]);
      expect(s.geometry.drawRange.count / 2).toBeLessThanOrEqual(M.laserStreaks[1]);
      // A streak's head (vertex 2i) and tail (vertex 2i + 1), relative to the eye.
      const pos = s.geometry.getAttribute('position') as THREE.BufferAttribute;
      const reach = (v: number) => Math.hypot(pos.getX(v), pos.getY(v), pos.getZ(v));
      const tick = 0.01;
      let closed = 0;
      for (let k = 0; k < 8; k++) {
        const heads = Array.from({ length: M.laserStreaks[0] }, (_, i) => reach(i * 2));
        mech.update(tick, c.ctx);
        heads.forEach((h, i) => {
          if (reach(i * 2) < h) closed++;
          else if (reach(i * 2) > h + 1e-3) closed--;
        });
      }
      // Only a streak that expires and respawns further out may ever step away from the eye.
      expect(closed).toBeGreaterThan(M.laserStreaks[0] * 4);
      expect(s.position.distanceTo(inner(mech).rig.eye(new THREE.Vector3()))).toBeLessThan(1e-6);
      until(mech, c, 'aim');
      expect(s.visible).toBe(false);
    });

    it('clears the streaks on death', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'charge');
      mech.update(DT, c.ctx);
      body(mech).applyDamage(1e9);
      expect(inner(mech).laser.streaks.visible).toBe(false);
    });

    it('gives up when the monster dies before the beam fires', () => {
      const c = makeCtx();
      const mech = ready(c);
      until(mech, c, 'aim');
      c.monster.alive = false;
      mech.update(DT, c.ctx);
      expect(inner(mech).action).toBe('walk');
      expect(inner(mech).laser.visible).toBe(false);
      expect(inner(mech).laserCd).toBeGreaterThan(0);
    });
  });
});
