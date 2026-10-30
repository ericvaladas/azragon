import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BodyFrame } from '../types';
import { WendigoBody } from './WendigoBody';

const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, dashing: false, tailSweep: null, lookAt: null,
  charge: 0, heat: 0, flash: false, glow: 0,
});

describe('WendigoBody strike kind', () => {
  it('poses the strike kind it is told (the one the damage uses), even right at the slam/backhand boundary', () => {
    for (const kind of ['slam', 'backhand'] as const) {
      const body = new WendigoBody();
      body.root.scale.setScalar(CONFIG.monster.scale);
      // Just inside the slam cone as the body sees it: a body recomputing the kind would slam.
      const b = CONFIG.wendigo.fist.frontHalf - 0.01;
      const target = new THREE.Vector3(Math.sin(b) * 150, 0, Math.cos(b) * 150);
      const T = kind === 'backhand' ? CONFIG.wendigo.fist.backhandTiming : CONFIG.wendigo.stats.meleeTiming;
      let hand = new THREE.Vector3();
      for (let t = 0; t <= T.impact + 1e-9; t += 1 / 60) {
        body.animate({ ...base(), time: t, melee: { t, side: 0, target, kind } }, () => {});
        hand = body['limbArms'][0]!.fist.position.clone();
      }
      expect(body['strikeKind']).toBe(kind);
      // A backhand has swept out round the side by its contact; a slam has come down ahead onto the target.
      const bearing = Math.atan2(hand.x, hand.z);
      if (kind === 'backhand') expect(bearing).toBeGreaterThan(1.2);
      else expect(bearing).toBeLessThan(1.0);
    }
  });
});

describe('WendigoBody dispose', () => {
  it('frees every material it made (body, torso and its shadow), not just the geometry', () => {
    const body = new WendigoBody();
    const mats = new Set<THREE.Material>();
    body.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
      if (m.customDepthMaterial) mats.add(m.customDepthMaterial);
    });
    expect(mats.size).toBeGreaterThanOrEqual(3);
    const freed = new Set<THREE.Material>();
    for (const m of mats) m.addEventListener('dispose', () => freed.add(m));
    body.dispose();
    expect(freed.size).toBe(mats.size);
  });
});
