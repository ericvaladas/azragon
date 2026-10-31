import * as THREE from 'three';
import { CONFIG } from '../../config';

const U = CONFIG.kaiju.ultimate;
const C = CONFIG.kaiju.colors;
/** How fast (rad/s) and how much (fraction of its width) the beam flickers. */
const FLICKER_RATE = 47;
const FLICKER = 0.15;
/** The scar sits this far (m) above the ground; a fresh disc glows at SCAR_GLOW of the scar colour (they overlap and add up). */
const SCAR_LIFT = 1;
const SCAR_GLOW = 0.35;

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _scarColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const FLAT = new THREE.Quaternion();

/**
 * Plasma Lance's beam: a white-hot core inside a plasma-cyan sheath, from the jaws to where it meets the ground,
 * flickering; and the trench it burns into the ground under its whole length, a pool of glowing discs that fade (additive, so a disc fades by
 * darkening its colour). Three draw calls; everything is pooled.
 */
export class LanceBeam {
  private core: THREE.Mesh;
  private edge: THREE.Mesh;
  private scars: THREE.InstancedMesh;
  private scarAt: THREE.Vector3[] = Array.from({ length: U.scars }, () => new THREE.Vector3());
  private scarAge = new Float32Array(U.scars).fill(Infinity);
  private nextScar = 0;

  constructor(scene: THREE.Scene) {
    // A unit cylinder along +Y, centred on the origin: scaled to the beam's radius and length.
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const beamMat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.edge = new THREE.Mesh(geo, beamMat(C.plasma, 0.55));
    this.core = new THREE.Mesh(geo, beamMat(C.beamCore, 0.95));
    for (const m of [this.edge, this.core]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 6;
      scene.add(m);
    }
    const disc = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    this.scars = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      U.scars,
    );
    for (let i = 0; i < U.scars; i++) this.scars.setColorAt(i, _c.setHex(0x000000));
    this.scars.frustumCulled = false;
    this.scars.count = 0;
    this.scars.renderOrder = 2;
    scene.add(this.scars);
  }

  /** Draw the beam from `from` to `to` at `strength` (0..1), flickering with `time` (s). */
  show(from: THREE.Vector3, to: THREE.Vector3, strength: number, time: number): void {
    _dir.subVectors(to, from);
    const len = _dir.length();
    _q.setFromUnitVectors(UP, _dir.divideScalar(Math.max(len, 1e-6)));
    const flicker = 1 + FLICKER * Math.sin(time * FLICKER_RATE) * Math.sin(time * FLICKER_RATE * 0.37);
    this.place(this.core, from, to, len, U.beamCore * strength * flicker);
    this.place(this.edge, from, to, len, U.beamEdge * strength * (2 - flicker));
  }

  hide(): void {
    this.core.visible = false;
    this.edge.visible = false;
  }

  /** Burn a scar disc at `at` (on the ground); the oldest is reused. */
  scar(at: THREE.Vector3): void {
    const i = this.nextScar;
    this.nextScar = (i + 1) % U.scars;
    this.scarAt[i]!.set(at.x, SCAR_LIFT, at.z);
    this.scarAge[i] = 0;
  }

  /** Burn a trench of scar discs every U.scarSpacing m along the ground from `from` to `to`. */
  burn(from: THREE.Vector3, to: THREE.Vector3): void {
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const n = Math.floor(len / U.scarSpacing);
    for (let i = 0; i <= n; i++) this.scar(_dir.lerpVectors(from, to, len > 0 ? (i * U.scarSpacing) / len : 0));
  }

  /** Age and redraw the scars. */
  update(dt: number): void {
    let n = 0;
    _scarColor.setHex(C.scar);
    for (let i = 0; i < U.scars; i++) {
      const age = (this.scarAge[i]! += dt);
      if (age >= U.scarLife) continue;
      const k = 1 - age / U.scarLife;
      this.scars.setMatrixAt(n, _m.compose(this.scarAt[i]!, FLAT, _s.set(U.scarWidth, 1, U.scarWidth)));
      // Bright where the beam is, dying quickly to embers behind it.
      this.scars.setColorAt(n, _c.copy(_scarColor).multiplyScalar(SCAR_GLOW * k * k * k));
      n++;
    }
    this.scars.count = n;
    this.scars.instanceMatrix.needsUpdate = true;
    if (this.scars.instanceColor) this.scars.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.hide();
    this.scarAge.fill(Infinity);
    this.nextScar = 0;
    this.scars.count = 0;
  }

  dispose(): void {
    this.core.geometry.dispose();
    for (const m of [this.core, this.edge, this.scars]) {
      m.removeFromParent();
      (m.material as THREE.Material).dispose();
    }
    this.scars.geometry.dispose();
  }

  private place(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, len: number, radius: number): void {
    mesh.visible = radius > 0;
    mesh.position.addVectors(from, to).multiplyScalar(0.5);
    mesh.quaternion.copy(_q);
    mesh.scale.set(radius, len, radius);
  }
}
