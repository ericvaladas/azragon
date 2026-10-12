import * as THREE from 'three';
import { GameEventEmitter, type GameState } from './GameEvents';
import { clampDelta } from './util/math';

export class GameScene {
  readonly events = new GameEventEmitter();

  private state: GameState = 'loading';
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 5, 12000);
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private resizeObserver: ResizeObserver;

  constructor(private container: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x6f9fd8);
    container.appendChild(this.renderer.domElement);
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
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(w * dpr, h * dpr, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const dt = clampDelta(this.clock.getDelta());
    void dt;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.removeAll();
    void this.container;
  }
}
