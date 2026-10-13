import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { CRATER_RADIUS } from '../world/City';
import { PRESETS } from './Particles';

describe('veil (the cloud that hides the crater after impact)', () => {
  const S = CONFIG.intro.starts;
  const R = CONFIG.intro.reveal;
  const V = PRESETS.veil;
  it('is mostly fed in after the first burst, so it thins gradually (in the order it was fed) rather than all at once', () => {
    expect(R.feedRate * R.feedFor).toBeGreaterThan(R.cloud);
  });
  it('is solid for a second after impact, then thins over a long stretch, so the dark figure shows through it early', () => {
    const thin = S.impact + V.life * (V.fadeFrom ?? 0.75);
    expect(thin).toBeGreaterThanOrEqual(S.impact + 1);
    expect(thin).toBeLessThanOrEqual(S.impact + 1.5);
    expect(V.fadeFrom).toBeLessThanOrEqual(0.45);
  });
  it('the last puffs fed into it are gone by the time play starts, after the colour has come back', () => {
    const last = S.impact + R.feedFor + V.life;
    expect(last).toBeLessThanOrEqual(S.done);
    expect(last).toBeGreaterThanOrEqual(S.emerge + R.hold + R.fade - 0.3);
  });
  it('is dense: drawn more opaque than plain dust, and big enough to swallow a cocoon seen from ~2 km', () => {
    expect(V.size0).toBeGreaterThan(200);
    expect(R.cloud + R.feedRate * R.feedFor).toBeGreaterThanOrEqual(50);
  });
});

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
