import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { rainPhase } from './spikeRain';
import { SpikeRain, type SpikeRainHost } from './SpikeRainSequence';

const U = CONFIG.insect.ultimate;
const T = U.t;
const BOSS = CONFIG.wendigo.ultimate.bossDamage;
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
    sky: [] as number[],
    camera: [] as number[],
    holds: [] as [number, number][],
    releases: 0,
    bursts: [] as [THREE.Vector3, number][],
    launches: [] as number[],
  };
  const host: SpikeRainHost = {
    enemies: () => enemies,
    buildingsWithin: () => buildings,
    destroy: (t) => {
      log.destroyed.push([t, now]);
      t.applyDamage(1e9);
    },
    hurtBoss: (t, d) => log.bosses.push([t, d]),
    facing: () => facing,
    mouth: (out) => {
      log.launches.push(now);
      return out.set(0, 520, 380);
    },
    hold: (roar) => log.holds.push([roar, now]),
    release: () => log.releases++,
    sky: (k) => log.sky.push(k),
    camera: (k) => log.camera.push(k),
    shake: () => {},
    burst: (at) => log.bursts.push([at.clone(), now]),
  };
  let seed = 17;
  const s = new SpikeRain(new THREE.Scene(), host, 0xffffff, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  let ends = 0;
  const run = (until: number, step = 1 / 60) => {
    while (now < until - 1e-9) {
      now += step;
      if (s.update(step)) ends++;
    }
  };
  return { s, log, run, ends: () => ends, at: () => now };
}

describe('SpikeRain', () => {
  it('destroys everything in the area during the rain; nothing outside is touched', () => {
    const inside = [unit(-0.7, 400), unit(-0.3, 900), unit(0, 1300), unit(0.2, 600), unit(0.5, 800), unit(0.8, 1100)];
    const houses = [unit(-0.4, 700, 0, { kind: 'building', radius: 60 }), unit(0.3, 1200, 0, { kind: 'building', radius: 60 })];
    const outside = [unit(0, 150), unit(0, 1600), unit(1.3, 800), unit(Math.PI, 700)];
    const r = rig([...inside, ...outside], houses);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    for (const t of [...inside, ...houses]) {
      const hit = r.log.destroyed.find(([d]) => d === t);
      expect(hit).toBeDefined();
      expect(hit![1]).toBeGreaterThanOrEqual(T.rainFrom);
      expect(hit![1]).toBeLessThanOrEqual(T.rainTo + 0.05);
    }
    for (const t of outside) expect(t.isAlive()).toBe(true);
  });

  it('cuts down aircraft over the area', () => {
    const heli = unit(0.2, 700, 600);
    const r = rig([heli]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(heli.isAlive()).toBe(false);
  });

  it('bosses take the heavy ultimate damage instead', () => {
    const boss = unit(0.1, 700, 0, { boss: true });
    const r = rig([boss]);
    r.s.start(new THREE.Vector3(), 2);
    r.run(T.end + 0.1);
    expect(r.log.bosses).toEqual([[boss, BOSS * 2]]);
    expect(r.log.destroyed).toHaveLength(0);
  });

  it('more targets than the pool: every one is still destroyed', () => {
    const many = Array.from({ length: U.pool + 40 }, (_, i) => unit(-0.8 + (1.6 * i) / (U.pool + 40), 300 + ((i * 37) % 1000)));
    const r = rig(many);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    for (const t of many) expect(t.isAlive()).toBe(false);
  });

  it('a moving target is hit where it is', () => {
    const heli = unit(0, 700, 300);
    const r = rig([heli]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.volleyFrom + 0.05);
    heli.position.set(Math.sin(0.4) * 800, 300, Math.cos(0.4) * 800);
    r.run(T.end + 0.1);
    expect(heli.isAlive()).toBe(false);
    const [, t] = r.log.destroyed[0]!;
    const at = r.log.bursts.filter(([, b]) => Math.abs(b - t) < 1e-9).map(([p]) => p);
    expect(Math.min(...at.map((p) => p.distanceTo(heli.position)))).toBeLessThan(30);
  });

  it('something that drives in after the gather is caught by the end of the rain', () => {
    const late = unit(Math.PI, 600);
    const r = rig([late]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.volleyFrom + 0.1);
    late.position.set(0, 0, 700);
    r.run(T.end + 0.1);
    expect(late.isAlive()).toBe(false);
  });

  it('an Insect facing near ±π rains on its own front', () => {
    const ahead = unit(3.0, 800);
    const behind = unit(3.0 - Math.PI, 800);
    const r = rig([ahead, behind], [], 3.0);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(ahead.isAlive()).toBe(false);
    expect(behind.isAlive()).toBe(true);
  });

  it('sprays spikes from the mouth through the volley, and lands them through the rain', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    expect(r.log.launches[0]!).toBeLessThanOrEqual(T.rainFrom - U.flight + 1 / 60 + 1e-9);
    expect(last(r.log.launches)!).toBeLessThanOrEqual(T.volleyTo + 1e-9);
    expect(r.log.bursts.length).toBeGreaterThanOrEqual(U.spikes);
    for (const [, t] of r.log.bursts) {
      expect(t).toBeGreaterThanOrEqual(T.rainFrom - 1e-9);
      expect(t).toBeLessThanOrEqual(T.rainTo + 1 / 60);
    }
  });

  it('rears up by the timeline, and sprays once it is mostly up', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 0.1);
    for (const [roar, t] of r.log.holds) expect(roar).toBeCloseTo(rainPhase(t).roar);
    for (const t of r.log.launches) expect(rainPhase(t).roar).toBeGreaterThan(0.7);
  });

  it('pauses freeze it', () => {
    const r = rig([unit(0, 700)]);
    r.s.start(new THREE.Vector3(), 1);
    r.run((T.volleyFrom + T.volleyTo) / 2);
    const launched = r.log.launches.length;
    const scale = r.s.timeScale();
    for (let i = 0; i < 100; i++) r.s.update(0);
    expect(r.log.launches).toHaveLength(launched);
    expect(r.s.timeScale()).toBe(scale);
    expect(r.s.active).toBe(true);
  });

  it('cancel mid-volley restores everything', () => {
    const r = rig([unit(0, 700)]);
    r.s.start(new THREE.Vector3(), 1);
    r.run((T.volleyFrom + T.volleyTo) / 2);
    r.s.cancel();
    expect(r.log.releases).toBe(1);
    expect(last(r.log.sky)).toBe(0);
    expect(last(r.log.camera)).toBe(0);
    expect(r.s.timeScale()).toBe(1);
    expect(r.s.active).toBe(false);
    expect(r.s['spikes'].flying).toBe(0);
  });

  it('ends once, with time scale 1', () => {
    const r = rig([]);
    r.s.start(new THREE.Vector3(), 1);
    r.run(T.end + 1);
    expect(r.ends()).toBe(1);
    expect(r.s.timeScale()).toBe(1);
    expect(r.log.releases).toBe(1);
  });
});
