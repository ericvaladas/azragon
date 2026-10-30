import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Vec2 } from '../../util/math';
import { Devour, type DevourHost } from './DevourSequence';

const U = CONFIG.wendigo.ultimate;
const last = (a: number[]) => a[a.length - 1];
const T = U.t;

const unit = (x: number, extra: Partial<Target> = {}): Target & { hits: number[] } => {
  const hits: number[] = [];
  let alive = true;
  return {
    kind: 'tank',
    position: new THREE.Vector3(x, 0, 0),
    radius: 30,
    airborne: false,
    isAlive: () => alive,
    applyDamage: (d: number) => {
      hits.push(d);
      if (d >= 1e9) alive = false;
    },
    hits,
    ...extra,
  };
};

function rig(enemies: Target[], buildings: Target[] = []) {
  const log = { taken: [] as Target[], bosses: [] as [Target, number][], sky: [] as number[], camera: [] as number[], buildingT: [] as [number, number][] };
  let now = 0;
  const host: DevourHost = {
    enemies: () => enemies,
    take: (t) => {
      log.taken.push(t);
      t.applyDamage(1e9);
    },
    hurtBoss: (t, d) => log.bosses.push([t, d]),
    buildingsWithin: (_c: Vec2, _r: number) => buildings,
    sky: (k) => log.sky.push(k),
    camera: (k) => log.camera.push(k),
    shake: () => {},
    flash: () => {},
    burst: () => {},
  };
  for (const b of buildings) {
    const apply = b.applyDamage;
    (b as { applyDamage: (d: number) => void }).applyDamage = (d) => {
      log.buildingT.push([b.position.x, now]);
      apply(d);
    };
  }
  const camera = new THREE.PerspectiveCamera();
  const d = new Devour(new THREE.Scene(), camera, host, () => 0.5);
  const run = (until: number, step = 1 / 60) => {
    while (now < until - 1e-9) {
      d.update(step);
      now += step;
    }
  };
  return { d, log, run, at: () => now };
}

describe('Devour', () => {
  it('takes victims at the grasp, buildings over the drag, nearest first', () => {
    const near = unit(200);
    const far = unit(800);
    const b1 = unit(100, { kind: 'building' });
    const b2 = unit(700, { kind: 'building' });
    const { d, log, run } = rig([near, far], [b2, b1]);
    d.start(new THREE.Vector3(), 1);
    run(T.grasp - 0.05);
    expect(log.taken).toEqual([]);
    run(T.grasp + 0.05);
    expect(new Set(log.taken)).toEqual(new Set([near, far]));
    expect(log.taken.length).toBe(2);
    run(T.dragFrom - 0.02);
    expect(log.buildingT).toEqual([]);
    run(T.dragTo + 0.02);
    const [first, second] = log.buildingT;
    expect(first![0]).toBe(100);
    expect(second![0]).toBe(700);
    expect(first![1]).toBeLessThan(second![1]);
    expect(first![1]).toBeGreaterThanOrEqual(T.dragFrom - 1e-6);
    expect(second![1]).toBeLessThanOrEqual(T.dragTo + 1e-6);
  });

  it('bosses take bossDamage × damageMult and are not taken', () => {
    const boss = unit(100, { boss: true });
    const { d, log, run } = rig([boss]);
    d.start(new THREE.Vector3(), 1.5);
    run(T.grasp + 0.05);
    expect(log.taken).toEqual([]);
    expect(log.bosses).toEqual([[boss, U.bossDamage * 1.5]]);
  });

  it('pauses freeze the timeline', () => {
    const { d, log } = rig([unit(100)]);
    d.start(new THREE.Vector3(), 1);
    d.update(0);
    d.update(0);
    expect(log.taken).toEqual([]);
    expect(d.timeScale()).toBe(1);
    expect(d.active).toBe(true);
  });

  it('takes enemies that walk in before the grasp, not those after it', () => {
    const late = unit(5000);
    const enemies: Target[] = [];
    const { d, log, run } = rig(enemies);
    d.start(new THREE.Vector3(), 1);
    run(T.emergeFrom + 0.1);
    enemies.push(late);
    late.position.x = 300;
    run(T.grasp + 0.05);
    expect(log.taken).toEqual([late]);
    const later = unit(300);
    enemies.push(later);
    run(T.end + 0.1);
    expect(log.taken).toEqual([late]);
  });

  it('ends at the end beat with sky(0), camera(0) and time scale 1', () => {
    const { d, log, run } = rig([]);
    d.start(new THREE.Vector3(), 1);
    run(1);
    expect(d.timeScale()).toBeCloseTo(U.timeScale);
    let ended = false;
    for (let i = 0; i < 400 && !ended; i++) ended = d.update(1 / 60);
    expect(ended).toBe(true);
    expect(d.active).toBe(false);
    expect(last(log.sky)).toBe(0);
    expect(last(log.camera)).toBe(0);
    expect(d.timeScale()).toBe(1);
  });

  it('cancel restores everything', () => {
    const { d, log, run } = rig([unit(100)]);
    d.start(new THREE.Vector3(), 1);
    run(2);
    d.cancel();
    expect(d.active).toBe(false);
    expect(last(log.sky)).toBe(0);
    expect(last(log.camera)).toBe(0);
    expect(d.timeScale()).toBe(1);
  });
});
