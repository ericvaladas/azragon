import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const MAX = 60;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

type Pool = { x: number; z: number; r: number; life: number; age: number };

/** Glowing acid puddles from footsteps; burn ground enemies standing in them. */
export class AcidPools {
  private pools: Pool[] = [];
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: CONFIG.palette.acid, transparent: true, opacity: 0.55, depthWrite: false }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  add(p: THREE.Vector3, radius: number, life: number): void {
    if (this.pools.length >= MAX) this.pools.shift();
    this.pools.push({ x: p.x, z: p.z, r: radius, life, age: 0 });
  }

  update(dt: number, targets: readonly Target[], dmgMult: number): void {
    const dps = CONFIG.passives.acid.dps * dmgMult;
    for (const pool of this.pools) {
      pool.age += dt;
      for (const t of targets) {
        if (t.airborne || !t.isAlive()) continue;
        if (Math.hypot(t.position.x - pool.x, t.position.z - pool.z) <= pool.r + t.radius) t.applyDamage(dps * dt);
      }
    }
    this.pools = this.pools.filter((p) => p.age < p.life);
    this.pools.forEach((p, i) => {
      const k = 1 - p.age / p.life;
      _m.compose(_p.set(p.x, 2 + i * 0.01, p.z), _q.identity(), _s.set(p.r * (0.6 + 0.4 * k), 1, p.r * (0.6 + 0.4 * k)));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.count = this.pools.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.pools = [];
    this.mesh.count = 0;
  }
}
