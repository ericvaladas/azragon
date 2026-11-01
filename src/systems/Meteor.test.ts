import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { Meteor, type MeteorEvent } from './Meteor';
import type { Particles } from './Particles';

const M = CONFIG.meteor;
const stub = { emit: () => {}, ring: () => {}, explosion: () => {} } as unknown as Particles;
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
    expect(run(m, M.lookUp + M.fallTime - 0.2)).toEqual([]);
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
    run(m, M.lookUp + M.fallTime + 0.2);
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
    run(m, M.lookUp + M.fallTime + 0.2);
    m.clear();
    expect(m.cutsceneActive).toBe(false);
    expect(m.onGround).toBe(false);
    expect(m.lookK()).toBe(0);
  });

  it('cutscene ends after the full timeline', () => {
    const m = make();
    m.start(AT);
    expect(m.cutsceneActive).toBe(true);
    run(m, M.lookUp + M.fallTime + M.hold + M.lookBack + 0.2);
    expect(m.cutsceneActive).toBe(false);
    expect(m.onGround).toBe(true);
  });
});
