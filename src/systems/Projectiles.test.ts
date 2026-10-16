import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Projectiles } from './Projectiles';
import { CONFIG } from '../config';

describe('Projectiles.setTheme', () => {
  it('recolours the monster\'s spikes and globs only', () => {
    const scene = new THREE.Scene();
    const p = new Projectiles(scene);
    const colorOf = (name: string) => ((scene.children.find((c) => c.name === name) as THREE.InstancedMesh).material as THREE.MeshBasicMaterial).color.getHex();
    const shellBefore = colorOf('shot-shell');
    p.setTheme(0x112233, 0x445566);
    expect(colorOf('shot-spike')).toBe(0x112233);
    expect(colorOf('shot-glob')).toBe(0x445566);
    expect(colorOf('shot-shell')).toBe(shellBefore);
  });
});

describe('Projectiles.fireChunk', () => {
  it('lobs a chunk on a high arc that lands on the target after the hurl flight time', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; x: number; z: number; damage: number }[] = [];
    p.onHit = (h) => hits.push({ kind: h.kind, x: h.point.x, z: h.point.z, damage: h.damage });
    p.fireChunk(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, 0, 900), 85);
    let peak = 0;
    const steps = Math.ceil(CONFIG.kraken.arms.hurl.flight / 0.05) + 2;
    for (let i = 0; i < steps; i++) {
      p.update(0.05);
      const s = (p as unknown as { shots: { pos: THREE.Vector3 }[] }).shots[0];
      if (s) peak = Math.max(peak, s.pos.y);
    }
    expect(hits).toEqual([{ kind: 'chunk', x: 0, z: 900, damage: 85 }]);
    expect(peak).toBeGreaterThan(CONFIG.kraken.arms.hurl.arc * 0.8);
    expect(p.incoming()).toHaveLength(0);
  });
});

describe('Projectiles.fireShell', () => {
  it('a tank shell flies at the tank shell speed, landing sooner from closer', () => {
    const land = (dist: number) => {
      const p = new Projectiles(new THREE.Scene());
      let at = -1;
      let t = 0;
      p.onHit = () => (at = t);
      p.fireShell(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, 30, dist), 6);
      for (; t < 5 && at < 0; t += 0.01) p.update(0.01);
      return at;
    };
    expect(land(950)).toBeCloseTo(950 / CONFIG.tank.shellSpeed, 1);
    expect(land(400)).toBeCloseTo(400 / CONFIG.tank.shellSpeed, 1);
  });
});

describe('Projectiles chunk trail', () => {
  it('a Kraken hurl chunk flies without a trail', () => {
    const p = new Projectiles(new THREE.Scene());
    const trail: string[] = [];
    p.onTrail = (_at, kind) => trail.push(kind);
    p.fireChunk(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, 0, 900), 85);
    for (let t = 0; t < CONFIG.kraken.arms.hurl.flight + 0.2; t += 0.05) p.update(0.05);
    expect(trail).toEqual([]);
  });
});

describe('Projectiles spike trail', () => {
  const trails = (p: Projectiles) => {
    const out: string[] = [];
    p.onTrail = (_at, kind) => out.push(kind);
    const target = { kind: 'tank', position: new THREE.Vector3(0, 0, 900), radius: 30, airborne: false, isAlive: () => true, applyDamage: () => {} };
    p.fireSpike(new THREE.Vector3(0, 100, 0), target as never, 10, 0);
    for (let t = 0; t < 1; t += 0.05) p.update(0.05);
    return out;
  };

  it('spikes trail by default', () => {
    expect(trails(new Projectiles(new THREE.Scene()))).toContain('spike');
  });

  it('a theme without spike trails fires bare spikes', () => {
    const p = new Projectiles(new THREE.Scene());
    p.setTheme(0x112233, 0x445566, false);
    expect(trails(p)).toEqual([]);
  });
});

describe('Projectiles.fireWisp and fireShard', () => {
  it('a Hungry Ghost wisp homes onto its target and hits it as a wisp', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; damage: number; hit: boolean }[] = [];
    const target = { position: new THREE.Vector3(600, 0, 300), radius: 40, airborne: false, kind: 'tank', isAlive: () => true, applyDamage: () => {} };
    p.onHit = (h) => hits.push({ kind: h.kind, damage: h.damage, hit: h.target === target });
    p.fireWisp(new THREE.Vector3(0, 300, 0), target as never, 50, 0.2);
    for (let i = 0; i < 80 && hits.length === 0; i++) p.update(0.03);
    expect(hits).toEqual([{ kind: 'wisp', damage: 50, hit: true }]);
  });
  it('a Bone Ward shard flies straight to the point quickly, with no damage and no target', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; x: number; damage: number; t: number }[] = [];
    let t = 0;
    p.onHit = (h) => hits.push({ kind: h.kind, x: Math.round(h.point.x), damage: h.damage, t });
    p.fireShard(new THREE.Vector3(0, 300, 0), new THREE.Vector3(400, 300, 0));
    for (let i = 0; i < 20 && hits.length === 0; i++) { t += 0.02; p.update(0.02); }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'shard', x: 400, damage: 0 });
    expect(hits[0]!.t).toBeLessThanOrEqual(0.26);
    expect(p.incoming()).toHaveLength(0);
  });
});

describe('Projectiles.fireGustavShell', () => {
  it('flies straight at shellSpeed, trailing smoke, and lands as a gustav hit with its damage', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; damage: number }[] = [];
    const trail: { kind: string; y: number; z: number }[] = [];
    p.onHit = (h) => hits.push({ kind: h.kind, damage: h.damage });
    p.onTrail = (at, kind) => trail.push({ kind, y: at.y, z: at.z });
    const from = new THREE.Vector3(0, 60, 0);
    const to = new THREE.Vector3(0, 210, 1500);
    p.fireGustavShell(from, to, 60);
    const flight = from.distanceTo(to) / CONFIG.gustav.shellSpeed;
    for (let t = 0; t < flight - 0.1; t += 0.02) p.update(0.02);
    expect(hits).toEqual([]);
    expect(trail.length).toBeGreaterThan(10);
    for (const q of trail) {
      expect(q.kind).toBe('gustav');
      // On the straight line from the muzzle to the target: no arc.
      expect(q.y).toBeCloseTo(60 + (150 * q.z) / 1500, 3);
    }
    for (let t = 0; t < 0.2; t += 0.02) p.update(0.02);
    expect(hits).toEqual([{ kind: 'gustav', damage: 60 }]);
  });

  it('lays a chemtrail: a puff every trailSpacing metres along its path', () => {
    const p = new Projectiles(new THREE.Scene());
    const trail: number[] = [];
    p.onTrail = (at, kind) => kind === 'gustav' && trail.push(at.z);
    p.fireGustavShell(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1500), 60);
    for (let t = 0; t < 2; t += 1 / 60) p.update(1 / 60);
    const S = CONFIG.gustav.trailSpacing;
    expect(trail.length).toBeGreaterThanOrEqual(Math.floor(1500 / S) - 1);
    for (let i = 1; i < trail.length; i++) expect(trail[i]! - trail[i - 1]!).toBeCloseTo(S, 3);
  });

  it('holds each chemtrail puff until the shell lands, so the whole trail fades together', () => {
    const p = new Projectiles(new THREE.Scene());
    const ends: number[] = [];
    let now = 0;
    p.onTrail = (_at, kind, hold) => kind === 'gustav' && ends.push(now + (hold ?? 0));
    const from = new THREE.Vector3(0, 0, 0);
    const to = new THREE.Vector3(0, 0, 1500);
    p.fireGustavShell(from, to, 60);
    const flight = from.distanceTo(to) / CONFIG.gustav.shellSpeed;
    for (let t = 0; t < flight + 0.1; t += 1 / 60) {
      now += 1 / 60;
      p.update(1 / 60);
    }
    expect(ends.length).toBeGreaterThan(10);
    for (const e of ends) expect(e).toBeCloseTo(flight, 1);
  });

  it('counts as incoming, like a shell', () => {
    const p = new Projectiles(new THREE.Scene());
    p.fireGustavShell(new THREE.Vector3(0, 60, 0), new THREE.Vector3(0, 0, 1000), 60);
    expect(p.incoming().map((s) => s.kind)).toEqual(['gustav']);
  });
});
