import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Meteor, type MeteorEvent } from './Meteor';
import type { Particles } from './Particles';

const M = CONFIG.meteor;
const stub = { emit: () => {}, ring: () => {}, explosion: () => {} } as unknown as Particles;
const recorder = () => {
  const calls: { kind: string; count: number }[] = [];
  const p = { emit: (kind: string, _at: unknown, count: number) => calls.push({ kind, count }), ring: () => {}, explosion: () => {} } as unknown as Particles;
  return { calls, p };
};
const make = () => new Meteor(new THREE.Scene(), stub);
const AT = { x: 500, z: 300 };
const FAR = { x: -5000, z: 0 };

/** Steps in 0.05 s frames until `seconds` pass, returning every event. */
function run(m: Meteor, seconds: number, monster = FAR, airborne = false): MeteorEvent[] {
  const out: MeteorEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    const e = m.update(0.05, monster, 50, airborne);
    if (e) out.push(e);
  }
  return out;
}

describe('Meteor', () => {
  it('reports landed once, after fallTime', () => {
    const m = make();
    m.start(AT);
    expect(run(m, M.fallStart + M.fallTime - 0.2)).toEqual([]);
    expect(m.onGround).toBe(false);
    expect(run(m, 0.5)).toEqual(['landed']);
    expect(m.onGround).toBe(true);
    expect(run(m, 5)).toEqual([]);
    expect(m.position.x).toBeCloseTo(AT.x);
    expect(m.position.z).toBeCloseTo(AT.z);
  });

  it('not collected while falling, even with the monster underneath', () => {
    const m = make();
    m.start(AT);
    const ev: (MeteorEvent | null)[] = [];
    while (ev[ev.length - 1] !== 'landed') ev.push(m.update(0.05, AT, 50, false));
    expect(ev.filter((e) => e !== null)).toEqual(['landed']);
    expect(m.update(0.05, AT, 50, false)).toBe('collected');
  });

  it('collected once when walked onto, not while airborne', () => {
    const m = make();
    m.start(AT);
    run(m, M.fallStart + M.fallTime + 0.2);
    expect(run(m, 1, AT, true)).toEqual([]);
    expect(run(m, 1, AT, false)).toEqual(['collected']);
    expect(run(m, 1, AT, false)).toEqual([]);
    expect(m.onGround).toBe(false);
  });

  it('zero dt freezes the cutscene', () => {
    const m = make();
    m.start(AT);
    run(m, 0.6);
    const k = m.lookK();
    expect(k).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) m.update(0, FAR, 50, false);
    expect(m.lookK()).toBe(k);
  });

  it('clear stops the cutscene and hides it', () => {
    const m = make();
    m.start(AT);
    run(m, M.fallStart + M.fallTime + 0.2);
    m.clear();
    expect(m.cutsceneActive).toBe(false);
    expect(m.onGround).toBe(false);
    expect(m.lookK()).toBe(0);
  });

  it('cutscene ends after the full timeline', () => {
    const m = make();
    m.start(AT);
    expect(m.cutsceneActive).toBe(true);
    run(m, M.fallStart + M.fallTime + M.hold + M.lookBack + 0.2);
    expect(m.cutsceneActive).toBe(false);
    expect(m.onGround).toBe(true);
  });
});

describe('Meteor fall during the camera blend', () => {
  it('is above ground and visible when the camera blend first reaches its hold', () => {
    const scene = new THREE.Scene();
    const m = new Meteor(scene, stub);
    const gem = scene.getObjectByName('meteor-gem')!;
    m.start(AT);
    expect(gem.visible).toBe(false);
    while (m.lookK() < 1) m.update(0.01, FAR, 50, false);
    expect(m.onGround).toBe(false);
    expect(gem.visible).toBe(true);
    expect(gem.position.y).toBeGreaterThan(0);
    expect(gem.position.y).toBeLessThan(M.startHeight);
    expect(m.lookPoint().y).toBeCloseTo(gem.position.y);
  });

  it('lands after the camera is looking at the sky', () => {
    expect(M.fallStart + M.fallTime).toBeGreaterThan(M.lookUp);
    expect(M.fallStart).toBeLessThan(M.lookUp);
    const m = make();
    m.start(AT);
    let landedAt = -1;
    for (let t = 0; t < 10 && landedAt < 0; t += 0.01) {
      if (m.update(0.01, FAR, 50, false) === 'landed') landedAt = m.lookK();
    }
    expect(landedAt).toBe(1);
  });
});

describe('Meteor beacon', () => {
  it('emits nothing before landing or at dt = 0, then a steady column at the configured rates', () => {
    const { calls, p } = recorder();
    const m = new Meteor(new THREE.Scene(), p);
    m.start(AT);
    run(m, M.fallStart + M.fallTime - 0.2);
    expect(calls.some((c) => c.kind === 'beacon' || c.kind === 'beaconSpark')).toBe(false);
    run(m, 0.5);
    calls.length = 0;
    for (let i = 0; i < 20; i++) m.update(0, FAR, 50, false);
    expect(calls).toEqual([]);
    const total = (kind: string) => calls.filter((c) => c.kind === kind).reduce((a, c) => a + c.count, 0);
    run(m, 4);
    expect(total('beacon')).toBeGreaterThanOrEqual(4 * M.beaconRate - 2);
    expect(total('beacon')).toBeLessThanOrEqual(4 * M.beaconRate + 2);
    expect(total('beaconSpark')).toBeGreaterThanOrEqual(4 * M.beaconSparkRate - 2);
    expect(total('beaconSpark')).toBeLessThanOrEqual(4 * M.beaconSparkRate + 2);
    expect(M.beaconRate + M.beaconSparkRate).toBeLessThan(100);
  });

  it('stops after pickup and the pillar hides', () => {
    const scene = new THREE.Scene();
    const { calls, p } = recorder();
    const m = new Meteor(scene, p);
    const pillar = scene.getObjectByName('meteor-pillar')!;
    m.start(AT);
    run(m, M.fallStart + M.fallTime + 0.2);
    expect(pillar.visible).toBe(true);
    expect(run(m, 0.1, AT)).toEqual(['collected']);
    expect(pillar.visible).toBe(false);
    calls.length = 0;
    run(m, 1, AT);
    expect(calls).toEqual([]);
  });
});

describe('Meteor crater', () => {
  it('appears at the landing site on impact, stays after pickup, and clear hides it', () => {
    const scene = new THREE.Scene();
    const m = new Meteor(scene, stub);
    const crater = scene.getObjectByName('meteor-crater')!;
    expect(crater.visible).toBe(false);
    m.start(AT);
    run(m, M.fallStart + M.fallTime - 0.2);
    expect(crater.visible).toBe(false);
    run(m, 0.5);
    expect(crater.visible).toBe(true);
    expect(crater.position.x).toBeCloseTo(AT.x);
    expect(crater.position.z).toBeCloseTo(AT.z);
    expect(run(m, 0.1, AT)).toEqual(['collected']);
    expect(crater.visible).toBe(true);
    m.clear();
    expect(crater.visible).toBe(false);
  });
});
