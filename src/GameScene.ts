import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState } from './GameEvents';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { faceted, toonMat } from './render/toon';
import { clampDelta } from './util/math';

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
  private tmpLookCheck: THREE.Group | null = null; // removed in Task 3

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.camera.near = CONFIG.camera.near;
    this.camera.far = CONFIG.camera.far;
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    // Temporary look-check content (Task 3 replaces with the city)
    this.tmpLookCheck = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), toonMat(CONFIG.palette.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const pillar = new THREE.Mesh(faceted(new THREE.CylinderGeometry(60, 90, 550, 6)), toonMat(CONFIG.palette.carapace));
    pillar.position.y = 275;
    pillar.castShadow = true;
    for (let i = 0; i < 30; i++) {
      const h = 20 + ((i * 37) % 100);
      const b = new THREE.Mesh(new THREE.BoxGeometry(60, h, 60), toonMat(CONFIG.palette.buildingFacades[i % 5]!));
      b.position.set(((i % 6) - 3) * 160, h / 2, Math.floor(i / 6) * 160 + 200);
      b.castShadow = b.receiveShadow = true;
      this.tmpLookCheck.add(b);
    }
    this.tmpLookCheck.add(ground, pillar);
    this.scene.add(this.tmpLookCheck);
    this.camera.position.set(-120, 430 + 380, -820);
    this.camera.lookAt(0, 300, 400);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const dt = clampDelta(this.clock.getDelta());
    void dt;
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
    void this.container;
  }
}
