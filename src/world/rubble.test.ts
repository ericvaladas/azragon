import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TOKYO } from '../cities/tokyo';
import { rubbleGeometry } from './rubble';

const light = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;

describe('ground and rubble contrast', () => {
  it('paves the ground clearly darker than the (pale) roofs, and the roads darker still', () => {
    expect(light(TOKYO.colors.paved)).toBeLessThan(light(TOKYO.colors.roof) * 0.75);
    expect(light(TOKYO.colors.road)).toBeLessThan(light(TOKYO.colors.paved) * 0.6);
  });

  it('leaves a ruin of many dark, varied chunks on a scorched base, unlike a flat roof', () => {
    const g = rubbleGeometry();
    const col = g.getAttribute('color');
    expect(col).toBeDefined();
    const tones = new Set<string>();
    let sum = 0;
    for (let i = 0; i < col.count; i++) {
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
      tones.add(c.getHexString());
      sum += c.getHSL({ h: 0, s: 0, l: 0 }).l;
    }
    // Several tones (texture), and on average darker than the pavement around it.
    expect(tones.size).toBeGreaterThanOrEqual(4);
    expect(sum / col.count).toBeLessThan(light(TOKYO.colors.paved) * 0.7);
    // Many pieces, sitting on the ground inside the (unit) footprint.
    expect(col.count).toBeGreaterThan(200);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(1, 1);
    expect(Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z)).toBeLessThanOrEqual(0.6);
  });
});
