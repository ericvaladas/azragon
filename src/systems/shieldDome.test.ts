import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchShieldDome, shieldBricks, shieldBuildProgress, shieldDome } from './shieldDome';

/** The bubble's dome, as ShieldFx makes it. */
const dome = () => new THREE.IcosahedronGeometry(1, 1);

describe('shieldBricks', () => {
  const bricks = shieldBricks(dome());

  it('makes one brick per triangle of the dome', () => {
    expect(bricks).toHaveLength(80);
    for (const b of bricks) expect(b.corners).toHaveLength(3);
  });

  it('numbers them from the ground up, 0 to 1', () => {
    expect(bricks[0]!.order).toBe(0);
    expect(bricks[bricks.length - 1]!.order).toBeCloseTo(1, 6);
    // Every step of the build is at least as high as the one before it.
    for (let i = 1; i < bricks.length; i++) {
      expect(bricks[i]!.center.y).toBeGreaterThanOrEqual(bricks[i - 1]!.center.y - 1e-6);
    }
  });

  it('grows every brick from the centre of its own face, pointing straight out', () => {
    for (const b of bricks) {
      // The face centres of a geodesic dome sit just inside the surface it encloses.
      expect(b.center.length()).toBeGreaterThan(0.9);
      expect(b.center.length()).toBeLessThan(1);
      const [p0, p1, p2] = b.corners;
      const normal = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
      expect(b.center.clone().normalize().dot(normal)).toBeGreaterThan(0.999);
    }
  });
});

describe('shieldDome', () => {
  const { fill, wire } = shieldDome(dome());

  it('rebuilds the dome as faces and as one outline per brick', () => {
    // 80 bricks of 3 vertices; each brick's outline is 3 segments, and every edge lies in two bricks.
    expect(fill.getAttribute('position').count).toBe(240);
    expect(wire.getAttribute('position').count).toBe(480);
  });

  it('tags both with the centre and build order of the brick each vertex belongs to', () => {
    const bricks = shieldBricks(dome());
    for (const geo of [fill, wire]) {
      const a = geo.getAttribute('aBrick');
      expect(a.itemSize).toBe(4);
      // One vec4 per vertex: the centre and order of the brick it belongs to.
      expect(a.count).toBe(geo.getAttribute('position').count);
    }
    const fp = fill.getAttribute('position');
    const ab = fill.getAttribute('aBrick');
    bricks.forEach((b, i) => {
      for (let k = 0; k < 3; k++) {
        expect(ab.getX(i * 3 + k)).toBeCloseTo(b.center.x, 6);
        expect(ab.getY(i * 3 + k)).toBeCloseTo(b.center.y, 6);
        expect(ab.getZ(i * 3 + k)).toBeCloseTo(b.center.z, 6);
        expect(ab.getComponent(i * 3 + k, 3)).toBeCloseTo(b.order, 6);
      }
      // The face itself, in brick order.
      expect(fp.getX(i * 3)).toBeCloseTo(b.corners[0].x, 6);
      expect(fp.getZ(i * 3 + 2)).toBeCloseTo(b.corners[2].z, 6);
    });
    // The outlines run in the same order: brick 0's first segment is brick 0's first edge.
    const wp = wire.getAttribute('position');
    const wb = wire.getAttribute('aBrick');
    expect(wp.getX(0)).toBeCloseTo(fill.getAttribute('position').getX(0), 6);
    expect(wp.getY(1)).toBeCloseTo(fill.getAttribute('position').getY(1), 6);
    expect(wb.getComponent(0, 3)).toBeCloseTo(bricks[0]!.order, 6);
    expect(wb.getComponent(5, 3)).toBeCloseTo(bricks[0]!.order, 6);
  });
});

describe('shieldBuildProgress', () => {
  it('runs from nothing to complete over the build time', () => {
    expect(shieldBuildProgress(0, 0.5)).toBe(0);
    expect(shieldBuildProgress(-1, 0.5)).toBe(0);
    expect(shieldBuildProgress(0.5, 0.5)).toBe(1);
    expect(shieldBuildProgress(9, 0.5)).toBe(1);
  });

  it('rises fast and settles', () => {
    expect(shieldBuildProgress(0.25, 0.5)).toBeCloseTo(0.875, 6);
    let last = 0;
    for (let t = 0; t <= 0.5; t += 0.01) {
      const p = shieldBuildProgress(t, 0.5);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(last).toBeCloseTo(1, 4);
  });
});

describe('patchShieldDome', () => {
  const compile = (mat: THREE.Material) => {
    const sh = {
      vertexShader: 'void main() {\n  #include <common>\n  #include <begin_vertex>\n}',
      fragmentShader: 'void main() {\n  #include <common>\n  vec4 diffuseColor = vec4( diffuse, opacity );\n}',
      uniforms: {} as Record<string, THREE.IUniform>,
    };
    mat.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return sh;
  };

  it('grows every brick from its own centre as the shared progress rises, and dims the whole dome with `fade`', () => {
    const build = { value: 0 };
    const fade = { value: 1 };
    const mat = new THREE.MeshBasicMaterial();
    patchShieldDome(mat, { build, fade, window: 0.35, flash: 16 });
    const sh = compile(mat);
    expect(sh.uniforms['uBuild']).toBe(build);
    expect(sh.uniforms['uFade']).toBe(fade);
    expect(sh.vertexShader).toContain('attribute vec4 aBrick;');
    // The front climbs over 1 - window of the build, then each brick opens over its window.
    expect(sh.vertexShader).toContain('clamp((uBuild - aBrick.w * 0.650) / 0.350, 0.0, 1.0)');
    // easeOutBack around the brick's own centre.
    expect(sh.vertexShader).toContain('transformed = mix(aBrick.xyz, transformed, max(1.0 + 1.70158 * settle * settle - 2.70158 * settle * settle * settle, 0.0));');
    expect(sh.fragmentShader).toContain('uniform float uFade;');
    expect(sh.fragmentShader).toContain('vec4 diffuseColor = vec4( diffuse, opacity * vBrick * uFade );');
    expect(sh.fragmentShader).toContain('diffuseColor.rgb *= 1.0 + 16.0 * (1.0 - vBrick) * (1.0 - vBrick);');
  });

  it('keeps a material\'s own shader hook and gives it a distinct program key', () => {
    const mat = new THREE.LineBasicMaterial();
    let ran = 0;
    mat.onBeforeCompile = (sh) => {
      ran++;
      sh.vertexShader += '// bend';
    };
    mat.customProgramCacheKey = () => 'shield-fx';
    patchShieldDome(mat, { build: { value: 1 }, fade: { value: 1 }, window: 0.35, flash: 16 });
    expect(compile(mat).vertexShader).toContain('// bend');
    expect(mat.customProgramCacheKey()).toBe('shield-fx|shield-dome');
  });
});
