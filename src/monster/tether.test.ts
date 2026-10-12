import { describe, it, expect } from 'vitest';
import { clampToTethers } from './tether';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('clampToTethers', () => {
  const t = { x: 0, z: 0, length: 500 };

  it('passes moves through when there are no tethers or the move stays inside', () => {
    expect(clampToTethers({ x: 0, z: 0 }, { x: 900, z: 0 }, [])).toEqual({ x: 900, z: 0 });
    expect(clampToTethers({ x: 100, z: 0 }, { x: 200, z: 50 }, [t])).toEqual({ x: 200, z: 50 });
  });

  it('stops a move at the tether circle', () => {
    const p = clampToTethers({ x: 490, z: 0 }, { x: 520, z: 0 }, [t]);
    expect(d(p, t)).toBeCloseTo(500);
    expect(p.z).toBeCloseTo(0);
  });

  it('allows moving back inward even when starting outside the length', () => {
    expect(clampToTethers({ x: 700, z: 0 }, { x: 650, z: 0 }, [t])).toEqual({ x: 650, z: 0 });
  });

  it('does not let a start point outside the length drift further away', () => {
    const p = clampToTethers({ x: 700, z: 0 }, { x: 720, z: 0 }, [t]);
    expect(d(p, t)).toBeCloseTo(700);
  });

  it('keeps the monster inside every circle with opposing tethers, without teleporting', () => {
    const a = { x: -300, z: 0, length: 320 };
    const b = { x: 300, z: 0, length: 320 };
    const from = { x: 0, z: 0 };
    const to = { x: 0, z: 200 };
    const p = clampToTethers(from, to, [a, b]);
    expect(d(p, a)).toBeLessThanOrEqual(320 + 1e-6);
    expect(d(p, b)).toBeLessThanOrEqual(320 + 1e-6);
    expect(d(p, from)).toBeLessThanOrEqual(d(to, from) + 1e-6);
  });
});
