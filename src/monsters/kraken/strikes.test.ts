import { describe, it, expect } from 'vitest';
import { assignStrikes } from './strikes';

const t = (x: number, z: number, alive = true, radius = 20) => ({ position: { x, z }, radius, isAlive: () => alive });
const at = { x: 0, z: 0 };

describe('assignStrikes', () => {
  it('sends each target the free arm pointing most nearly at it — one arm per target, one target per arm', () => {
    const ahead = t(0, 300); // bearing 0 → arm 3 or 4 (±22.5°)
    const left = t(300, 0); // bearing +90° → arm 5 (67.5°) or 6 (112.5°)
    const behind = t(0, -300); // bearing 180° → arm 0 or 7
    const pairs = assignStrikes([0, 1, 2, 3, 4, 5, 6, 7], 0, at, [behind, left, ahead], 400);
    expect(pairs).toHaveLength(3);
    const armFor = (target: object) => pairs.find((p) => p.target === target)!.arm;
    expect([3, 4]).toContain(armFor(ahead));
    expect([5, 6]).toContain(armFor(left));
    expect([0, 7]).toContain(armFor(behind));
    expect(new Set(pairs.map((p) => p.arm)).size).toBe(3);
  });
  it('uses only the free arms it is given and serves the nearest targets first when arms are scarce', () => {
    const near = t(0, 150);
    const far = t(0, 390);
    const pairs = assignStrikes([1], 0, at, [far, near], 400);
    expect(pairs).toEqual([{ arm: 1, target: near }]);
  });
  it('ignores dead targets and targets beyond reach (plus their radius)', () => {
    expect(assignStrikes([0, 1, 2], 0, at, [t(0, 200, false), t(0, 500), t(0, 415, true, 20)], 400).map((p) => p.target.position.z)).toEqual([415]);
  });
  it('measures bearings relative to the monster\'s facing', () => {
    const pairs = assignStrikes([3, 4, 0, 7], Math.PI, at, [t(0, -300)], 400);
    expect([3, 4]).toContain(pairs[0]!.arm);
  });
});
