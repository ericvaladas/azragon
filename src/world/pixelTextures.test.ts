import { describe, it, expect } from 'vitest';
import { FACADE_COUNT } from '../cities/types';
import { FACADE_TILE, patchFacadeShader } from './pixelTextures';

const VERT = 'x\n#include <common>\ny\n#include <uv_vertex>\nz';
const FRAG = 'x\n#include <common>\ny\n#include <map_fragment>\nz';

describe('patchFacadeShader', () => {
  it('reads the per-building facade cell and tiles it by the building size (one cell per FACADE_TILE metres)', () => {
    const sh = { vertexShader: VERT, fragmentShader: FRAG };
    patchFacadeShader(sh);
    expect(sh.vertexShader).toContain('attribute float aFacade;');
    expect(sh.vertexShader).toContain('instanceMatrix');
    expect(sh.vertexShader).toContain(`/ ${FACADE_TILE.h.toFixed(1)}`);
    expect(sh.fragmentShader).toContain('fract(vFacadeUv.x)');
    expect(sh.fragmentShader).toContain(`/ ${FACADE_COUNT.toFixed(1)}`);
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
  });
});
