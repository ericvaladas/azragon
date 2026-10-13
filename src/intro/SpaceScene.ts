import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';
import { fovForAspect } from '../systems/orbit';
import { mulberry32 } from '../util/rng';
import { earthTexture } from './earthTexture';
import { PodModel } from './PodModel';
import { earthCenter, heatAt, spaceCamera, heatColor, starDirections } from './spaceMath';
import { shakeAt } from './timeline';

const SP = CONFIG.intro.space;
const L = SP.podLength;
const EMBERS = 90;
const EMBER_SPEED = L * 14;
const _heat = new THREE.Color();
const _look = new THREE.Vector3();

/** The opening shot before the cut: stars, a pixel-art Earth, and the cocoon burning in. */
export class SpaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 5, 30000);
  private earth = new THREE.Group();
  private pod = new PodModel(L);
  private sheath = new THREE.Group();
  private sheathMats: THREE.MeshBasicMaterial[] = [];
  private embers: THREE.Points;
  private emberPos: Float32Array;
  private rng = mulberry32(CONFIG.world.seed + 41);

  constructor() {
    this.scene.background = new THREE.Color(0x05060f);
    const sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.4);
    sun.position.set(1, 0.7, -0.3);
    this.scene.add(sun, new THREE.HemisphereLight(0x4a5f8a, 0x000000, 0.5));

    // Two star layers: many faint single pixels and a few bright 2-px ones.
    const dirs = starDirections(SP.stars, mulberry32(CONFIG.world.seed + 43));
    const layer = (from: number, to: number, size: number, color: number) => {
      const pos = new Float32Array((to - from) * 3);
      for (let i = from; i < to; i++) dirs[i]!.clone().multiplyScalar(20000).toArray(pos, (i - from) * 3);
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
    };
    const bright = Math.floor(SP.stars * 0.1);
    this.scene.add(layer(0, bright, 2, 0xffffff), layer(bright, SP.stars, 1, 0xaab4d6));

    const R = SP.earthRadius;
    const globe = new THREE.Mesh(faceted(new THREE.SphereGeometry(R, 40, 24)), toonMat(0xffffff, { map: earthTexture() }));
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(R * SP.atmosphere, 40, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.4, side: THREE.BackSide, depthWrite: false }),
    );
    globe.rotation.z = 0.35;
    this.earth.add(globe, rim);
    this.scene.add(this.earth, this.pod.root);

    // Bow shock: flattened glowing domes capping the nose (+Z, the leading side), where re-entry burns.
    // Two additive layers: a saturated orange outer shock and a tighter yellow-white core.
    for (const [r, color] of [[0.62, 0xff5a14], [0.48, 0xffe08a]] as const) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.sheathMats.push(mat);
      const dome = new THREE.SphereGeometry(L * r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(0, 0, L * 0.3);
      this.sheath.add(new THREE.Mesh(dome, mat));
    }
    this.scene.add(this.sheath);

    this.emberPos = new Float32Array(EMBERS * 3);
    for (let i = 0; i < EMBERS; i++) this.respawnEmber(i, -this.rng() * L * 6);
    const eg = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffd27a, size: 2, sizeAttenuation: false }));
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
  }

  private respawnEmber(i: number, z: number): void {
    const a = this.rng() * Math.PI * 2;
    const r = L * (0.2 + this.rng() * 0.35);
    this.emberPos[i * 3] = Math.cos(a) * r;
    this.emberPos[i * 3 + 1] = Math.sin(a) * r;
    this.emberPos[i * 3 + 2] = z;
  }

  update(t: number, dt: number): void {
    // Earth sits below the flight path (lower half of the frame) and swells as it closes in.
    earthCenter(t, this.earth.position);
    this.earth.rotation.y = t * 0.04;
    this.pod.root.rotation.z = t * 0.5;

    const h = heatAt(t);
    this.pod.setHeat(heatColor(h, _heat));
    this.sheath.visible = h > 0;
    // The bow shock lights up the moment the pod enters the atmosphere, then the core builds to white-hot.
    this.sheathMats[0]!.opacity = h > 0 ? 0.5 + 0.35 * Math.min(1, h * 2) : 0;
    this.sheathMats[1]!.opacity = 0.8 * Math.sqrt(h);
    const flicker = 1 + 0.12 * Math.sin(t * 47) + 0.08 * Math.sin(t * 83);
    this.sheath.scale.set(flicker, flicker, 0.6 + 0.6 * h);

    // Embers stream backward, past the camera, and respawn at the nose.
    this.embers.visible = h > 0;
    this.embers.geometry.setDrawRange(0, Math.floor(EMBERS * h));
    for (let i = 0; i < EMBERS; i++) {
      const z = this.emberPos[i * 3 + 2]! - EMBER_SPEED * dt;
      if (z < -L * 6) this.respawnEmber(i, L * 0.4);
      else this.emberPos[i * 3 + 2] = z;
    }
    this.embers.geometry.getAttribute('position').needsUpdate = true;

    const s = shakeAt(t);
    const amp = s * s * L * 0.12;
    // Three-quarter view from behind and above, so the seams read along the shell.
    spaceCamera(this.camera.aspect, this.camera.position, _look);
    this.camera.position.x += Math.sin(t * 43) * amp;
    this.camera.position.y += Math.sin(t * 61 + 1) * amp;
    this.camera.lookAt(_look);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect, CONFIG.camera.baseVFovDeg, CONFIG.camera.maxHFovDeg);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.pod.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry || o === this.pod.root) return;
      m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      for (const x of Array.isArray(mat) ? mat : [mat]) {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      }
    });
  }
}
