import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, painted, toonMat } from '../../render/toon';
import { DEMON_CLAW, demonGeometry, demonPose } from './demonModel';

const U = CONFIG.wendigo.ultimate;
const C = CONFIG.wendigo.colors;
/** Smallest figure (m tall); bigger victims get bigger figures, aircraft ones tall enough to reach them. */
const MIN_SIZE = 200;
const SIZE_PER_RADIUS = 4;
/** How far a figure leans into its reach (rad) and how hard its clutch squashes it. */
const REACH_LEAN = 0.35;
const CLUTCH_SQUASH = 0.12;
/** The smoky shell drawn around each figure, this much bigger. */
const SHELL = 1.08;

type Figure = { base: THREE.Vector3; yaw: number; size: number; victimY: number; husk: number };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Devour's demonic figures: one rises out of the black circle under each victim, reaches for it, closes its claws
 * on a dark husk of the victim's size (the victim itself is gone by then) and sinks with it into the ground.
 * Three instanced draw calls (bodies, their smoky shells, the husks), pooled for maxFigures.
 */
export class DemonFigures {
  private figures: Figure[] = [];
  private body: THREE.InstancedMesh;
  private shell: THREE.InstancedMesh;
  private husks: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const geo = demonGeometry();
    this.body = new THREE.InstancedMesh(geo, toonMat(0xffffff, { vertexColors: true, emissive: C.demonEye }), U.maxFigures);
    // The emissive glow is for the eyes; the vertex colours keep the body near-black, so a faint glow only.
    (this.body.material as THREE.MeshToonMaterial).emissiveIntensity = 0.08;
    this.shell = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: C.handSmoke, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.BackSide }), U.maxFigures);
    this.shell.renderOrder = 1;
    this.husks = new THREE.InstancedMesh(painted(faceted(new THREE.BoxGeometry(1, 0.6, 1.4)), C.demon), toonMat(0xffffff, { vertexColors: true }), U.maxFigures);
    for (const m of [this.body, this.shell, this.husks]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  /**
   * A figure for the victim at `at` (radius `radius`), facing `toward` (the circle's centre) so that its claws close
   * on the victim: sized to the victim, and for a flyer tall enough to reach it. Returns its index.
   */
  spawn(at: THREE.Vector3, radius: number, toward: THREE.Vector3): number {
    if (this.figures.length >= U.maxFigures) return -1;
    const size = Math.max(MIN_SIZE, radius * SIZE_PER_RADIUS, at.y / DEMON_CLAW.y);
    const dx = toward.x - at.x;
    const dz = toward.z - at.z;
    // It stands beyond the victim, facing in toward the centre (straight +Z for a victim on the centre).
    const yaw = dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz);
    const base = new THREE.Vector3(at.x - Math.sin(yaw) * DEMON_CLAW.z * size, 0, at.z - Math.cos(yaw) * DEMON_CLAW.z * size);
    this.figures.push({ base, yaw, size, victimY: at.y, husk: radius * 1.6 });
    return this.figures.length - 1;
  }

  /** Pose every figure at life fraction u (demonLife). */
  update(u: number): void {
    const pose = demonPose(u);
    let n = 0;
    for (const f of this.figures) {
      // Risen, the claws sit at the victim's height (the rest of the figure below ground for a ground victim).
      const top = f.victimY - DEMON_CLAW.y * f.size;
      const y = top - (1 - pose.rise) * f.size - pose.sink * (f.size + f.victimY);
      const squash = 1 - CLUTCH_SQUASH * pose.clutch * (1 - pose.sink);
      _e.set(-REACH_LEAN * pose.reach, f.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(f.base.x, y, f.base.z);
      _s.set(f.size, f.size * squash, f.size);
      this.body.setMatrixAt(n, _m.compose(_p, _q, _s));
      this.shell.setMatrixAt(n, _m.compose(_p, _q, _s.multiplyScalar(SHELL)));
      // The husk rides in the claws from the grasp on.
      const h = pose.clutch > 0 ? f.husk : 0;
      _p.set(f.base.x + Math.sin(f.yaw) * DEMON_CLAW.z * f.size, y + DEMON_CLAW.y * f.size, f.base.z + Math.cos(f.yaw) * DEMON_CLAW.z * f.size);
      _e.set(0, f.yaw, 0);
      this.husks.setMatrixAt(n, _m.compose(_p, _q.setFromEuler(_e), _s.set(h, h, h)));
      n++;
    }
    for (const m of [this.body, this.shell, this.husks]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    this.figures = [];
    for (const m of [this.body, this.shell, this.husks]) m.count = 0;
  }

  dispose(): void {
    for (const m of [this.body, this.shell, this.husks]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
