import * as THREE from 'three';
import { CONFIG } from '../config';

const HIT_LIFE = 0.45;
const MAX_HITS = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const FACING = new THREE.Vector3(0, 0, 1);

/**
 * Auto-shield visuals. Shield Bubble is a visible cyan dome while active. Reflect Shield stays invisible:
 * each reflected projectile flashes a violet hexagon patch on the shield surface where it struck.
 */
export class ShieldFx {
  private bubble: THREE.Mesh;
  private fill: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private hits: { at: THREE.Vector3; normal: THREE.Vector3; age: number }[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.bubble = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x6fe7ff, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.bubble.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.8, fog: false })));
    this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    this.bubble.frustumCulled = false;
    const additive = (color: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.fill = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6), additive(0x8a3fd6), MAX_HITS);
    this.rim = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 6), additive(0xe2c2ff), MAX_HITS);
    for (const m of [this.fill, this.rim]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 6;
      for (let i = 0; i < MAX_HITS; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
    }
    scene.add(this.bubble, this.fill, this.rim);
  }

  /** Flash a reflect patch at `at` (on the shield surface), facing outward along `normal`. */
  reflectHit(at: THREE.Vector3, normal: THREE.Vector3): void {
    if (this.hits.length >= MAX_HITS) this.hits.shift();
    this.hits.push({ at: at.clone(), normal: normal.clone().normalize(), age: 0 });
  }

  update(dt: number, center: THREE.Vector3, bubble: boolean): void {
    this.time += dt;
    const s = CONFIG.monster.scale;
    this.bubble.visible = bubble;
    if (bubble) {
      this.bubble.position.set(center.x, center.y + 300 * s, center.z);
      this.bubble.scale.setScalar(520 * s);
      this.bubble.rotation.y = this.time * 0.4;
    }
    for (const h of this.hits) h.age += dt;
    this.hits = this.hits.filter((h) => h.age < HIT_LIFE);
    this.hits.forEach((h, i) => {
      const k = h.age / HIT_LIFE;
      _q.setFromUnitVectors(FACING, _n.copy(h.normal));
      _m.compose(_p.copy(h.at), _q, _s.setScalar(70 + 90 * k));
      this.fill.setMatrixAt(i, _m);
      this.rim.setMatrixAt(i, _m);
      // Additive blending: dimming the colour fades the patch out.
      const fade = (1 - k) * (1 - k);
      this.fill.setColorAt(i, _c.setRGB(fade, fade, fade));
      this.rim.setColorAt(i, _c.setRGB(1 - k, 1 - k, 1 - k));
    });
    for (const m of [this.fill, this.rim]) {
      m.count = this.hits.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.bubble.visible = false;
    this.hits = [];
    this.fill.count = this.rim.count = 0;
  }
}
