import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS, FACADE } from '../types';
import { TORONTO } from './index';
import { chunksInRadius, generateChunk } from '../../world/chunks';
import { CN_TOWER_SITE, CITY_HALL_SITE, ROGERS_CENTRE_SITE } from './layout';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
import { PITCH, isIsland, isWater, lineWidth } from '../../world/roads';
import { gameplayPose } from '../../intro/timeline';

describe('TORONTO', () => {
  it('has rules for every district at the spec heights; parks build nothing; the port is condos, not a container yard', () => {
    const D = TORONTO.districts;
    for (const d of DISTRICTS) expect(D[d]).toBeDefined();
    expect(D.park.lots).toBe(0);
    expect(D.highrise.height).toEqual([200, 300]);
    expect(D.neon.height).toEqual([40, 90]);
    expect(D.office.height).toEqual([40, 100]);
    expect(D.residential.height).toEqual([10, 22]);
    expect(D.residential.trees).toBe(6);
    expect(D.residential.lots).toBe(4);
    expect(D.port.height).toEqual([80, 160]);
    expect(D.port.yard).toBeUndefined();
  });

  it('keeps billboards rare: chance 0.02 or less in every district', () => {
    for (const d of DISTRICTS) expect(TORONTO.districts[d].billboard, d).toBeLessThanOrEqual(0.02);
  });

  it('removes fewer streets than Tokyo: residential 15%, office 15%, high-rise 10%, parks 40%', () => {
    expect(TORONTO.roadRemoval).toMatchObject({ residential: 0.15, office: 0.15, highrise: 0.1, park: 0.4 });
  });

  it('is a warm evening: dusky sky, peach fog at Tokyo\'s distances, low western sun, warm window glow', () => {
    expect(TORONTO.atmosphere).toEqual({
      skyZenith: 0x4b4a8c, skyHorizon: 0xf2a46b, fog: 0xe9a985,
      hemiSky: 0xffc59a, hemiGround: 0x4a3550, hemiIntensity: 0.8,
      sun: 0xffa25a, sunIntensity: 2, sunDir: { x: -0.9, y: 0.3, z: 0.2 },
      windowGlow: { color: 0xffc46b, strength: 0.45 },
    });
  });

  it('letters its signs in Latin, has no cranes, and paints a greener lake', () => {
    expect(TORONTO.glyphs).toBe('latin');
    expect(TORONTO.cranes).toBe(false);
    expect(TORONTO.colors.water).not.toBe(0x3f8fc9);
  });

  it('keeps sign colours well away from the threat reds (readability)', () => {
    const a = new THREE.Color(), b = new THREE.Color();
    for (const s of TORONTO.signColors) for (const t of [CONFIG.palette.chevron, 0xff3b2f]) {
      a.setHex(s);
      b.setHex(t);
      expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(0.25);
    }
  });

  it('generates no container cranes and no container facades along the lakeshore', () => {
    let built = 0;
    for (const r of chunksInRadius(0, 2100, 3000)) {
      const c = generateChunk(TORONTO, 1337, r.cx, r.cz);
      expect(c.cranes).toEqual([]);
      for (const b of c.buildings) expect(b.facade).not.toBe(FACADE.container);
      built += c.buildings.length;
    }
    expect(built).toBeGreaterThan(100);
  });

  it('generates the same chunk from the same inputs', () => {
    expect(generateChunk(TORONTO, 1337, -1, 2)).toEqual(generateChunk(TORONTO, 1337, -1, 2));
  });
});

describe('Toronto landmarks', () => {
  const W = CONFIG.world;
  const INNER = W.blockSize - W.roadWidth;
  const blockOf = (v: number) => Math.floor(v / W.blockSize);
  const at = (id: string) => TORONTO.landmarks.find((l) => l.id === id)!;
  const down = (g: THREE.BufferGeometry, x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)).intersectObject(new THREE.Mesh(g, new THREE.MeshBasicMaterial()))[0];

  it('lists the CN Tower, Rogers Centre and City Hall at their sites and sizes', () => {
    expect(TORONTO.landmarks.map((l) => l.id)).toEqual(['cn-tower', 'rogers-centre', 'city-hall']);
    expect(at('cn-tower')).toMatchObject({ ...CN_TOWER_SITE, ...CN_TOWER });
    expect(at('rogers-centre')).toMatchObject({ ...ROGERS_CENTRE_SITE, ...ROGERS_CENTRE });
    expect(at('city-hall')).toMatchObject({ ...CITY_HALL_SITE, ...CITY_HALL });
    expect(CN_TOWER_SITE).toEqual({ x: -700, z: 1900 });
    expect(CN_TOWER.h).toBe(720);
  });

  it('fits each inside one block clear of its roads, on land, and out of the crater', () => {
    for (const l of TORONTO.landmarks) {
      const ci = blockOf(l.x), cj = blockOf(l.z);
      expect(blockOf(l.x - l.w / 2), l.id).toBe(blockOf(l.x + l.w / 2));
      expect(blockOf(l.z - l.d / 2), l.id).toBe(blockOf(l.z + l.d / 2));
      expect(l.w).toBeLessThanOrEqual(INNER);
      expect(l.d).toBeLessThanOrEqual(INNER);
      expect(l.x - l.w / 2, l.id).toBeGreaterThanOrEqual(PITCH * ci + lineWidth(ci) / 2);
      expect(l.x + l.w / 2, l.id).toBeLessThanOrEqual(PITCH * (ci + 1) - lineWidth(ci + 1) / 2);
      expect(l.z - l.d / 2, l.id).toBeGreaterThanOrEqual(PITCH * cj + lineWidth(cj) / 2);
      expect(l.z + l.d / 2, l.id).toBeLessThanOrEqual(PITCH * (cj + 1) - lineWidth(cj + 1) / 2);
      expect(isWater(TORONTO, ci, cj), l.id).toBe(false);
      expect(isIsland(TORONTO, ci, cj), l.id).toBe(false);
      expect(Math.hypot(PITCH * (ci + 0.5), PITCH * (cj + 0.5)), l.id).toBeGreaterThanOrEqual(W.clearRadius + W.blockSize * 0.5);
    }
  });

  it('gives each landmark to exactly one chunk, and builds nothing else on its block', () => {
    for (const l of TORONTO.landmarks) {
      let owners = 0;
      for (const r of chunksInRadius(l.x, l.z, 1600)) {
        const c = generateChunk(TORONTO, 1337, r.cx, r.cz);
        owners += c.landmarks.filter((m) => m.id === l.id).length;
        for (const b of c.buildings) expect(blockOf(b.x) === blockOf(l.x) && blockOf(b.z) === blockOf(l.z), l.id).toBe(false);
      }
      expect(owners, l.id).toBe(1);
    }
  });

  it('builds the CN Tower 720 m tall from y = 0, within its footprint, vertex-coloured, its main pod about two-thirds up', () => {
    const g = cnTowerGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(720);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(CN_TOWER.w);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(CN_TOWER.d);
    expect(g.getAttribute('color')).toBeDefined();
    const pod = down(g, 25, 0)!;
    expect(pod.point.y / 720).toBeGreaterThan(0.6);
    expect(pod.point.y / 720).toBeLessThan(0.7);
    // The antenna is thin: just off its axis, a ray only meets the SkyPod below it.
    expect(down(g, 9, 0)!.point.y).toBeLessThan(610);
  });

  it('builds the Rogers Centre as a 144 m drum about 70 m tall from y = 0, vertex-coloured', () => {
    const g = rogersCentreGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(70);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(ROGERS_CENTRE.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(ROGERS_CENTRE.d + 0.01);
    expect(g.getAttribute('color')).toBeDefined();
    // The roof is domed: higher at the centre than near the rim.
    expect(down(g, 0, 0)!.point.y).toBeGreaterThan(down(g, 62, 0)!.point.y + 5);
  });

  it('builds City Hall: the east (+X) tower 130 m, the west 105 m, a saucer low between them', () => {
    const g = cityHallGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(130);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(CITY_HALL.w);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(CITY_HALL.d);
    expect(g.getAttribute('color')).toBeDefined();
    expect(down(g, 52, 3)!.point.y).toBeGreaterThan(125);
    expect(down(g, -52, 3)!.point.y).toBeGreaterThan(100);
    expect(down(g, -52, 3)!.point.y).toBeLessThan(110);
    const saucer = down(g, 0, 0)!.point.y;
    expect(saucer).toBeGreaterThan(20);
    expect(saucer).toBeLessThan(35);
  });

  it('frames the CN Tower in the opening gameplay view (as Tokyo Tower is framed)', () => {
    const pose = gameplayPose();
    const cam = new THREE.PerspectiveCamera(CONFIG.camera.baseVFovDeg, 16 / 10, CONFIG.camera.near, CONFIG.camera.far);
    cam.position.copy(pose.pos);
    cam.lookAt(pose.look);
    cam.updateMatrixWorld();
    const tower = at('cn-tower');
    const p = new THREE.Vector3(tower.x, tower.h / 2, tower.z).project(cam);
    expect(Math.abs(p.x)).toBeLessThan(0.9);
    expect(Math.abs(p.y)).toBeLessThan(0.9);
    expect(p.z).toBeLessThan(1);
  });
});
