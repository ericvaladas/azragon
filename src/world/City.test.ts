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
