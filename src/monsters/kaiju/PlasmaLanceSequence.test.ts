import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { bearingOf, lancePhase } from './plasmaLance';
import { PlasmaLance, type PlasmaLanceHost } from './PlasmaLanceSequence';

const U = CONFIG.kaiju.ultimate;
const T = U.t;
const BOSS = CONFIG.wendigo.ultimate.bossDamage;
const O = { x: 0, z: 0 };
const last = <X>(a: X[]) => a[a.length - 1];

/** A target at `bearing` (rad from facing 0, + to the left) `r` m out, `y` m up. */
const unit = (bearing: number, r: number, y = 0, extra: Partial<Target> = {}): Target => {
  let alive = true;
  return {
    kind: y > 0 ? 'heli' : 'tank',
    position: new THREE.Vector3(Math.sin(bearing) * r, y, Math.cos(bearing) * r),
    radius: 30,
    airborne: y > 0,
    isAlive: () => alive,
    applyDamage: (d: number) => {
      if (d >= 1e9) alive = false;
    },
    ...extra,
  } as Target;
};

function rig(enemies: Target[], buildings: Target[] = [], facing = 0) {
  let now = 0;
  const log = {
    destroyed: [] as [Target, number][],
    bosses: [] as [Target, number][],
    aims: [] as [THREE.Vector3 | null, number][],
    sky: [] as number[],
    camera: [] as number[],
    flash: [] as number[],
    holds: [] as number[],
    roars: [] as [number, number][],
    releases: 0,
    vapor: 0,
    impact: 0,
  };
  const host: PlasmaLanceHost = {
    enemies: () => enemies,
    buildingsWithin: () => buildings,
    destroy: (t) => {
      log.destroyed.push([t, now]);
      t.applyDamage(1e9);
    },
    hurtBoss: (t, d) => log.bosses.push([t, d]),
    facing: () => facing,
    jaws: (out) => out.set(0, 340, 60),
    aim: (at) => log.aims.push([at ? at.clone() : null, now]),
    hold: (blaze, roar) => {
      log.holds.push(blaze);
      log.roars.push([roar, now]);
    },
    release: () => log.releases++,
    sky: (k) => log.sky.push(k),
    camera: (k) => log.camera.push(k),
    shake: () => {},
    flash: (k) => log.flash.push(k),
    burst: (_at, kind) => {
      if (kind === 'vapor') log.vapor++;
      else log.impact++;
    },
  };
  let seed = 11;
  const s = new PlasmaLance(new THREE.Scene(), host, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  let ends = 0;
  const run = (until: number, step = 1 / 60) => {
    while (now < until - 1e-9) {
      now += step;
      if (s.update(step)) ends++;
    }
  };
  return { s, log, run, ends: () => ends, at: () => now };
}

/** When the sweep reaches `bearing` (s). */
const sweepReaches = (bearing: number) => T.fire + ((bearing + U.halfAngle) / (2 * U.halfAngle)) * (T.sweepTo - T.fire);

describe('PlasmaLance', () => {
  it('destroys what is in the wedge in sweep order, right first, each as the beam passes', () => {
    const bearings = [-0.9, -0.3, 0.4, 0.95];
    const inside = bearings.map((b) => unit(b, 600, 0, { radius: 5 }));
    const outside = unit(1.3, 600);
    const behind = unit(Math.PI, 600);
    const r = rig([inside[2]!, outside, inside[0]!, behind, inside[3]!, inside[1]!]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.destroyed.map(([t]) => t)).toEqual(inside);
    r.log.destroyed.forEach(([, t], i) => expect(Math.abs(t - sweepReaches(bearings[i]!))).toBeLessThan(0.05));
    expect(outside.isAlive()).toBe(true);
    expect(behind.isAlive()).toBe(true);
  });

  it('a moving target is cut where it is when the beam reaches it, not where it was', () => {
    const heli = unit(0.9, 700, 300, { radius: 5 });
    const r = rig([heli]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.fire + 0.05);
    heli.position.set(Math.sin(-0.5) * 700, 300, Math.cos(-0.5) * 700);
    r.run(T.end + 0.1);
    expect(r.log.destroyed).toHaveLength(1);
    expect(Math.abs(r.log.destroyed[0]![1] - sweepReaches(-0.5))).toBeLessThan(0.05);
  });

  it('a target that moves into the wedge after the beam fires is still cut as it passes', () => {
    const tank = unit(1.6, 600, 0, { radius: 5 });
    const r = rig([tank]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.fire + 0.05);
    tank.position.set(Math.sin(0.3) * 600, 0, Math.cos(0.3) * 600);
    r.run(T.end + 0.1);
    expect(tank.isAlive()).toBe(false);
  });

  it('buildings in the wedge collapse as it passes; outside ones stand', () => {
    const a = unit(-0.5, 900, 0, { kind: 'building' });
    const b = unit(0.6, 300, 0, { kind: 'building' });
    const c = unit(1.4, 700, 0, { kind: 'building' });
    const r = rig([], [a, b, c]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.destroyed.map(([t]) => t)).toEqual([a, b]);
  });

  it('cuts down aircraft at altitude', () => {
    const heli = unit(0, 700, 800);
    const r = rig([heli]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.destroyed.map(([t]) => t)).toEqual([heli]);
  });

  it('bosses take the heavy ultimate damage instead', () => {
    const boss = unit(0.2, 500, 0, { boss: true });
    const r = rig([boss]);
    r.s.start(new THREE.Vector3(), 2);
    r.run(T.end + 0.1);
    expect(r.log.bosses).toEqual([[boss, BOSS * 2]]);
    expect(r.log.destroyed).toHaveLength(0);
  });

  it('a hitch still catches everything it swept past', () => {
    const inside = [-0.9, -0.3, 0.4, 0.95].map((b) => unit(b, 600));
    const r = rig(inside);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.5, 0.5);
    expect(r.log.destroyed.map(([t]) => t)).toEqual(inside);
  });

  it('a target poking into the wedge edge or right beside the Kaiju is caught', () => {
    const edge = unit(1.1, 400, 0, { kind: 'building', radius: 80 });
    const close = unit(0.2, 25);
    const r = rig([close], [edge]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(edge.isAlive()).toBe(false);
    expect(close.isAlive()).toBe(false);
  });

  it('a Kaiju facing near ±π sweeps its own front', () => {
    const ahead = unit(3.0, 600);
    const behindIt = unit(3.0 - Math.PI, 600);
    const r = rig([ahead, behindIt], [], 3.0);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(ahead.isAlive()).toBe(false);
    expect(behindIt.isAlive()).toBe(true);
  });

  it('vaporizes floating debris in the wedge as the beam passes; the rest settle', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    const debris = r.s['debris'];
    for (let i = 0; i < debris.count; i++) expect(debris.alive(i)).toBe(false);
    // The beam's wedge is a third of the way round: about that share is vaporized, the rest settle.
    expect(r.log.vapor).toBeGreaterThanOrEqual(0.2 * U.debris);
    expect(r.log.vapor).toBeLessThan(0.5 * U.debris);
  });

  it('the debris left after the sweep is all back down before the end, not cleared in mid-air', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end - 0.05);
    expect(r.s.active).toBe(true);
    const debris = r.s['debris'];
    for (let i = 0; i < debris.count; i++) expect(debris.alive(i)).toBe(false);
  });

  it('burns the ground along the whole length of the beam, from near the Kaiju out to its end', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run((T.fire + T.sweepTo) / 2);
    const scars = r.s['beam']['scars'] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const ds: number[] = [];
    for (let i = 0; i < scars.count; i++) {
      p.setFromMatrixPosition((scars.getMatrixAt(i, m), m));
      ds.push(Math.hypot(p.x, p.z));
    }
    expect(Math.min(...ds)).toBeLessThanOrEqual(U.scarFrom + 1);
    expect(Math.max(...ds)).toBeGreaterThan(0.85 * U.range);
  });

  it('holds the Kaiju roaring by the timeline, building slowly from Q and done before it turns', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    for (const [roar, t] of r.log.roars) expect(roar).toBeCloseTo(lancePhase(t).roar);
    expect(Math.max(...r.log.roars.map(([k]) => k))).toBe(1);
    expect(r.log.roars.find(([, t]) => t >= 0.25)![0]).toBeLessThan(0.2);
  });

  it('turns the head round to the right edge before firing, with no jump into the sweep', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    const aims = r.log.aims.filter(([p]) => p).map(([p, t]) => [bearingOf(O, 0, { x: p!.x, z: p!.z }), t] as const);
    expect(aims[0]![1]).toBeLessThan(T.roarTo + 0.02);
    expect(aims[0]![0]).toBeCloseTo(0, 1);
    // The eased turn peaks near 0.05 rad a frame; firing used to jump a full halfAngle (1.05 rad) in one.
    for (let i = 1; i < aims.length; i++) expect(Math.abs(aims[i]![0] - aims[i - 1]![0])).toBeLessThan(0.1);
  });


  it('aims the head along the sweep and lets go after', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    const during = r.log.aims.filter(([p, t]) => p && t >= T.fire && t <= T.sweepTo);
    expect(during.length).toBeGreaterThan(60);
    for (const [p, t] of during) expect(Math.abs(bearingOf(O, 0, { x: p!.x, z: p!.z }) - lancePhase(t).sweep)).toBeLessThan(0.05);
    expect(last(r.log.aims)![0]).toBeNull();
  });

  it('pauses freeze it', () => {
    const units = [-0.9, 0.4].map((b) => unit(b, 600));
    const r = rig(units);
    r.s.start(new THREE.Vector3(), 1);
    r.run((T.fire + T.sweepTo) / 2);
    const destroyed = r.log.destroyed.length;
    const aim = last(r.log.aims)![0]!.clone();
    const scale = r.s.timeScale();
    for (let i = 0; i < 100; i++) r.s.update(0);
    expect(r.log.destroyed).toHaveLength(destroyed);
    expect(last(r.log.aims)![0]!.distanceTo(aim)).toBeLessThan(1e-9);
    expect(r.s.timeScale()).toBe(scale);
    expect(r.s.active).toBe(true);
  });

  it('cancel mid-sweep restores everything', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run((T.fire + T.sweepTo) / 2);
    r.s.cancel();
    expect(r.log.releases).toBe(1);
    expect(last(r.log.sky)).toBe(0);
    expect(last(r.log.camera)).toBe(0);
    expect(last(r.log.flash)).toBe(0);
    expect(last(r.log.aims)![0]).toBeNull();
    expect(r.s.timeScale()).toBe(1);
    expect(r.s.active).toBe(false);
    expect(r.s['beam']['core'].visible).toBe(false);
    const debris = r.s['debris'];
    for (let i = 0; i < debris.count; i++) expect(debris.alive(i)).toBe(false);
  });

  it('ends once, with time scale 1, releasing the Kaiju', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 1);
    expect(r.ends()).toBe(1);
    expect(r.s.timeScale()).toBe(1);
    expect(r.log.releases).toBe(1);
    expect(last(r.log.holds)).toBeLessThan(0.05);
  });
});
