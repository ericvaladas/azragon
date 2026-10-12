import * as THREE from 'three';
import { CONFIG } from '../config';
import { damp } from '../util/math';
import { applyDrag, applyZoom, cameraPose, fovForAspect, type OrbitState } from './orbit';

const FOLLOW_LAMBDA = 6;

export class CameraRig {
  orbit: OrbitState = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
  private trauma = 0;
  private follow = new THREE.Vector3();
  private time = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.near = CONFIG.camera.near;
    camera.far = CONFIG.camera.far;
  }

  reset(): void {
    this.orbit = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
    this.trauma = 0;
    this.follow.set(0, 0, 0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect, CONFIG.camera.baseVFovDeg, CONFIG.camera.maxHFovDeg);
    this.camera.updateProjectionMatrix();
  }

  drag(dx: number, dy: number): void {
    this.orbit = applyDrag(this.orbit, dx, dy);
  }

  zoom(deltaY: number): void {
    this.orbit = applyZoom(this.orbit, deltaY);
  }

  /** Trauma in 0..1; shake magnitude is trauma². */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, target: THREE.Vector3): void {
    this.time += dt;
    this.follow.x = damp(this.follow.x, target.x, FOLLOW_LAMBDA, dt);
    this.follow.y = damp(this.follow.y, target.y, FOLLOW_LAMBDA, dt);
    this.follow.z = damp(this.follow.z, target.z, FOLLOW_LAMBDA, dt);
    const { pos, look } = cameraPose(this.orbit, this.follow);
    const s = this.trauma * this.trauma * CONFIG.camera.shakeMaxOffset;
    const t = this.time * 40;
    this.camera.position.set(pos[0] + Math.sin(t * 1.1) * s, pos[1] + Math.sin(t * 1.7 + 1) * s, pos[2] + Math.sin(t * 1.3 + 2) * s);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.trauma = Math.max(0, this.trauma - CONFIG.camera.shakeDecay * dt);
  }
}
