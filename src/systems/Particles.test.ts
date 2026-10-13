import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { CRATER_RADIUS } from '../world/City';
import { PRESETS } from './Particles';

describe('billow (the pod crash dust cloud)', () => {
  it('is big enough to read from the cutscene camera ~2 km up and lingers well past the impact flash', () => {
    const b = PRESETS.billow;
    expect(b.size1).toBeGreaterThan(CRATER_RADIUS * 0.6);
    expect(b.size0).toBeGreaterThan(PRESETS.dust.size1 * 2);
    expect(b.life).toBeGreaterThan(CONFIG.intro.flash.impactFade + 1);
    // ...but it has cleared by the time the cocoon splits, so the monster climbing out is never hidden.
    expect(CONFIG.intro.starts.impact + b.life).toBeLessThan(CONFIG.intro.starts.emerge);
    // It rolls out along the ground rather than falling.
    expect(b.gravity).toBeLessThanOrEqual(0);
  });
});
