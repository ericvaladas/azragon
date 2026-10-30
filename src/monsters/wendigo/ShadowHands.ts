import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Particles } from '../../systems/Particles';
import { faceted, toonMat } from '../../render/toon';
import { ARM_BEND, armJointsTo, dragPoint, fingerPoints, fistPoint, HAND_DIM, HAND_T, handBase, handFrame, handPhase, thumbPoints, underBase, type HandTiming } from './handMath';

/** Hands alive at once by default (Anti-Air grabs up to three flyers per strike; strikes can overlap). */
const MAX = 10;
/** A husk is this many times its victim's radius across. */
const HUSK = 1.5;
/** Bones in each arm (knobbed joints between them). */
const SEGS = 7;
/** Per hand: arm bones, joint knobs, palm, four fingers of 3 phalanges and 3 knuckles, a 3-bone thumb with 2 knuckles. */
const CORE_PER = SEGS + (SEGS - 1) + 1 + 4 * 6 + 5;
/** Smoke shell around the arm bones and the palm. */
const HALO_PER = SEGS + 1;
/** How opaque the arm's bones and their smoky shell are: nearly solid, with a hint of the city through the limb. */
const CORE_OPACITY = 0.93;
const HALO_OPACITY = 0.45;
/** Hand scale; dimensions below are in metres before it. */
const HS = 2;
const PALM = { len: HAND_DIM.palmLen, width: HAND_DIM.palmWidth, thick: HAND_DIM.thick };
/** Phalanx radii (proximal, middle, distal) and their knuckles, a shade fatter. */
const FINGER_R = [5.6, 4.6, 3.4];
const KNUCKLE = 1.45;
/** Arm radius at the pool and at the wrist (m). */
const ARM_R0 = 34;
const ARM_R1 = 17;
/** Where the closed fist holds its prize, from the wrist: along the hand and toward the palm side (in the fingers' curl). */
const HOLD_FWD = HAND_DIM.holdFwd;
const HOLD_IN = HAND_DIM.holdIn;
/** A finger's or the thumb's joints in the hand's frame (fingerPoints / thumbPoints). */
const _P = Array.from({ length: 4 }, () => new THREE.Vector3());

type Hand = {
  target: Target;
  base: THREE.Vector3;
  /** Where the fist closed (world); the wreck is dragged down from here. */
  held: THREE.Vector3;
  t: number;
  /** How many times slower than the timeline this hand rises and drags (`speed`: its reach over the speed); 1 otherwise. */
  riseK: number;
  dragK: number;
  /** Decided once at impact: the flyer survived, so the fist (still shut) sinks back on empty air and leaves it be. */
  survived: boolean;
  decided: boolean;
  seed: number;
  twist: number;
  joints: THREE.Vector3[];
};

const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _base = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _col = new THREE.Color();

/** Colours: arm bones darken toward the pool; knuckles and finger bones a shade lighter so the hand reads. */
const ARM_ROOT = new THREE.Color(0x040305);
const ARM_TIP = new THREE.Color(0x120c17);
const KNOB = new THREE.Color(0x1c1422);
const FINGER = new THREE.Color(0x150f1a);
const CLAW = new THREE.Color(0x2a2030);
const POOL_OUTER = new THREE.Color(0x1d1124);
const POOL_INNER = new THREE.Color(0x030204);

/** Flat ragged disc (radius ~1) for the shadow pool. */
function raggedDisc(): THREE.BufferGeometry {
  const n = 16;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = 0.75 + 0.25 * Math.abs(Math.sin(i * 2.7));
    const r1 = 0.75 + 0.25 * Math.abs(Math.sin(((i + 1) % n) * 2.7));
    pos.push(0, 0, 0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1, Math.cos(a0) * r0, 0, Math.sin(a0) * r0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Shadow Hands (the Wendigo's anti-air): for each flyer grabbed, a long, jointed, near-black arm bursts out of a
 * roiling pool of shadow on the ground beyond it, lunges up onto it on the shared anti-air clock, closes its bony
 * fingers, drags the wreck down into the ground and dissolves into smoke. The fist never opens once shut: a surviving
 * flyer flies on, the fist sinking clenched on empty air.
 * Three draw calls at most (bones, their smoky shell, the pools); everything is pooled.
 */
export class ShadowHands {
  private hands: Hand[] = [];
  private spare: Hand[] = [];
  private core: THREE.InstancedMesh;
  private halo: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  /** Dark husks held in the fists (`husks` hands only). */
  private husks: THREE.InstancedMesh;
  private max: number;
  private holdsHusks: boolean;
  /** Size multiplier on the arms, hands and pools (1 for the anti-air hands); the hand scale it gives. */
  private size: number;
  private hs: number;
  private T: HandTiming;
  private under: number | null;
  private speed: number | null;
  private onImpact: (t: Target) => void;

  /**
   * `max` hands at once; with `husks` (Devour), a taken victim is gone from its own system, so each fist closes on a
   * dark husk of its size and drags that under instead of moving the wreck itself. `timing` replaces the anti-air
   * timeline (Devour's pulls at once); `onImpact` hears each hand close on its target, just before it decides whether
   * it holds a wreck. `under` (m) raises each arm from right under its target, that far out, instead of from a pool
   * out beyond it. `speed` (m per second of the hands' clock) has each hand rise and drag at that constant speed, so a
   * longer reach takes longer (with a `steady` timing). `size` scales the arms, hands and pools (Devour's are seen from much further back).
   */
  constructor(scene: THREE.Scene, opts: { max?: number; husks?: boolean; size?: number; timing?: HandTiming; onImpact?: (t: Target) => void; under?: number; speed?: number } = {}) {
    this.max = opts.max ?? MAX;
    this.size = opts.size ?? 1;
    this.T = opts.timing ?? HAND_T;
    this.under = opts.under ?? null;
    this.speed = opts.speed ?? null;
    this.onImpact = opts.onImpact ?? (() => {});
    this.hs = HS * this.size;
    this.holdsHusks = opts.husks ?? false;
    const n = this.max;
    // Bones taper toward their far end, so each one reads as a separate bone and each finger ends in a point.
    const bone = faceted(new THREE.CylinderGeometry(0.55, 1, 1, 5));
    // Ghostly: the bones themselves are see-through (the city reads through the arm); they still write depth, so the
    // limb never doubles up over itself, and the opaque flyer drawn before them shows through the fist.
    const coreMat = toonMat(0xffffff);
    coreMat.transparent = true;
    coreMat.opacity = CORE_OPACITY;
    this.core = new THREE.InstancedMesh(bone, coreMat, n * CORE_PER);
    this.halo = new THREE.InstancedMesh(
      bone,
      new THREE.MeshBasicMaterial({ color: CONFIG.wendigo.colors.handSmoke, transparent: true, opacity: HALO_OPACITY, depthWrite: false, side: THREE.BackSide }),
      n * HALO_PER,
    );
    this.halo.renderOrder = 1;
    this.pools = new THREE.InstancedMesh(raggedDisc(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), n * 2);
    this.pools.renderOrder = 2;
    this.husks = new THREE.InstancedMesh(faceted(new THREE.BoxGeometry(1, 0.6, 1.4)), toonMat(CONFIG.wendigo.colors.husk), n);
    for (const m of [this.core, this.halo, this.pools, this.husks]) {
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      m.setColorAt(0, _col.setHex(0xffffff));
      scene.add(m);
    }
  }

  /** Active grabs. */
  get count(): number {
    return this.hands.length;
  }

  /** Some hand has yet to finish dragging its prize under (waiting to rise counts). */
  dragging(): boolean {
    return this.hands.some((h) => h.t < this.T.drag);
  }

  /** A hand rises for `target` (followed live until the impact), `delay` s from now; the arm comes out of the ground beyond it. */
  grab(target: Target, monster: THREE.Vector3, delay = 0): void {
    if (this.hands.length >= this.max) return;
    const h = this.spare.pop() ?? {
      target, base: new THREE.Vector3(), held: new THREE.Vector3(), t: 0, riseK: 1, dragK: 1, survived: false, decided: false, seed: 0, twist: 0,
      joints: Array.from({ length: SEGS + 1 }, () => new THREE.Vector3()),
    };
    h.target = target;
    if (this.under === null) handBase(target.position, monster, Math.random(), h.base);
    else underBase(target.position, monster, Math.random(), this.under, h.base);
    h.held.copy(target.position);
    h.t = -delay;
    // At a constant `speed`, the rise and the drag each take the reach (pool to target) over the speed.
    const reach = h.base.distanceTo(target.position);
    h.riseK = this.speed === null ? 1 : reach / this.speed / this.T.impact;
    h.dragK = this.speed === null ? 1 : reach / this.speed / (this.T.drag - this.T.hold);
    h.survived = false;
    h.decided = false;
    h.seed = Math.random() * 100;
    h.twist = (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.06);
    this.hands.push(h);
  }

  clear(): void {
    this.spare.push(...this.hands);
    this.hands = [];
    for (const m of [this.core, this.halo, this.pools, this.husks]) {
      m.count = 0;
      m.visible = false;
    }
  }

  update(dt: number, particles: Particles): void {
    let nc = 0;
    let nh = 0;
    let np = 0;
    let nk = 0;
    for (let i = this.hands.length - 1; i >= 0; i--) {
      const h = this.hands[i]!;
      // Rising (after any delay, before it closes) runs riseK times slower, dragging dragK times.
      const k = h.t >= 0 && h.t < this.T.impact ? h.riseK : h.t >= this.T.hold && h.t < this.T.drag ? h.dragK : 1;
      h.t += dt / k;
      // Not risen yet.
      if (h.t < 0) continue;
      const T = this.T;
      if (h.t >= T.total) {
        this.spare.push(h);
        this.hands.splice(i, 1);
        continue;
      }
      // At the impact (the anti-air damage has just landed) the fist either holds a wreck or, shut on empty air, leaves a
      // survivor to fly on.
      if (!h.decided && h.t >= T.impact) {
        h.decided = true;
        this.onImpact(h.target);
        h.survived = h.target.isAlive();
        h.held.copy(h.target.position);
      }
      const ph = handPhase(h.t, h.survived, T);
      const fade = ph.fade;
      const life = 1 - fade;

      // The point the fist closes on: arcing over the live flyer and down onto it while lunging, then (crushing,
      // shaking) dragged down into the ground out beyond the pool, the arm arching over after it.
      _base.copy(h.base).setY(-25 - 90 * fade);
      if (!h.decided) fistPoint(h.base, h.target.position, ph.rise, _a);
      else {
        // From where the fist closed: a survivor is left to fly on, the fist sinking shut on empty air.
        dragPoint(h.base, h.held, ph.drag, _a);
        if (h.t < T.hold) _a.x += Math.sin(h.t * 65) * 3;
        // The wreck goes down with the hand (purely visual: the flyer is already destroyed); or, holding husks, a
        // dark husk of the victim's size does, the victim itself left alone.
        if (!h.survived && this.holdsHusks) {
          const r = h.target.radius * HUSK * life;
          _q.setFromAxisAngle(_up, h.seed);
          this.husks.setMatrixAt(nk++, _m.compose(_a, _q, _scale.set(r, r, r)));
        } else if (!h.survived && !h.target.isAlive() && ph.drag < 1) h.target.position.copy(_a);
      }

      // Hand frame: F along the hand toward the fingertips, S across the knuckles, N out of the palm. Overhand: it
      // rolls palm-down as it comes over the flyer, then tips on over to point down as it drags the wreck into the
      // ground; the wrist sits above the prize (−N). The wrist is rigid: the forearm runs straight into the hand.
      handFrame(h.base, h.decided ? h.held : h.target.position, h.decided ? 1 : ph.rise, _f, _s, _n, ph.drag, T.pitch);
      const bend = ARM_BEND + 0.015 * Math.sin(h.t * 5 + h.seed);
      const twist = 0.3 * h.twist + 0.015 * Math.sin(h.t * 3.7 + h.seed);
      _w.copy(_a).addScaledVector(_f, -HOLD_FWD * this.hs).addScaledVector(_n, -HOLD_IN * this.hs);

      // Arm: a long, nearly straight, trembling chain of tapering bones with knobbed joints, leaning in from its pool
      // and bending a little at the elbow to arrive along the hand (the elbow keeps still so the wrist stays straight).
      const J = armJointsTo(_base, _w, _f, bend, twist, h.joints);
      for (let k = 1; k < SEGS - 1; k++) {
        const s = h.seed + k * 1.9;
        J[k]!.x += Math.sin(h.t * 11 + s) * 5;
        J[k]!.y += Math.sin(h.t * 13 + s * 1.3) * 4;
        J[k]!.z += Math.cos(h.t * 12 + s) * 5;
      }
      for (let k = 0; k < SEGS; k++) {
        const u = k / SEGS;
        const r = (ARM_R0 + (ARM_R1 - ARM_R0) * u) * this.size * life;
        _col.copy(ARM_ROOT).lerp(ARM_TIP, u);
        this.bone(nc++, J[k]!, J[k + 1]!, r, _col);
        this.bone(nh++, J[k]!, J[k + 1]!, r * 1.9, null, this.halo);
        if (k > 0) {
          // A knuckle-like knob over the joint.
          _e.subVectors(J[k + 1]!, J[k]!).setLength(r * 1.4);
          _p.copy(J[k]!).addScaledVector(_e, -0.5);
          this.bone(nc++, _p, _c.copy(_p).add(_e), r * 1.45, KNOB);
        }
      }

      // Palm: a flat slab from the wrist along F, knuckles across S.
      _p.copy(_w).addScaledVector(_f, PALM.len * this.hs * 0.5);
      _m.makeBasis(_s, _f, _n).setPosition(_p);
      _q.setFromRotationMatrix(_m);
      _scale.set((PALM.width / 2) * this.hs * life, PALM.len * this.hs, (PALM.thick / 2) * this.hs * life);
      this.core.setMatrixAt(nc, _m.compose(_p, _q, _scale));
      this.core.setColorAt(nc++, ARM_TIP);
      _scale.x *= 1.35;
      _scale.z *= 1.8;
      _scale.y *= 1.2;
      this.halo.setMatrixAt(nh++, _m.compose(_p, _q, _scale));

      // Fingers: fanned wide and bent back while lunging; each curls joint by joint (knuckle, middle, tip), the
      // index first, into a fist round the prize, clenching tighter in the crush (twitching as it holds).
      const g = ph.grip;
      const ls = 0.6 + 0.4 * life;
      for (let fi = 0; fi < 4; fi++) {
        fingerPoints(g, ph.squeeze * (1 + 0.15 * Math.sin(h.t * 12.5 + fi * 2.1 + h.seed)), fi, _P);
        this.digit(nc, _P, 3, ls, life, g);
        nc += 6;
      }
      // Thumb: from the heel of the palm on the index side, swinging across to oppose the fingers as it closes.
      thumbPoints(g, ph.squeeze, _P);
      this.digit(nc, _P, 2, ls, life, g);
      nc += 5;

      // Shadow pool: two ragged discs turning against each other.
      const pr = (70 + 5 * Math.sin(h.t * 6 + h.seed)) * this.size * ph.pool;
      this.disc(np++, h.base, pr, h.t * 0.9 + h.seed, 3, POOL_OUTER);
      this.disc(np++, h.base, pr * 0.62, -h.t * 1.05, 4, POOL_INNER);

      // Smoke: a column boiling up as the arm rises, wisps off the bones, and a burst as it all dissolves.
      if (h.t < T.emerge && Math.random() < 0.5) particles.emit('shade', _p.copy(h.base).setY(10), 1, 0.5);
      if (Math.random() < dt * 14) particles.emit('shade', J[2 + Math.floor(Math.random() * (SEGS - 2))]!, 1, 0.2);
      if (Math.random() < dt * 5) particles.emit('shade', _p.copy(h.base).setY(6).add(_e.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(pr * 1.6)), 1, 0.4);
      if (fade > 0 && Math.random() < dt * 40) particles.emit('shade', J[Math.floor(Math.random() * (SEGS + 1))]!, 1, 0.5);
    }
    this.finish(this.core, nc);
    this.finish(this.halo, nh);
    this.finish(this.pools, np);
    this.finish(this.husks, nk);
  }

  /**
   * One finger (or the thumb) from its joints `P` in the hand's frame (fingerPoints), placed on the current hand
   * (`_w` the wrist, `_f`, `_s`, `_n` its frame): a tapering bone per phalanx, the last a claw, and a knob over each of
   * the first `knobs` joints (instances i .. i + 2 + knobs). Lengths shrink by `ls` and girth by `life` as it dissolves.
   */
  private digit(i: number, P: THREE.Vector3[], knobs: number, ls: number, life: number, grip: number): void {
    for (let k = 3; k >= 0; k--) {
      _e.copy(P[k]!).sub(P[0]!).multiplyScalar(ls).add(P[0]!);
      _D[k]!.copy(_w).addScaledVector(_s, _e.x * this.hs).addScaledVector(_f, _e.y * this.hs).addScaledVector(_n, _e.z * this.hs);
    }
    for (let j = 0; j < 3; j++) this.bone(i++, _D[j]!, _D[j + 1]!, FINGER_R[j]! * this.hs * life, j === 2 ? CLAW : FINGER);
    for (let j = 0; j < knobs; j++) {
      // A knuckle over the joint, along the bone it starts, standing out more as the fist clenches.
      const k = knobs === 3 ? j : j + 1;
      _e.subVectors(_D[k + 1]!, _D[k]!).setLength(FINGER_R[Math.min(2, k)]! * this.hs * KNUCKLE * 1.2);
      _p.copy(_D[k]!).addScaledVector(_e, -0.5);
      this.bone(i++, _p, _c.copy(_p).add(_e), FINGER_R[Math.min(2, k)]! * this.hs * life * (KNUCKLE + 0.15 * grip), KNOB);
    }
  }

  /** One bone from a to b, radius r at a (the shared geometry tapers to 0.55 r at b); its smoke shell when `mesh` is the halo. */
  private bone(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.Color | null, mesh = this.core): void {
    _bd.subVectors(b, a);
    const l = _bd.length();
    _q.setFromUnitVectors(_up, l > 1e-6 ? _bd.divideScalar(l) : _up);
    _m.compose(_p2.addVectors(a, b).multiplyScalar(0.5), _q, _scale2.set(Math.max(0.01, r), l, Math.max(0.01, r)));
    mesh.setMatrixAt(i, _m);
    if (color) mesh.setColorAt(i, color);
  }

  private disc(i: number, at: THREE.Vector3, r: number, spin: number, y: number, color: THREE.Color): void {
    _q.setFromAxisAngle(_up, spin);
    _m.compose(_p2.set(at.x, y, at.z), _q, _scale2.set(r, 1, r));
    this.pools.setMatrixAt(i, _m);
    this.pools.setColorAt(i, color);
  }

  private finish(m: THREE.InstancedMesh, n: number): void {
    m.count = n;
    m.visible = n > 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.core, this.halo, this.pools, this.husks]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}

const _p2 = new THREE.Vector3();
const _D = Array.from({ length: 4 }, () => new THREE.Vector3());
const _bd = new THREE.Vector3();
const _scale2 = new THREE.Vector3();
