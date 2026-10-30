import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { InkStorm, type InkStormHost } from './InkStormSequence';

const U = CONFIG.kraken.ultimate;
const T = U.t;
const BOSS = CONFIG.wendigo.ultimate.bossDamage;
const last = <X>(a: X[]) => a[a.length - 1];

const unit = (x: number, y = 0, extra: Partial<Target> = {}): Target & { hits: number[]; kill(): void } => {
  const hits: number[] = [];
  let alive = true;
  return {
    kind: y > 0 ? 'heli' : 'tank',
    position: new THREE.Vector3(x, y, 0),
    radius: 30,
    airborne: y > 0,
    isAlive: () => alive,
    applyDamage: (d: number) => {
      hits.push(d);
      if (d >= 1e9) alive = false;
    },
    kill: () => {
      alive = false;
    },
    hits,
    ...extra,
  };
};

function rig(enemies: Target[], buildings: Target[] = []) {
  let now = 0;
  const log = {
    taken: [] as [Target, number][],
    smashed: [] as [Target, number][],
    bosses: [] as [Target, number][],
    sky: [] as number[],
    camera: [] as number[],
    height: [] as [number | null, number][],
    grabs: [] as THREE.Vector3[][],
    dust: [] as [THREE.Vector3, number][],
    buildingT: [] as [number, number][],
    calls: 0,
  };
  const tips = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos(i) * 200, 50, Math.sin(i) * 200));
  const host: InkStormHost = {
    enemies: () => enemies,
    take: (t) => {
      log.calls++;
      log.taken.push([t, now]);
      t.applyDamage(1e9);
    },
    smash: (t) => {
      log.calls++;
      log.smashed.push([t, now]);
      t.applyDamage(1e9);
    },
    hurtBoss: (t, d) => {
      log.calls++;
      log.bosses.push([t, d]);
    },
    buildingsWithin: () => buildings,
    sky: (k) => {
      log.calls++;
      log.sky.push(k);
    },
    camera: (k) => {
      log.calls++;
      log.camera.push(k);
    },
    shake: () => {},
    height: (y) => {
      log.calls++;
      log.height.push([y, now]);
    },
    tips: () => tips,
    grab: (p) => log.grabs.push(p.map((v) => v.clone())),
    siphon: (out) => out.set(0, 600, 0),
    dust: (at) => log.dust.push([at.clone(), now]),
  };
  for (const b of buildings) {
    const apply = b.applyDamage;
    (b as { applyDamage: (d: number) => void }).applyDamage = (d) => {
      log.buildingT.push([b.position.x, now]);
      apply(d);
    };
  }
  const s = new InkStorm(new THREE.Scene(), new THREE.PerspectiveCamera(), host, () => 0.5);
  let ends = 0;
  const run = (until: number, step = 1 / 60) => {
    while (now < until - 1e-9) {
      now += step;
      if (s.update(step)) ends++;
    }
  };
  return { s, log, run, ends: () => ends, at: () => now };
}

describe('InkStorm', () => {
  it('grabs, leaps to the peak, falls and lands', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.grabs).toHaveLength(1);
    expect(r.log.grabs[0]).toHaveLength(8);
    const hs = r.log.height.map(([y]) => y ?? 0);
    expect(Math.max(...hs)).toBeCloseTo(U.peak, 0);
    const [y, t] = last(r.log.height)!;
    expect(y).toBeNull();
    expect(t).toBeGreaterThanOrEqual(T.fallTo);
    expect(r.log.height.filter(([h]) => h === null)).toHaveLength(1);
  });

  it('takes the ground under the ink nearest first during the ink beat, and the buildings', () => {
    const far = unit(800);
    const near = unit(100);
    const mid = unit(500);
    const heli = unit(50, 300);
    const outside = unit(U.radius + 200);
    const b1 = unit(700, 0, { kind: 'building' });
    const b2 = unit(200, 0, { kind: 'building' });
    const r = rig([far, heli, near, mid, outside], [b1, b2]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.taken.map(([t]) => t)).toEqual([near, mid, far]);
    for (const [, t] of r.log.taken) {
      expect(t).toBeGreaterThanOrEqual(T.inkFrom);
      expect(t).toBeLessThanOrEqual(T.inkTo + 0.02);
    }
    expect(r.log.buildingT.map(([x]) => x)).toEqual([200, 700]);
    for (const [, t] of r.log.buildingT) {
      expect(t).toBeGreaterThanOrEqual(T.inkFrom);
      expect(t).toBeLessThanOrEqual(T.inkTo + 0.02);
    }
    expect(outside.isAlive()).toBe(true);
  });

  it('smashes each of the nearest eight aircraft with its own chunk', () => {
    const air = Array.from({ length: 10 }, (_, i) => unit(80 * (i + 1), 400));
    const r = rig([...air].reverse());
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.smashed.map(([t]) => t)).toEqual(air.slice(0, 8));
    for (const [, t] of r.log.smashed) {
      expect(t).toBeGreaterThanOrEqual(T.throwFrom + U.chunkFlight);
      expect(t).toBeLessThanOrEqual(T.throwTo + U.chunkFlight + 0.02);
    }
    expect(air[8]!.isAlive()).toBe(true);
    expect(air[9]!.isAlive()).toBe(true);
    expect(r.log.taken).toHaveLength(0);
  });

  it('chunks with no aircraft fly down into the ink', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    const thrown = r.log.dust.filter(([, t]) => t > T.throwFrom && t < T.fallTo);
    expect(thrown).toHaveLength(8);
    for (const [p] of thrown) {
      expect(p.y).toBe(0);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(U.radius);
    }
  });

  it('a chunk whose aircraft is already dead lands harmlessly', () => {
    const heli = unit(300, 400);
    const r = rig([heli]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.throwFrom + 0.1);
    heli.kill();
    r.run(T.end + 0.1);
    expect(r.log.smashed).toHaveLength(0);
    expect(heli.hits).toHaveLength(0);
    expect(r.ends()).toBe(1);
  });

  it('bosses take bossDamage', () => {
    const ground = unit(200, 0, { boss: true });
    const air = unit(300, 400, { boss: true });
    const r = rig([ground, air]);
    r.s.start(new THREE.Vector3(), 2);
    r.run(T.end + 0.1);
    expect(r.log.bosses).toEqual([
      [ground, BOSS * 2],
      [air, BOSS * 2],
    ]);
    expect(r.log.taken).toHaveLength(0);
    expect(r.log.smashed).toHaveLength(0);
  });

  it('pauses freeze it', () => {
    const r = rig([unit(100)]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(2.0);
    const h = last(r.log.height)![0];
    const scale = r.s.timeScale();
    for (let i = 0; i < 100; i++) r.s.update(0);
    expect(last(r.log.height)![0]).toBe(h);
    expect(r.s.timeScale()).toBe(scale);
    expect(r.log.taken).toHaveLength(0);
    expect(r.s.active).toBe(true);
  });

  it('cancel restores everything and lands the Kraken', () => {
    const r = rig([unit(100), unit(300, 400)]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(2.5);
    r.s.cancel();
    expect(last(r.log.sky)).toBe(0);
    expect(last(r.log.camera)).toBe(0);
    expect(last(r.log.height)![0]).toBeNull();
    expect(r.s.active).toBe(false);
    expect(r.s.timeScale()).toBe(1);
    const calls = r.log.calls;
    r.run(T.end + 1);
    expect(r.log.calls).toBe(calls);
  });

  it('ends with time scale 1', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(1);
    expect(r.s.timeScale()).toBeCloseTo(U.timeScale);
    r.run(T.end + 0.5);
    expect(r.ends()).toBe(1);
    expect(r.s.active).toBe(false);
    expect(r.s.timeScale()).toBe(1);
    expect(last(r.log.sky)).toBe(0);
    expect(last(r.log.camera)).toBe(0);
  });
});
