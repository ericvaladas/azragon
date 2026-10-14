import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS } from '../types';
import { TOKYO } from './index';
import { SHIBUYA_CROSSING, SKYTREE_SITE, TMG_SITE, TOKYO_TOWER_SITE } from './layout';
import { SKYTREE, skytreeGeometry, TOKYO_TOWER, tokyoTowerGeometry } from './towers';
import { TMG, tmgGeometry } from './tmg';
import { RAINBOW_BRIDGE, rainbowBridgeGeometry } from './rainbowBridge';
import { isIsland, isWater } from '../../world/roads';

const W = CONFIG.world;
const INNER = W.blockSize - W.roadWidth;
const blockOf = (v: number) => Math.floor(v / W.blockSize);

describe('TOKYO', () => {
  it('has rules for every district; parks build nothing', () => {
    for (const d of DISTRICTS) expect(TOKYO.districts[d]).toBeDefined();
    expect(TOKYO.districts.park.lots).toBe(0);
    expect(TOKYO.districts.highrise.height[0]).toBeGreaterThanOrEqual(150);
    expect(TOKYO.districts.highrise.height[1]).toBeLessThanOrEqual(300);
    expect(TOKYO.districts.residential.height[1]).toBeLessThanOrEqual(34);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const threats = [CONFIG.palette.chevron, 0xff3b2f];
    const a = new THREE.Color();
    const b = new THREE.Color();
    for (const s of TOKYO.signColors) for (const t of threats) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('places the Metropolitan Government Building at its site, inside one block', () => {
    const tmg = TOKYO.landmarks.find((l) => l.id === 'tmg')!;
    expect(tmg).toMatchObject({ x: TMG_SITE.x, z: TMG_SITE.z, w: TMG.w, d: TMG.d, h: TMG.h });
    expect(blockOf(tmg.x - tmg.w / 2)).toBe(blockOf(tmg.x + tmg.w / 2));
    expect(blockOf(tmg.z - tmg.d / 2)).toBe(blockOf(tmg.z + tmg.d / 2));
    expect(tmg.w).toBeLessThanOrEqual(INNER);
    expect(tmg.d).toBeLessThanOrEqual(INNER);
  });

  it('lists all three landmarks at their sites', () => {
    const at = (id: string) => TOKYO.landmarks.find((l) => l.id === id);
    expect(at('tmg')).toMatchObject(TMG_SITE);
    expect(at('tokyo-tower')).toMatchObject({ ...TOKYO_TOWER_SITE, w: TOKYO_TOWER.w, d: TOKYO_TOWER.d, h: TOKYO_TOWER.h });
    expect(at('skytree')).toMatchObject({ ...SKYTREE_SITE, w: SKYTREE.w, d: SKYTREE.d, h: SKYTREE.h });
    expect(TOKYO_TOWER_SITE).toEqual({ x: -300, z: 1500 });
    expect(SKYTREE_SITE).toEqual({ x: -1900, z: 3100 });
  });

  it('fits each landmark but the span (the bridge) inside one block, clear of the roads', () => {
    for (const l of TOKYO.landmarks.filter((l) => !l.span)) {
      expect(blockOf(l.x - l.w / 2)).toBe(blockOf(l.x + l.w / 2));
      expect(blockOf(l.z - l.d / 2)).toBe(blockOf(l.z + l.d / 2));
      expect(l.w).toBeLessThanOrEqual(INNER);
      expect(l.d).toBeLessThanOrEqual(INNER);
    }
  });

  it('builds Tokyo Tower 494 m tall (1.3 × life), base at y = 0, no wider than its 130 m lot', () => {
    const g = tokyoTowerGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(494);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(130);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(130);
    expect(g.getAttribute('color')).toBeDefined();
  });

  it('builds the Skytree 600 m tall, base at y = 0, inside its block', () => {
    const g = skytreeGeometry();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(600);
    expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeLessThanOrEqual(INNER);
    expect(g.boundingBox!.max.z - g.boundingBox!.min.z).toBeLessThanOrEqual(INNER);
  });

  it('builds the twin-towered landmark mesh to its size, base at y = 0, vertex-coloured', () => {
    const g = tmgGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(TMG.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(TMG.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(TMG.d + 2);
    expect(g.getAttribute('color')).toBeDefined();
  });

  it('puts four Shibuya corner buildings around the crossing, each inside one block, all kept through the crash, with screens', () => {
    expect(TOKYO.specialLots).toHaveLength(4);
    for (const b of TOKYO.specialLots) {
      expect(Math.abs(b.x - SHIBUYA_CROSSING.x)).toBeLessThan(W.blockSize / 2);
      expect(Math.abs(b.z - SHIBUYA_CROSSING.z)).toBeLessThan(W.blockSize / 2);
      expect(blockOf(b.x - b.w / 2)).toBe(blockOf(b.x + b.w / 2));
      expect(blockOf(b.z - b.d / 2)).toBe(blockOf(b.z + b.d / 2));
      expect(b.keep).toBe(true);
      // Clear of the 36 m street along x = 200 and the 56 m avenue along z = 1000.
      expect(Math.abs(b.x - SHIBUYA_CROSSING.x) - b.w / 2).toBeGreaterThanOrEqual(36 / 2);
      expect(Math.abs(b.z - SHIBUYA_CROSSING.z) - b.d / 2).toBeGreaterThanOrEqual(56 / 2);
    }
    expect(TOKYO.specialLots.filter((b) => b.signs.some((s) => s.kind === 'screen')).length).toBeGreaterThanOrEqual(3);
  });

  it('draws the scramble markings over the crossing', () => {
    expect(TOKYO.overlays).toContainEqual(expect.objectContaining({ id: 'scramble', x: SHIBUYA_CROSSING.x, z: SHIBUYA_CROSSING.z }));
  });
});

describe('Rainbow Bridge', () => {
  const bridge = TOKYO.landmarks.find((l) => l.id === 'rainbow-bridge')!;
  const cell = (p: { x: number; z: number }) => [blockOf(p.x), blockOf(p.z)] as const;

  it('spans about 1000 m from a shore anchorage on land to an anchorage on the island', () => {
    expect(bridge).toBeDefined();
    const span = bridge.span!;
    expect(span.from.x).toBeCloseTo(-1658, 0);
    expect(span.from.z).toBeCloseTo(-958, 0);
    // The landmark's (x, z) and footprint are its shore anchorage, in the same block as `from`.
    expect(bridge.h).toBe(RAINBOW_BRIDGE.h);
    expect(cell(bridge)).toEqual(cell(span.from));
    expect(Math.hypot(bridge.x - span.from.x, bridge.z - span.from.z)).toBeLessThan(bridge.w);
    expect(isWater(TOKYO, ...cell(span.from))).toBe(false);
    expect(isIsland(TOKYO, ...cell(span.from))).toBe(false);
    expect(isIsland(TOKYO, ...cell(span.to))).toBe(true);
    const len = Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z);
    expect(len).toBeGreaterThan(950);
    expect(len).toBeLessThan(1100);
    // Along the bay's dir, straight out to sea.
    const dir = TOKYO.bay!.dir;
    expect(((span.to.x - span.from.x) * dir.x + (span.to.z - span.from.z) * dir.z) / len).toBeCloseTo(1, 3);
  });

  it('builds ~160 m towers and a deck ~50 m up, along local +Z from the shore anchorage, vertex-coloured', () => {
    const len = RAINBOW_BRIDGE.length;
    const g = rainbowBridgeGeometry(len);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeGreaterThan(150);
    expect(bb.max.y).toBeLessThan(170);
    expect(bb.min.z).toBeLessThan(0);
    expect(bb.max.z).toBeGreaterThan(len);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(2 * bridge.span!.halfWidth);
    expect(g.getAttribute('color')).toBeDefined();
    // Straight down onto the roadway at mid-span (between the towers): the deck top, about 50 m up.
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 500, len / 2), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
    expect(hit.point.y).toBeGreaterThan(45);
    expect(hit.point.y).toBeLessThan(55);
    // Over a tower (30% along), the ray meets the tower top first, about 160 m up.
    const tower = new THREE.Raycaster(new THREE.Vector3(RAINBOW_BRIDGE.towerX, 500, len * 0.3), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
    expect(tower.point.y).toBeGreaterThan(150);
  });
});
