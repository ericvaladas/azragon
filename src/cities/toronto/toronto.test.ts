import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { DISTRICTS, FACADE } from '../types';
import { TORONTO } from './index';
import { chunksInRadius, generateChunk } from '../../world/chunks';
import { AREAS, CASA_LOMA_SITE, CN_TOWER_SITE, CITY_HALL_SITE, QUEENS_PARK_SITE, ROGERS_CENTRE_SITE, SCOTIABANK_ARENA_SITE, blockInterior, districtAt } from './layout';
import { QUEENS_PARK, queensParkGeometry } from './queensPark';
import { CASA_LOMA, CASA_LOMA_TOWER, CASA_LOMA_TURRET, casaLomaGeometry } from './casaLoma';
import { SCOTIABANK_ARENA, scotiabankArenaGeometry } from './scotiabankArena';
import { CN_TOWER, cnTowerGeometry } from './cnTower';
import { ROGERS_CENTRE, rogersCentreGeometry } from './rogersCentre';
import { CITY_HALL, cityHallGeometry } from './cityHall';
import { FIRST_CANADIAN_PLACE, FINANCIAL_LOTS, GOLD, ROYAL_BANK_PLAZA } from './financial';
import { YD_BLOCK, YONGE_DUNDAS_LOTS } from './yongeDundas';
import { UOFT_HALLS } from './uoft';
import { DISTILLERY_CHIMNEY, DISTILLERY_LOTS } from './distillery';
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
    expect(D.highrise.height).toEqual([110, 220]);
    expect(D.neon.height).toEqual([15, 30]);
    expect(D.office.height).toEqual([35, 80]);
    expect(D.residential.height).toEqual([10, 22]);
    expect(D.residential.trees).toBe(6);
    expect(D.residential.lots).toBe(4);
    expect(D.port.height).toEqual([60, 120]);
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
    expect(TORONTO.landmarks.map((l) => l.id)).toEqual(['cn-tower', 'rogers-centre', 'city-hall', 'queens-park', 'casa-loma', 'scotiabank-arena']);
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
    ['queens-park', QUEENS_PARK_SITE, { x: -1000, z: -100 }, QUEENS_PARK, 'park'],
    ['casa-loma', CASA_LOMA_SITE, { x: -1800, z: -2300 }, CASA_LOMA, 'park'],
    ['scotiabank-arena', SCOTIABANK_ARENA_SITE, { x: 100, z: 1950 }, SCOTIABANK_ARENA, 'port'],
  ] as const)('sets %s within a block of its target, on its green or quay', (id, site, target, size, district) => {
    expect(at(id)).toMatchObject({ ...site, ...size });
    expect(Math.abs(site.x - target.x)).toBeLessThanOrEqual(W.blockSize);
    expect(Math.abs(site.z - target.z)).toBeLessThanOrEqual(W.blockSize);
    const ci = blockOf(site.x), cj = blockOf(site.z);
    expect(blockDistrict(TORONTO, W.blockSize * (ci + 0.5), W.blockSize * (cj + 0.5))).toBe(district);
  });

  it('builds the Ontario Legislature: a long pink-sandstone front, wings lower than the centre, a taller pyramid-roofed central tower', () => {
    const g = queensParkGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(QUEENS_PARK.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(QUEENS_PARK.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(QUEENS_PARK.d + 0.01);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(2 * (bb.max.z - bb.min.z) - 10);
    expect(g.getAttribute('color')).toBeDefined();
    const tower = down(g, 0, QUEENS_PARK.d / 2 - 10)!.point.y;
    const centre = down(g, 15, 0)!.point.y;
    const wing = down(g, 45, 0)!.point.y;
    expect(tower).toBeGreaterThan(centre + 15);
    expect(centre).toBeGreaterThan(wing);
    expect(wing).toBeGreaterThan(15);
    // The tower's roof is a pyramid: lower off its axis.
    expect(down(g, 5, QUEENS_PARK.d / 2 - 10)!.point.y).toBeLessThan(tower - 3);
  });

  it('builds Casa Loma: a stone hall, a tall square tower with battlements, and round turrets with conical roofs', () => {
    const g = casaLomaGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(CASA_LOMA.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(CASA_LOMA.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(CASA_LOMA.d + 0.01);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(80);
    expect(g.getAttribute('color')).toBeDefined();
    // The hall is lower than its towers; the square tower's top is notched (merlons and gaps).
    const hall = down(g, 0, 0)!.point.y;
    expect(hall).toBeGreaterThan(15);
    expect(hall).toBeLessThan(35);
    // A turret's cone peaks at its axis and falls toward its rim.
    const tip = down(g, CASA_LOMA_TURRET.x, CASA_LOMA_TURRET.z)!.point.y;
    expect(tip).toBeGreaterThan(hall + 10);
    expect(down(g, CASA_LOMA_TURRET.x + CASA_LOMA_TURRET.r * 0.7, CASA_LOMA_TURRET.z)!.point.y).toBeLessThan(tip - 4);
    const tops = [-8, -4, 0, 4, 8].map((dx) => down(g, CASA_LOMA_TOWER.x + dx, CASA_LOMA_TOWER.z + CASA_LOMA_TOWER.half - 0.75)!.point.y);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(1.5);
    expect(Math.min(...tops)).toBeGreaterThan(hall + 10);
  });

  it('builds Scotiabank Arena: a big pale box under a vaulted roof, a dark glass corner', () => {
    const g = scotiabankArenaGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0);
    expect(bb.max.y).toBeCloseTo(SCOTIABANK_ARENA.h);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(SCOTIABANK_ARENA.w + 0.01);
    expect(bb.max.z - bb.min.z).toBeLessThanOrEqual(SCOTIABANK_ARENA.d + 0.01);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(110);
    expect(g.getAttribute('color')).toBeDefined();
    // The roof vaults: highest along the middle, lower toward the long sides.
    const mid = down(g, 0, 0)!.point.y;
    expect(mid).toBeGreaterThan(down(g, 0, SCOTIABANK_ARENA.d / 2 - 12)!.point.y + 4);
    expect(mid).toBeGreaterThan(down(g, 0, -SCOTIABANK_ARENA.d / 2 + 12)!.point.y + 4);
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

  it('puts 8–10 deep slate glass towers 150–220 m tall in the Financial District, all kept through the crash', () => {
    expect(dark.length).toBeGreaterThanOrEqual(8);
    expect(dark.length).toBeLessThanOrEqual(10);
    for (const b of dark) {
      expect(b.h).toBeGreaterThanOrEqual(150);
      expect(b.h).toBeLessThanOrEqual(220);
      // Darker than the stone offices on average, but not black (glass.test.ts sets the floor).
      const sum = (hex: number) => { const c = new THREE.Color(hex); return c.r + c.g + c.b; };
      const office = TORONTO.districts.office.colors.map(sum);
      expect(sum(b.color)).toBeLessThan(office.reduce((a, v) => a + v, 0) / office.length);
      expect(sum(b.color)).toBeGreaterThan(0.25);
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

  it('generates every downtown hand-placed lot exactly, with no random building overlapping one', () => {
    const all: BuildingSpec[] = [];
    for (const r of chunksInRadius(-200, 1200, 1200)) all.push(...generateChunk(TORONTO, 1337, r.cx, r.cz).buildings);
    const downtown = [...YONGE_DUNDAS_LOTS, ...FINANCIAL_LOTS];
    const isSpecial = (b: BuildingSpec) => downtown.some((s) => s.x === b.x && s.z === b.z && s.h === b.h);
    expect(all.filter(isSpecial)).toHaveLength(downtown.length);
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

describe('Chinatown and Kensington Market', () => {
  const blockOf = (v: number) => Math.floor(v / PITCH);
  const area = (name: string) => AREAS.find((a) => a.name === name)!;
  const inArea = (name: string, b: { x: number; z: number }) => {
    const a = area(name);
    return 'ci0' in a && blockOf(b.x) >= a.ci0 && blockOf(b.x) <= a.ci1 && blockOf(b.z) >= a.cj0 && blockOf(b.z) <= a.cj1;
  };
  const hsl = (c: number) => {
    const o = { h: 0, s: 0, l: 0 };
    new THREE.Color(c).getHSL(o, THREE.SRGBColorSpace);
    return o;
  };
  const collect = (name: string) => {
    const a = area(name);
    if (!('ci0' in a)) throw new Error(name);
    const out: BuildingSpec[] = [];
    const seen = new Set<string>();
    for (let i = a.ci0; i <= a.ci1; i++) for (let j = a.cj0; j <= a.cj1; j++) {
      const cx = Math.floor(i / 4), cz = Math.floor(j / 4);
      if (seen.has(`${cx},${cz}`)) continue;
      seen.add(`${cx},${cz}`);
      out.push(...generateChunk(TORONTO, 1337, cx, cz).buildings.filter((b) => inArea(name, b)));
    }
    return out;
  };

  it("retunes Toronto's neon for Chinatown: low (15–30 m), dense small lots, many blade signs, rare billboards, colourful facades", () => {
    const N = TORONTO.districts.neon;
    expect(N.height).toEqual([15, 30]);
    expect(N.lots).toBeGreaterThanOrEqual(4);
    expect(N.fill).toBeGreaterThanOrEqual(0.75);
    expect(N.signs).toBeGreaterThanOrEqual(2);
    expect(N.billboard).toBeLessThanOrEqual(0.02);
    const vivid = N.colors.filter((c) => hsl(c).s > 0.35);
    expect(new Set(vivid.map((c) => Math.round(hsl(c).h * 6) % 6)).size).toBeGreaterThanOrEqual(3);
  });

  it('builds Chinatown low and dense, hung with blade signs', () => {
    const shops = collect('Chinatown');
    // After the per-chunk cap (Chinatown shares its chunks with Kensington and midtown), about half the lots stand.
    expect(shops.length).toBeGreaterThan(60);
    for (const b of shops) {
      expect(b.h).toBeGreaterThanOrEqual(15);
      expect(b.h).toBeLessThanOrEqual(30);
    }
    const blades = shops.reduce((n, b) => n + b.signs.filter((s) => s.kind === 'vertical').length, 0);
    expect(blades / shops.length).toBeGreaterThanOrEqual(0.7);
  });

  it('leaves Yonge-Dundas exactly its four hand-placed lots: no random building on its block', () => {
    const bs = generateChunk(TORONTO, 1337, Math.floor(YD_BLOCK.ci / 4), Math.floor(YD_BLOCK.cj / 4)).buildings.filter((b) => blockOf(b.x) === YD_BLOCK.ci && blockOf(b.z) === YD_BLOCK.cj);
    expect(bs).toEqual(YONGE_DUNDAS_LOTS);
  });

  it('paints Kensington Market in bright pinks, teals, yellows and purples, from its own palette', () => {
    const colors = area('Kensington Market').colors!;
    const hues = colors.map((c) => hsl(c)).filter((c) => c.s > 0.45).map((c) => c.h * 360);
    const near = (h: number) => hues.some((x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 25);
    for (const h of [330, 175, 48, 275]) expect(near(h), `hue ${h}`).toBe(true);
    const homes = collect('Kensington Market');
    expect(homes.length).toBeGreaterThan(20);
    for (const b of homes) expect(colors).toContain(b.color);
    expect(TOKYO.blockColors).toBeUndefined();
  });

  it('keeps University Avenue out of the near-black: blue-grey glass and limestone, so its band does not wall off the start view', () => {
    const towers = collect('University Avenue');
    expect(towers.length).toBeGreaterThan(10);
    for (const b of towers) {
      expect(area('University Avenue').colors).toContain(b.color);
      expect(hsl(b.color).l).toBeGreaterThan(0.25);
    }
  });

  it('gives CityPlace and King West pale condo glass, unlike the dark Financial District', () => {
    for (const name of ['CityPlace', 'King West']) {
      const towers = collect(name);
      expect(towers.length, name).toBeGreaterThan(3);
      for (const b of towers) {
        expect(area(name).colors, name).toContain(b.color);
        expect(hsl(b.color).l, name).toBeGreaterThan(0.4);
      }
    }
  });
});

describe('U of T and the Distillery District (hand-placed lots)', () => {
  const W = CONFIG.world;
  const blockOf = (v: number) => Math.floor(v / PITCH);
  const area = (b: { x: number; z: number }) => AREAS.find((a) => 'ci0' in a && blockOf(b.x) >= a.ci0 && blockOf(b.x) <= a.ci1 && blockOf(b.z) >= a.cj0 && blockOf(b.z) <= a.cj1)?.name;
  const hsl = (c: number) => {
    const o = { h: 0, s: 0, l: 0 };
    new THREE.Color(c).getHSL(o, THREE.SRGBColorSpace);
    return o;
  };
  const chunksOf = (lots: readonly BuildingSpec[]) => {
    const keys = new Map<string, [number, number]>();
    for (const b of lots) keys.set(`${Math.floor(b.x / 800)},${Math.floor(b.z / 800)}`, [Math.floor(b.x / 800), Math.floor(b.z / 800)]);
    return [...keys.values()].map(([cx, cz]) => generateChunk(TORONTO, 1337, cx, cz));
  };

  it('lists the halls and the Distillery among the special lots, all kept through the crash, on land, off the islands and out of the crater', () => {
    for (const b of [...UOFT_HALLS, ...DISTILLERY_LOTS]) expect(TORONTO.specialLots).toContain(b);
    for (const b of TORONTO.specialLots) {
      const ci = blockOf(b.x), cj = blockOf(b.z);
      expect(b.keep).toBe(true);
      expect(isWater(TORONTO, ci, cj), `${b.x},${b.z}`).toBe(false);
      expect(isIsland(TORONTO, ci, cj), `${b.x},${b.z}`).toBe(false);
      expect(Math.hypot(PITCH * (ci + 0.5), PITCH * (cj + 0.5)), `${b.x},${b.z}`).toBeGreaterThanOrEqual(W.clearRadius + PITCH / 2);
    }
  });

  it('stands a few warm stone college halls, 20–35 m, on the U of T lawns', () => {
    expect(UOFT_HALLS.length).toBeGreaterThanOrEqual(4);
    for (const b of UOFT_HALLS) {
      expect(area(b)).toBe('U of T');
      expect(blockDistrict(TORONTO, PITCH * (blockOf(b.x) + 0.5), PITCH * (blockOf(b.z) + 0.5))).toBe('park');
      expect(b.h).toBeGreaterThanOrEqual(20);
      expect(b.h).toBeLessThanOrEqual(35);
      const c = hsl(b.color);
      expect(c.s).toBeLessThan(0.35);
      expect(c.l).toBeGreaterThan(0.5);
      expect(c.l).toBeLessThan(0.85);
    }
    expect(new Set(UOFT_HALLS.map((b) => `${blockOf(b.x)},${blockOf(b.z)}`)).size).toBeGreaterThanOrEqual(3);
  });

  it('generates the halls on their park blocks, with no park tree inside a hall', () => {
    const chunks = chunksOf(UOFT_HALLS);
    const all = chunks.flatMap((c) => c.buildings);
    for (const h of UOFT_HALLS) expect(all).toContainEqual(h);
    for (const c of chunks) for (const t of c.trees) for (const h of UOFT_HALLS) {
      expect(Math.abs(t.x - h.x) * 2 < h.w + 2 && Math.abs(t.z - h.z) * 2 < h.d + 2, `tree ${t.x},${t.z}`).toBe(false);
    }
    // The halls' blocks keep their park pads and their trees.
    for (const h of UOFT_HALLS) {
      const x = PITCH * (blockOf(h.x) + 0.5), z = PITCH * (blockOf(h.z) + 0.5);
      expect(chunks.some((c) => c.parks.some((p) => p.x === x && p.z === z))).toBe(true);
    }
  });

  it('builds the Distillery District of red-brick Victorian warehouses (10–20 m) and one tall slender brick chimney, nothing random among them', () => {
    const sheds = DISTILLERY_LOTS.filter((b) => b !== DISTILLERY_CHIMNEY);
    expect(DISTILLERY_LOTS).toContain(DISTILLERY_CHIMNEY);
    expect(sheds.length).toBeGreaterThanOrEqual(6);
    for (const b of DISTILLERY_LOTS) {
      expect(area(b)).toBe('Distillery District');
      expect(districtAt(PITCH * (blockOf(b.x) + 0.5), PITCH * (blockOf(b.z) + 0.5))).toBe('office');
      const c = hsl(b.color);
      expect(c.h < 30 / 360 || c.h > 340 / 360, `${b.color.toString(16)}`).toBe(true);
      expect(c.s).toBeGreaterThan(0.3);
      expect(c.l).toBeLessThan(0.5);
    }
    for (const b of sheds) {
      expect(b.h).toBeGreaterThanOrEqual(10);
      expect(b.h).toBeLessThanOrEqual(20);
    }
    expect(Math.max(DISTILLERY_CHIMNEY.w, DISTILLERY_CHIMNEY.d)).toBeLessThanOrEqual(8);
    expect(DISTILLERY_CHIMNEY.h).toBeGreaterThanOrEqual(40);
    const overlaps = (a: BuildingSpec, b: BuildingSpec) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;
    for (const s of sheds) expect(overlaps(s, DISTILLERY_CHIMNEY)).toBe(false);
    const blocks = new Set(DISTILLERY_LOTS.map((b) => `${blockOf(b.x)},${blockOf(b.z)}`));
    const built = chunksOf(DISTILLERY_LOTS).flatMap((c) => c.buildings).filter((b) => blocks.has(`${blockOf(b.x)},${blockOf(b.z)}`));
    expect(built).toHaveLength(DISTILLERY_LOTS.length);
    for (const b of built) expect(DISTILLERY_LOTS).toContainEqual(b);
  });
});


describe('Toronto: generic towers stay below the real ones', () => {
  it('keeps every generated and unnamed tower shorter than First Canadian Place and the Royal Bank Plaza', async () => {
    const { FIRST_CANADIAN_PLACE, ROYAL_BANK_PLAZA, FINANCIAL_LOTS } = await import('./financial');
    const { POCKET_RULES } = await import('./districts');
    const real = new Set([FIRST_CANADIAN_PLACE, ...ROYAL_BANK_PLAZA]);
    const generic = FINANCIAL_LOTS.filter((l) => !real.has(l));
    expect(generic.length).toBeGreaterThan(0);
    const tallestReal = Math.min(FIRST_CANADIAN_PLACE.h, Math.max(...ROYAL_BANK_PLAZA.map((b) => b.h)));
    for (const l of generic) expect(l.h).toBeLessThan(tallestReal);
    for (const max of [TORONTO.districts.highrise.height[1], TORONTO.districts.port.height[1], POCKET_RULES.height[1]]) expect(max).toBeLessThan(tallestReal);
  });
});
