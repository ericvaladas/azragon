import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { angleDelta } from '../../util/math';
import type { BodyFrame, MonsterBody } from '../types';
import { ARM_COUNT, armAngle, armPlanted, armRole, crawlPhase, isFrontArm } from './crawl';
import { type ChainTuning, type Ellipsoid, pushOut, resample, TentacleChain } from './tentacleChain';
import { TentacleArms } from './TentacleArms';

const K = CONFIG.kraken;
const C = K.colors;
/** Segments per tentacle; all 8 × SEGS segments are one instanced mesh (one draw call). */
const SEGS = 14;
/** Points sampled along each arm's pose curve before it is evened out into SEGS + 1 joint targets. */
const SAMPLES = 24;
/** Model units (before CONFIG.monster.scale). */
const MANTLE_Y = 265;
const ANCHOR_R = 115;
const ANCHOR_Y = 170;
/** Full arm length; an arm can contract to ARM_MIN of it, never stretch past it. */
const ARM_LEN = 1150;
const ARM_MIN = 0.45;
const REST_R = 640;
const PLANT_R = 760;
const LIFT = 190;
/** Resting tip height and the (negative) arch that sags the resting arm onto the ground before it curls up. */
const REST_CURL = 90;
const REST_ARCH = -200;
/** How high a resting tip curls back up, and how far the free arms undulate. */
const CURL = 150;
const WAVE = 55;
const THICK = 58;
/** Whirlpool: how far (rad) each arm swings either side of its rest bearing, and how close (tip radius) a
 * fully swung arm wraps the mantle. */
const SWING = 2.5;
const WRAP_R = 330;
/** A frame-to-frame jump longer than this (model units) is a teleport: the arms snap instead of trailing. */
const SNAP = 500;
/** Joint springs: stiff at the root, loose and underdamped at the tip, so motion cracks down the arm. */
const TUNE: ChainTuning = { omegaRoot: 22, omegaTip: 9, zetaRoot: 0.9, zetaTip: 0.38 };
/** Crawling arms place their tips deliberately and hold their grip: stiff and damped to the tip. */
const PLANT_TUNE: ChainTuning = { omegaRoot: 26, omegaTip: 24, zetaRoot: 1, zetaTip: 1 };
/** Whirlpool arms: softer near the root so each sweep bends the whole arm in one curve, not at an elbow. */
const WHIRL_TUNE: ChainTuning = { omegaRoot: 15, omegaTip: 9, zetaRoot: 0.85, zetaTip: 0.5 };
/** Striking arms snap tighter so the tip lands near the impact time. */
const STRIKE_TUNE: ChainTuning = { omegaRoot: 26, omegaTip: 14, zetaRoot: 0.9, zetaTip: 0.42 };
/** The mantle as ellipsoids (mantle-local centre and radii): the sac, the brow, the skirt. */
const HULL: readonly [readonly [number, number, number], readonly [number, number, number]][] = [
  [[0, 75, -70], [170, 196, 206]],
  [[0, -25, 40], [152, 98, 134]],
  [[0, -95, 15], [172, 62, 167]],
];

const _anchor = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();
const _tint = new THREE.Color();
const _side = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _ctrl2 = new THREE.Vector3();
const _plant = new THREE.Vector3();
const _delta = new THREE.Matrix4();
const _path = Array.from({ length: SAMPLES + 1 }, () => new THREE.Vector3());
const _targets = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());

/** Root-space point on the cubic curve anchor → ctrl → ctrl2 → tip at u. */
function curve(u: number, out: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return out.set(
    a * _anchor.x + b * _ctrl.x + c * _ctrl2.x + d * _tip.x,
    a * _anchor.y + b * _ctrl.y + c * _ctrl2.y + d * _tip.y,
    a * _anchor.z + b * _ctrl.z + c * _ctrl2.z + d * _tip.z,
  );
}

/** Whirlpool swing (−1 right … +1 left) over its 0..1 timeline: wind left, lash right, settle. */
function whirl(k: number): number {
  const ease = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };
  if (k < 0.3) return ease(k / 0.3);
  if (k < 0.72) return 1 - 2 * ease((k - 0.3) / 0.42);
  return -1 + ease((k - 0.72) / 0.28);
}

/** Segment radius at joint j (root to tip). */
const radiusAt = (j: number) => THICK * (1 - 0.84 * Math.pow(j / SEGS, 0.75));

/**
 * The Kraken: a bulbous mantle carried low, two glowing eyes at the front (+Z), and eight tentacles. The
 * front four crawl (reach, plant, pull); free arms writhe and strike from `arms`; all eight spin for
 * Whirlpool, spread for Roar, coil when airborne, and sweep back in a Dash. +X is its left.
 */
export class KrakenBody implements MonsterBody {
  readonly root = new THREE.Group();
  readonly arms = new TentacleArms();
  private mantle = new THREE.Group();
  private segments: THREE.InstancedMesh;
  private segMat: THREE.MeshToonMaterial;
  private tintMats: THREE.MeshToonMaterial[];
  private eyeMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private chains = Array.from({ length: ARM_COUNT }, () => new TentacleChain(SEGS));
  private hull: Ellipsoid[] = HULL.map(() => ({ c: new THREE.Vector3(), r: new THREE.Vector3() }));
  private prevWorld = new THREE.Matrix4();
  private hasPrev = false;
  private nextLaunch = 0;

  constructor() {
    const skin = toonMat(C.mantle);
    const dark = toonMat(C.mantleDark);
    const under = toonMat(C.underside);
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    const pupilMat = toonMat(0x140808);
    this.segMat = toonMat(0xffffff);
    this.tintMats = [skin, dark, under, this.segMat];
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.x = rotX;
      m.castShadow = true;
      m.receiveShadow = true;
      this.mantle.add(m);
      return m;
    };

    // Mantle: a big sac swept back and up behind a lower brow, mottled with raised spots, over a pale skirt
    // that the arm roots grow out of.
    const sac = add(blob, skin, [0, 75, -70], [165, 185, 205], 0.5);
    for (const [x, y, z, r] of [
      [0.55, 0.55, 0.3, 0.13], [-0.5, 0.6, -0.1, 0.11], [0.1, 0.85, -0.45, 0.12], [-0.6, 0.2, -0.6, 0.1],
      [0.7, 0.1, -0.5, 0.1], [0.15, 0.4, 0.8, 0.09], [-0.25, 0.95, 0.2, 0.1], [0.75, 0.45, -0.15, 0.08],
      [-0.75, 0.35, 0.35, 0.09], [0.35, 0.7, -0.75, 0.09], [-0.3, 0.55, -0.8, 0.11], [0.4, 0.95, 0.15, 0.08],
    ] as const) {
      const spot = new THREE.Mesh(blob, dark);
      spot.position.set(x, y, z).normalize().multiplyScalar(0.94);
      spot.scale.setScalar(r);
      sac.add(spot);
    }
    add(blob, skin, [0, -25, 40], [150, 95, 130]);
    add(blob, under, [0, -95, 15], [170, 60, 165]);
    // Eyes on the brow, looking forward and out, with the octopus's horizontal bar pupils.
    for (const side of [1, -1]) {
      const eye = add(blob, this.eyeMat, [side * 94, 0, 112], [44, 40, 32]);
      eye.rotation.y = side * 0.45;
      const pupil = add(box, pupilMat, [side * 106, 0, 141], [30, 8, 6]);
      pupil.rotation.y = side * 0.45;
      add(box, dark, [side * 90, 40, 112], [60, 12, 38]).rotation.z = side * -0.25;
    }
    this.mantle.position.y = MANTLE_Y;
    this.root.add(this.mantle);

    // Tentacles: one instanced mesh of tapered segments; colour per instance (top / dark band / pale tip).
    const seg = this.keep(faceted(new THREE.CylinderGeometry(0.88, 1, 1, 6)));
    this.segments = new THREE.InstancedMesh(seg, this.segMat, ARM_COUNT * SEGS);
    this.segments.castShadow = true;
    this.segments.receiveShadow = true;
    this.segments.frustumCulled = false;
    for (let i = 0; i < ARM_COUNT; i++) {
      for (let k = 0; k < SEGS; k++) {
        // Mantle-coloured roots fading to pale tips over the last third; a dark band at the root.
        const fade = Math.max(0, (k - SEGS * 0.6) / (SEGS * 0.4));
        this.segments.setColorAt(i * SEGS + k, _c.setHex(k === 0 ? C.mantleDark : C.mantle).lerp(_tint.setHex(C.underside), fade));
      }
    }
    this.root.add(this.segments);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const moving = f.motion > 0.3;
    const S = K.stats.strideLength;
    // Two front arms pull per half cycle, so the mantle surges twice per cycle.
    const surge = moving ? Math.sin(f.cycle * Math.PI * 4) * f.motion : 0;
    const bob = surge * 12 + Math.sin(f.time * 1.2) * 8 - f.pose.dip - f.pose.collapse * 220;
    this.mantle.position.set(0, MANTLE_Y + bob, surge * 10);
    this.mantle.rotation.set(f.pose.pitch + 0.08 * f.motion + (f.roaring ? -0.35 : 0), 0, 0);
    const breathe = 1 + Math.sin(f.time * 1.2) * 0.02;
    this.mantle.scale.set(breathe, 1 / breathe, breathe);
    this.root.updateMatrixWorld(true);

    // The arms live in the world: carry them over the body's own motion so they trail when it moves or turns.
    if (this.hasPrev) {
      _delta.copy(this.root.matrixWorld).invert().multiply(this.prevWorld);
      for (const c of this.chains) c.shift(_delta, SNAP);
    }
    this.prevWorld.copy(this.root.matrixWorld);
    this.hasPrev = true;
    // The mantle's hull (root space) the arms wrap around instead of passing through.
    for (let h = 0; h < HULL.length; h++) {
      const [c, r] = HULL[h]!;
      this.hull[h]!.c.set(...c).applyMatrix4(this.mantle.matrix);
      this.hull[h]!.r.set(...r).multiply(this.mantle.scale);
    }

    // Lash: the free arm whose anchor points most nearly at the flyer, kept for the whole swing
    // (reserved in `arms.lashArm` so no strike can take it) while it stays free in the crawl.
    let lashArm = -1;
    if (f.antiAir) {
      const kept = this.arms.lashArm;
      if (kept >= 0 && armRole(kept, f.cycle, moving) === 'free' && !this.arms.strikes[kept]) {
        lashArm = kept;
      } else {
        this.root.worldToLocal(_tmp.copy(f.antiAir.target));
        const bearing = Math.atan2(_tmp.x, _tmp.z);
        let best = Infinity;
        for (let i = 0; i < ARM_COUNT; i++) {
          if (armRole(i, f.cycle, moving) !== 'free' || this.arms.strikes[i]) continue;
          const d = Math.abs(angleDelta(armAngle(i), bearing));
          if (d < best) {
            best = d;
            lashArm = i;
          }
        }
      }
    }
    this.arms.lashArm = lashArm;

    for (let i = 0; i < ARM_COUNT; i++) {
      const role = armRole(i, f.cycle, moving);
      this.arms.roles[i] = role;
      const ang = armAngle(i);
      _dir.set(Math.sin(ang), 0, Math.cos(ang));
      _anchor.copy(_dir).multiplyScalar(ANCHOR_R).setY(ANCHOR_Y + bob);

      // Resting pose: sprawled on the ground around the mantle, tips curled up, writhing; back arms trail
      // while crawling.
      const sway = Math.sin(f.time * 0.9 + i * 1.3) * 0.15;
      _rest.set(Math.sin(ang + sway), 0, Math.cos(ang + sway)).multiplyScalar(REST_R + Math.sin(f.time * 1.3 + i * 1.7) * 50);
      _rest.y = REST_CURL + Math.max(0, Math.sin(f.time * 1.1 + i)) * 70;
      if (moving && !isFrontArm(i)) _rest.addScaledVector(_fwd, -S * 0.3 * f.motion);
      _tip.copy(_rest);
      // arch: how far the curve bows up (negative sags it onto the ground); drop: how the root leaves the
      // skirt; curl and wave: tip curl and travelling undulation (fractions of CURL and WAVE).
      let arch = REST_ARCH;
      let drop = -190;
      let curl = 0.6 + 0.4 * Math.sin(f.time * 0.8 + i * 2.1);
      let wave = 1;
      let tune = TUNE;
      // A pulling arm's tip is gripping the ground: pinned there unless another pose takes the arm.
      let pin = role === 'pull';

      if (role !== 'free') {
        // Crawl: plant ahead, slide back under the mantle (world-still), then lift and reach forward again.
        const p = crawlPhase(i, f.cycle);
        _p0.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, S / 4);
        _p1.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, -S / 4);
        if (role === 'pull') _tip.lerpVectors(_p0, _p1, p / 0.5);
        else {
          const u = (p - 0.5) / 0.5;
          _tip.lerpVectors(_p1, _p0, u);
          _tip.y = LIFT * Math.sin(Math.PI * u);
        }
        arch = 150;
        drop = -60;
        curl = role === 'pull' ? 0 : 0.25;
        wave = 0.3;
        tune = PLANT_TUNE;
      }
      _plant.copy(_tip);

      const s = this.arms.strikes[i];
      if (s) {
        const T = s.timing;
        this.root.worldToLocal(_b.copy(s.target));
        _b.y = 0;
        // Slam: rear high over its own side. Hurl: hold the rubble up behind the mantle, on the arm's side,
        // so the arm wraps around the body.
        if (s.kind === 'slam') _a.copy(_dir).multiplyScalar(PLANT_R * 0.5).setY(780);
        else _a.copy(_dir).multiplyScalar(110).add(_tmp.set(0, 820, -230));
        if (s.kind === 'hurl') _p0.copy(_dir).multiplyScalar(PLANT_R * 0.6);
        if (s.t < T.windup) {
          // Slam: rear up; Hurl: reach down to grab rubble.
          _tip.lerpVectors(_rest, s.kind === 'slam' ? _a : _p0, s.t / T.windup);
        } else if (s.t < T.impact) {
          const u = (s.t - T.windup) / (T.impact - T.windup);
          if (s.kind === 'slam') _tip.lerpVectors(_a, _b, u * u);
          else _tip.lerpVectors(_p0, _a, u);
        } else {
          const u = Math.min(1, (s.t - T.impact) / (T.end - T.impact));
          _tip.lerpVectors(s.kind === 'slam' ? _b : _a, _rest, u);
        }
        pin = false;
        arch = s.kind === 'slam' ? 320 : 380;
        drop = 0;
        curl = 0;
        wave = 0;
        tune = STRIKE_TUNE;
      }
      if (this.arms.spinT >= 0) {
        // Whirlpool: every arm winds left until it nearly wraps the mantle, lashes all the way right to wrap
        // it the other way, then settles back to rest; the further it swings, the closer it hugs the body.
        const k = this.arms.spinT / K.arms.spinTime;
        const swing = SWING * whirl(k - i * 0.012);
        const w = Math.abs(swing) / SWING;
        const sa = ang + swing;
        const r = PLANT_R * 1.05 + (WRAP_R - PLANT_R * 1.05) * Math.pow(w, 1.5);
        _tip.set(Math.sin(sa) * r, 80 + 90 * w, Math.cos(sa) * r);
        tune = WHIRL_TUNE;
        pin = false;
        arch = 60;
        drop = -40;
        curl = 0;
        wave = 0;
      }
      if (f.roaring) {
        _tip.copy(_dir).multiplyScalar(REST_R * 1.05).setY(340);
        pin = false;
        arch = 260;
        drop = 0;
        curl = 0.8;
        wave = 0.6;
      }
      if (f.dashing) {
        _tip.copy(_dir).multiplyScalar(REST_R * 0.6).addScaledVector(_fwd, -420).setY(40);
        pin = false;
        arch = 60;
        drop = -40;
        curl = 0;
        wave = 0.5;
      }
      if (f.airborne) {
        _tip.copy(_dir).multiplyScalar(REST_R * 0.55).setY(-160);
        pin = false;
        curl = 0.4;
      }
      if (i === lashArm && f.antiAir) {
        this.root.worldToLocal(_b.copy(f.antiAir.target));
        _tip.lerp(_b, Math.max(0, Math.min(1, f.antiAir.weight)));
        pin = false;
        arch = 60;
        drop = 0;
        curl = 0;
        wave = 0;
        tune = STRIKE_TUNE;
      }
      if (f.pose.collapse > 0) {
        _tip.multiplyScalar(1 + f.pose.collapse * 0.15).setY(_tip.y * (1 - f.pose.collapse));
        wave *= 1 - f.pose.collapse;
        pin = false;
      }
      // Never reach past the arm's length.
      _tmp.copy(_tip).sub(_anchor);
      if (_tmp.length() > ARM_LEN * 0.95) _tip.copy(_anchor).add(_tmp.setLength(ARM_LEN * 0.95));

      // Pose curve: out of the skirt (ctrl), bowed by the arch (ctrl2), to the tip; then the tip curl and a
      // wave travelling root → tip, kept off the ground and outside the mantle.
      const reach = Math.hypot(_tip.x - _anchor.x, _tip.z - _anchor.z);
      _ctrl.copy(_anchor).addScaledVector(_dir, Math.max(160, reach * 0.35)).setY(_anchor.y + drop);
      _ctrl2.lerpVectors(_anchor, _tip, 0.65).addScaledVector(_dir, 60);
      _ctrl2.y += arch;
      _side.crossVectors(_up, _dir);
      for (let k = 0; k <= SAMPLES; k++) {
        const u = k / SAMPLES;
        const p = curve(u, _path[k]!);
        if (curl > 0 && u > 0.6) {
          const w = (u - 0.6) / 0.4;
          p.y += CURL * curl * w * w;
          p.addScaledVector(_dir, -CURL * 0.9 * curl * w * w * w);
        }
        if (wave > 0) {
          const amp = WAVE * wave * u;
          p.addScaledVector(_side, amp * Math.sin(f.time * 3.1 - u * 7 + i * 1.3));
          p.y += amp * 0.5 * Math.sin(f.time * 2.3 - u * 6 + i * 2.1);
        }
        if (!f.airborne) p.y = Math.max(p.y, radiusAt(u * SEGS) * 0.7);
        if (u > 0.12) for (const h of this.hull) pushOut(p, h, radiusAt(u * SEGS));
      }
      const len = resample(_path, _targets);
      const segLen = Math.min(ARM_LEN, Math.max(ARM_LEN * ARM_MIN, len)) / SEGS;

      // The arm springs toward that pose, stiff at the root and whippy at the tip, and wraps the mantle.
      const chain = this.chains[i]!;
      chain.step(f.dt, _targets, segLen, tune, this.hull, radiusAt, 2, pin);
      const J = chain.joints;
      for (let k = 0; k < SEGS; k++) {
        _tmp.subVectors(J[k + 1]!, J[k]!);
        const r = radiusAt(k);
        const l = _tmp.length();
        _tmp.divideScalar(Math.max(l, 1e-6));
        // Every segment keeps the same roll (its X toward the arm's side), so the facets line up down the arm.
        _a.copy(_side).addScaledVector(_tmp, -_side.dot(_tmp)).normalize();
        _b.crossVectors(_a, _tmp);
        // A little longer than the segment so the joints close over at bends.
        _m.makeBasis(_a.multiplyScalar(r), _tmp.multiplyScalar(l + r * 0.3), _b.multiplyScalar(r));
        _m.setPosition(_c3.addVectors(J[k]!, J[k + 1]!).multiplyScalar(0.5));
        this.segments.setMatrixAt(i * SEGS + k, _m);
      }

      this.root.localToWorld(this.arms.tips[i]!.copy(J[SEGS]!));
      if (moving && !this.arms.strikes[i] && this.arms.spinT < 0 && i !== lashArm && armPlanted(f.prevCycle, f.cycle, i)) {
        onFootLand(this.root.localToWorld(_plant).setY(0));
      }
    }
    this.segments.instanceMatrix.needsUpdate = true;

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.eyeMat.emissiveIntensity = f.flash ? 3 : 1 + (f.roaring ? 2 : 0);
  }

  /** Hurls launch from the arm tips themselves; Barrage, Deep Throw and Ink Cloud use free arms in turn. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    for (let n = 0; n < ARM_COUNT; n++) {
      const i = (this.nextLaunch + n) % ARM_COUNT;
      if (this.arms.roles[i] === 'free' && !this.arms.strikes[i]) {
        this.nextLaunch = i + 1;
        return out.copy(this.arms.tips[i]!).setY(this.arms.tips[i]!.y + 40);
      }
    }
    return this.rangedOrigin(out);
  }

  /** Top of the mantle. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mantle.updateWorldMatrix(true, false);
    return this.mantle.localToWorld(out.set(0, 160, -40));
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.segments.dispose();
  }
}
