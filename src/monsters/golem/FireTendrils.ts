import * as THREE from 'three';
import { type ChainTuning, resample, TentacleChain } from '../kraken/tentacleChain';

/** Segments per tendril; every tendril's segments are one instanced mesh (one draw call). */
const SEGS = 10;
/** Points sampled along each pose curve before it is evened out into SEGS + 1 joint targets. */
const SAMPLES = 16;
/** Model units: radius at the root and the tip; idle flare length; longest a lash can stretch. */
const R_ROOT = 18;
const R_TIP = 5;
const FLARE_LEN = 230;
const MAX_LEN = 1300;
/** A frame-to-frame jump longer than this (model units) is a teleport: the tendrils snap instead of trailing. */
const SNAP = 500;
/** Idle flares: loose and whippy, so they lick and flicker. A lash: tighter, so it cracks onto the flyer. */
const FLARE_TUNE: ChainTuning = { omegaRoot: 30, omegaTip: 12, zetaRoot: 0.8, zetaTip: 0.35, bend: 0.2 };
const LASH_TUNE: ChainTuning = { omegaRoot: 36, omegaTip: 20, zetaRoot: 0.85, zetaTip: 0.45, bend: 0.15 };
/** Colour stops from root to tip: yellow flame, orange, red-orange, deep red. */
const STOPS = [0xffc02a, 0xff8f1c, 0xff5a12, 0xc8280a].map((c) => new THREE.Color(c));

const _up = new THREE.Vector3(0, 1, 0);
const _root = new THREE.Vector3();
const _n = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _curl = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _delta = new THREE.Matrix4();
const _c = new THREE.Color();
const _path = Array.from({ length: SAMPLES + 1 }, () => new THREE.Vector3());
const _targets = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());

/** Which tendril lashes at `target`: the one whose root is nearest it (all in the same space). */
export function pickTendril(roots: readonly THREE.Vector3[], target: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  roots.forEach((r, i) => {
    const d = r.distanceToSquared(target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Point on the cubic curve a → b → c → d at u. */
function cubic(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  return out
    .copy(a)
    .multiplyScalar(v * v * v)
    .addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u)
    .addScaledVector(d, u * u * u);
}

/**
 * The Golem's fire tendrils: thin whips of flame rising from its back like solar flares. At rest they lick up
 * and curl over, flickering and surging (longer and hotter with Molten Core heat). For Vent Burst the tendril
 * nearest the flyer cocks back and whips out to it; spring chains give the lag and the crack.
 */
export class FireTendrils {
  readonly mesh: THREE.InstancedMesh;
  private chains: TentacleChain[];
  private local: THREE.Vector3[];
  private prevWorld = new THREE.Matrix4();
  private hasPrev = false;
  private lash = -1;

  /**
   * `roots` are torso-space points on the back; each tendril leaves its root along the direction away from
   * `centre` (also torso space).
   */
  constructor(
    private roots: readonly THREE.Vector3[],
    private centre: THREE.Vector3,
  ) {
    const geo = new THREE.CylinderGeometry(0.75, 1, 1, 5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), roots.length * SEGS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setColorAt(i, STOPS[0]!);
    this.chains = roots.map(() => new TentacleChain(SEGS));
    this.local = roots.map(() => new THREE.Vector3());
  }

  /**
   * `rel` maps torso space to the body root's space; `rootWorld` is the root's world matrix. `lashAt` is the
   * flyer in root space (null when not lashing) and `weight` the anti-air reach (negative while cocking back).
   * `heat` 0..1 makes the flares longer and brighter; `shrink` 0..1 (collapse) dies them down.
   */
  update(dt: number, time: number, rel: THREE.Matrix4, rootWorld: THREE.Matrix4, lashAt: THREE.Vector3 | null, weight: number, heat: number, shrink: number): void {
    // The tendrils live in the world: carry them over the body's motion so they trail when it walks or turns.
    if (this.hasPrev) {
      _delta.copy(rootWorld).invert().multiply(this.prevWorld);
      for (const c of this.chains) c.shift(_delta, SNAP);
    }
    this.prevWorld.copy(rootWorld);
    this.hasPrev = true;

    for (let i = 0; i < this.roots.length; i++) this.local[i]!.copy(this.roots[i]!).applyMatrix4(rel);
    if (!lashAt) this.lash = -1;
    else if (this.lash < 0) this.lash = pickTendril(this.local, lashAt);

    for (let i = 0; i < this.roots.length; i++) {
      _root.copy(this.local[i]!);
      _n.copy(this.roots[i]!).sub(this.centre).transformDirection(rel);
      _side.crossVectors(_n, _up);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
      _side.normalize();
      _fwd.crossVectors(_side, _n);
      // Each flare curls over toward its own slowly wandering direction.
      const ang = i * 1.26 + Math.sin(time * 0.35 + i * 1.7) * 0.9;
      _curl.copy(_side).multiplyScalar(Math.cos(ang)).addScaledVector(_fwd, Math.sin(ang));
      const surge = Math.pow(Math.max(0, Math.sin(time * 0.9 + i * 1.3)), 4);
      const len = FLARE_LEN * (0.75 + 0.25 * Math.sin(time * 1.7 + i * 2.1) + 0.45 * surge) * (1 + heat * 0.6) * (1 - shrink);
      _c1.copy(_root).addScaledVector(_n, len * 0.55);
      _c2.copy(_root).addScaledVector(_n, len * 0.95).addScaledVector(_curl, len * 0.35);
      _tip.copy(_root).addScaledVector(_n, len * 0.45).addScaledVector(_curl, len * 0.8);
      let tune = FLARE_TUNE;
      const lashing = i === this.lash && lashAt !== null;
      if (lashing) {
        // Cock back (negative weight extrapolates away from the flyer), then whip out onto it.
        _tip.lerp(lashAt!, weight);
        _c1.copy(_root).addScaledVector(_n, 180);
        _c2.lerpVectors(_root, _tip, 0.55).addScaledVector(_n, 120);
        tune = LASH_TUNE;
      }
      for (let k = 0; k <= SAMPLES; k++) {
        const u = k / SAMPLES;
        const p = cubic(_root, _c1, _c2, _tip, u, _path[k]!);
        // A flickering ripple along the flame.
        const flick = Math.sin(time * 9 - u * 8 + i * 2.3) * 14 * u * (lashing ? 0.3 : 1);
        p.addScaledVector(_side, flick);
      }
      const total = resample(_path, _targets);
      this.chains[i]!.step(dt, _targets, Math.max(1, Math.min(MAX_LEN, total)) / SEGS, tune, [], () => 0, 1);

      const J = this.chains[i]!.joints;
      for (let k = 0; k < SEGS; k++) {
        const idx = i * SEGS + k;
        _d.subVectors(J[k + 1]!, J[k]!);
        const l = _d.length();
        const u = k / SEGS;
        const r = (R_ROOT + (R_TIP - R_ROOT) * u) * (lashing ? 1.25 : 1) * (0.85 + 0.15 * Math.sin(time * 23 + k * 1.9 + i)) * (1 - shrink);
        _q.setFromUnitVectors(_up, l > 1e-6 ? _d.divideScalar(l) : _up);
        _m.compose(_a.addVectors(J[k]!, J[k + 1]!).multiplyScalar(0.5), _q, _s.set(r, l + r * 0.4, r));
        this.mesh.setMatrixAt(idx, _m);
        const t = u * (STOPS.length - 1);
        const s = Math.min(STOPS.length - 2, Math.floor(t));
        _c.copy(STOPS[s]!).lerp(STOPS[s + 1]!, t - s).multiplyScalar(0.85 + 0.25 * Math.sin(time * 17 + k + i * 3) + heat * 0.2);
        this.mesh.setColorAt(idx, _c);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
