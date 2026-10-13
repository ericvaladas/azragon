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
