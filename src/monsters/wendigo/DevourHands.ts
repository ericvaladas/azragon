import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import { faceted, toonMat } from '../../render/toon';
import { fingerPoints, HAND_DIM, thumbPoints } from './handMath';
import { elbowPoint, newDevourHand, riseSpeedFor, stepDevourHand, type DevourHand, type DevourHandSpec } from './devourHand';

const U = CONFIG.wendigo.ultimate;
const H = U.hand;
const D = HAND_DIM;
/**
 * The arm: a rigid, nearly straight limb below the wrist that rises and sinks with the hand, as long as puts the
 * shoulder SHOULDER_DOWN (× hand scale) under the ground when the hand is at its grasp height. The elbow is bent ELBOW_BEND rad (bending out, away from the victim) and the arm leans ARM_LEAN rad back
 * from straight up; the upper arm is UPPER_SHARE of its length.
 */
const SHOULDER_DOWN = 4;
const ELBOW_BEND = 0.26;
const ARM_LEAN = 0.12;
const UPPER_SHARE = 0.52;
/** Per hand: palm, four fingers of 3 bones and 3 knuckles, a 3-bone thumb with 2 knuckles. */
const CORE_PER = 1 + 4 * 6 + 5;
/** Tube radius at its narrow (top) and wide (base) ends, upper arm and forearm base radii, and phalanx radii (× hand scale). */
const ARM_R_WRIST = 13;
const ARM_R_ROOT = 19;
const UPPER_R = 22;
const FORE_R = 17;
const FINGER_R = [5.6, 4.6, 3.4];
const KNUCKLE = 1.45;
/** The husk of its victim the fist holds is this big across (× hand scale), so it sits inside the closed fingers. */
const HUSK = 17;
/** How far the hand reaches above its hold point to the fingertips (× hand scale): the longest finger, straight up. */
const ABOVE = D.palmLen + D.phalanx[0] + D.phalanx[1] + D.phalanx[2] - D.holdFwd;

const ARM_TIP = new THREE.Color(0x120c17);
const KNOB = new THREE.Color(0x1c1422);
const FINGER = new THREE.Color(0x150f1a);
const CLAW = new THREE.Color(0x2a2030);

type Hand = {
  target: Target;
  state: DevourHand;
  spec: DevourHandSpec;
  /** Hand scale, and the ground point under the hold point (followed live until the victim is taken). */
  hs: number;
  x: number;
  z: number;
  /** Palm normal (horizontal, facing the victim from the hand's side) and the across-the-knuckles axis. */
  n: THREE.Vector3;
  s: THREE.Vector3;
  /** Upper arm and forearm lengths (m), and the straight distance from shoulder to wrist they make with the elbow bend. */
  upper: number;
  fore: number;
  chord: number;
};

const _up = new THREE.Vector3(0, 1, 0);
const _hold = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _el = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _col = new THREE.Color();
const _P = Array.from({ length: 4 }, () => new THREE.Vector3());
const _J = Array.from({ length: 4 }, () => new THREE.Vector3());

/**
 * Devour's hands: for each victim an arm (shoulder in the hole, elbow, forearm) raises an open hand straight up out of
 * the ground beneath it,
 * fingers pointing up in a relaxed, neutral grip; reaching the victim the hand takes it (a dark husk of it rides in
 * the hand from then on; a ground victim is lifted up until the whole hand clears the ground), closes into a full
 * fist round it, then sinks straight back down into the ground with it, slowly (devourHand). A boss gets a far bigger
 * hand that crushes it and sinks away empty: it stays where it is. Pooled: four draw calls.
 */
export class DevourHands {
  private hands: Hand[] = [];
  private core: THREE.InstancedMesh;
  /** The upper arms and forearms: one smooth tapered tube each (the knobbly bones would make them lumpy). */
  private arms: THREE.InstancedMesh;
  /** The shoulder and elbow joints. */
  private joints: THREE.InstancedMesh;
  private husks: THREE.InstancedMesh;

  /** `onTake` hears each victim as its hand reaches it. */
  constructor(
    scene: THREE.Scene,
    private onTake: (t: Target) => void,
  ) {
    const bone = faceted(new THREE.CylinderGeometry(0.55, 1, 1, 5));
    this.core = new THREE.InstancedMesh(bone, toonMat(0xffffff), U.maxFigures * CORE_PER);
    // A unit-tall tube from its base (radius 1) up to the wrist (ARM_R_WRIST / ARM_R_ROOT), origin at the base.
    const arm = faceted(new THREE.CylinderGeometry(ARM_R_WRIST / ARM_R_ROOT, 1, 1, 8).translate(0, 0.5, 0));
    this.arms = new THREE.InstancedMesh(arm, toonMat(0xffffff), U.maxFigures * 2);
    this.joints = new THREE.InstancedMesh(faceted(new THREE.IcosahedronGeometry(1, 1)), toonMat(0xffffff), U.maxFigures * 2);
    this.husks = new THREE.InstancedMesh(faceted(new THREE.BoxGeometry(1, 0.6, 1.4)), toonMat(CONFIG.wendigo.colors.husk), U.maxFigures);
    for (const m of [this.core, this.arms, this.joints, this.husks]) {
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, _col.setHex(0xffffff));
      scene.add(m);
    }
  }

  get count(): number {
    return this.hands.length;
  }

  /** Some hand is not yet back under the ground. */
  dragging(): boolean {
    return this.hands.length > 0;
  }

  /** A hand for `target`, rising after `delay` s, its palm toward `center` (the circle's centre). */
  grab(target: Target, center: THREE.Vector3, delay: number): void {
    if (this.hands.length >= U.maxFigures) return;
    // Every hand is the same size, the husk in its fist standing in for the victim, but for a boss's far bigger one.
    const hs = target.boss ? H.bossScale : H.scale;
    const above = ABOVE * hs;
    // A bigger hand moves as much faster, so it takes as long as any other and the ultimate isn't held up.
    const sized = hs / H.scale;
    // A flyer is reached in airRiseTime, however high it is.
    const riseSpeed = target.airborne ? Math.max(H.riseSpeed, riseSpeedFor(target.position.y + above + 1, H.airRiseTime, H.easeTime)) : H.riseSpeed * sized;
    // A flyer's hand sinks back under in airSinkTime, however high it grabbed it.
    const sinkSpeed = target.airborne ? Math.max(H.sinkSpeed, (target.position.y + above + 1) / H.airSinkTime) : H.sinkSpeed * sized;
    const spec: DevourHandSpec = { riseSpeed, easeTime: H.easeTime, closeTime: H.closeTime, sinkSpeed, below: D.holdFwd * hs, above, clear: D.holdFwd * hs + H.wristClear };
    const n = new THREE.Vector3(center.x - target.position.x, 0, center.z - target.position.z);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    // The palm faces the victim from the hand's side: the hand stands beyond it, palm turned in toward the centre.
    const s = new THREE.Vector3().crossVectors(_up, n);
    // The arm's length puts its shoulder just under the ground when the hand is at its grasp height.
    const graspWristY = Math.max(target.position.y, spec.clear) - D.holdFwd * hs;
    const chord = Math.max(1, (graspWristY + SHOULDER_DOWN * hs) / Math.cos(ARM_LEAN));
    // Upper arm and forearm whose ends, with the elbow bent ELBOW_BEND, are `chord` apart.
    const k = Math.sqrt(UPPER_SHARE ** 2 + (1 - UPPER_SHARE) ** 2 + 2 * UPPER_SHARE * (1 - UPPER_SHARE) * Math.cos(ELBOW_BEND));
    const upper = (chord * UPPER_SHARE) / k;
    const fore = (chord * (1 - UPPER_SHARE)) / k;
    this.hands.push({ target, state: newDevourHand(target.position.y, delay, spec), spec, hs, x: target.position.x, z: target.position.z, n, s, upper, fore, chord });
  }

  update(dt: number): void {
    let nc = 0;
    let na = 0;
    let nj = 0;
    let nk = 0;
    for (let i = this.hands.length - 1; i >= 0; i--) {
      const h = this.hands[i]!;
      // Until it has its victim, the hand stays under it as it moves.
      if (!h.state.holding && h.target.isAlive()) {
        h.x = h.target.position.x;
        h.z = h.target.position.z;
        h.state.victimY = h.target.position.y;
        h.state.graspY = Math.max(h.state.victimY, h.spec.clear);
      }
      if (stepDevourHand(h.state, dt, h.spec)) this.onTake(h.target);
      if (h.state.phase === 'done') {
        this.hands.splice(i, 1);
        continue;
      }
      if (h.state.phase === 'wait') continue;
      const hs = h.hs;
      // The hold point is in front of the palm (+N), holdFwd up from the wrist.
      _hold.set(h.x, h.state.holdY, h.z);
      _w.copy(_hold).addScaledVector(_up, -D.holdFwd * hs).addScaledVector(h.n, -D.holdIn * hs);

      // The arm: a rigid, nearly straight limb hanging below the wrist, leaning a little back from the victim, rising
      // and sinking with the hand: the shoulder (in the hole at the grasp), the upper arm, the slightly bent elbow
      // (bending out, away from the victim), and the forearm up to the wrist.
      _bend.copy(h.n).negate();
      _sh.copy(_w).addScaledVector(_up, -h.chord * Math.cos(ARM_LEAN)).addScaledVector(_bend, h.chord * Math.sin(ARM_LEAN));
      elbowPoint(_sh, _w, h.upper, h.fore, _bend, _el);
      na = this.tube(na, _sh, _el, UPPER_R * hs);
      na = this.tube(na, _el, _w, FORE_R * hs);
      this.joints.setMatrixAt(nj, _m.compose(_sh, _q.identity(), _sc.setScalar(UPPER_R * hs * 1.25)));
      this.joints.setColorAt(nj++, ARM_TIP);
      this.joints.setMatrixAt(nj, _m.compose(_el, _q.identity(), _sc.setScalar(FORE_R * hs * 1.15)));
      this.joints.setColorAt(nj++, ARM_TIP);

      // Palm: an upright slab from the wrist, knuckles across S, facing N.
      _p.copy(_w).addScaledVector(_up, D.palmLen * hs * 0.5);
      _m.makeBasis(h.s, _up, h.n);
      _q.setFromRotationMatrix(_m);
      _sc.set((D.palmWidth / 2) * hs, D.palmLen * hs, (D.thick / 2) * hs);
      this.core.setMatrixAt(nc, _m.compose(_p, _q, _sc));
      this.core.setColorAt(nc++, ARM_TIP);

      // Fingers and thumb: a relaxed open hand, closing into a full fist (grip 0..1).
      const g = h.state.grip;
      for (let f = 0; f < 4; f++) {
        fingerPoints(g, g, f, _P, true);
        nc = this.digit(h, nc, 3, g);
      }
      thumbPoints(g, g, _P, true);
      nc = this.digit(h, nc, 2, g);

      // The victim's husk rides in the hand once taken, inside the closing fist.
      if (h.state.holding && !h.target.boss) {
        const r = HUSK * h.hs;
        _q.setFromAxisAngle(_up, Math.atan2(h.n.x, h.n.z));
        this.husks.setMatrixAt(nk++, _m.compose(_hold, _q, _sc.set(r, r, r)));
      }
    }
    for (const [m, n] of [[this.core, nc], [this.arms, na], [this.joints, nj], [this.husks, nk]] as const) {
      m.count = n;
      m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /**
   * One finger (or the thumb) from its joints in `_P` (hand frame: x across S, y up F, z out of the palm N), placed on
   * the hand at the wrist `_w`: a tapering bone per phalanx, the last a claw, and a knob over each of the first
   * `knobs` joints. Returns the next free instance.
   */
  private digit(h: Hand, i: number, knobs: number, grip: number): number {
    const hs = h.hs;
    for (let k = 0; k < 4; k++) _J[k]!.copy(_w).addScaledVector(h.s, _P[k]!.x * hs).addScaledVector(_up, _P[k]!.y * hs).addScaledVector(h.n, _P[k]!.z * hs);
    for (let j = 0; j < 3; j++) this.bone(this.core, i++, _J[j]!, _J[j + 1]!, FINGER_R[j]! * hs, j === 2 ? CLAW : FINGER);
    for (let j = 0; j < knobs; j++) {
      const k = knobs === 3 ? j : j + 1;
      const r = FINGER_R[Math.min(2, k)]! * hs;
      _e.subVectors(_J[k + 1]!, _J[k]!).setLength(r * KNUCKLE * 1.2);
      _p.copy(_J[k]!).addScaledVector(_e, -0.5);
      this.bone(this.core, i++, _p, _d.copy(_p).add(_e), r * (KNUCKLE + 0.15 * grip), KNOB);
    }
    return i;
  }

  /** One arm tube from a (its wide base, radius r) to b (tapering to ARM_R_WRIST / ARM_R_ROOT of that). Returns the next free instance. */
  private tube(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): number {
    _dir.subVectors(b, a);
    const l = _dir.length();
    _q.setFromUnitVectors(_up, l > 1e-6 ? _dir.divideScalar(l) : _up);
    this.arms.setMatrixAt(i, _m.compose(a, _q, _sc.set(r, Math.max(0.01, l), r)));
    this.arms.setColorAt(i, ARM_TIP);
    return i + 1;
  }

  /** One bone from a to b, radius r at a (the shared geometry tapers to 0.55 r at b). */
  private bone(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.Color): void {
    _mid.addVectors(a, b).multiplyScalar(0.5);
    _dir.subVectors(b, a);
    const l = _dir.length();
    _q.setFromUnitVectors(_up, l > 1e-6 ? _dir.divideScalar(l) : _up);
    _m.compose(_mid, _q, _sc.set(Math.max(0.01, r), l, Math.max(0.01, r)));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, color);
  }

  clear(): void {
    this.hands = [];
    for (const m of [this.core, this.arms, this.joints, this.husks]) {
      m.count = 0;
      m.visible = false;
    }
  }

  dispose(): void {
    for (const m of [this.core, this.arms, this.joints, this.husks]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
