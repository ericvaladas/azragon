import * as THREE from 'three';
import { CONFIG } from '../../config';
import { ballistic } from '../../systems/projectileMath';

const U = CONFIG.insect.ultimate;

/** A spike in the air: where it left, where it lands, how long it has flown (s), and whether its slot is in use. */
type Spike = { from: THREE.Vector3; to: THREE.Vector3; t: number; on: boolean };

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Spike Rain's spikes: each flies a high ballistic arc from the mouth to its landing point over U.flight real
 * seconds (the game's own projectiles run on slowed world time), nose along its flight. One InstancedMesh, unlit, in
 * the Insect's spike colour; a pool of U.pool.
 */
export class RainSpikes {
  private spikes: Spike[] = Array.from({ length: U.pool }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, on: false }));
  private mesh: THREE.InstancedMesh;
  /** Spikes in the air. */
  flying = 0;

  constructor(scene: THREE.Scene, color: number) {
    // A thin four-sided cone along +Y, its point at the top: scaled to U.spikeWidth × U.spikeLength.
    this.mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 4), new THREE.MeshBasicMaterial({ color }), U.pool);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Fire a spike from `from` to land at `to`; its slot, or −1 when the pool is full. */
  launch(from: THREE.Vector3, to: THREE.Vector3): number {
    const i = this.spikes.findIndex((s) => !s.on);
    if (i < 0) return -1;
    const s = this.spikes[i]!;
    s.from.copy(from);
    s.to.copy(to);
    s.t = 0;
    s.on = true;
    this.flying++;
    return i;
  }

  /** Move where spike `i` lands (to follow a moving target). */
  aimAt(i: number, to: THREE.Vector3): void {
    this.spikes[i]!.to.copy(to);
  }

  /** Fly every spike on by `dt` real seconds, landing (once each, through `onLand`) those whose flight is over; then redraw. */
  update(dt: number, onLand: (i: number, at: THREE.Vector3) => void): void {
    let n = 0;
    for (let i = 0; i < this.spikes.length; i++) {
      const s = this.spikes[i]!;
      if (!s.on) continue;
      s.t += dt;
      if (s.t >= U.flight - 1e-9) {
        s.on = false;
        this.flying--;
        onLand(i, s.to);
        continue;
      }
      const k = s.t / U.flight;
      ballistic(s.from, s.to, U.arc, k, _p);
      // Its velocity: the straight line plus the arc's lift, rising then falling.
      _v.subVectors(s.to, s.from);
      _v.y += U.arc * 4 * (1 - 2 * k);
      _q.setFromUnitVectors(UP, _v.normalize());
      this.mesh.setMatrixAt(n++, _m.compose(_p, _q, _s.set(U.spikeWidth, U.spikeLength, U.spikeWidth)));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (const s of this.spikes) s.on = false;
    this.flying = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
