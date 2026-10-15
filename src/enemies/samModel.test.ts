import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RACK, samLauncherGeometry, samLaunchDir, samMuzzle } from './samModel';

describe('SAM launcher model', () => {
  it('launches 45° above the horizon toward the rack front, for any yaw', () => {
    for (const yaw of [0, 1, -2.5]) {
      const d = samLaunchDir(yaw, new THREE.Vector3());
      expect(d.length()).toBeCloseTo(1, 6);
      expect(Math.asin(d.y)).toBeCloseTo(Math.PI / 4, 6);
      expect(Math.atan2(d.x, d.z)).toBeCloseTo(yaw, 6);
    }
  });

  it('puts the four tube mouths at the top of the pod, ahead of the turntable, rotating with yaw', () => {
    const geo = samLauncherGeometry();
    const box = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute);
    expect(geo.getAttribute('color')).toBeDefined();
    const mouths = [0, 1, 2, 3].map((k) => samMuzzle(k, 0, 1, new THREE.Vector3()));
    for (const m of mouths) {
      expect(m.y).toBeGreaterThan(0.8);
      expect(m.y).toBeLessThanOrEqual(box.max.y);
      expect(m.z).toBeGreaterThan(0.2);
    }
    expect(new Set(mouths.map((m) => `${m.x.toFixed(3)},${m.y.toFixed(3)}`)).size).toBe(4);
    // Each mouth lies on its tube's axis: back along the launch direction it passes the pivot plane at the pivot.
    const centre = mouths.reduce((a, m) => a.add(m), new THREE.Vector3()).multiplyScalar(0.25);
    const dir = samLaunchDir(0, new THREE.Vector3());
    const back = centre.clone().addScaledVector(dir, -RACK.mouth);
    expect(back.y).toBeCloseTo(RACK.pivot.y, 6);
    expect(back.z).toBeCloseTo(RACK.pivot.z, 6);
    const turned = samMuzzle(0, Math.PI / 2, 130, new THREE.Vector3());
    const m0 = mouths[0]!.clone().multiplyScalar(130);
    expect(turned.x).toBeCloseTo(m0.z, 6);
    expect(turned.y).toBeCloseTo(m0.y, 6);
  });
});
