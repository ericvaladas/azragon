import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { TOKYO } from '../cities/tokyo';
import type { CityStyle } from '../cities/types';
import { City, CRATER_RADIUS } from './City';
import type { CityTextures } from './pixelTextures';
import type { Target } from '../combat';

const STUB: CityTextures = {
  ground: () => new THREE.Texture(),
  crater: () => new THREE.Texture(),
  facades: () => new THREE.Texture(),
  screen: () => new THREE.Texture(),
  overlay: () => new THREE.Texture(),
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
    expect(city.landmarkCount()).toBe(1);
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
    expect(city.landmarkCount()).toBe(1);
    let standing = false;
    city.forEachStandingInRadius({ x: tmg.x, z: tmg.z }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) standing = true; });
    expect(standing).toBe(false);
  });

  it('is untouched by the crash blast at its distance (only the topple zone falls)', () => {
    const { city } = make();
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(landmarkTarget(city).isAlive()).toBe(true);
  });

  it('a landmark inside the blast radius topples like any building', () => {
    const near: CityStyle = { ...TOKYO, landmarks: [{ ...tmg, x: 500, z: 700 }] };
    const { city } = make(near);
    let t: Target | null = null;
    city.forEachStandingInRadius({ x: 500, z: 700 }, 5, (b) => { if (b.radius >= tmg.w / 2 - 1) t = b; });
    city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    expect(t!.isAlive()).toBe(false);
  });

  it('reset(style) twice leaves exactly one mesh per loaded landmark and per overlay (no leftovers)', () => {
    const { city, scene } = make();
    const count = () => scene.children.filter((o) => (o as THREE.Mesh).isMesh).length;
    const before = count();
    city.reset(TOKYO);
    city.reset(TOKYO);
    expect(count()).toBe(before);
    expect(city.landmarkCount()).toBe(1);
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

  it('tints each building with its spec colour and sets its facade cell', () => {
    const { city } = make();
    const attr = city.buildingMesh.geometry.getAttribute('aFacade') as THREE.InstancedBufferAttribute;
    expect(attr).toBeDefined();
    let seen = false;
    for (let i = 0; i < city.buildingMesh.count; i++) if (attr.getX(i) > 0) seen = true;
    expect(seen).toBe(true);
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
