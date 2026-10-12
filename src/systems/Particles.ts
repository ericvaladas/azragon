import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted } from '../render/toon';

export type ParticleKind = 'dust' | 'debris' | 'fire' | 'smoke' | 'spark';

type Preset = { color: number; life: number; size0: number; size1: number; speed: number; up: number; gravity: number; drag: number };

const P = CONFIG.palette;
const PRESETS: Record<ParticleKind, Preset> = {
  dust: { color: P.dust, life: 1.3, size0: 22, size1: 70, speed: 110, up: 40, gravity: -15, drag: 2.2 },
  debris: { color: P.debris, life: 1.6, size0: 12, size1: 8, speed: 160, up: 260, gravity: 420, drag: 0.3 },
  fire: { color: P.fire, life: 0.55, size0: 34, size1: 4, speed: 70, up: 60, gravity: -40, drag: 1.5 },
  smoke: { color: P.smoke, life: 2.0, size0: 26, size1: 80, speed: 40, up: 70, gravity: -20, drag: 1.2 },
  spark: { color: P.eye, life: 0.3, size0: 10, size1: 2, speed: 260, up: 80, gravity: 200, drag: 0.5 },
};

const MAX = 700;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Pooled chunky puffs: one InstancedMesh, swap-remove on death, zero per-frame allocation. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX);
  private kind: ParticleKind[] = new Array(MAX).fill('dust');

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(faceted(new THREE.IcosahedronGeometry(0.5, 0)), new THREE.MeshBasicMaterial(), MAX);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
    }
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  emit(kind: ParticleKind, at: THREE.Vector3, count: number, spread = 1): void {
    const p = PRESETS[kind];
    for (let k = 0; k < count && this.n < MAX; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = p.speed * spread * (0.4 + Math.random() * 0.6);
      this.spawn(kind, at.x, at.y, at.z, Math.cos(a) * s, p.up * (0.5 + Math.random()), Math.sin(a) * s);
    }
  }

  /** Outward ring along the ground, used for foot landings and stomps. */
  ring(kind: ParticleKind, center: THREE.Vector3, radius: number, count: number): void {
    const p = PRESETS[kind];
    for (let k = 0; k < count && this.n < MAX; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.3;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      this.spawn(kind, center.x + cx * radius * 0.5, center.y + 4, center.z + cz * radius * 0.5, cx * p.speed * 1.4, p.up * 0.3, cz * p.speed * 1.4);
    }
  }

  explosion(at: THREE.Vector3, scale: number): void {
    this.emit('fire', at, Math.round(10 * scale), scale);
    this.emit('smoke', at, Math.round(6 * scale), scale);
    this.emit('debris', at, Math.round(6 * scale), scale);
    this.emit('spark', at, Math.round(6 * scale), scale);
  }

  private spawn(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.kind[i] = kind;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[kind].color));
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const p = PRESETS[this.kind[i]!];
      const age = (this.age[i]! += dt);
      if (age >= p.life) {
        this.swapRemove(i);
        continue;
      }
      const o = i * 3;
      const damp = Math.exp(-p.drag * dt);
      this.vel[o] = this.vel[o]! * damp;
      this.vel[o + 1] = this.vel[o + 1]! * damp - p.gravity * dt;
      this.vel[o + 2] = this.vel[o + 2]! * damp;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = Math.max(0, this.pos[o + 1]! + this.vel[o + 1]! * dt);
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      const k = age / p.life;
      _s.setScalar(p.size0 + (p.size1 - p.size0) * k);
      if (k > 0.75) _s.multiplyScalar((1 - k) / 0.25);
      _m.compose(_p.set(this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!), _q.set(age, age * 0.7, 0, 1).normalize(), _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private swapRemove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.age[i] = this.age[last]!;
    this.kind[i] = this.kind[last]!;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[this.kind[i]!].color));
  }
}
