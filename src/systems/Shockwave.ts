import * as THREE from 'three';
import { CONFIG } from '../config';

const LIFE = 0.6;

/** Expanding ground ring for Roar. */
export class Shockwave {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private t = -1;
  private radius = 1;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.stinger, transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  start(center: THREE.Vector3, radius: number): void {
    this.mesh.position.set(center.x, 6, center.z);
    this.radius = radius;
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / LIFE);
    this.mesh.scale.setScalar(this.radius * (0.1 + 0.9 * (1 - (1 - k) * (1 - k))));
    this.mat.opacity = 1 - k;
    if (k >= 1) {
      this.t = -1;
      this.mesh.visible = false;
    }
  }
}
