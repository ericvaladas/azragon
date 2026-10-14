import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import type { CityStyle } from '../cities/types';
import { City, CRATER_RADIUS, SlotPool } from './City';
import type { CityTextures } from './pixelTextures';
import type { Target } from '../combat';
import { gameplayPose } from '../intro/timeline';

const STUB: CityTextures = {
  ground: () => new THREE.Texture(),
  crater: () => new THREE.Texture(),
  facades: () => new THREE.Texture(),
  screen: () => new THREE.Texture(),
  signs: () => new THREE.Texture(),
  overlay: () => new THREE.Texture(),
  road: () => new THREE.Texture(),
};
const make = (style: CityStyle = TOKYO, onDestroyed = (_t: Target, _e: number) => {}) => {
  const scene = new THREE.Scene();
  return { scene, city: new City(scene, style, CONFIG.world.seed, onDestroyed, STUB) };
};
const tmg = TOKYO.landmarks[0]!;
const landmarkTarget = (city: City): Target => {
  let t: Target | null = null;
  city.forEachStandingInRadius({ x: tmg.x, z: tmg.z }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) t = b; });
  return t!;
};

describe('City (Tokyo)', () => {
  it('loads the Metropolitan Government Building as a standing building-kind target with HP by height', () => {
    const { city } = make();
    expect(city.landmarkCount()).toBe(TOKYO.landmarks.length);
    const t = landmarkTarget(city);
    expect(t.kind).toBe('building');
    expect((t as unknown as { maxHp: number }).maxHp).toBe(Math.round(tmg.h * CONFIG.world.buildingHpPerMetre));
    expect(city.landmarkAt(tmg.x, tmg.z)).toBe(true);
    expect(city.landmarkAt(tmg.x + tmg.w, tmg.z)).toBe(false);
  });

  it('is picked by a ray aimed at it (straight down, so no nearer tower is in the way)', () => {
    const { city } = make();
    const ray = new THREE.Ray(new THREE.Vector3(tmg.x, 1000, tmg.z), new THREE.Vector3(0, -1, 0));
    expect(city.pickBuilding(ray)).toBe(landmarkTarget(city));
  });

  it('collapses when destroyed, awarding EXP by HP, and its mesh tilts and sinks, then is hidden', () => {
    let exp = 0;
    const { city, scene } = make(TOKYO, (_t, e) => { exp = e; });
    const t = landmarkTarget(city);
    t.applyDamage(1e9);
    expect(t.isAlive()).toBe(false);
    expect(exp).toBe(Math.max(1, Math.round(Math.round(tmg.h * CONFIG.world.buildingHpPerMetre) * CONFIG.world.buildingExpPerHp)));
    const mesh = scene.children.find((o) => (o as THREE.Mesh).isMesh && o.position.x === tmg.x && o.position.z === tmg.z) as THREE.Mesh;
    city.update(CONFIG.world.collapseTime * 0.5, new THREE.Vector3());
    expect(mesh.position.y).toBeLessThan(0);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0);
    city.update(CONFIG.world.collapseTime, new THREE.Vector3());
    expect(mesh.visible).toBe(false);
  });

  it('remembers a destroyed landmark after its chunk streams out and back', () => {
    const { city } = make();
    landmarkTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3(30000, 0, 0));
    expect(city.landmarkCount()).toBe(0);
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3());
    expect(city.landmarkCount()).toBe(TOKYO.landmarks.length);
    let standing = false;
    city.forEachStandingInRadius({ x: tmg.x, z: tmg.z }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) standing = true; });
    expect(standing).toBe(false);
  });

  it('a landmark inside the blast radius rides it out', () => {
    const near: CityStyle = { ...TOKYO, landmarks: [{ ...tmg, x: 500, z: 700 }] };
    const { city } = make(near);
    let t: Target | null = null;
    city.forEachStandingInRadius({ x: 500, z: 700 }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) t = b; });
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(t!.isAlive()).toBe(true);
  });

  it('keeps every landmark and every Shibuya corner building standing through the crash blast', () => {
    const { city } = make();
    const at = (x: number, z: number): Target | null => {
      let t: Target | null = null;
      city.forEachStandingInRadius({ x, z }, 2, (b) => { if (b.position.x === x && b.position.z === z) t = b; });
      return t;
    };
    const targets = [...TOKYO.landmarks, ...TOKYO.specialLots].map((s) => at(s.x, s.z));
    for (const t of targets) expect(t).not.toBeNull();
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    for (const t of targets) expect(t!.isAlive()).toBe(true);
  });

  // A kept lot and a landmark well inside the crater radius, where every other building falls.
  const NEAR: CityStyle = { ...TOKYO, landmarks: [{ ...tmg, x: 500, z: 700 }], specialLots: [{ ...TOKYO.specialLots[0]!, x: 500, z: 500 }] };
  const nearTargets = (city: City) => {
    let lot: Target | null = null;
    let landmark: Target | null = null;
    city.forEachStandingInRadius({ x: 500, z: 600 }, 120, (b) => {
      if (b.position.x === 500 && b.position.z === 500) lot = b;
      if (b.position.x === 500 && b.position.z === 700) landmark = b;
    });
    return { lot: lot as Target | null, landmark: landmark as Target | null };
  };

  it('keeps a kept lot standing through the instant crash blast inside the crater radius', () => {
    const { city } = make(NEAR);
    const { lot } = nearTargets(city);
    expect(lot).not.toBeNull();
    expect(Math.hypot(500, 500) + lot!.radius).toBeLessThan(CRATER_RADIUS);
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(lot!.isAlive()).toBe(true);
  });

  it('keeps a kept lot and a landmark standing, upright and in place, through the animated crash blast', () => {
    const { city, scene } = make(NEAR);
    const { lot, landmark } = nearTargets(city);
    expect(lot).not.toBeNull();
    expect(landmark).not.toBeNull();
    // A random building next to them does fall, so the blast really reaches this spot.
    let neighbour: Target | null = null;
    city.forEachStandingInRadius({ x: 300, z: 500 }, 100, (b) => { if (!(b.position.x === 500 && b.position.z === 500)) neighbour = b; });
    expect(neighbour).not.toBeNull();
    const outer = CRATER_RADIUS * CONFIG.intro.impact.outer;
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, false, outer, CONFIG.intro.impact.shockSpeed);
    const T = CONFIG.world.collapseTime + outer / CONFIG.intro.impact.shockSpeed + 1;
    for (let t = 0; t < T; t += 0.05) city.update(0.05, new THREE.Vector3());
    expect((neighbour as Target | null)!.isAlive()).toBe(false);
    expect(lot!.isAlive()).toBe(true);
    expect(landmark!.isAlive()).toBe(true);
    const slot = (lot as unknown as { slot: number }).slot;
    const m = new THREE.Matrix4();
    city.buildingMesh.getMatrixAt(slot, m);
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(pos, q, s);
    expect(pos.x).toBe(500);
    expect(pos.y).toBeCloseTo(0);
    expect(pos.z).toBe(500);
    expect(s.y).toBeCloseTo((lot as unknown as { spec: { h: number } }).spec.h);
    const mesh = scene.children.find((o) => (o as THREE.Mesh).isMesh && o.position.x === 500 && o.position.z === 700)!;
    expect(mesh.visible).toBe(true);
    expect(mesh.position.y).toBeCloseTo(0);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
  });

  it('frames Tokyo Tower in the opening gameplay view', () => {
    const pose = gameplayPose();
    const cam = new THREE.PerspectiveCamera(CONFIG.camera.baseVFovDeg, 16 / 10, CONFIG.camera.near, CONFIG.camera.far);
    cam.position.copy(pose.pos);
    cam.lookAt(pose.look);
    cam.updateMatrixWorld();
    const tower = TOKYO.landmarks.find((l) => l.id === 'tokyo-tower')!;
    const p = new THREE.Vector3(tower.x, tower.h / 2, tower.z).project(cam);
    expect(Math.abs(p.x)).toBeLessThan(0.9);
    expect(Math.abs(p.y)).toBeLessThan(0.9);
    expect(p.z).toBeLessThan(1);
  });

  it('reset(style) twice leaves exactly one mesh per loaded landmark and per overlay (no leftovers)', () => {
    const { city, scene } = make();
    const count = () => scene.children.filter((o) => (o as THREE.Mesh).isMesh).length;
    const before = count();
    city.reset(TOKYO);
    city.reset(TOKYO);
    expect(count()).toBe(before);
    expect(city.landmarkCount()).toBe(TOKYO.landmarks.length);
    expect(city.style).toBe(TOKYO);
  });

  it('keeps the chunk under the monster fully built after streaming far away and back (no pool starvation)', () => {
    const { city } = make();
    const countNear = () => {
      let n = 0;
      city.forEachStandingInRadius({ x: 100, z: 1900 }, 150, () => n++);
      return n;
    };
    const first = countNear();
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) city.update(0.016, new THREE.Vector3(20000, 0, 0));
    for (let i = 0; i < 400; i++) city.update(0.016, new THREE.Vector3(0, 0, 0));
    expect(countNear()).toBe(first);
  });

  it('a collapse-only frame re-uploads buildings, rubble and signs, never the ground-layer pools', () => {
    const { city } = make();
    const meshes = city as unknown as Record<'treeMesh' | 'roadMesh' | 'nodeMesh' | 'waterMesh' | 'parkMesh' | 'rubbleMesh', THREE.InstancedMesh>;
    // Flush the construction upload; the city stays centred on the origin, so nothing streams.
    city.update(0, new THREE.Vector3());
    const ground = [meshes.treeMesh, meshes.roadMesh, meshes.nodeMesh, meshes.waterMesh, meshes.parkMesh];
    const versions = () => [
      ...ground.map((m) => m.instanceMatrix.version),
      meshes.nodeMesh.instanceColor!.version,
      meshes.parkMesh.instanceColor!.version,
      city.buildingMesh.instanceColor!.version,
      (city.buildingMesh.geometry.getAttribute('aFacade') as THREE.InstancedBufferAttribute).version,
      (meshes.roadMesh.geometry.getAttribute('aPlainEnds') as THREE.InstancedBufferAttribute).version,
    ];
    const before = versions();
    const building = city.buildingMesh.instanceMatrix.version;
    const rubble = meshes.rubbleMesh.instanceMatrix.version;
    let victim: Target | null = null;
    city.forEachStandingInRadius({ x: 100, z: 1900 }, 150, (t) => { if (!victim && (t as unknown as { slot: number }).slot >= 0) victim = t; });
    victim!.applyDamage(1e9);
    for (let i = 0; i < 20; i++) city.update(0.1, new THREE.Vector3());
    expect(versions()).toEqual(before);
    expect(city.buildingMesh.instanceMatrix.version).toBeGreaterThan(building);
    expect(meshes.rubbleMesh.instanceMatrix.version).toBeGreaterThan(rubble);
    // Only the slots in draw range go up.
    expect(city.buildingMesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: city.buildingMesh.count * 16 }]);
  });

  it('tints each building with its spec colour and sets its facade cell', () => {
    const { city } = make();
    const attr = city.buildingMesh.geometry.getAttribute('aFacade') as THREE.InstancedBufferAttribute;
    expect(attr).toBeDefined();
    let seen = false;
    for (let i = 0; i < city.buildingMesh.count; i++) if (attr.getX(i) > 0) seen = true;
    expect(seen).toBe(true);
  });
});

describe('road network', () => {
  const meshes = (city: City) => city as unknown as Record<'roadMesh' | 'nodeMesh' | 'waterMesh', THREE.InstancedMesh>;
  const counts = (city: City) => {
    const m = meshes(city);
    return [m.roadMesh.count, m.nodeMesh.count, m.waterMesh.count];
  };

  it('draws roads, intersections and the river after construction', () => {
    const { city } = make();
    const m = meshes(city);
    expect(m.roadMesh.count).toBeGreaterThan(0);
    expect(m.nodeMesh.count).toBeGreaterThan(0);
    expect(m.waterMesh.count).toBeGreaterThan(0);
    expect(m.roadMesh.count).toBeLessThanOrEqual(CONFIG.world.maxRoads);
  });

  it('keeps the same counts after reset(TOKYO) twice (no leak)', () => {
    const { city } = make();
    const before = counts(city);
    city.reset(TOKYO);
    city.reset(TOKYO);
    expect(counts(city)).toEqual(before);
  });

  it('switches off segment-end crosswalks only where a segment meets a keep node (the scramble draws its own)', () => {
    const { city } = make();
    const road = meshes(city).roadMesh;
    const plain = road.geometry.getAttribute('aPlainEnds') as THREE.InstancedBufferAttribute;
    expect(plain).toBeDefined();
    const keep = TOKYO.keepNodes.map((k) => new THREE.Vector2(k.x, k.z));
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let atKeep = 0, elsewhere = 0;
    for (let i = 0; i < road.count; i++) {
      road.getMatrixAt(i, m);
      m.decompose(p, q, s);
      if (s.z === 0) continue;
      const alongX = Math.abs(q.y) > 0.1;
      const half = s.z / 2;
      // Quad ends: the start node's end (lower coordinate) first.
      const ends = alongX ? [new THREE.Vector2(p.x - half, p.z), new THREE.Vector2(p.x + half, p.z)] : [new THREE.Vector2(p.x, p.z - half), new THREE.Vector2(p.x, p.z + half)];
      ends.forEach((e, k) => {
        const touches = keep.some((n) => e.distanceTo(n) < 60);
        const flag = k === 0 ? plain.getX(i) : plain.getY(i);
        expect(flag, `road ${i} end ${k} at ${e.x},${e.y}`).toBe(touches ? 1 : 0);
        if (touches) atKeep++;
        else elsewhere++;
      });
    }
    expect(atKeep).toBe(4 * TOKYO.keepNodes.length);
    expect(elsewhere).toBeGreaterThan(100);
  });

  // Mesh `count` is the highest slot in use, which depends on the order slots were freed; slots in use do not.
  it('returns to the same slots in use after streaming 30 km away and back', () => {
    const { city } = make();
    const before = city.roadNetworkCount();
    expect(before.roads).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3(30000, 0, 0));
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3());
    expect(city.roadNetworkCount()).toEqual(before);
  });
});

describe('SlotPool', () => {
  it('reset() frees every slot and clears its in-use marks', () => {
    const pool = new SlotPool(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 8));
    for (let i = 0; i < 5; i++) pool.take(new THREE.Matrix4());
    expect(pool.inUse()).toBe(5);
    expect(pool.highWater()).toBe(5);
    pool.reset();
    expect(pool.inUse()).toBe(0);
    expect(pool.highWater()).toBe(0);
  });
});

describe('signs', () => {
  const corner = TOKYO.specialLots.find((s) => s.signs.some((g) => g.kind === 'screen'))!;
  const cornerTarget = (city: City): Target => {
    let t: Target | null = null;
    city.forEachStandingInRadius({ x: corner.x, z: corner.z }, 2, (b) => { if (b.position.x === corner.x && b.position.z === corner.z) t = b; });
    return t!;
  };
  const signMatrix = (city: City, b: Target, k: number) => {
    const entry = (b as unknown as { signSlots: { pool: 'sign' | 'screen'; slot: number }[] }).signSlots[k]!;
    const mesh = (city as unknown as Record<string, THREE.InstancedMesh>)[entry.pool === 'sign' ? 'signMesh' : 'screenMesh']!;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(entry.slot, m);
    return m;
  };

  it('builds signs and screens for standing buildings', () => {
    const { city } = make();
    expect(city.signCount()).toBeGreaterThan(0);
    expect(city.screenCount()).toBeGreaterThanOrEqual(3);
  });

  it('a screen sits on its building and follows it as it tilts and sinks', () => {
    const { city } = make();
    const b = cornerTarget(city);
    const k = corner.signs.findIndex((g) => g.kind === 'screen');
    const g = corner.signs[k]!;
    const at = new THREE.Vector3().setFromMatrixPosition(signMatrix(city, b, k));
    expect(at.x).toBeCloseTo(corner.x + g.lx);
    expect(at.y).toBeCloseTo(g.ly);
    expect(at.z).toBeCloseTo(corner.z + g.lz);
    b.applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 0.6, new THREE.Vector3());
    const mid = new THREE.Vector3().setFromMatrixPosition(signMatrix(city, b, k));
    expect(mid.y).toBeLessThan(g.ly - 1);
  });

  it('is gone once the building is rubble', () => {
    const { city } = make();
    const before = city.screenCount();
    cornerTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    expect(city.screenCount()).toBe(before - corner.signs.filter((g) => g.kind === 'screen').length);
  });

  it('a destroyed building that streams back returns as rubble without signs', () => {
    const { city } = make();
    cornerTarget(city).applyDamage(1e9);
    city.update(CONFIG.world.collapseTime * 2, new THREE.Vector3());
    const after = city.screenCount();
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3(30000, 0, 0));
    for (let i = 0; i < 200; i++) city.update(0.016, new THREE.Vector3());
    expect(city.screenCount()).toBe(after);
  });
});
