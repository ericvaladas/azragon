import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addSilhouette } from './silhouette';

const FRAG = 'void main() {\n  #include <fog_fragment>\n}';
const compile = (mat: THREE.Material) => {
  const sh = { vertexShader: 'void main() {}', fragmentShader: FRAG, uniforms: {} as Record<string, THREE.IUniform> };
  mat.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return sh;
};

describe('addSilhouette', () => {
  it('darkens every material under the root toward black by one shared amount (before fog, so it still fogs)', () => {
    const amount = { value: 0 };
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshToonMaterial());
    const b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(a);
    a.add(b);
    addSilhouette(root, amount);
    for (const m of [a.material, b.material]) {
      const sh = compile(m);
      expect(sh.uniforms['uSilhouette']).toBe(amount);
      expect(sh.fragmentShader).toContain('uniform float uSilhouette;');
      expect(sh.fragmentShader.indexOf('gl_FragColor.rgb *= 1.0 - uSilhouette;')).toBeLessThan(sh.fragmentShader.indexOf('#include <fog_fragment>'));
    }
  });

  it('keeps a material\'s own shader hook and gives it a distinct program key', () => {
    const mat = new THREE.MeshToonMaterial();
    let ran = 0;
    mat.onBeforeCompile = (sh) => {
      ran++;
      sh.vertexShader += '// bend';
    };
    mat.customProgramCacheKey = () => 'wendigo-spine';
    const root = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    addSilhouette(root, { value: 0 });
    const sh = compile(mat);
    expect(ran).toBe(1);
    expect(sh.vertexShader).toContain('// bend');
    expect(mat.customProgramCacheKey()).not.toBe('wendigo-spine');
    expect(mat.customProgramCacheKey()).toContain('wendigo-spine');
  });

  it('hooks a material shared by several meshes only once', () => {
    const mat = new THREE.MeshToonMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mat), new THREE.Mesh(new THREE.BoxGeometry(), mat));
    addSilhouette(root, { value: 0 });
    const sh = compile(mat);
    expect(sh.fragmentShader.split('uniform float uSilhouette;')).toHaveLength(2);
  });
});
