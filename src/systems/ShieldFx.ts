import * as THREE from 'three';
import { CONFIG } from '../config';

/** Faceted translucent domes for the auto-shields: cyan bubble (invincible) and violet reflect dome. */
export class ShieldFx {
  private bubble: THREE.Mesh;
  private reflect: THREE.Mesh;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: false });
    this.bubble = new THREE.Mesh(geo, mat(0x6fe7ff, 0.22));
    this.reflect = new THREE.Mesh(geo, mat(0xb46bff, 0.18));
    const edges = (color: number) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, fog: false }));
    this.bubble.add(edges(0xbff6ff));
    this.reflect.add(edges(0xe2c2ff));
    for (const m of [this.bubble, this.reflect]) {
      m.visible = false;
      m.renderOrder = 5;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(dt: number, center: THREE.Vector3, bubble: boolean, reflect: boolean): void {
    this.time += dt;
    const s = CONFIG.monster.scale;
    this.bubble.visible = bubble;
    this.reflect.visible = reflect;
    if (bubble) {
      this.bubble.position.set(center.x, center.y + 300 * s, center.z);
      this.bubble.scale.setScalar(520 * s);
      this.bubble.rotation.y = this.time * 0.4;
    }
    if (reflect) {
      this.reflect.position.set(center.x, center.y + 300 * s, center.z);
      this.reflect.scale.setScalar(CONFIG.passives.reflect.radius);
      this.reflect.rotation.y = -this.time * 0.6;
    }
  }

  clear(): void {
    this.bubble.visible = this.reflect.visible = false;
  }
}
