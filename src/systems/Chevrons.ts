import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Red downward chevrons floating over every live enemy, sized by camera distance so they stay readable. */
export class Chevrons {
  private mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.ConeGeometry(0.5, 1, 3).rotateX(Math.PI);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: CONFIG.palette.chevron, fog: false }), CONFIG.readability.chevronMax);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(targets: readonly Target[], camera: THREE.Camera, time: number): void {
    let n = 0;
    for (const t of targets) {
      if (n >= CONFIG.readability.chevronMax) break;
      const d = camera.position.distanceTo(t.position);
      const size = Math.min(70, Math.max(16, d * 0.014));
      _p.copy(t.position);
      _p.y += t.radius * 0.6 + size * 1.6 + Math.sin(time * 5 + n) * size * 0.15;
      _q.setFromAxisAngle(_s.set(0, 1, 0), time * 2);
      _m.compose(_p, _q, _s.set(size, size * 1.2, size));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
