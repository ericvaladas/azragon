import { describe, it, expect } from 'vitest';
import { newDevourHand, riseSpeedFor, stepDevourHand, type DevourHandSpec } from './devourHand';

const spec: DevourHandSpec = { riseSpeed: 100, easeTime: 0.6, closeTime: 1, sinkSpeed: 50, below: 40, above: 150, clear: 60 };
const run = (victimY: number, delay = 0) => {
  const h = newDevourHand(victimY, delay, spec);
  const log: { t: number; y: number; grip: number; phase: string; took: boolean }[] = [];
  let t = 0;
  for (; t < 60 && h.phase !== 'done'; t += 1 / 100) {
    const took = stepDevourHand(h, 1 / 100, spec);
    log.push({ t, y: h.holdY, grip: h.grip, phase: h.phase, took });
  }
  return { h, log, t };
};

describe('a Devour hand', () => {
  it('starts wholly under the ground, open, and waits out its delay', () => {
    const h = newDevourHand(10, 0.5, spec);
    expect(h.holdY + spec.above).toBeLessThan(0);
    expect(h.grip).toBe(0);
    stepDevourHand(h, 0.4, spec);
    expect(h.phase).toBe('wait');
  });

  it('rises, open, at full speed, then brakes smoothly to a stop at the grasp height over its last easeTime s', () => {
    const { log } = run(10);
    const rising = log.filter((r) => r.phase === 'rise');
    for (const r of rising) expect(r.grip).toBe(0);
    const steps = rising.slice(1).map((r, i) => r.y - rising[i]!.y);
    const easeSteps = Math.round(spec.easeTime * 100);
    // Full speed until the brake, then slowing every step, nearly still at the top.
    for (const d of steps.slice(0, -easeSteps - 1)) expect(d).toBeCloseTo(spec.riseSpeed / 100, 6);
    const brake = steps.slice(-easeSteps + 1);
    for (let i = 1; i < brake.length; i++) expect(brake[i]!).toBeLessThan(brake[i - 1]!);
    expect(brake[brake.length - 1]!).toBeLessThan(spec.riseSpeed / 100 / 10);
    // It ends exactly at the grasp height: the victim, or high enough that the whole hand clears the ground.
    const closing = log.find((r) => r.phase === 'close')!;
    expect(closing.y).toBeCloseTo(spec.clear, 6);
    expect(closing.y - spec.below).toBeGreaterThan(0);
    // A flyer is grasped where it is.
    expect(run(400).log.find((r) => r.phase === 'close')!.y).toBeCloseTo(400, 6);
  });

  it('takes its victim the moment it reaches it (a ground one is then lifted up to the grasp height)', () => {
    const { log } = run(10);
    const took = log.filter((r) => r.took);
    expect(took.length).toBe(1);
    expect(took[0]!.y).toBeGreaterThanOrEqual(10);
    expect(took[0]!.y).toBeLessThan(10 + (3 * spec.riseSpeed) / 100);
  });

  it('closes without moving, and starts sinking while the fist is still shutting (no pause), shut a little way down', () => {
    const { log } = run(400);
    const closing = log.filter((r) => r.phase === 'close');
    for (const r of closing) expect(r.y).toBeCloseTo(400, 6);
    // It sets off down before the close is over: most of the way shut, not yet a full fist.
    expect(closing.length * 0.01).toBeLessThan(spec.closeTime * 0.7);
    const firstSink = log.find((r) => r.phase === 'sink')!;
    expect(firstSink.grip).toBeGreaterThan(0.7);
    expect(firstSink.grip).toBeLessThan(1);
    // Shut fully on the way down, and never opening again.
    const sinking = log.filter((r) => r.phase === 'sink');
    for (let i = 1; i < sinking.length; i++) expect(sinking[i]!.grip).toBeGreaterThanOrEqual(sinking[i - 1]!.grip);
    expect(sinking.some((r) => r.grip === 1)).toBe(true);
  });

  it('sinks at a constant speed until it is wholly under the ground, then is done', () => {
    const { log, h } = run(400);
    const sinking = log.filter((r) => r.phase === 'sink');
    for (let i = 1; i < sinking.length; i++) expect(sinking[i - 1]!.y - sinking[i]!.y).toBeCloseTo(spec.sinkSpeed / 100, 6);
    expect(h.phase).toBe('done');
    expect(h.holdY + spec.above).toBeLessThan(0);
  });

  it('riseSpeedFor gives the speed whose rise, brake included, takes the time asked', () => {
    for (const [len, time] of [[800, 0.45], [800, 2], [100, 1.5]] as const) {
      const v = riseSpeedFor(len, time, spec.easeTime);
      // A rise of exactly `len` m: from the start (above + 1 m down) to a victim `len` m higher, nothing raising it.
      const at = { ...spec, riseSpeed: v, clear: -1e9 };
      const h = newDevourHand(len - spec.above - 1, 0, at);
      let t = 0;
      for (; t < 10 && h.phase !== 'close'; t += 1 / 1000) stepDevourHand(h, 1 / 1000, at);
      expect(t).toBeCloseTo(time, 1);
    }
  });

  it('starts closing the instant it stops rising: a clear part of the way shut within the first tenth of a second', () => {
    const h = newDevourHand(400, 0, spec);
    for (let t = 0; t < 30 && h.phase !== 'close'; t += 1 / 100) stepDevourHand(h, 1 / 100, spec);
    stepDevourHand(h, 0.1, spec);
    expect(h.grip).toBeGreaterThan((0.1 / spec.closeTime) * 1.5);
  });
});

describe('elbowPoint', () => {
  it('places the elbow upper from the shoulder and fore from the wrist, bent toward `bend`', async () => {
    const THREE = await import('three');
    const { elbowPoint } = await import('./devourHand');
    const shoulder = new THREE.Vector3(0, 0, 0);
    const wrist = new THREE.Vector3(0, 300, 40);
    const bend = new THREE.Vector3(0, 0, -1);
    const e = elbowPoint(shoulder, wrist, 200, 180, bend, new THREE.Vector3());
    expect(e.distanceTo(shoulder)).toBeCloseTo(200, 6);
    expect(e.distanceTo(wrist)).toBeCloseTo(180, 6);
    // Bent out toward -Z, off the shoulder-wrist line.
    expect(e.z).toBeLessThan(wrist.z * (e.y / wrist.y));
  });

  it('straightens the arm, never stretching it, when the wrist is out of reach', async () => {
    const THREE = await import('three');
    const { elbowPoint } = await import('./devourHand');
    const e = elbowPoint(new THREE.Vector3(), new THREE.Vector3(0, 1000, 0), 200, 180, new THREE.Vector3(1, 0, 0), new THREE.Vector3());
    expect(e.distanceTo(new THREE.Vector3())).toBeCloseTo(200, 6);
    expect(Math.abs(e.x)).toBeLessThan(10);
  });
});
