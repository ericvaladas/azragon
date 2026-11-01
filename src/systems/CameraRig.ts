import * as THREE from 'three';
import { CONFIG } from '../config';
import { damp } from '../util/math';
import { applyDrag, applyZoom, blendOrbit, cameraPose, fovForAspect, swingBehind, type OrbitState } from './orbit';

const FOLLOW_LAMBDA = 6;

export class CameraRig {
  orbit: OrbitState = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
  private trauma = 0;
  private follow = new THREE.Vector3();
  private time = 0;
  /** Cinematic pull-back: how far (0..1) toward `pullTo`; the player's own orbit is never overwritten. */
  private pullK = 0;
  private pullTo = { pitch: 0, distance: 0 };

  /** Cutscene override: blend of the look target toward `lookAt` and camera lift, by `lookK` (0 is off). */
  private lookK = 0;
  private lookAt = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.near = CONFIG.camera.near;
    camera.far = CONFIG.camera.far;
  }

  reset(): void {
    this.orbit = { yaw: CONFIG.camera.defaultYaw, pitch: CONFIG.camera.defaultPitch, distance: CONFIG.camera.defaultDistance };
    this.trauma = 0;
    this.pullK = 0;
    this.lookK = 0;
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

  /** Swing round behind a monster facing `yaw` (called each frame it is walked with the keys). */
  swingBehind(yaw: number, dt: number): void {
    this.orbit = swingBehind(this.orbit, yaw, CONFIG.camera.behindLambda, dt);
  }

  /** Pull the camera back toward `pitch` and `distance` by k (0 is exactly the player's orbit). */
  pull(k: number, pitch: number, distance: number): void {
    this.pullK = k;
    this.pullTo.pitch = pitch;
    this.pullTo.distance = distance;
  }

  /** Blend the view toward `point` by k (0..1) and raise the camera by k × CONFIG.meteor.cameraLift; k <= 0 clears it. */
  lookToward(k: number, point: THREE.Vector3): void {
    this.lookK = k;
    this.lookAt.copy(point);
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
    const { pos, look } = cameraPose(this.pullK > 0 ? blendOrbit(this.orbit, this.pullTo, this.pullK) : this.orbit, this.follow);
    let lookY = look[1];
    if (this.lookK > 0) {
      const k = this.lookK;
      pos[1] += k * CONFIG.meteor.cameraLift;
      look[0] += (this.lookAt.x - look[0]) * k;
      lookY += (this.lookAt.y - lookY) * k;
      look[2] += (this.lookAt.z - look[2]) * k;
    }
    const s = this.trauma * this.trauma * CONFIG.camera.shakeMaxOffset;
    const t = this.time * 40;
    this.camera.position.set(pos[0] + Math.sin(t * 1.1) * s, pos[1] + Math.sin(t * 1.7 + 1) * s, pos[2] + Math.sin(t * 1.3 + 2) * s);
    this.camera.lookAt(look[0], lookY, look[2]);
    this.trauma = Math.max(0, this.trauma - CONFIG.camera.shakeDecay * dt);
  }
}
