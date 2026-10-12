import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState } from './GameEvents';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta } from './util/math';
import type { Target } from './combat';
import { City } from './world/City';
import { Monster } from './monster/Monster';
import { CameraRig } from './systems/CameraRig';
import { generateCityLayout } from './world/cityLayout';

export class GameScene {
  readonly events = new GameEventEmitter();

  private state: GameState = 'loading';
  private pixel: PixelRenderer;
  private lighting: Lighting;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 5, 12000);
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private resizeObserver: ResizeObserver;
  private city: City;
  private kills = 0;
  private monster: Monster;
  private elapsed = 0;
  private rig: CameraRig;

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.rig = new CameraRig(this.camera);
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, generateCityLayout(CONFIG.world.seed), this.onTargetDestroyed);
    this.monster = new Monster(this.scene);
    this.monster.onFootLand = () => this.rig.addTrauma(0.08);
    this.pixel.domElement.addEventListener('pointerdown', this.debugSmash);

    this.lighting.follow(new THREE.Vector3());

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.clock.start();
    this.update();
    this.setState('playing');
  }

  getState(): GameState {
    return this.state;
  }

  restart(): void {
    this.setState('playing');
  }

  private setState(next: GameState): void {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('stateChange', next);
  }

  private onResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;
    const { width: w, height: h } = entry.contentRect;
    if (w === 0 || h === 0) return;
    this.pixel.resize(w, h);
    this.rig.setAspect(w / h);
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const dt = clampDelta(this.clock.getDelta());
    this.elapsed += dt;
    // TEMP (removed in Task 6): wander in a circle to check the gait
    const t = this.elapsed * 0.15;
    this.monster.moveToward({ x: Math.sin(t) * 260, z: Math.cos(t) * 260 }, dt, 1);
    this.monster.animate(dt, this.elapsed);
    this.rig.update(dt, this.monster.position);
    this.lighting.follow(this.monster.position);
    this.city.update(dt);
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
  };

  // Task 10 adds EXP; until then only kills are counted.
  private onTargetDestroyed = (target: Target, exp: number): void => {
    if (target.kind !== 'building') this.kills++;
    void exp;
  };

  // TEMP (replaced in Task 6): click a building to destroy it.
  private debugSmash = (e: PointerEvent) => {
    const r = this.pixel.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.intersectObject(this.city.buildingMesh)[0];
    if (hit?.instanceId !== undefined) this.city.targetForInstance(hit.instanceId)?.applyDamage(9999);
  };

  dispose(): void {
    this.pixel.domElement.removeEventListener('pointerdown', this.debugSmash);
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
    void this.container;
  }
}
