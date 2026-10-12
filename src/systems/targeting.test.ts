import { describe, it, expect } from 'vitest';
import { mortarTargets, nearestWithin } from './targeting';

const P = (x: number, y: number, z: number) => ({ x, y, z });

describe('nearestWithin', () => {
  it('returns up to max items inside the 3D radius, nearest first', () => {
    const items = [{ p: P(0, 0, 300) }, { p: P(0, 0, 100) }, { p: P(0, 600, 0) }, { p: P(0, 0, 200) }];
    const got = nearestWithin(P(0, 0, 0), 450, items, 2, (i) => i.p);
    expect(got.map((i) => i.p.z)).toEqual([100, 200]);
  });
  it('returns nothing when max is 0 or nothing is in range', () => {
    expect(nearestWithin(P(0, 0, 0), 450, [{ p: P(0, 0, 100) }], 0, (i) => i.p)).toEqual([]);
    expect(nearestWithin(P(0, 0, 0), 50, [{ p: P(0, 0, 100) }], 3, (i) => i.p)).toEqual([]);
  });
});

describe('mortarTargets', () => {
  const t = (kind: string, x: number, opts: { airborne?: boolean; alive?: boolean } = {}) => ({
    kind,
    position: P(x, 0, 0),
    airborne: opts.airborne ?? false,
    isAlive: () => opts.alive ?? true,
  });
  it('prioritises artillery, then SAM silos, then trucks, then tanks; ground only, in range', () => {
    const tank = t('tank', 100);
    const truck = t('truck', 900);
    const art = t('artillery', 1500);
    const sam = t('sam', 1200);
    const jet = t('jet', 50, { airborne: true });
    const far = t('artillery', 5000);
    const dead = t('sam', 300, { alive: false });
    const got = mortarTargets(P(0, 0, 0), 1800, [tank, truck, art, sam, jet, far, dead], 3);
    expect(got).toEqual([art, sam, truck]);
  });
  it('fills with nearer tanks when fewer priority targets exist', () => {
    const a = t('tank', 300);
    const b = t('tank', 100);
    expect(mortarTargets(P(0, 0, 0), 1800, [a, b], 3)).toEqual([b, a]);
  });
});
