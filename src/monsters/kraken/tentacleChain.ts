import * as THREE from 'three';

/** An axis-aligned ellipsoid an arm must stay outside of (centre, radii). */
export type Ellipsoid = { c: THREE.Vector3; r: THREE.Vector3 };

/**
 * Per-joint spring stiffness (rad/s) and damping ratio, blended from the root to the tip; `bend` (0..1) is how
 * strongly each joint straightens toward its neighbours' midpoint every step (the arm's bending stiffness).
 */
export type ChainTuning = { omegaRoot: number; omegaTip: number; zetaRoot: number; zetaTip: number; bend?: number };

/** Push `p` out of `e` grown by `pad`, along its direction from the centre. True if it was inside. */
export function pushOut(p: THREE.Vector3, e: Ellipsoid, pad: number): boolean {
  const rx = e.r.x + pad;
  const ry = e.r.y + pad;
  const rz = e.r.z + pad;
  const qx = (p.x - e.c.x) / rx;
  const qy = (p.y - e.c.y) / ry;
  const qz = (p.z - e.c.z) / rz;
  const d = Math.hypot(qx, qy, qz);
  if (d >= 1) return false;
  if (d < 1e-6) p.set(e.c.x, e.c.y + ry, e.c.z);
  else p.set(e.c.x + (qx / d) * rx, e.c.y + (qy / d) * ry, e.c.z + (qz / d) * rz);
  return true;
}

/** Resample the polyline `src` into `out.length` points evenly spaced along it; returns its length. */
export function resample(src: readonly THREE.Vector3[], out: THREE.Vector3[]): number {
  let total = 0;
  for (let k = 1; k < src.length; k++) total += src[k]!.distanceTo(src[k - 1]!);
  let k = 1;
  let walked = 0;
  for (let j = 0; j < out.length; j++) {
    const want = (j / (out.length - 1)) * total;
    while (k < src.length - 1 && walked + src[k]!.distanceTo(src[k - 1]!) < want) {
      walked += src[k]!.distanceTo(src[k - 1]!);
      k++;
    }
    const seg = src[k]!.distanceTo(src[k - 1]!);
    out[j]!.lerpVectors(src[k - 1]!, src[k]!, seg > 1e-9 ? Math.min(1, (want - walked) / seg) : 0);
  }
  return total;
}

const _prev = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

/**
 * A tentacle as a chain of joints with fixed-length segments. Each joint springs toward its target, stiff at
 * the root and loose at the tip, so a fast pose change travels down the arm and the tip lags then snaps like
 * a whip. Joint 0 is pinned to its target; joints from `firstFree` on are kept outside the given bodies;
 * with `pinTip` (a planted arm) the tip holds its target too.
 */
export class TentacleChain {
  readonly joints: THREE.Vector3[];
  private vel: THREE.Vector3[];
  private next: THREE.Vector3[];
  private ready = false;

  constructor(readonly segments: number) {
    const make = () => Array.from({ length: segments + 1 }, () => new THREE.Vector3());
    this.joints = make();
    this.vel = make();
    this.next = make();
  }

  /**
   * The chain's frame moved (e.g. the body walked or turned): `delta` maps last frame's coordinates to this
   * frame's, so the joints keep their place in the world and trail behind. A jump longer than `snapDist`
   * (a teleport) makes the next step snap to its targets instead.
   */
  shift(delta: THREE.Matrix4, snapDist: number): void {
    if (!this.ready) return;
    const e = delta.elements;
    if (Math.hypot(e[12]!, e[13]!, e[14]!) > snapDist) {
      this.ready = false;
      return;
    }
    _m3.setFromMatrix4(delta);
    for (let j = 0; j <= this.segments; j++) {
      this.joints[j]!.applyMatrix4(delta);
      this.vel[j]!.applyMatrix3(_m3);
    }
  }

  /** Place joint `j` at `segLen` from joint `from`, along their current line. */
  private follow(j: number, from: number, segLen: number): void {
    _prev.subVectors(this.next[j]!, this.next[from]!);
    const len = _prev.length();
    if (len > 1e-6) this.next[j]!.copy(this.next[from]!).addScaledVector(_prev, segLen / len);
  }

  reset(): void {
    this.ready = false;
  }

  step(
    dt: number,
    targets: readonly THREE.Vector3[],
    segLen: number,
    tune: ChainTuning,
    bodies: readonly Ellipsoid[],
    pad: (j: number) => number,
    firstFree = 2,
    pinTip = false,
  ): void {
    const n = this.segments;
    if (!this.ready || dt <= 0) {
      for (let j = 0; j <= n; j++) {
        this.joints[j]!.copy(targets[j]!);
        this.vel[j]!.set(0, 0, 0);
      }
      this.ready = true;
      return;
    }
    const h = Math.min(dt, 1 / 30);
    const subs = h > 1 / 60 ? 2 : 1;
    const s = h / subs;
    for (let it = 0; it < subs; it++) {
      this.next[0]!.copy(targets[0]!);
      for (let j = 1; j <= n; j++) {
        const u = j / n;
        const w = tune.omegaRoot + (tune.omegaTip - tune.omegaRoot) * u;
        const z = tune.zetaRoot + (tune.zetaTip - tune.zetaRoot) * u;
        const p = this.joints[j]!;
        const v = this.vel[j]!;
        const t = targets[j]!;
        v.x += (w * w * (t.x - p.x) - 2 * z * w * v.x) * s;
        v.y += (w * w * (t.y - p.y) - 2 * z * w * v.y) * s;
        v.z += (w * w * (t.z - p.z) - 2 * z * w * v.z) * s;
        this.next[j]!.copy(p).addScaledVector(v, s);
      }
      // Segments keep their length (follow the leader from the root; a pinned tip first pulls the chain to
      // its target from the other end, as in FABRIK); bodies push the arm around them.
      const bend = tune.bend ?? 0;
      if (bend > 0) {
        for (let j = 1; j < n; j++) {
          _mid.addVectors(this.next[j - 1]!, this.next[j + 1]!).multiplyScalar(0.5);
          this.next[j]!.lerp(_mid, bend);
        }
      }
      for (let pass = 0; pass < (pinTip ? 4 : 2); pass++) {
        if (pinTip) {
          this.next[n]!.copy(targets[n]!);
          for (let j = n - 1; j >= 1; j--) this.follow(j, j + 1, segLen);
        }
        for (let j = 1; j <= n; j++) this.follow(j, j - 1, segLen);
        for (let j = firstFree; j <= n; j++) for (const b of bodies) pushOut(this.next[j]!, b, pad(j));
      }
      for (let j = 0; j <= n; j++) {
        this.vel[j]!.subVectors(this.next[j]!, this.joints[j]!).divideScalar(s);
        this.joints[j]!.copy(this.next[j]!);
      }
    }
  }
}
