import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Particles } from '../../systems/Particles';
import { faceted, toonMat } from '../../render/toon';
import { armJoints, HAND_T, handBase, handPhase } from './handMath';

/** Hands alive at once (Shadow Hands+ grabs up to four flyers per strike; strikes can overlap). */
const MAX = 10;
/** Bones in each arm (knobbed joints between them). */
const SEGS = 7;
/** Per hand: arm bones, joint knobs, palm, four 3-bone fingers, a 2-bone thumb. */
const CORE_PER = SEGS + (SEGS - 1) + 1 + 4 * 3 + 2;
/** Smoke shell around the arm bones and the palm. */
const HALO_PER = SEGS + 1;
/** Hand scale; dimensions below are in metres before it. */
const HS = 2;
const PALM = { len: 34, width: 40, thick: 13 };
const FINGER_LEN = [30, 25, 21];
const FINGER_R = [5.2, 4.4, 3.2];
/** Index to little finger: relative length. */
const FINGER_SCALE = [0.92, 1, 0.97, 0.8];
const THUMB_LEN = [26, 20];
/** Arm radius at the pool and at the wrist (m). */
const ARM_R0 = 34;
const ARM_R1 = 17;
/** Where the closed fist holds its prize, from the wrist: along the hand and toward the palm side. */
const HOLD_FWD = PALM.len + 14;
const HOLD_IN = 20;

type Hand = {
  target: Target;
  base: THREE.Vector3;
  /** Where the fist closed (world); the wreck is dragged down from here. */
  held: THREE.Vector3;
  t: number;
  /** Decided once at impact: the flyer survived, so the hand lets go and sinks back empty. */
  released: boolean;
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
const _d = new THREE.Vector3();
const _fd = new THREE.Vector3();
const _cd = new THREE.Vector3();
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
 * fingers, drags the wreck down into the pool and dissolves into smoke. A surviving flyer is let go.
 * Three draw calls at most (bones, their smoky shell, the pools); everything is pooled.
 */
export class ShadowHands {
  private hands: Hand[] = [];
  private spare: Hand[] = [];
  private core: THREE.InstancedMesh;
  private halo: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    // Bones taper toward their far end, so each one reads as a separate bone and each finger ends in a point.
    const bone = faceted(new THREE.CylinderGeometry(0.55, 1, 1, 5));
    this.core = new THREE.InstancedMesh(bone, toonMat(0xffffff), MAX * CORE_PER);
    this.halo = new THREE.InstancedMesh(
      bone,
      new THREE.MeshBasicMaterial({ color: CONFIG.golem.colors.handSmoke, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.BackSide }),
      MAX * HALO_PER,
    );
    this.halo.renderOrder = 1;
    this.pools = new THREE.InstancedMesh(raggedDisc(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), MAX * 2);
    this.pools.renderOrder = 2;
    for (const m of [this.core, this.halo, this.pools]) {
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

  /** A hand rises for `target` (followed live until the impact); the arm comes out of the ground beyond it. */
  grab(target: Target, monster: THREE.Vector3): void {
    if (this.hands.length >= MAX) return;
    const h = this.spare.pop() ?? {
      target, base: new THREE.Vector3(), held: new THREE.Vector3(), t: 0, released: false, decided: false, seed: 0, twist: 0,
      joints: Array.from({ length: SEGS + 1 }, () => new THREE.Vector3()),
    };
    h.target = target;
    handBase(target.position, monster, Math.random(), h.base);
    h.held.copy(target.position);
    h.t = 0;
    h.released = false;
    h.decided = false;
    h.seed = Math.random() * 100;
    h.twist = (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.06);
    this.hands.push(h);
  }

  clear(): void {
    this.spare.push(...this.hands);
    this.hands = [];
    for (const m of [this.core, this.halo, this.pools]) {
      m.count = 0;
      m.visible = false;
    }
  }

  update(dt: number, particles: Particles): void {
    let nc = 0;
    let nh = 0;
    let np = 0;
    for (let i = this.hands.length - 1; i >= 0; i--) {
      const h = this.hands[i]!;
      h.t += dt;
      if (h.t >= HAND_T.total) {
        this.spare.push(h);
        this.hands.splice(i, 1);
        continue;
      }
      // At the impact (the anti-air damage has just landed) the fist either holds a wreck or lets a survivor go.
      if (!h.decided && h.t >= HAND_T.impact) {
        h.decided = true;
        h.released = h.target.isAlive();
        h.held.copy(h.target.position);
      }
      const ph = handPhase(h.t, h.released);
      const fade = ph.fade;
      const life = 1 - fade;

      // The point the fist closes on: the live flyer while lunging, then (crushing, shaking) dragged down to the pool.
      _base.copy(h.base).setY(-25 - 90 * fade);
      if (!h.decided) _a.copy(h.base).setY(40).lerp(h.target.position, ph.rise);
      else {
        const from = h.released ? h.target.position : h.held;
        _a.copy(from).lerp(_c.copy(h.base).setY(-30), ph.drag);
        if (h.t < HAND_T.hold) _a.x += Math.sin(h.t * 90) * 3;
        // The wreck goes down with the hand (purely visual: the flyer is already destroyed).
        if (!h.released && !h.target.isAlive() && ph.drag < 1) h.target.position.copy(_a);
      }

      // Hand frame: F along the hand (from the arm's elbow toward the fist), S across the knuckles, N the palm side.
      const len = Math.max(1, _a.distanceTo(_base));
      const bend = 0.2 + 0.3 * ph.drag + 0.04 * Math.sin(h.t * 5 + h.seed);
      const twist = h.twist + 0.05 * Math.sin(h.t * 3.7 + h.seed);
      _d.subVectors(_a, _base).divideScalar(len);
      _c.copy(_up).addScaledVector(_d, -_d.y).normalize();
      _c.multiplyScalar(bend * len).add(_p.addVectors(_a, _base).multiplyScalar(0.5));
      _f.subVectors(_a, _c).normalize();
      _s.crossVectors(_f, _up);
      if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0);
      _s.normalize();
      _n.crossVectors(_s, _f).normalize();
      _w.copy(_a).addScaledVector(_f, -HOLD_FWD * HS).addScaledVector(_n, -HOLD_IN * HS);

      // Arm: a bowed, trembling chain of tapering bones with knobbed joints.
      const J = armJoints(_base, _w, bend, twist, h.joints);
      for (let k = 1; k < SEGS; k++) {
        const s = h.seed + k * 1.9;
        J[k]!.x += Math.sin(h.t * 11 + s) * 5;
        J[k]!.y += Math.sin(h.t * 13 + s * 1.3) * 4;
        J[k]!.z += Math.cos(h.t * 12 + s) * 5;
      }
      for (let k = 0; k < SEGS; k++) {
        const u = k / SEGS;
        const r = (ARM_R0 + (ARM_R1 - ARM_R0) * u) * life;
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
      _p.copy(_w).addScaledVector(_f, PALM.len * HS * 0.5);
      _m.makeBasis(_s, _f, _n).setPosition(_p);
      _q.setFromRotationMatrix(_m);
      _scale.set((PALM.width / 2) * HS * life, PALM.len * HS, (PALM.thick / 2) * HS * life);
      this.core.setMatrixAt(nc, _m.compose(_p, _q, _scale));
      this.core.setColorAt(nc++, ARM_TIP);
      _scale.x *= 1.35;
      _scale.z *= 1.8;
      _scale.y *= 1.2;
      this.halo.setMatrixAt(nh++, _m.compose(_p, _q, _scale));

      // Fingers: fanned wide while lunging, curling into a fist around the prize; they twitch as they hold.
      const g = ph.grip;
      for (let fi = 0; fi < 4; fi++) {
        const off = (fi - 1.5) / 1.5;
        _p.copy(_w).addScaledVector(_f, PALM.len * HS).addScaledVector(_s, off * PALM.width * 0.42 * HS);
        const spread = (0.55 - 0.42 * g) * off;
        _fd.copy(_f).multiplyScalar(Math.cos(spread)).addScaledVector(_s, Math.sin(spread));
        const curl = -0.3 + 1.45 * g + 0.08 * Math.sin(h.t * 17 + fi * 2.1 + h.seed);
        let th = 0;
        for (let j = 0; j < 3; j++) {
          th += curl * (j === 0 ? 0.75 : 1);
          _cd.copy(_fd).multiplyScalar(Math.cos(th)).addScaledVector(_n, Math.sin(th));
          _e.copy(_p).addScaledVector(_cd, FINGER_LEN[j]! * FINGER_SCALE[fi]! * HS * (0.6 + 0.4 * life));
          this.bone(nc++, _p, _e, FINGER_R[j]! * HS * life, j === 2 ? CLAW : FINGER);
          _p.copy(_e);
        }
      }
      // Thumb: from the heel of the palm on the −S side, swinging across as the fist closes.
      _p.copy(_w).addScaledVector(_f, PALM.len * HS * 0.3).addScaledVector(_s, -PALM.width * 0.5 * HS);
      const ta = 1.0 - 0.6 * g;
      _fd.copy(_f).multiplyScalar(Math.cos(ta)).addScaledVector(_s, -Math.sin(ta));
      _c.copy(_n).multiplyScalar(0.6).addScaledVector(_s, 0.8);
      let th = 0;
      for (let j = 0; j < 2; j++) {
        th += -0.1 + 1.0 * g;
        _cd.copy(_fd).multiplyScalar(Math.cos(th)).addScaledVector(_c, Math.sin(th));
        _e.copy(_p).addScaledVector(_cd, THUMB_LEN[j]! * HS * (0.6 + 0.4 * life));
        this.bone(nc++, _p, _e, FINGER_R[j]! * 1.1 * HS * life, j === 1 ? CLAW : FINGER);
        _p.copy(_e);
      }

      // Shadow pool: two ragged discs turning against each other.
      const pr = (70 + 5 * Math.sin(h.t * 6 + h.seed)) * ph.pool;
      this.disc(np++, h.base, pr, h.t * 0.9 + h.seed, 3, POOL_OUTER);
      this.disc(np++, h.base, pr * 0.62, -h.t * 1.4, 4, POOL_INNER);

      // Smoke: a column boiling up as the arm rises, wisps off the bones, and a burst as it all dissolves.
      if (h.t < HAND_T.emerge && Math.random() < 0.5) particles.emit('shade', _p.copy(h.base).setY(10), 1, 0.5);
      if (Math.random() < dt * 14) particles.emit('shade', J[2 + Math.floor(Math.random() * (SEGS - 2))]!, 1, 0.2);
      if (Math.random() < dt * 5) particles.emit('shade', _p.copy(h.base).setY(6).add(_e.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(pr * 1.6)), 1, 0.4);
      if (fade > 0 && Math.random() < dt * 40) particles.emit('shade', J[Math.floor(Math.random() * (SEGS + 1))]!, 1, 0.5);
    }
    this.finish(this.core, nc);
    this.finish(this.halo, nh);
    this.finish(this.pools, np);
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
    for (const m of [this.core, this.halo, this.pools]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}

const _p2 = new THREE.Vector3();
const _bd = new THREE.Vector3();
const _scale2 = new THREE.Vector3();
