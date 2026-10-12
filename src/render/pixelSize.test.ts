import { describe, it, expect } from 'vitest';
import { internalSize } from './pixelSize';

describe('internalSize', () => {
  it('divides by pixelScale and keeps aspect', () => {
    expect(internalSize(1440, 900, 3, 180)).toEqual({ w: 480, h: 300 });
  });
  it('enforces the minimum internal height on small screens', () => {
    const s = internalSize(390, 500, 3, 180);
    expect(s.h).toBe(180);
    expect(s.w).toBe(Math.round(180 * (390 / 500)));
  });
  it('never exceeds the CSS size', () => {
    expect(internalSize(200, 120, 3, 180)).toEqual({ w: 200, h: 120 });
  });
  it('returns at least 1x1 for zero sizes', () => {
    expect(internalSize(0, 0, 3, 180)).toEqual({ w: 1, h: 1 });
  });
});
