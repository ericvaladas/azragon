import * as THREE from 'three';

/**
 * One Devour hand's motion, as heights of its hold point (where the fist closes, world y) over real time:
 * it waits out its delay wholly under the ground, rises straight up, open, at riseSpeed, then brakes smoothly to a
 * stop over its last easeTime s at the grasp height (the victim's height, or `clear` if that is higher, so the whole
 * hand is above the ground), closes into a fist over closeTime, setting off straight down at sinkSpeed while the fist
 * is still shutting, until it is wholly under the ground again.
 */
export type DevourHandSpec = {
  riseSpeed: number;
  easeTime: number;
  closeTime: number;
  sinkSpeed: number;
  /** How far the hand reaches below its hold point (to the wrist) and above it (to the fingertips), m. */
  below: number;
  above: number;
  /** The lowest grasp height (m): the wrist is then above the ground. */
  clear: number;
};

export type DevourHandPhase = 'wait' | 'rise' | 'close' | 'sink' | 'done';

export type DevourHand = {
  phase: DevourHandPhase;
  /** Seconds still to wait before rising. */
  delay: number;
  holdY: number;
  /** The victim's height (where it is taken) and the grasp height. */
  victimY: number;
  graspY: number;
  /** The rise: where it started, its length, the full-speed part (s), the brake (s, and its share of the length), and how far in it is (s). */
  riseFrom: number;
  riseLen: number;
  riseFull: number;
  riseBrake: number;
  brakeLen: number;
  riseT: number;
  /** 0 an open hand .. 1 a full fist. */
  grip: number;
  closeT: number;
  /** The victim has been taken (it rides in the hand from then on). */
  holding: boolean;
};

/** A hand for a victim at height `victimY`, rising after `delay` s. */
export function newDevourHand(victimY: number, delay: number, s: DevourHandSpec): DevourHand {
  const holdY = -s.above - 1;
  return { phase: 'wait', delay, holdY, victimY, graspY: Math.max(victimY, s.clear), riseFrom: holdY, riseLen: 0, riseFull: 0, riseBrake: 0, brakeLen: 0, riseT: 0, grip: 0, closeT: 0, holding: false };
}


/** How far (0..1) through its rise a hand is: full speed, then braking to a stop. */
function riseFraction(h: DevourHand, s: DevourHandSpec): number {
  if (h.riseT <= h.riseFull) return (s.riseSpeed * h.riseT) / h.riseLen;
  const u = Math.min(1, (h.riseT - h.riseFull) / h.riseBrake);
  return (h.riseLen - h.brakeLen + h.brakeLen * (1 - (1 - u) ** 2)) / h.riseLen;
}

/** How far through the close (0..1) the hand starts to sink, finishing the fist on the way down. */
const SINK_AT = 0.6;

/** The grip `closeT` s into the close: closing at once, fastest at first, slowing as the fist shuts. */
function closeGrip(closeT: number, s: DevourHandSpec): number {
  return 1 - (1 - closeT / s.closeTime) ** 2;
}

/** Advance by dt real seconds. Returns true on the step the hand reaches its victim (take it then). */
export function stepDevourHand(h: DevourHand, dt: number, s: DevourHandSpec): boolean {
  let took = false;
  switch (h.phase) {
    case 'wait':
      h.delay -= dt;
      if (h.delay <= 0) {
        h.phase = 'rise';
        // Full speed, then a constant brake from riseSpeed to rest over easeTime (covering riseSpeed × easeTime / 2),
        // or over a shorter stretch if the rise is short.
        h.riseFrom = h.holdY;
        h.riseLen = Math.max(1e-3, h.graspY - h.holdY);
        h.brakeLen = Math.min((s.riseSpeed * s.easeTime) / 2, h.riseLen * 0.6);
        h.riseBrake = (2 * h.brakeLen) / s.riseSpeed;
        h.riseFull = (h.riseLen - h.brakeLen) / s.riseSpeed;
      }
      break;
    case 'rise':
      h.riseT = Math.min(h.riseFull + h.riseBrake, h.riseT + dt);
      h.holdY = h.riseFrom + (h.graspY - h.riseFrom) * riseFraction(h, s);
      if (!h.holding && h.holdY >= h.victimY) {
        h.holding = true;
        took = true;
      }
      if (h.riseT >= h.riseFull + h.riseBrake) h.phase = 'close';
      break;
    case 'close':
      h.closeT = Math.min(s.closeTime, h.closeT + dt);
      h.grip = closeGrip(h.closeT, s);
      // It sets off down while the fist is still shutting (the slow end of the close would read as a pause).
      if (h.closeT >= s.closeTime * SINK_AT) h.phase = 'sink';
      break;
    case 'sink':
      h.closeT = Math.min(s.closeTime, h.closeT + dt);
      h.grip = closeGrip(h.closeT, s);
      h.holdY -= s.sinkSpeed * dt;
      if (h.holdY + s.above < 0) h.phase = 'done';
      break;
    case 'done':
      break;
  }
  return took;
}

/**
 * The rise speed that covers `len` m in `time` s including the brake (stepDevourHand's rise: full speed, then a brake
 * over easeTime covering speed × easeTime / 2, at most 0.6 of the rise).
 */
export function riseSpeedFor(len: number, time: number, easeTime: number): number {
  // With the whole brake: len / v + easeTime / 2 = time, if that brake fits in 0.6 of the rise.
  if (time > easeTime / 2) {
    const v = len / (time - easeTime / 2);
    if ((v * easeTime) / 2 <= len * 0.6) return v;
  }
  // Otherwise the brake is cut to 0.6 of the rise, and the rise takes 1.6 × len / v.
  return (1.6 * len) / time;
}

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();

/**
 * The elbow of an arm from `shoulder` to `wrist`, its upper arm `upper` and forearm `fore` long, bent toward `bend`
 * (two-bone IK in the plane of the arm and `bend`), into `out`. Out of reach, the arm straightens toward the wrist.
 */
export function elbowPoint(shoulder: THREE.Vector3, wrist: THREE.Vector3, upper: number, fore: number, bend: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  _dir.subVectors(wrist, shoulder);
  const d = Math.min(_dir.length(), (upper + fore) * 0.9999);
  if (d < 1e-6) return out.copy(shoulder).addScaledVector(bend, upper);
  _dir.normalize();
  // Along the arm to the foot of the elbow, then out toward the bend by the triangle's height.
  const a = (upper * upper - fore * fore + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  _perp.copy(bend).addScaledVector(_dir, -bend.dot(_dir));
  if (_perp.lengthSq() < 1e-9) _perp.set(1, 0, 0).addScaledVector(_dir, -_dir.x);
  _perp.normalize();
  return out.copy(shoulder).addScaledVector(_dir, a).addScaledVector(_perp, h);
}
