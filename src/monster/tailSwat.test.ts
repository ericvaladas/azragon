import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { INSECT } from '../monsters/insect/kind';
import { SWAT_TIMES, swatTiming, swatWeight, swingPhase, TAIL_SWING_TIMES, tailSwingPoints } from './tailSwat';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const base = [V(0, 350, -380), V(0, 450, -440), V(0, 540, -330), V(0, 550, -190), V(0, 510, -90)];

describe('swingPhase', () => {
  const T = TAIL_SWING_TIMES;
  it('blends the swing in over the windup, holds it to the hit and through the hold, and lets it go in the recovery', () => {
    expect(swingPhase(0, T).blend).toBe(0);
    expect(swingPhase(T.windup, T).blend).toBeCloseTo(1);
    expect(swingPhase(T.impact, T).blend).toBe(1);
    expect(swingPhase(T.total, T).blend).toBe(0);
  });

  it('cocks out to the side, sweeps through the target at the hit, and follows through past it', () => {
    expect(swingPhase(T.windup, T).sweep).toBeGreaterThan(0.5);
    expect(swingPhase(T.impact, T).sweep).toBeCloseTo(0);
    expect(swingPhase(T.impact + T.hold, T).sweep).toBeLessThan(-0.3);
    let prev = Infinity;
    for (let t = T.windup; t <= T.impact + T.hold; t += 0.01) {
      const s = swingPhase(t, T).sweep;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  it("is the Insect's swat timeline: an unhurried whip, about 0.7 s to the hit", () => {
    expect(INSECT.swatTiming).toBe(TAIL_SWING_TIMES);
    expect(TAIL_SWING_TIMES.impact).toBeGreaterThanOrEqual(0.65);
    expect(TAIL_SWING_TIMES.total).toBeGreaterThanOrEqual(1.3);
  });
});

describe('tailSwingPoints', () => {
  const target = new THREE.Vector3(300, 600, 200);
  const root = base[0]!;
  const rest = base.slice(1).map((p, i) => p.distanceTo(base[i]!));
  const yawOf = (p: THREE.Vector3) => Math.atan2(p.x - root.x, p.z - root.z);
  const tipOf = (ps: THREE.Vector3[]) => ps[ps.length - 1]!;
  it('keeps the rest pose at blend 0', () => {
    tailSwingPoints(base, target, 0.4, 0).forEach((p, i) => expect(p.distanceTo(base[i]!)).toBeLessThan(1e-6));
  });

  it('never changes length: every segment keeps its rest length, whatever the target, sweep or blend', () => {
    for (const t of [target, new THREE.Vector3(-200, 500, 100), new THREE.Vector3(900, 300, 1200), new THREE.Vector3(50, 450, -300)]) {
      for (const sweep of [0.9, 0.3, 0, -0.6]) {
        for (const blend of [0.25, 0.5, 1]) {
          const out = tailSwingPoints(base, t, sweep, blend);
          out.slice(1).forEach((p, i) => expect(p.distanceTo(out[i]!)).toBeCloseTo(rest[i]!, 6));
          expect(out[0]!.distanceTo(root)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('throws the tail out wide toward the target: uncurled well past its coiled reach, tilted up off the ground', () => {
    const out = tailSwingPoints(base, target, 0, 1);
    const tip = tipOf(out);
    expect(tip.distanceTo(root)).toBeGreaterThan(tipOf(base).distanceTo(root) * 1.4);
    expect(Math.abs(yawOf(tip) - yawOf(target))).toBeLessThan(0.15);
    expect(tip.y).toBeGreaterThan(root.y);
  });

  it('sweeps round: cocked out to the target side by the sweep, past it the other way in the follow-through', () => {
    const at = (sweep: number) => yawOf(tipOf(tailSwingPoints(base, target, sweep, 1)));
    expect(at(0.6) - at(0)).toBeGreaterThan(0.45);
    expect(at(-0.5) - at(0)).toBeLessThan(-0.35);
  });
});

describe('swatWeight', () => {
  const T = SWAT_TIMES;
  it('cocks, strikes to full extension at the impact time, holds, then recovers to 0', () => {
    expect(swatWeight(0)).toBe(0);
    expect(swatWeight(T.windup + T.strike)).toBeCloseTo(1);
    expect(swatWeight(T.windup + T.strike + T.hold * 0.5)).toBeCloseTo(1);
    expect(swatWeight(T.total)).toBeCloseTo(0);
    expect(swatWeight(T.total + 1)).toBe(0);
  });
  it('the impact time is when the tip reaches the target', () => {
    expect(T.impact).toBeCloseTo(T.windup + T.strike);
  });
});

describe('swatTiming', () => {
  it('keeps the shared anti-air timeline (Tail Swat, Snap Bite, Tentacle Lash) as it was', () => {
    expect(SWAT_TIMES.windup).toBe(0.12);
    expect(SWAT_TIMES.impact).toBeCloseTo(0.22);
    expect(SWAT_TIMES.total).toBeCloseTo(0.52);
  });
  it('builds a timeline from its phases, and swatWeight follows whichever timeline it is given', () => {
    const T = swatTiming(0.2, 0.1, 0.1, 0.4);
    expect(T.impact).toBeCloseTo(0.3);
    expect(T.total).toBeCloseTo(0.8);
    expect(swatWeight(T.impact, T)).toBeCloseTo(1);
    expect(swatWeight(T.impact + 0.05, T)).toBeCloseTo(1);
    expect(swatWeight(0.1, T)).toBeLessThan(0);
    expect(swatWeight(T.total - 0.01, T)).toBeGreaterThan(0);
    expect(swatWeight(T.total, T)).toBe(0);
  });
});
