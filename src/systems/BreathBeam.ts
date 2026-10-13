import * as THREE from 'three';
import { CONFIG } from '../config';
import { placeSegment } from '../monster/ik';
import { beamEnd } from './sweep';

const B = CONFIG.kaiju.breath;
const _jaws = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _end = new THREE.Vector3();
const _far = new THREE.Vector3();

/** Rotate (dx, dz) about the vertical axis by `a` and add it back to (ox, oz). */
function turned(ox: number, oz: number, dx: number, dz: number, a: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return out.set(ox + dx * c + dz * s, y, oz - dx * s + dz * c);
}

/**
 * Plasma Breath: a short charge (the plates light up through `charge`), then one or more beams from the
 * jaws. The caller applies hits once, in `onFire`; the beams then linger briefly with a small sweep.
 */
export class BreathBeam {
  /** 0..1 while charging; decays after. */
  charge = 0;
  private phase: 'idle' | 'charge' | 'fire' = 'idle';
  private t = 0;
  private aim = new THREE.Vector3();
  private lines = 1;
  private from = new THREE.Vector3();
  private ends: THREE.Vector3[] = [];
  private meshes: THREE.Mesh[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: CONFIG.kaiju.colors.plasma, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (let i = 0; i < B.maxLines; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
      this.ends.push(new THREE.Vector3());
    }
  }

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Begin charging at `aim` (world) with `lines` fanned beams (capped at maxLines). Ignored while busy. */
  start(aim: THREE.Vector3, lines: number): void {
    if (this.busy) return;
    this.phase = 'charge';
    this.t = 0;
    this.aim.copy(aim);
    this.lines = Math.max(1, Math.min(B.maxLines, Math.floor(lines)));
  }

  /**
   * Advance by dt. `from` is the jaws this frame. On the frame the charge completes, `onFire` gets the jaws
   * and each beam's end: fanned around the aim, at most `range` away horizontally, stopping at the ground.
   */
  update(dt: number, from: THREE.Vector3, range: number, onFire: (from: THREE.Vector3, ends: readonly THREE.Vector3[]) => void): void {
    if (this.phase === 'idle') {
      this.charge = Math.max(0, this.charge - dt * 4);
      return;
    }
    this.t += dt;
    if (this.phase === 'charge') {
      this.charge = Math.min(1, this.t / B.charge);
      if (this.t < B.charge) return;
      this.phase = 'fire';
      this.t = 0;
      this.from.copy(from);
      const dx = this.aim.x - from.x;
      const dz = this.aim.z - from.z;
      for (let i = 0; i < this.lines; i++) {
        turned(from.x, from.z, dx, dz, (i - (this.lines - 1) / 2) * B.fan, this.aim.y, _aim);
        let e;
        if (_aim.y < 100) {
          // Ground aim: the beam runs the whole lane out to full range.
          const h = Math.hypot(_aim.x - from.x, _aim.z - from.z) || 1;
          _far.set(from.x + ((_aim.x - from.x) / h) * range, 0, from.z + ((_aim.z - from.z) / h) * range);
          e = beamEnd(from, _far, range);
        } else {
          e = beamEnd(from, _aim, range);
        }
        this.ends[i]!.set(e.x, e.y, e.z);
      }
      onFire(this.from, this.ends.slice(0, this.lines));
    }
    const k = Math.min(1, this.t / B.show);
    const sweep = (k - 0.5) * B.sweep;
    _jaws.copy(from);
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i]!;
      m.visible = i < this.lines && k < 1;
      if (!m.visible) continue;
      const e = this.ends[i]!;
      turned(this.from.x, this.from.z, e.x - this.from.x, e.z - this.from.z, sweep, e.y, _end);
      placeSegment(m, _jaws, _end);
      m.scale.x = m.scale.z = B.halfWidth * 0.9 * (1 - 0.6 * k);
    }
    this.mat.opacity = 0.9 * (1 - 0.7 * k);
    if (k >= 1) this.clear();
  }

  clear(): void {
    this.phase = 'idle';
    this.charge = 0;
    for (const m of this.meshes) m.visible = false;
  }
}
