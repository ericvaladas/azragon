import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

export type CloudSpec = { x: number; y: number; z: number; size: number };

const C = CONFIG.intro.clouds;

/** Deterministic cloud placement in the band the pod falls through. */
export function cloudSpecs(rng: () => number): CloudSpec[] {
  return Array.from({ length: C.count }, () => ({
    x: (rng() * 2 - 1) * C.spreadX,
    y: C.minY + rng() * (C.maxY - C.minY),
    z: C.minZ + rng() * (C.maxZ - C.minZ),
    size: C.minSize + rng() * (C.maxSize - C.minSize),
  }));
}

/** 48×28 puffy pixel cloud: a shaded underside, then white puffs; alpha-tested for hard pixel edges. */
function cloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 28;
  const g = c.getContext('2d')!;
  const puffs: [number, number, number][] = [[14, 17, 9], [24, 12, 11], [34, 16, 9], [20, 19, 8], [30, 20, 7]];
  const draw = (color: string, dy: number) => {
    g.fillStyle = color;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  draw('#c9d3de', 2);
  draw('#ffffff', 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Instanced cloud billboards above the city, turned to face the camera each frame. */
export class CloudLayer {
  private mesh: THREE.InstancedMesh;
  private specs = cloudSpecs(mulberry32(CONFIG.world.seed + 51));

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ map: cloudTexture(), alphaTest: 0.5 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 28 / 48), mat, this.specs.length);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(camera: THREE.Camera): void {
    this.specs.forEach((s, i) => {
      _m.compose(_p.set(s.x, s.y, s.z), camera.quaternion, _s.set(s.size, s.size, 1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
