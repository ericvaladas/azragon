import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BodyFrame } from '../types';
import { KrakenBody } from './KrakenBody';
import { inkPhase } from './inkStorm';

const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, blaze: 0, dashing: false, tailSweep: null, lookAt: null,
  charge: 0, heat: 0, flash: false, glow: 0,
});

describe('KrakenBody carried', () => {
  it("rides its arms with the body while an ultimate carries it: Ink Storm's leap poses them as if it stood still", () => {
    const U = CONFIG.kraken.ultimate;
    const lifted = new KrakenBody();
    const still = new KrakenBody();
    for (const b of [lifted, still]) b.root.scale.setScalar(CONFIG.monster.scale);
    let worst = 0;
    // Ink Storm lifts on real time while the arms step on slowed world time.
    for (let f = 0; f < 60 * U.t.end; f++) {
      const t = f / 60;
      const h = inkPhase(t).height;
      const frame = { ...base(), dt: U.timeScale / 60, time: t * U.timeScale, airborne: h > 0, carried: true };
      lifted.root.position.y = h;
      lifted.root.updateMatrixWorld(true);
      lifted.animate(frame, () => {});
      still.animate(frame, () => {});
      for (let i = 0; i < lifted.arms.tips.length; i++) {
        worst = Math.max(worst, lifted.arms.tips[i]!.clone().setY(lifted.arms.tips[i]!.y - h).distanceTo(still.arms.tips[i]!));
      }
    }
    expect(worst).toBeLessThan(1);
  });

  it('a braced Kraken crouches with its tips pressed into the ground, and they stay there as it pushes off', () => {
    const body = new KrakenBody();
    body.root.scale.setScalar(CONFIG.monster.scale);
    const frame = (brace: number, airborne: boolean, t: number) => ({ ...base(), dt: 1 / 60, time: t, carried: true, brace, airborne });
    const mantle = () => body['mantle'].position.y;
    body.animate(frame(0, false, 0), () => {});
    const standing = mantle();
    for (let f = 1; f <= 120; f++) body.animate(frame(1, false, f / 60), () => {});
    expect(mantle()).toBeLessThan(standing - 40);
    for (const tip of body.arms.tips) {
      expect(tip.y).toBeLessThan(25);
      expect(Math.hypot(tip.x, tip.z)).toBeGreaterThan(CONFIG.kraken.ultimate.grabReach * 0.7);
    }
    // Pushing off: the body rises 120 m and the tips are still on the ground.
    for (let f = 1; f <= 30; f++) {
      body.root.position.y = 4 * f;
      body.root.updateMatrixWorld(true);
      body.animate(frame(1, true, 2 + f / 60), () => {});
    }
    for (const tip of body.arms.tips) expect(tip.y).toBeLessThan(25);
  });

  it('a fling cocks the arm back away from its target, then whips it overhead and out toward it', () => {
    const body = new KrakenBody();
    body.root.scale.setScalar(CONFIG.monster.scale);
    body.root.position.y = 600;
    body.root.updateMatrixWorld(true);
    const frame = (t: number) => ({ ...base(), dt: 1 / 60, time: t, carried: true, airborne: true });
    for (let f = 0; f < 60; f++) body.animate(frame(f / 60), () => {});
    // Arm 0 throws at a point far off to its right and below.
    const target = new THREE.Vector3(-2000, 0, 300);
    const timing = { windup: 0.5, impact: 0.65, end: 1.2 };
    body.arms.start(0, 'fling', target, null, 0, timing);
    const toward = () => {
      const tip = body.arms.tips[0]!;
      return new THREE.Vector3(tip.x, 0, tip.z).normalize().dot(new THREE.Vector3(target.x, 0, target.z).normalize());
    };
    let t = 1;
    const run = (until: number) => {
      while (body.arms.strikes[0] && body.arms.strikes[0].t < until) {
        body.arms.update(1 / 60, 1, () => {});
        body.animate(frame((t += 1 / 60)), () => {});
      }
    };
    run(timing.windup);
    expect(toward()).toBeLessThan(-0.3);
    const cocked = body.arms.tips[0]!.y;
    expect(cocked).toBeGreaterThan(600);
    // Overhead: the whip carries the tip up over the top before it comes down at the target.
    let top = cocked;
    while (body.arms.strikes[0]!.t < timing.impact) {
      run(body.arms.strikes[0]!.t + 1 / 120);
      top = Math.max(top, body.arms.tips[0]!.y);
    }
    expect(top).toBeGreaterThan(cocked + 150);
    run(timing.impact + 0.1);
    expect(toward()).toBeGreaterThan(0.6);
  });
});
