import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Projectiles } from './Projectiles';

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
