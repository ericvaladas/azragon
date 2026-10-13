import * as THREE from 'three';
import { faceted, toonMat } from '../../render/toon';
import { approach, blobFlightTime, blobPoint, CLOUD, cloudPuff, hazeStrength } from './inkMath';

/** Ink palette: near-black core, the Kraken's ink, a dark violet body and a violet sheen that reads over dark city blocks. */
const INK_DEEP = 0x12091a;
const INK = 0x2a1838;
const INK_VIOLET = 0x45265e;
const INK_SHEEN = 0x6a3d8c;
const CLOUD_COLORS = [INK_DEEP, INK_DEEP, INK_DEEP, INK, INK, INK_VIOLET, INK_VIOLET, INK_SHEEN] as const;
/** The haze is thin, so it uses brighter, saturated violets: dark ink at low opacity just reads as a muddy shadow. */
const HAZE_COLORS = [0x5a2a85, 0x6e38a0, 0x4a2370] as const;

/** Pool size shared by blobs (head + trail), cloud puffs and haze wisps. */
const MAX = 400;
const MAX_BLOBS = 16;
const MAX_PUFFS = 240;
/** Blob head radius (m) and its stretch along the flight; trail blobs lag by TRAIL_LAG of the flight each. */
const BLOB_R = 30;
const BLOB_STRETCH = 2.2;
const TRAIL = 4;
const TRAIL_LAG = 0.075;
/** Cloud burst: puffs per cloud, spread (m), puff radius range (m), outward speed (m/s) and its drag. */
const CLOUD_PUFFS = 14;
const CLOUD_SPREAD = 85;
const PUFF_R: readonly [number, number] = [50, 92];
const PUFF_SPEED: readonly [number, number] = [60, 170];
const PUFF_DRAG = 2.4;
const PUFF_RISE = 18;
const PUFF_ALPHA = 0.9;
/** Siphon puffs: a few small, quick puffs where the jet leaves the body. */
const SIPHON_PUFFS = 3;
const SIPHON_R = 22;
const SIPHON_RATE = 1.8;
/** Armed haze: wisps orbiting the mantle and lower body, their max opacity, and how fast the haze follows the bank. */
const HAZE_WISPS = 16;
const HAZE_ALPHA = 0.42;
const HAZE_R: readonly [number, number] = [120, 200];
const HAZE_Y: readonly [number, number] = [70, 230];
const HAZE_SIZE: readonly [number, number] = [24, 40];
/** Puffs per wisp and their spacing along the orbit (rad). */
const WISP_PUFFS = 3;
const WISP_GAP = 0.16;
const HAZE_FOLLOW = 2.5;

type Blob = { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; seed: number };
type Puff = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; delay: number; size: number; color: number; rate: number; spin: number };
type Wisp = { angle: number; radius: number; y: number; speed: number; size: number; phase: number; color: number };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _c = new THREE.Color();
const _fade = { scale: 0, alpha: 0 };
const FWD = new THREE.Vector3(0, 0, 1);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

/**
 * Ink Cloud visuals (Kraken): a gooey blob squirts from the siphon to each stopped shot and bursts into a
 * billowing black-violet cloud that lingers, then thins; while shots are banked, faint ink wisps drift around
 * the body. Blobs, puffs and wisps share one pooled, per-instance-alpha InstancedMesh: one draw call, none when idle.
 */
export class InkFx {
  private mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  private blobs: Blob[] = [];
  private freeBlobs: Blob[] = [];
  private puffs: Puff[] = [];
  private freePuffs: Puff[] = [];
  private wisps: Wisp[];
  private haze = 0;
  private time = 0;
  private n = 0;

  constructor(scene: THREE.Scene) {
    const geo = faceted(new THREE.IcosahedronGeometry(1, 1));
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('instAlpha', this.alpha);
    const mat = toonMat(0xffffff);
    mat.transparent = true;
    mat.depthWrite = false;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float instAlpha;\nvarying float vInstAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstAlpha = instAlpha;');
      sh.fragmentShader = 'varying float vInstAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstAlpha;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, _c.setHex(0xffffff));
    this.wisps = Array.from({ length: HAZE_WISPS }, (_, i) => ({
      angle: (i / HAZE_WISPS) * Math.PI * 2 + rand(-0.2, 0.2),
      radius: rand(...HAZE_R),
      y: rand(...HAZE_Y),
      speed: (i % 2 ? 1 : -1) * rand(0.18, 0.4),
      size: rand(...HAZE_SIZE),
      phase: rand(0, Math.PI * 2),
      color: HAZE_COLORS[i % HAZE_COLORS.length]!,
    }));
    scene.add(this.mesh);
  }

  /** Squirt a blob from `from` (the siphon) to `to` (the stopped shot); it bursts into a cloud on arrival. */
  jet(from: THREE.Vector3, to: THREE.Vector3): void {
    if (this.blobs.length >= MAX_BLOBS) return;
    const b = this.freeBlobs.pop() ?? { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0, seed: 0 };
    b.from.copy(from);
    b.to.copy(to);
    b.t = 0;
    b.dur = blobFlightTime(from.distanceTo(to));
    b.seed = Math.random() * 10;
    this.blobs.push(b);
    for (let k = 0; k < SIPHON_PUFFS; k++) {
      _dir.subVectors(to, from).setY(0).normalize().multiplyScalar(rand(40, 90));
      this.puff(from, _dir.x + rand(-30, 30), rand(10, 40), _dir.z + rand(-30, 30), rand(0, 0.08), SIPHON_R * rand(0.8, 1.3), pick(CLOUD_COLORS), SIPHON_RATE);
    }
  }

  /** Burst a billowing cloud at `at`. */
  burst(at: THREE.Vector3): void {
    for (let k = 0; k < CLOUD_PUFFS; k++) {
      // The first puff is a dense core; the rest spread out around it, some a beat later so it keeps billowing.
      const core = k === 0;
      _dir.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize();
      const sp = core ? 0 : rand(...PUFF_SPEED);
      _p.copy(at).addScaledVector(_dir, core ? 0 : rand(0.3, 1) * CLOUD_SPREAD);
      this.puff(_p, _dir.x * sp, _dir.y * sp + PUFF_RISE, _dir.z * sp, core ? 0 : rand(0, 0.14), core ? PUFF_R[1] : rand(...PUFF_R), core ? INK_DEEP : pick(CLOUD_COLORS), 1);
    }
  }

  private puff(at: THREE.Vector3, vx: number, vy: number, vz: number, delay: number, size: number, color: number, rate: number): void {
    if (this.puffs.length >= MAX_PUFFS) return;
    const p = this.freePuffs.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, delay: 0, size: 0, color: 0, rate: 1, spin: 0 };
    p.pos.copy(at);
    p.vel.set(vx, vy, vz);
    p.age = 0;
    p.delay = delay;
    p.size = size;
    p.color = color;
    p.rate = rate;
    p.spin = rand(0, Math.PI * 2);
    this.puffs.push(p);
  }

  /**
   * Advance and draw. `center`: the monster's ground position the haze orbits; `charge`: the intercept bank
   * (0..1) the haze thickens with, 0 to let it thin away.
   */
  update(dt: number, center: THREE.Vector3, charge: number): void {
    this.time += dt;
    this.n = 0;

    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i]!;
      b.t += dt;
      if (b.t >= b.dur) {
        this.burst(b.to);
        this.blobs.splice(i, 1);
        this.freeBlobs.push(b);
        continue;
      }
      const k = b.t / b.dur;
      for (let j = TRAIL; j >= 0; j--) {
        const kj = k - j * TRAIL_LAG;
        if (kj < 0) continue;
        blobPoint(b.from, b.to, kj, _p);
        blobPoint(b.from, b.to, kj - 0.04, _prev);
        _dir.subVectors(_p, _prev);
        if (_dir.lengthSq() < 1e-6) _dir.subVectors(b.to, b.from);
        _q.setFromUnitVectors(FWD, _dir.normalize());
        // Gooey: the head wobbles; the trail thins and shrinks behind it.
        const wob = 1 + 0.18 * Math.sin(b.t * 55 + b.seed + j);
        const r = BLOB_R * Math.pow(0.72, j) * wob;
        this.put(_p, _q, _s.set(r, r / wob, r * (j === 0 ? BLOB_STRETCH : 1.6)), j === 0 ? INK_VIOLET : j === 1 ? INK : INK_DEEP, 1 - j * 0.16);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt * p.rate;
      cloudPuff(p.age, p.delay, _fade);
      if (p.age - p.delay >= CLOUD.life) {
        this.puffs[i] = this.puffs[this.puffs.length - 1]!;
        this.puffs.pop();
        this.freePuffs.push(p);
        continue;
      }
      if (p.age < p.delay) continue;
      p.vel.multiplyScalar(Math.exp(-PUFF_DRAG * dt * p.rate));
      p.pos.addScaledVector(p.vel, dt);
      p.pos.y = Math.max(p.size * 0.4, p.pos.y);
      _q.setFromAxisAngle(_dir.set(0.3, 1, 0.2).normalize(), p.spin + p.age * 0.6);
      const r = p.size * _fade.scale;
      this.put(p.pos, _q, _s.set(r, r * 0.85, r), p.color, PUFF_ALPHA * _fade.alpha);
    }

    this.haze = approach(this.haze, hazeStrength(charge), dt, HAZE_FOLLOW);
    if (this.haze > 0.01) {
      for (const w of this.wisps) {
        const a = w.angle + this.time * w.speed;
        const breathe = Math.sin(this.time * 0.9 + w.phase);
        const rad = w.radius + 22 * Math.sin(this.time * 0.5 + w.phase);
        const y = center.y + w.y + 18 * Math.sin(this.time * 0.7 + w.phase * 1.3);
        // A short chain of puffs trailing along its orbit, so each wisp reads as drifting smoke.
        const r = w.size * (0.55 + 0.45 * this.haze) * (1 + 0.15 * breathe);
        const alpha = HAZE_ALPHA * this.haze * (0.7 + 0.3 * breathe);
        for (let j = 0; j < WISP_PUFFS; j++) {
          const aj = a - Math.sign(w.speed) * j * WISP_GAP;
          _p.set(center.x + Math.sin(aj) * rad, y - j * 6, center.z + Math.cos(aj) * rad);
          _q.setFromAxisAngle(_dir.set(0, 1, 0), aj + w.phase * j);
          const rj = r * (1 - 0.22 * j);
          this.put(_p, _q, _s.set(rj * 1.5, rj * 0.7, rj), w.color, alpha * (1 - 0.28 * j));
        }
      }
    }

    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  private put(pos: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3, color: number, alpha: number): void {
    if (this.n >= MAX || alpha <= 0.004) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, _m.compose(pos, q, s));
    this.mesh.setColorAt(i, _c.setHex(color));
    this.alpha.setX(i, alpha);
  }

  /** Blobs in flight and puffs alive (for tests and debugging). */
  get active(): { blobs: number; puffs: number; haze: number } {
    return { blobs: this.blobs.length, puffs: this.puffs.length, haze: this.haze };
  }

  /** Drop every blob, cloud and the haze (new run, monster change). */
  clear(): void {
    this.freeBlobs.push(...this.blobs);
    this.blobs.length = 0;
    this.freePuffs.push(...this.puffs);
    this.puffs.length = 0;
    this.haze = 0;
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}
