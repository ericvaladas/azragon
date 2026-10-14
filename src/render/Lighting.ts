import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from '../cities/types';

const SUN_DISTANCE = 2000;

/** Sun with a tight shadow box that follows the monster, plus hemisphere fill; colours and direction from the city's atmosphere. */
export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  /** Unit vector toward the sun. */
  readonly sunDir = new THREE.Vector3();
  private sky: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, a: Atmosphere) {
    const { render } = CONFIG;
    this.hemi = new THREE.HemisphereLight(a.hemiSky, a.hemiGround, a.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(a.sun, a.sunIntensity);
    this.sunDir.set(a.sunDir.x, a.sunDir.y, a.sunDir.z).normalize();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(render.shadowMapSize, render.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -render.shadowExtent;
    cam.right = render.shadowExtent;
    cam.top = render.shadowExtent;
    cam.bottom = -render.shadowExtent;
    cam.near = 100;
    cam.far = SUN_DISTANCE * 2;
    this.sun.shadow.bias = -0.002;
    this.sun.shadow.normalBias = 6;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Keep the shadow box centred on the target (the monster). The sky dome follows the camera. */
  follow(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, SUN_DISTANCE);
  }

  attachSky(sky: THREE.Mesh): void {
    this.sky = sky;
  }

  followCamera(camera: THREE.Camera): void {
    this.sky?.position.copy(camera.position);
  }
}
