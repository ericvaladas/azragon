import * as THREE from 'three';
import { CONFIG } from '../../config';

/** Seconds for the aura to spread or recede. */
const FADE = 0.5;

/**
 * Ravenous Hunger's withering aura: a patch of dead, blackened ground with a ragged rim of rot that follows the
 * Wendigo while the aura is on, slowly turning. One mesh (vertex colours), hidden when off.
 */
export class WitherAura {
  private mesh: THREE.Mesh;
  private k = 0;
  private spin = 0;

  constructor(scene: THREE.Scene) {
    const n = 28;
    const pos: number[] = [];
    const col: number[] = [];
    const inner = new THREE.Color(CONFIG.wendigo.colors.blight);
    const rim = new THREE.Color(0x050307);
    const at = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    const ragged = (i: number) => 0.9 + 0.1 * Math.sin(i * 2.3) * Math.sin(i * 0.7 + 1);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const o0 = ragged(i);
      const o1 = ragged((i + 1) % n);
      // Dead ground inside, a ragged dark rim around it.
      pos.push(0, 0, 0, ...at(a1, o1 * 0.72), ...at(a0, o0 * 0.72));
      col.push(...inner.toArray(), ...inner.toArray(), ...inner.toArray());
      pos.push(...at(a0, o0 * 0.72), ...at(a1, o1 * 0.72), ...at(a1, o1));
      pos.push(...at(a0, o0 * 0.72), ...at(a1, o1), ...at(a0, o0));
      for (let k = 0; k < 6; k++) col.push(...rim.toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // Polygon-offset toward the camera so it wins over the crater decal (itself offset) beneath it.
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** `radius` 0 turns the aura off (it recedes); otherwise it spreads to that radius around `at`. */
  update(dt: number, at: THREE.Vector3, radius: number): void {
    this.k = Math.max(0, Math.min(1, this.k + (radius > 0 ? dt : -dt) / FADE));
    this.mesh.visible = this.k > 0;
    if (!this.mesh.visible) return;
    if (radius > 0) this.mesh.scale.setScalar(radius * (0.7 + 0.3 * this.k));
    this.spin += dt * 0.25;
    this.mesh.rotation.y = this.spin;
    this.mesh.position.set(at.x, 3, at.z);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * this.k;
  }

  clear(): void {
    this.k = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
