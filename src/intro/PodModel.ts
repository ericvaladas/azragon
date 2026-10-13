import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted, toonMat } from '../render/toon';

/** Dark purple-brown chitin. */
const SHELL = 0x3b2433;
const ACID = new THREE.Color(CONFIG.palette.acid);
const WHITE = new THREE.Color(0xffffff);

/** The alien cocoon: a faceted chitin egg (blunt nose at +Z, length along Z) wrapped in glowing acid-green seams. */
export class PodModel {
  readonly root = new THREE.Group();
  private shellMat: THREE.MeshToonMaterial;
  private seamMat: THREE.MeshBasicMaterial;

  constructor(length: number) {
    // Egg profile, revolved around Y and then turned so the axis is Z; the fat end becomes the nose.
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      profile.push(new THREE.Vector2(Math.sin(a) * 0.36 * (1 - 0.22 * Math.cos(a)), -Math.cos(a) * 0.5));
    }
    this.shellMat = toonMat(SHELL);
    const shell = new THREE.Mesh(faceted(new THREE.LatheGeometry(profile, 7).rotateX(Math.PI / 2)), this.shellMat);
    shell.castShadow = true;

    // Three meridian seams around the long axis.
    const rings = [0, 1, 2].map((i) =>
      new THREE.TorusGeometry(1, 0.04, 3, 18)
        .rotateY(Math.PI / 2)
        .scale(1, 0.39, 0.51)
        .rotateZ((i * Math.PI) / 3),
    );
    this.seamMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.acid });
    const seams = new THREE.Mesh(mergeGeometries(rings), this.seamMat);

    this.root.add(shell, seams);
    this.root.scale.setScalar(length);
  }

  /** Resize the cocoon (its length along Z, in metres). */
  setLength(length: number): void {
    this.root.scale.setScalar(length);
  }

  /** Re-entry glow on the shell (black = none). */
  setHeat(c: THREE.Color): void {
    this.shellMat.emissive.copy(c);
  }

  /** Seam brightness 0..1: acid green to white as the cocoon is about to split. */
  setGlow(k: number): void {
    this.seamMat.color.copy(ACID).lerp(WHITE, Math.min(1, Math.max(0, k)));
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.shellMat.dispose();
    this.seamMat.dispose();
  }
}
