import * as THREE from 'three';
import { rainDrop } from './rainMath';

/** Streaks in the pool, all drawn at full intensity. */
const DROPS = 1500;
/** Fall speed (m/s, world time). */
const SPEED = 1100;
/** The box sits halfway down the camera's line of sight; its size is this much of the camera's distance to the ground there (m, at least MIN_BOX). */
const BOX_PER_DIST = 1.1;
const MIN_BOX = 800;
/** A streak's length and width as fractions of the box size, and its slant (rad, the wind). */
const LENGTH = 0.035;
const WIDTH = 0.0016;
const SLANT = 0.18;

const _dir = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _center = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Rain: a pooled field of thin, slightly slanted streaks falling through a box between the camera and the ground it
 * looks at, each turned to face the camera. One InstancedMesh, one draw call; how many are drawn follows `intensity`.
 */
export class Rain {
  private mesh: THREE.InstancedMesh;
  private t = 0;

  constructor(scene: THREE.Scene, color: number) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      DROPS,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Advance by `dt` (s) and redraw around `camera`; `intensity` 0..1 sets how many streaks fall (0 hides them). */
  update(dt: number, camera: THREE.Camera, intensity: number): void {
    const n = Math.round(DROPS * Math.min(1, Math.max(0, intensity)));
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    this.t += dt;
    camera.getWorldPosition(_cam);
    camera.getWorldDirection(_dir);
    // Where the line of sight meets the ground (or 3 km out when it looks above the horizon).
    const reach = _dir.y < -0.05 ? Math.min(3000, _cam.y / -_dir.y) : 3000;
    _center.copy(_cam).addScaledVector(_dir, reach * 0.5);
    const size = Math.max(MIN_BOX, reach * BOX_PER_DIST);
    const box = { size, height: size };
    const base = _center.y - size / 2;
    _q.setFromEuler(_e.set(0, Math.atan2(-_dir.x, -_dir.z), SLANT));
    _s.set(size * WIDTH, size * LENGTH, 1);
    for (let i = 0; i < n; i++) {
      rainDrop(i, this.t, box, SPEED, _p);
      _p.x += _center.x;
      _p.y += base;
      _p.z += _center.z;
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
