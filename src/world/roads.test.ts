import { describe, it, expect } from 'vitest';
import { snapToRoad, planRoadPath, ringOnRoads } from './roads';

const O = -2000;
const P = 200;

describe('snapToRoad', () => {
  it('snaps to the nearest road line', () => {
    expect(snapToRoad(90, O, P)).toBe(0);
    expect(snapToRoad(110, O, P)).toBe(200);
    expect(snapToRoad(-2000, O, P)).toBe(-2000);
  });
});

describe('planRoadPath', () => {
  it('from a north-south road: drive along z, then along x', () => {
    const path = planRoadPath({ x: -2000, z: 600 }, { x: 330, z: -170 }, O, P);
    expect(path).toEqual([{ x: -2000, z: -200 }, { x: 400, z: -200 }]);
  });
  it('from an east-west road: drive along x, then along z', () => {
    const path = planRoadPath({ x: 777, z: 2000 }, { x: -30, z: 10 }, O, P);
    expect(path).toEqual([{ x: 0, z: 2000 }, { x: 0, z: 0 }]);
  });
  it('drops zero-length legs', () => {
    expect(planRoadPath({ x: 0, z: 1000 }, { x: 10, z: 0 }, O, P)).toEqual([{ x: 0, z: 0 }]);
  });
});

describe('ringOnRoads', () => {
  it('places n points about r away, each on a road line', () => {
    const pts = ringOnRoads({ x: 130, z: -70 }, 8, 1200, 0, 200);
    expect(pts).toHaveLength(8);
    for (const p of pts) {
      const onX = Math.abs(p.x - Math.round(p.x / 200) * 200) < 1e-6;
      const onZ = Math.abs(p.z - Math.round(p.z / 200) * 200) < 1e-6;
      expect(onX || onZ).toBe(true);
      expect(Math.abs(Math.hypot(p.x - 130, p.z + 70) - 1200)).toBeLessThanOrEqual(150);
    }
  });
});
