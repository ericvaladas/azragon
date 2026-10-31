import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import type { Vec2 } from '../../util/math';

const U = CONFIG.kaiju.ultimate;
const C = CONFIG.kaiju.colors;
/** How quickly (1/s) a piece closes on its floating height, and how much (±) its height varies from the rest. */
const RISE_RATE = 1.5;
const HEIGHT_VARY = 0.25;
/** No piece lies closer than this (m) to the Kaiju. */
const NEAREST = 80;
/** Tumble speed range (rad/s); settling pieces fall under this gravity (m/s²), about a second from full height. */
const SPIN: [number, number] = [0.4, 1.4];
const GRAVITY = 2 * U.debrisLift;

/** A piece: where it lies, how high it floats (fraction of the lift), its size and tumble, and whether it is falling. */
type Piece = { pos: THREE.Vector3; height: number; size: number; axis: THREE.Vector3; spin: number; angle: number; alive: boolean; falling: boolean; vy: number };

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Plasma Lance's floating debris: small rubble scattered across the ground in front of the Kaiju (the wedge, a little
 * wider), drifting up as gravity seems to let go and tumbling slowly, until the beam vaporizes it or, once the beam is
 * done, it falls back down and is gone. One InstancedMesh; everything is pooled.
 */
export class LanceDebris {
  readonly count = U.debris;
  private pieces: Piece[] = Array.from({ length: U.debris }, () => ({
    pos: new THREE.Vector3(),
    height: 1,
    size: 1,
    axis: new THREE.Vector3(0, 1, 0),
    spin: 0,
    angle: 0,
    alive: false,
    falling: false,
    vy: 0,
  }));
  private posView: THREE.Vector3[] = this.pieces.map((p) => p.pos);
  private mesh: THREE.InstancedMesh;

  constructor(
    scene: THREE.Scene,
    private rand: () => number = Math.random,
  ) {
    this.mesh = new THREE.InstancedMesh(faceted(new THREE.DodecahedronGeometry(0.5, 0)), toonMat(C.debris), U.debris);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Lay every piece on the ground in front of a Kaiju at `origin` facing `yaw`, unevenly. */
  scatter(origin: Vec2, yaw: number): void {
    const spread = U.halfAngle + U.debrisMargin;
    const [s0, s1] = U.debrisSize;
    for (const p of this.pieces) {
      const a = yaw + (this.rand() * 2 - 1) * spread;
      const r = NEAREST + Math.sqrt(this.rand()) * (U.range - NEAREST);
      p.pos.set(origin.x + Math.sin(a) * r, 0, origin.z + Math.cos(a) * r);
      p.height = 1 + (this.rand() * 2 - 1) * HEIGHT_VARY;
      p.size = s0 + this.rand() * (s1 - s0);
      p.axis.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).normalize();
      p.spin = SPIN[0] + this.rand() * (SPIN[1] - SPIN[0]);
      p.angle = this.rand() * Math.PI * 2;
      p.alive = true;
      p.falling = false;
      p.vy = 0;
    }
  }

  /** Float the pieces toward `lift` (0..1) of their height, or let the settling ones fall; then redraw. */
  update(dt: number, lift: number): void {
    const k = 1 - Math.exp(-RISE_RATE * dt);
    let n = 0;
    for (const p of this.pieces) {
      if (!p.alive) continue;
      if (p.falling) {
        p.vy -= GRAVITY * dt;
        p.pos.y += p.vy * dt;
        if (p.pos.y <= 0) {
          p.alive = false;
          continue;
        }
      } else {
        p.pos.y += (U.debrisLift * p.height * lift - p.pos.y) * k;
      }
      p.angle += p.spin * dt;
      this.mesh.setMatrixAt(n++, _m.compose(p.pos, _q.setFromAxisAngle(p.axis, p.angle), _s.setScalar(p.size)));
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Every piece's position (world space), alive or not. */
  positions(): readonly THREE.Vector3[] {
    return this.posView;
  }

  alive(i: number): boolean {
    return this.pieces[i]!.alive;
  }

  vaporize(i: number): void {
    this.pieces[i]!.alive = false;
  }

  /** Let every live piece fall back to the ground and be gone. */
  settle(): void {
    for (const p of this.pieces) if (p.alive) p.falling = true;
  }

  clear(): void {
    for (const p of this.pieces) p.alive = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
