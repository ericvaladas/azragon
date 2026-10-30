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

function rig(enemies: Target[], buildings: Target[] = [], rand: () => number = () => 0.5) {
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
  const d = new Devour(new THREE.Scene(), camera, host, rand);
  const run = (until: number, step = 1 / 60) => {
    while (now < until - 1e-9) {
      d.update(step);
      now += step;
    }
  };
  return { d, log, run, at: () => now };
}

describe('Devour', () => {
  it('takes each victim as its own hand closes, the hands coming in at their own times', () => {
    const near = unit(200);
    const far = unit(800);
    let r = 0;
    const seq = [0.05, 0.95];
    const { d, log, run, at } = rig([near, far], [], () => seq[r++ % 2]!);
    const when = new Map<Target, number>();
    const take = log.taken;
    d.start(new THREE.Vector3(), 1);
    // Nothing is taken before the hands start to rise.
    run(T.circleTo - 0.02);
    expect(take).toEqual([]);
    for (let i = 0; i < 300 && take.length < 2; i++) {
      run(at() + 1 / 60);
      for (const t of take) if (!when.has(t)) when.set(t, at());
    }
    expect(new Set(take)).toEqual(new Set([near, far]));
    const times = [...when.values()];
    expect(Math.abs(times[0]! - times[1]!)).toBeGreaterThan(0.3);
  });

  it('brings the buildings down as the circle opens, nearest first, spreading out with it', () => {
    const b1 = unit(100, { kind: 'building' });
    const b2 = unit(700, { kind: 'building' });
    const { d, log, run } = rig([], [b2, b1]);
    d.start(new THREE.Vector3(), 1);
    run(T.circleFrom - 0.02);
    expect(log.buildingT).toEqual([]);
    run(T.circleTo + 0.02);
    const [first, second] = log.buildingT;
    expect(first![0]).toBe(100);
    expect(second![0]).toBe(700);
    expect(first![1]).toBeLessThan(second![1]);
    expect(first![1]).toBeGreaterThanOrEqual(T.circleFrom - 1e-6);
    expect(second![1]).toBeLessThanOrEqual(T.circleTo + 1e-6);
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
    run(T.grasp - 0.5);
    enemies.push(late);
    late.position.x = 300;
    run(T.grasp + 0.05);
    expect(log.taken).toEqual([late]);
    const later = unit(300);
    enemies.push(later);
    run(T.end + 0.1);
    expect(log.taken).toEqual([late]);
  });

  it('ends at the end beat with sky(0) and time scale 1, then eases the camera home by outroFrom + cameraOut', () => {
    const { d, log, run } = rig([]);
    d.start(new THREE.Vector3(), 1);
    run(1);
    expect(d.timeScale()).toBeCloseTo(U.timeScale);
    let ended = false;
    for (let i = 0; i < 400 && !ended; i++) ended = d.update(1 / 60);
    expect(ended).toBe(true);
    expect(d.active).toBe(false);
    expect(last(log.sky)).toBe(0);
    expect(d.timeScale()).toBe(1);
    expect(last(log.camera)).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) d.update(1 / 60);
    expect(last(log.camera)).toBe(0);
    const calls = log.camera.length;
    d.update(1 / 60);
    expect(log.camera.length).toBe(calls);
  });

  it('ends only once every hand is down; the hands then just dissolve, and a cancel clears them at once', () => {
    const { d } = rig([unit(300)]);
    const hands = () => (d as unknown as { hands: { count: number; dragging(): boolean } }).hands;
    d.start(new THREE.Vector3(), 1);
    for (let i = 0; i < 1200 && d.active; i++) d.update(1 / 60);
    expect(d.active).toBe(false);
    expect(hands().dragging()).toBe(false);
    for (let i = 0; i < 600 && hands().count > 0; i++) d.update(1 / 60);
    expect(hands().count).toBe(0);

    const again = rig([unit(300)]);
    again.d.start(new THREE.Vector3(), 1);
    for (let i = 0; i < 160; i++) again.d.update(1 / 60);
    again.d.cancel();
    expect((again.d as unknown as { hands: { count: number } }).hands.count).toBe(0);
  });

  it('keeps the black circle while any hand is still dragging, and it is gone once the effect has ended', () => {
    const jet = unit(400, { position: new THREE.Vector3(400, 650, 0), airborne: true });
    const { d } = rig([jet], [], () => 0.95);
    const circle = (d as unknown as { circle: THREE.Mesh }).circle;
    const hands = (d as unknown as { hands: { dragging(): boolean } }).hands;
    d.start(new THREE.Vector3(), 1);
    let sawHold = false;
    for (let i = 0; i < 2400 && d.active; i++) {
      d.update(1 / 60);
      if (d.active && hands.dragging() && (d as unknown as { t: number }).t >= T.outroFrom) {
        sawHold = true;
        expect((circle.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0.9);
      }
    }
    expect(sawHold).toBe(true);
    for (let i = 0; i < 120; i++) d.update(1 / 60);
    expect(circle.visible).toBe(false);
  });

  it('holds the whole effect until the last hand has dragged its victim under, then winds down', () => {
    const jet = unit(400, { position: new THREE.Vector3(400, 650, 0), airborne: true });
    const { d, log } = rig([jet], [], () => 0.99);
    const hands = (d as unknown as { hands: { dragging(): boolean } }).hands;
    d.start(new THREE.Vector3(), 1);
    let t = 0;
    let ended = false;
    for (; t < 30 && !ended; t += 1 / 60) {
      ended = d.update(1 / 60);
      if (!ended && t > T.end) {
        // Past the usual end but a hand is still out: everything holds.
        if (hands.dragging()) {
          expect(d.active).toBe(true);
          expect(last(log.sky)).toBe(1);
          expect(d.timeScale()).toBeCloseTo(U.timeScale);
        }
      }
    }
    expect(ended).toBe(true);
    expect(log.taken).toEqual([jet]);
    expect(hands.dragging()).toBe(false);
    expect(t).toBeGreaterThan(T.end + 1);
  });

  it('a new start or a cancel mid-return snaps the camera home', () => {
    const { d, log } = rig([]);
    d.start(new THREE.Vector3(), 1);
    for (let i = 0; i < 300 && d.active; i++) d.update(1 / 60);
    d.update(1 / 60);
    expect(last(log.camera)).toBeGreaterThan(0);
    d.cancel();
    expect(last(log.camera)).toBe(0);
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
