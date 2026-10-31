import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../config';
import { bearingOf } from '../kaiju/plasmaLance';
import { inArea, landingTimes, RAIN_ATMOSPHERE, rainPhase, scatterPoints } from './spikeRain';

const U = CONFIG.insect.ultimate;
const T = U.t;
const O = { x: 0, z: 0 };
const at = (bearing: number, r: number) => ({ x: Math.sin(bearing) * r, z: Math.cos(bearing) * r });
const seeded = () => {
  let s = 13;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe('rainPhase', () => {
  it('slows the world, turns the sky and closes the fog', () => {
    expect(rainPhase(0).time).toBe(1);
    expect(rainPhase(1).time).toBeCloseTo(U.timeScale);
    expect(rainPhase(T.end).time).toBe(1);
    expect(rainPhase(T.sky).sky).toBe(1);
    expect(rainPhase(T.end).sky).toBe(0);
    expect(RAIN_ATMOSPHERE.fogFar!).toBeLessThan(CONFIG.fog.far / 1.5);
    expect(rainPhase(T.end - 0.01).done).toBe(false);
    expect(rainPhase(T.end).done).toBe(true);
  });

  it('rears up slowly, holds through the volley and the rain, then drops back', () => {
    const roar = (t: number) => rainPhase(t).roar;
    expect(roar(0)).toBe(0);
    expect(roar(0.25)).toBeLessThan(0.2);
    expect(roar(T.rearUp)).toBe(1);
    expect(roar(T.rainTo)).toBe(1);
    expect(roar(T.end)).toBe(0);
    expect(T.rearUp).toBeGreaterThanOrEqual(1.2);
  });

  it('aims the tail high from just before the volley until it ends', () => {
    expect(rainPhase(T.volleyFrom - 0.4).aim).toBe(false);
    expect(rainPhase(T.volleyFrom).aim).toBe(true);
    expect(rainPhase(T.volleyTo - 0.01).aim).toBe(true);
    expect(rainPhase(T.volleyTo + 0.1).aim).toBe(false);
  });
});

describe('the area', () => {
  it("is the band in front, 100° across, widened by a target's size", () => {
    expect(inArea(O, 0, { x: 0, z: 800 }, 0)).toBe(true);
    expect(inArea(O, 0, { x: 0, z: 200 }, 0)).toBe(false);
    expect(inArea(O, 0, { x: 0, z: 1450 }, 0)).toBe(false);
    expect(inArea(O, 0, { x: 0, z: 1450 }, 60)).toBe(true);
    expect(inArea(O, 0, at(0.95, 600), 0)).toBe(false);
    expect(inArea(O, 0, at(0.95, 600), 80)).toBe(true);
    expect(inArea(O, 0, { x: 0, z: -600 }, 0)).toBe(false);
  });

  it('faces wrap: an Insect facing near ±π rains on its own front', () => {
    expect(inArea(O, 3.0, at(3.0, 800), 0)).toBe(true);
    expect(inArea(O, 3.0, at(3.0 - Math.PI, 800), 0)).toBe(false);
  });

  it('scatters landing points over the whole area, inside it, with no big gaps', () => {
    const pts = scatterPoints(O, 0, 160, seeded(), []);
    expect(pts).toHaveLength(160);
    const bins = new Array<number>(16).fill(0);
    for (const p of pts) {
      expect(inArea(O, 0, p, 0)).toBe(true);
      const a = Math.min(3, Math.floor(((bearingOf(O, 0, p) + U.halfAngle) / (2 * U.halfAngle)) * 4));
      const r = Math.hypot(p.x, p.z);
      const d = Math.min(3, Math.floor(((r - U.near) / (U.far - U.near)) * 4));
      bins[a * 4 + d]!++;
    }
    for (const b of bins) expect(b).toBeGreaterThanOrEqual(3);
  });

  it('spreads the landings over the rain beat', () => {
    const ts = landingTimes(160, seeded(), []);
    expect(ts).toHaveLength(160);
    for (let i = 0; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThanOrEqual(T.rainFrom);
      expect(ts[i]).toBeLessThanOrEqual(T.rainTo);
      if (i > 0) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]!);
    }
    const first = ts.filter((t) => t < T.rainFrom + (T.rainTo - T.rainFrom) / 4).length;
    expect(first).toBeGreaterThanOrEqual(0.2 * 160);
    expect(first).toBeLessThanOrEqual(0.3 * 160);
  });
});
