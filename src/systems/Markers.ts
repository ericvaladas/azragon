import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const TAP_TIME = 0.6;

function ring(color: number, inner: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, 1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }),
  );
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

/** Ground rings: tap destination (pulse + fade), selected target, desktop hover. */
export class Markers {
  private tap = ring(CONFIG.palette.carapace, 0.7);
  private target = ring(CONFIG.palette.fire, 0.82);
  private hover = ring(0xffffff, 0.88);
  private aim = ring(CONFIG.palette.stinger, 0.9);
  private tapT = 0;
  private targetRef: Target | null = null;
  private hoverRef: Target | null = null;
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.tap, this.target, this.hover, this.aim);
  }

  tapAt(p: THREE.Vector3): void {
    this.tap.position.set(p.x, 2, p.z);
    this.tapT = TAP_TIME;
    this.tap.visible = true;
  }

  setTarget(t: Target | null): void {
    this.targetRef = t;
  }

  setHover(t: Target | null): void {
    this.hoverRef = t;
  }

  setAim(p: THREE.Vector3 | null, radius: number): void {
    this.aim.visible = p !== null;
    if (p) {
      this.aim.position.set(p.x, 4, p.z);
      this.aim.scale.setScalar(radius * (1 + Math.sin(this.time * 10) * 0.04));
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.tapT > 0) {
      this.tapT -= dt;
      const k = 1 - this.tapT / TAP_TIME;
      this.tap.scale.setScalar(30 + 50 * k);
      (this.tap.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      this.tap.visible = this.tapT > 0;
    }
    this.place(this.target, this.targetRef, 1.5 + Math.sin(this.time * 8) * 0.1);
    this.place(this.hover, this.hoverRef !== this.targetRef ? this.hoverRef : null, 1.3);
  }

  private place(m: THREE.Mesh, t: Target | null, scale: number): void {
    if (!t || !t.isAlive()) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(t.position.x, t.airborne ? t.position.y : 3, t.position.z);
    m.scale.setScalar(Math.max(30, t.radius) * scale);
  }
}
