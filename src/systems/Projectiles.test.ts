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

describe('Projectiles.fireBomb', () => {
  it('lobs a magma bomb on a high arc that lands on the target after the lob flight time', () => {
    const p = new Projectiles(new THREE.Scene());
    const hits: { kind: string; x: number; z: number; damage: number }[] = [];
    p.onHit = (h) => hits.push({ kind: h.kind, x: h.point.x, z: h.point.z, damage: h.damage });
    p.fireBomb(new THREE.Vector3(0, 380, 0), new THREE.Vector3(0, 0, 1000), 90);
    let peak = 0;
    const steps = Math.ceil(CONFIG.golem.lob.flight / 0.05) + 2;
    for (let i = 0; i < steps; i++) {
      p.update(0.05);
      const s = (p as unknown as { shots: { pos: THREE.Vector3 }[] }).shots[0];
      if (s) peak = Math.max(peak, s.pos.y);
    }
    expect(hits).toEqual([{ kind: 'bomb', x: 0, z: 1000, damage: 90 }]);
    expect(peak).toBeGreaterThan(CONFIG.golem.lob.arc * 0.8);
    expect(p.incoming()).toHaveLength(0);
  });
});
