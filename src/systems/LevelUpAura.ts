import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Particles } from './Particles';

const L = CONFIG.levelUp;

/** Flickering vertical flame bands, banded into a few steps so they read as pixel art. Additive gold. */
const flameShader = {
  uniforms: {
    time: { value: 0 },
    strength: { value: 0 },
    color: { value: new THREE.Color(L.color) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float time;
    uniform float strength;
    uniform vec3 color;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      // Columns of flame licking upward: per-column height varies with time.
      float col = floor(vUv.x * 28.0);
      float h = 0.45 + 0.45 * hash(vec2(col, floor(time * 9.0)));
      float flame = smoothstep(h, h - 0.35, vUv.y);
      float flicker = 0.75 + 0.25 * hash(vec2(col, floor(time * 20.0)));
      float a = flame * flicker * strength;
      a = floor(a * 4.0) / 4.0;
      if (a <= 0.0) discard;
      gl_FragColor = vec4(color * (1.2 + vUv.y), a);
    }`,
};

/**
 * Super-Saiyan style power-up around the monster: gold flame columns, an expanding ground ring,
 * rising sparks, and a body glow. Driven by real time so it stays lively during the slow-motion beat.
 */
export class LevelUpAura {
  private outer: THREE.Mesh;
  private inner: THREE.Mesh;
  private outerMat: THREE.ShaderMaterial;
  private innerMat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private t = -1;
  private sparkT = 0;

  constructor(scene: THREE.Scene) {
    const cyl = new THREE.CylinderGeometry(1, 0.75, 1, 24, 1, true).translate(0, 0.5, 0);
    const make = () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(flameShader.uniforms),
        vertexShader: flameShader.vertexShader,
        fragmentShader: flameShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
    this.outerMat = make();
    this.innerMat = make();
    this.outer = new THREE.Mesh(cyl, this.outerMat);
    this.inner = new THREE.Mesh(cyl, this.innerMat);
    this.ringMat = new THREE.MeshBasicMaterial({ color: L.color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), this.ringMat);
    for (const o of [this.outer, this.inner, this.ring]) {
      o.visible = false;
      o.frustumCulled = false;
      o.renderOrder = 4;
      scene.add(o);
    }
  }

  get active(): boolean {
    return this.t >= 0;
  }

  start(): void {
    this.t = 0;
    this.sparkT = 0;
  }

  clear(): void {
    this.t = -1;
    for (const o of [this.outer, this.inner, this.ring]) o.visible = false;
  }

  /** Strength of the body glow, 0..1 (peaks early, fades out). */
  glow(): number {
    if (this.t < 0) return 0;
    const k = this.t / L.auraTime;
    return Math.max(0, Math.min(1, k * 6) * (1 - k));
  }

  update(realDt: number, center: THREE.Vector3, particles: Particles): void {
    if (this.t < 0) return;
    this.t += realDt;
    const k = this.t / L.auraTime;
    if (k >= 1) {
      this.clear();
      return;
    }
    const strength = Math.min(1, k * 8) * (1 - k * k);
    const scale = CONFIG.monster.scale;
    const flare = 1 + 0.08 * Math.sin(this.t * 30);
    for (const [mesh, mat, r, h] of [
      [this.outer, this.outerMat, L.auraRadius * 1.15, L.auraHeight] as const,
      [this.inner, this.innerMat, L.auraRadius * 0.8, L.auraHeight * 0.8] as const,
    ]) {
      mesh.visible = true;
      mesh.position.set(center.x, center.y, center.z);
      mesh.scale.set(r * scale * flare, h * scale * (0.6 + 0.4 * Math.min(1, k * 5)), r * scale * flare);
      mat.uniforms['time']!.value = this.t + (mesh === this.inner ? 3.7 : 0);
      mat.uniforms['strength']!.value = strength;
    }
    const ringK = Math.min(1, this.t / 0.5);
    this.ring.visible = ringK < 1;
    this.ring.position.set(center.x, center.y + 6, center.z);
    this.ring.scale.setScalar(L.auraRadius * 3 * (1 - (1 - ringK) * (1 - ringK)));
    this.ringMat.opacity = 1 - ringK;

    this.sparkT += realDt;
    if (this.sparkT > 0.05 && k < 0.8) {
      this.sparkT = 0;
      const a = Math.random() * Math.PI * 2;
      const r = L.auraRadius * scale * (0.6 + Math.random() * 0.5);
      particles.emit('spark', new THREE.Vector3(center.x + Math.cos(a) * r, center.y + 40, center.z + Math.sin(a) * r), 3, 0.4);
    }
  }
}
