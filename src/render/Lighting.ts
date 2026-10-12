import * as THREE from 'three';
import { CONFIG } from '../config';

const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const SUN_DISTANCE = 2000;

/** Sun with a tight shadow box that follows the monster, plus hemisphere fill. */
export class Lighting {
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    const { palette, render } = CONFIG;
    scene.add(new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 1.1));

    this.sun = new THREE.DirectionalLight(palette.sun, 2.2);
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
    this.sun.position.copy(target).addScaledVector(SUN_DIR, SUN_DISTANCE);
  }

  attachSky(sky: THREE.Mesh): void {
    this.sky = sky;
  }

  followCamera(camera: THREE.Camera): void {
    this.sky?.position.copy(camera.position);
  }
}
