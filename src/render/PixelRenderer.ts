import * as THREE from 'three';
import { CONFIG } from '../config';
import { internalSize } from './pixelSize';

/** Renders the scene into a low-res sRGB target, then draws it full-screen with nearest filtering. */
export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.domElement = this.renderer.domElement;
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    container.appendChild(this.domElement);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: THREE.SRGBColorSpace,
    });

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false }),
    );
    this.quadScene.add(quad);
  }

  /** Call with the container's CSS size (from ResizeObserver contentRect). */
  resize(cssW: number, cssH: number): void {
    const { w, h } = internalSize(cssW, cssH, CONFIG.render.pixelScale, CONFIG.render.minInternalHeight);
    this.target.setSize(w, h);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)), false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.renderer.dispose();
    this.domElement.remove();
  }
}
