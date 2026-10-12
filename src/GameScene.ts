import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState } from './GameEvents';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta, type Vec2 } from './util/math';
import type { Target } from './combat';
import { City } from './world/City';
import { Monster } from './monster/Monster';
import { CameraRig } from './systems/CameraRig';
import { Input } from './systems/Input';
import { Markers } from './systems/Markers';
import { pickEnemy } from './systems/tap';
import { generateCityLayout } from './world/cityLayout';

type Order = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: Target } | null;

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
  private input: Input;
  private markers: Markers;
  private order: Order = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpV = new THREE.Vector3();

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.rig = new CameraRig(this.camera);
    this.markers = new Markers(this.scene);
    this.input = new Input(this.pixel.domElement, {
      tap: this.onTap,
      drag: (dx, dy) => this.rig.drag(dx, dy),
      wheel: (dy) => this.rig.zoom(dy),
      hover: this.onHover,
    });
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, generateCityLayout(CONFIG.world.seed), this.onTargetDestroyed);
    this.monster = new Monster(this.scene);
    this.monster.onFootLand = () => this.rig.addTrauma(0.08);

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
    if (this.state === 'playing') {
      if (this.order?.kind === 'move') {
        if (this.monster.moveToward(this.order.to, dt, 1)) this.order = null;
      } else if (this.order?.kind === 'attack') {
        const t = this.order.target;
        if (!t.isAlive()) {
          this.order = null;
          this.markers.setTarget(null);
        } else {
          this.monster.moveToward({ x: t.position.x, z: t.position.z }, dt, 1);
        }
      }
    }
    this.monster.animate(dt, this.elapsed);
    this.markers.update(dt);
    this.rig.update(dt, this.monster.position);
    this.lighting.follow(this.monster.position);
    this.city.update(dt);
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
  };

  /** Enemies the player can target. Filled in by Task 9. */
  enemyTargets(): Target[] {
    return [];
  }

  private setRay(x: number, y: number): void {
    const el = this.pixel.domElement;
    this.ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /** Enemy within the pick radius on screen, else building under the ray. */
  private pickTarget(x: number, y: number): Target | null {
    const enemies = this.enemyTargets();
    const el = this.pixel.domElement;
    const pts = enemies.map((t, index) => {
      this.tmpV.copy(t.position).project(this.camera);
      return {
        index,
        x: (this.tmpV.x * 0.5 + 0.5) * el.clientWidth,
        y: (-this.tmpV.y * 0.5 + 0.5) * el.clientHeight,
        visible: this.tmpV.z < 1 && t.isAlive(),
      };
    });
    const hit = pickEnemy(pts, x, y, CONFIG.input.pickRadiusPx);
    if (hit !== null) return enemies[hit]!;
    this.setRay(x, y);
    const b = this.raycaster.intersectObject(this.city.buildingMesh)[0];
    return b?.instanceId !== undefined ? this.city.targetForInstance(b.instanceId) : null;
  }

  private onTap = (x: number, y: number): void => {
    if (this.state !== 'playing') return;
    const target = this.pickTarget(x, y);
    if (target) {
      this.order = { kind: 'attack', target };
      this.markers.setTarget(target);
      return;
    }
    this.setRay(x, y);
    const p = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
    if (!p) return;
    const lim = CONFIG.world.citySize / 2;
    p.x = Math.min(lim, Math.max(-lim, p.x));
    p.z = Math.min(lim, Math.max(-lim, p.z));
    this.order = { kind: 'move', to: { x: p.x, z: p.z } };
    this.markers.setTarget(null);
    this.markers.tapAt(p);
  };

  private onHover = (x: number, y: number): void => {
    const t = this.state === 'playing' ? this.pickTarget(x, y) : null;
    this.markers.setHover(t);
    this.container.classList.toggle('can-target', t !== null);
  };

  // Task 10 adds EXP; until then only kills are counted.
  private onTargetDestroyed = (target: Target, exp: number): void => {
    if (target.kind !== 'building') this.kills++;
    void exp;
  };

  dispose(): void {
    this.input.dispose();
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
  }
}
