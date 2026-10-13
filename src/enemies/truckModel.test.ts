import { describe, it, expect } from 'vitest';
import { PIVOT_DEPLOYED, PIVOT_STOWED, deployPose, legBoxes } from './truckModel';

const padBottom = (u: number) => {
  const pad = legBoxes(deployPose(u), 1, 0).find((b) => b.part === 'pad')!;
  return pad.c[1] - pad.s[1] / 2;
};

describe('truck deploy pose', () => {
  it('stows with the pads off the ground and the cannon lowered and flat', () => {
    const p = deployPose(0);
    expect(padBottom(0)).toBeGreaterThan(0.1);
    expect(p.pivotY).toBeCloseTo(PIVOT_STOWED, 9);
    expect(p.pitch).toBe(0);
  });

  it('deploys with the pads on the ground, beams out and the cannon raised', () => {
    const p = deployPose(1);
    expect(padBottom(1)).toBeCloseTo(0, 9);
    expect(p.beamX).toBeGreaterThan(deployPose(0).beamX);
    expect(p.pivotY).toBeCloseTo(PIVOT_DEPLOYED, 9);
    expect(p.pitch).toBe(1);
  });

  it('never pushes a pad below the ground mid-deploy', () => {
    for (let u = 0; u <= 1; u += 0.05) expect(padBottom(u)).toBeGreaterThanOrEqual(-1e-9);
  });
});
