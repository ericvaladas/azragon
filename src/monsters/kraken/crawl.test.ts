import { describe, it, expect } from 'vitest';
import { ARM_COUNT, armAngle, armPlanted, armRole, isFrontArm } from './crawl';

const arms = [...Array(ARM_COUNT).keys()];

describe('arm layout', () => {
  it('spaces eight arms evenly around the mantle, symmetric left/right', () => {
    expect(arms.map((i) => +(armAngle(i) * (180 / Math.PI)).toFixed(1))).toEqual([-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5]);
    expect(arms.filter(isFrontArm)).toEqual([2, 3, 4, 5]);
  });
});

describe('armRole', () => {
  it('while moving: exactly two front arms pull, two reach, and the four back arms are free', () => {
    for (let c = 0; c < 2; c += 0.037) {
      const roles = arms.map((i) => armRole(i, c, true));
      expect(roles.filter((r) => r === 'pull')).toHaveLength(2);
      expect(roles.filter((r) => r === 'reach')).toHaveLength(2);
      for (const i of [0, 1, 6, 7]) expect(roles[i]).toBe('free');
    }
  });
  it('at rest every arm is free', () => {
    for (const i of arms) expect(armRole(i, 0.3, false)).toBe('free');
  });
});

describe('armPlanted', () => {
  it('plants each front arm once per crawl cycle, never two at the same instant, never a back arm', () => {
    const plants: number[][] = arms.map(() => []);
    for (let c = 0; c < 1; c += 0.01) for (const i of arms) if (armPlanted(c, c + 0.01, i)) plants[i]!.push(c);
    for (const i of [2, 3, 4, 5]) expect(plants[i]).toHaveLength(1);
    for (const i of [0, 1, 6, 7]) expect(plants[i]).toHaveLength(0);
    const when = [2, 3, 4, 5].map((i) => plants[i]![0]!);
    expect(new Set(when.map((w) => w.toFixed(2))).size).toBe(4);
    expect(armPlanted(0.4, 0.4, 3)).toBe(false);
  });
  it('crawling backward, still plants each front arm once per cycle, at the end of its pull', () => {
    for (const i of [2, 3, 4, 5]) {
      let n = 0;
      for (let k = 0; k < 100; k++) if (armPlanted(1.005 - k * 0.01, 0.995 - k * 0.01, i)) n++;
      expect(n).toBe(1);
    }
    expect(armPlanted(0.51, 0.49, 5)).toBe(true);
    expect(armPlanted(0.51, 0.49, 0)).toBe(false);
  });
});
