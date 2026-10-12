import type * as THREE from 'three';

/** FPS + draw calls + triangles, refreshed twice a second. Enabled with ?debug=1. */
export class DebugOverlay {
  private el = document.createElement('div');
  private frames = 0;
  private t = 0;

  constructor(container: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'absolute', left: '4px', bottom: '4px', padding: '4px 6px', font: '11px monospace',
      color: '#9be22d', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none', zIndex: '10',
    });
    container.appendChild(this.el);
  }

  update(dt: number, info: THREE.WebGLInfo): void {
    this.frames++;
    this.t += dt;
    if (this.t < 0.5) return;
    this.el.textContent = `${Math.round(this.frames / this.t)} fps · ${info.render.calls} calls · ${Math.round(info.render.triangles / 1000)}k tris`;
    this.frames = 0;
    this.t = 0;
  }

  dispose(): void {
    this.el.remove();
  }
}
