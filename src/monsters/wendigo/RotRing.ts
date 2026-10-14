import * as THREE from 'three';

/** Seconds for the ring to roll out to its full radius and fade. */
const LIFE = 0.9;

/**
 * Withering Ring's ground wave: a broad, ragged band of black rot that rolls outward from the Wendigo and fades,
 * darkest at its leading edge. One mesh with per-vertex alpha, hidden when idle.
 */
export class RotRing {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private t = -1;
  private radius = 1;

  constructor(scene: THREE.Scene) {
    const n = 40;
    const pos: number[] = [];
    const col: number[] = [];
    const edge = (i: number) => 1 + 0.07 * Math.sin(i * 2.9) * Math.sin(i * 1.3 + 2);
    const tail = (i: number) => 0.55 + 0.08 * Math.sin(i * 3.7 + 1);
    const lead = [0.02, 0.015, 0.025, 1];
    const back = [0.08, 0.1, 0.05, 0];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const o0 = [Math.cos(a0) * edge(i), 0, Math.sin(a0) * edge(i)];
      const o1 = [Math.cos(a1) * edge(i + 1), 0, Math.sin(a1) * edge(i + 1)];
      const i0 = [Math.cos(a0) * tail(i), 0, Math.sin(a0) * tail(i)];
      const i1 = [Math.cos(a1) * tail(i + 1), 0, Math.sin(a1) * tail(i + 1)];
      pos.push(...i0, ...o1, ...o0, ...i0, ...i1, ...o1);
      col.push(...back, ...lead, ...lead, ...back, ...back, ...lead);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  start(center: THREE.Vector3, radius: number): void {
    this.mesh.position.set(center.x, 4, center.z);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    this.radius = radius;
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / LIFE);
    this.mesh.scale.setScalar(this.radius * (0.15 + 0.85 * (1 - (1 - k) * (1 - k))));
    this.mat.opacity = 0.9 * (1 - k * k);
    if (k >= 1) this.clear();
  }

  clear(): void {
    this.t = -1;
    this.mesh.visible = false;
  }
}
