import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';

const B = CONFIG.passives.brood;
const MAX = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

type Drone = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; hitCd: number };

/** Small insect drones that hunt the nearest air target and ram it. */
export class BroodDrones {
  private drones: Drone[] = [];
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const geo = mergeGeometries([
      faceted(new THREE.BoxGeometry(0.35, 0.3, 1)),
      faceted(new THREE.BoxGeometry(1.4, 0.04, 0.4)).translate(0, 0.18, 0),
    ])!;
    this.mesh = new THREE.InstancedMesh(geo, toonMat(CONFIG.palette.drone), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(n: number, from: THREE.Vector3): void {
    for (let i = 0; i < n && this.drones.length < MAX; i++) {
      const a = (i / n) * Math.PI * 2;
      this.drones.push({ pos: from.clone(), vel: new THREE.Vector3(Math.cos(a), 1, Math.sin(a)).normalize().multiplyScalar(B.speed * 0.5), age: 0, hitCd: 0 });
    }
  }

  update(dt: number, targets: readonly Target[], dmgMult: number): void {
    const air = targets.filter((t) => t.airborne && t.isAlive());
    for (const d of this.drones) {
      d.age += dt;
      d.hitCd = Math.max(0, d.hitCd - dt);
      let best: Target | null = null;
      let bestD = Infinity;
      for (const t of air) {
        const dist = t.position.distanceToSquared(d.pos);
        if (dist < bestD) {
          bestD = dist;
          best = t;
        }
      }
      if (best) {
        _d.subVectors(best.position, d.pos);
        const dist = _d.length();
        d.vel.lerp(_d.normalize().multiplyScalar(B.speed), 1 - Math.exp(-4 * dt));
        if (dist < best.radius + 20 && d.hitCd <= 0) {
          best.applyDamage(B.damage * dmgMult);
          d.hitCd = B.hitCooldown;
          d.vel.multiplyScalar(-0.6);
        }
      } else {
        d.vel.y += (40 - d.vel.y) * (1 - Math.exp(-2 * dt));
      }
      d.pos.addScaledVector(d.vel, dt);
    }
    this.drones = this.drones.filter((d) => d.age < B.life);
    this.drones.forEach((d, i) => {
      _q.setFromUnitVectors(FWD, _d.copy(d.vel).normalize());
      _m.compose(d.pos, _q, _s.setScalar(28));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.count = this.drones.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.drones = [];
    this.mesh.count = 0;
  }
}
