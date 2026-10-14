import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS, FACADE } from '../types';
import { TORONTO } from './index';
import { chunksInRadius, generateChunk } from '../../world/chunks';
import { CN_TOWER_SITE, CITY_HALL_SITE, ROGERS_CENTRE_SITE, blockInterior, districtAt } from './layout';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
import { FIRST_CANADIAN_PLACE, FINANCIAL_LOTS, GOLD, ROYAL_BANK_PLAZA } from './financial';
import { YD_BLOCK, YONGE_DUNDAS_LOTS } from './yongeDundas';
import { NATHAN_PHILLIPS, SQUARE_LAYOUT, SQUARE_PX, letterRects, squareRects } from './square';
import { LATIN_FONT } from '../../world/latinFont';
import { overlayPainter } from '../../world/pixelTextures';
import type { BuildingSpec } from '../types';
import { PITCH, blockDistrict, isIsland, isWater, lineWidth } from '../../world/roads';
import { TOKYO } from '../tokyo';
import { gameplayPose } from '../../intro/timeline';
import { fovForAspect } from '../../systems/orbit';

describe('TORONTO', () => {
  it('has rules for every district at the spec heights; parks build nothing; the port is condos, not a container yard', () => {
    const D = TORONTO.districts;
    for (const d of DISTRICTS) expect(D[d]).toBeDefined();
    expect(D.park.lots).toBe(0);
    expect(D.highrise.height).toEqual([150, 300]);
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

  it('is a warm evening: dusky sky, gold horizon fog pushed past the lakeshore, low west-north-west sun, warm window glow', () => {
    expect(TORONTO.atmosphere).toEqual({
      skyZenith: 0x4b4a8c, skyHorizon: 0xf2c08c, fog: 0xf2c08c, fogNear: 3000,
      hemiSky: 0x9c9ad6, hemiGround: 0x4e4466, hemiIntensity: 1.1,
      sun: 0xffb468, sunIntensity: 2.4, sunDir: { x: -0.85, y: 0.42, z: -0.35 },
      windowGlow: { color: 0xffc46b, strength: 0.45 },
    });
  });

  it('melts the fog into the horizon, so no band separates the fogged ground from the sky', () => {
    expect(TORONTO.atmosphere.fog).toBe(TORONTO.atmosphere.skyHorizon);
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

describe('Toronto lawns', () => {
  const W = CONFIG.world;
  const cell = (v: number) => Math.floor(v / PITCH);

  it('paints lawns a green a little lighter than its parks; Tokyo has none', () => {
    const lawn = new THREE.Color(TORONTO.colors.lawn!), park = new THREE.Color(TORONTO.colors.park);
    expect(lawn.g).toBeGreaterThan(lawn.r);
    expect(lawn.g).toBeGreaterThan(lawn.b);
    const l = lawn.r + lawn.g + lawn.b, p = park.r + park.g + park.b;
    expect(l).toBeGreaterThan(p);
    expect(l).toBeLessThan(p * 1.35);
    expect(TOKYO.colors.lawn).toBeUndefined();
  });

  it('lays one lawn pad under every residential block, off the crater, water and islands, never on a park', () => {
    let lawns = 0;
    for (let cx = -4; cx <= 4; cx++) for (let cz = -6; cz <= 3; cz++) {
      const c = generateChunk(TORONTO, 1337, cx, cz);
      const want: string[] = [];
      for (let i = 0; i < W.chunkBlocks; i++) for (let j = 0; j < W.chunkBlocks; j++) {
        const bi = cx * W.chunkBlocks + i, bj = cz * W.chunkBlocks + j;
        const x = PITCH * (bi + 0.5), z = PITCH * (bj + 0.5);
        if (isWater(TORONTO, bi, bj) || isIsland(TORONTO, bi, bj) || Math.hypot(x, z) < W.clearRadius + PITCH / 2) continue;
        if (TORONTO.landmarks.some((l) => cell(l.x) === bi && cell(l.z) === bj)) continue;
        if (blockDistrict(TORONTO, x, z) === 'residential') want.push(`${x},${z}`);
      }
      expect(c.lawns.map((p) => `${p.x},${p.z}`).sort(), `${cx},${cz}`).toEqual(want.sort());
      for (const p of c.lawns) expect(c.parks.some((q) => q.x === p.x && q.z === p.z)).toBe(false);
      lawns += c.lawns.length;
    }
    expect(lawns).toBeGreaterThan(300);
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
    expect(CN_TOWER_SITE).toEqual({ x: -500, z: 1900 });
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

  it.each([
    ['16:10 desktop', 16 / 10],
    ['390x844 phone portrait', 390 / 844],
  ])('frames the CN Tower in the opening gameplay view (as Tokyo Tower is framed): %s', (_name, aspect) => {
    const pose = gameplayPose();
    const fov = fovForAspect(aspect, CONFIG.camera.baseVFovDeg, CONFIG.camera.maxHFovDeg);
    const cam = new THREE.PerspectiveCamera(fov, aspect, CONFIG.camera.near, CONFIG.camera.far);
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

describe('hand-placed lots', () => {
  const blockOf = (v: number) => Math.floor(v / CONFIG.world.blockSize);
  const dark = FINANCIAL_LOTS.filter((b) => b !== FIRST_CANADIAN_PLACE && !ROYAL_BANK_PLAZA.includes(b));

  it('puts 8–10 dark glass towers 200–300 m tall in the Financial District, all kept through the crash', () => {
    expect(dark.length).toBeGreaterThanOrEqual(8);
    expect(dark.length).toBeLessThanOrEqual(10);
    for (const b of dark) {
      expect(b.h).toBeGreaterThanOrEqual(200);
      expect(b.h).toBeLessThanOrEqual(300);
      const c = new THREE.Color(b.color);
      expect(c.r + c.g + c.b).toBeLessThan(0.15);
      expect(districtAt(CONFIG.world.blockSize * (blockOf(b.x) + 0.5), CONFIG.world.blockSize * (blockOf(b.z) + 0.5))).toBe('highrise');
    }
    for (const b of TORONTO.specialLots) expect(b.keep).toBe(true);
  });

  it('makes First Canadian Place the tallest of all, a white slab', () => {
    expect(FIRST_CANADIAN_PLACE.h).toBe(Math.max(...TORONTO.specialLots.map((b) => b.h)));
    expect(FIRST_CANADIAN_PLACE.h).toBeLessThanOrEqual(300);
    expect(FIRST_CANADIAN_PLACE.w).not.toBe(FIRST_CANADIAN_PLACE.d);
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(FIRST_CANADIAN_PLACE.color).getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.l).toBeGreaterThan(0.85);
  });

  it('builds the Royal Bank Plaza as two gold towers, each three staggered boxes stepping down (saw-tooth edges)', () => {
    expect(ROYAL_BANK_PLAZA).toHaveLength(6);
    for (const b of ROYAL_BANK_PLAZA) expect(b.color).toBe(GOLD);
    for (const tower of [ROYAL_BANK_PLAZA.slice(0, 3), ROYAL_BANK_PLAZA.slice(3)]) {
      for (let k = 1; k < 3; k++) {
        expect(tower[k]!.x).toBeGreaterThan(tower[k - 1]!.x);
        expect(tower[k]!.z).toBeGreaterThan(tower[k - 1]!.z);
        expect(tower[k]!.h).toBeLessThan(tower[k - 1]!.h);
      }
    }
  });

  it('fills the Yonge-Dundas block with four kept shop blocks 40–90 m: a screen toward the crash, a roof billboard and a blade each', () => {
    expect(YONGE_DUNDAS_LOTS).toHaveLength(4);
    for (const b of YONGE_DUNDAS_LOTS) {
      expect([blockOf(b.x), blockOf(b.z)]).toEqual([YD_BLOCK.ci, YD_BLOCK.cj]);
      expect(b.h).toBeGreaterThanOrEqual(40);
      expect(b.h).toBeLessThanOrEqual(90);
      const screen = b.signs.find((s) => s.kind === 'screen')!;
      expect(screen.lz).toBeLessThan(-b.d / 2);
      expect([3, 4, 5]).toContain(b.signs.find((s) => s.kind === 'billboard')!.cell);
      const blade = b.signs.find((s) => s.kind === 'vertical')!;
      expect([0, 1, 2]).toContain(blade.cell);
      expect(TORONTO.signColors).toContain(blade.color);
    }
  });

  it('keeps every hand-placed lot inside its block interior (clear of roads and avenue pavement)', () => {
    for (const b of TORONTO.specialLots) {
      const r = blockInterior(blockOf(b.x), blockOf(b.z));
      const msg = `${b.x},${b.z}`;
      expect(b.x - b.w / 2, msg).toBeGreaterThanOrEqual(r.x0 - 1e-9);
      expect(b.x + b.w / 2, msg).toBeLessThanOrEqual(r.x1 + 1e-9);
      expect(b.z - b.d / 2, msg).toBeGreaterThanOrEqual(r.z0 - 1e-9);
      expect(b.z + b.d / 2, msg).toBeLessThanOrEqual(r.z1 + 1e-9);
    }
  });

  it('generates every hand-placed lot exactly, with no random building overlapping one', () => {
    const all: BuildingSpec[] = [];
    for (const r of chunksInRadius(-200, 1200, 1200)) all.push(...generateChunk(TORONTO, 1337, r.cx, r.cz).buildings);
    const isSpecial = (b: BuildingSpec) => TORONTO.specialLots.some((s) => s.x === b.x && s.z === b.z && s.h === b.h);
    expect(all.filter(isSpecial)).toHaveLength(TORONTO.specialLots.length);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of all.filter(isSpecial)) for (const b of all.filter((b) => !isSpecial(b))) expect(overlaps(s, b)).toBe(false);
  });

  it('puts video screens only on the Yonge-Dundas lots', () => {
    for (const r of chunksInRadius(0, 1500, 3000)) {
      for (const b of generateChunk(TORONTO, 1337, r.cx, r.cz).buildings) {
        if (b.signs.some((s) => s.kind === 'screen')) expect(YONGE_DUNDAS_LOTS.some((y) => y.x === b.x && y.z === b.z)).toBe(true);
      }
    }
  });
});

describe('Nathan Phillips Square', () => {
  const ov = NATHAN_PHILLIPS;
  const worldX = (px: number) => ov.x - ov.size / 2 + (px * ov.size) / SQUARE_PX;
  const worldZ = (py: number) => ov.z - ov.size / 2 + (py * ov.size) / SQUARE_PX;
  const hall = TORONTO.landmarks.find((l) => l.id === 'city-hall')!;

  it("is City Hall's block's ground decal, inside the block's interior, off every road", () => {
    expect(TORONTO.overlays).toEqual([NATHAN_PHILLIPS]);
    expect(ov).toEqual({ id: 'nathan-phillips', x: -500, z: 1106, size: 140 });
    const r = blockInterior(Math.floor(hall.x / 200), Math.floor(hall.z / 200));
    expect(ov.x - ov.size / 2).toBeGreaterThanOrEqual(r.x0);
    expect(ov.x + ov.size / 2).toBeLessThanOrEqual(r.x1);
    expect(ov.z - ov.size / 2).toBeGreaterThanOrEqual(r.z0);
    expect(ov.z + ov.size / 2).toBeLessThanOrEqual(r.z1);
  });

  it('paves the whole decal and sets the rimmed pool and the TORONTO strip on the plaza in front of City Hall (camera side)', () => {
    const rects = squareRects();
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: SQUARE_PX, h: SQUARE_PX });
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SQUARE_PX);
      expect(r.y + r.h).toBeLessThanOrEqual(SQUARE_PX);
    }
    const { pool, rim, strip } = SQUARE_LAYOUT;
    const front = hall.z - CITY_HALL.d / 2;
    for (const r of [{ x: pool.x - rim, y: pool.y - rim, w: pool.w + 2 * rim, h: pool.h + 2 * rim }, strip]) {
      expect(worldZ(r.y)).toBeGreaterThanOrEqual(blockInterior(-3, 5).z0);
      expect(worldZ(r.y + r.h)).toBeLessThanOrEqual(front);
      expect(worldX(r.x)).toBeGreaterThan(hall.x - CITY_HALL.w / 2);
      expect(worldX(r.x + r.w)).toBeLessThan(hall.x + CITY_HALL.w / 2);
    }
  });

  it('spells TORONTO on the strip, readable from the start camera: letters run toward −x, glyph tops toward +z', () => {
    const ink = letterRects();
    const word = 'TORONTO';
    const { strip } = SQUARE_LAYOUT;
    for (let k = 0; k < word.length; k++) {
      const mine = ink.filter((r) => r.letter === k);
      const want = LATIN_FONT[word[k]!]!.join('').split('').filter((c) => c === '1').length;
      expect(mine, word[k]).toHaveLength(want);
      for (const r of mine) {
        expect(r.x).toBeGreaterThanOrEqual(strip.x);
        expect(r.x + r.w).toBeLessThanOrEqual(strip.x + strip.w);
        expect(r.y).toBeGreaterThanOrEqual(strip.y);
        expect(r.y + r.h).toBeLessThanOrEqual(strip.y + strip.h);
      }
    }
    const xs = (k: number) => ink.filter((r) => r.letter === k).map((r) => r.x);
    expect(Math.min(...xs(0))).toBeGreaterThan(Math.max(...xs(6)));
    // The T's crossbar (its top row) is the farthest (+z) row of ink.
    const t = ink.filter((r) => r.letter === 0);
    const top = Math.max(...ink.map((r) => r.y));
    expect(t.filter((r) => r.y === top)).toHaveLength(5);
    expect(squareRects()).toEqual(expect.arrayContaining(ink.map(({ letter: _l, ...r }) => r)));
  });

  it('has its own texture painter', () => {
    expect(() => overlayPainter('nathan-phillips')).not.toThrow();
  });
});
